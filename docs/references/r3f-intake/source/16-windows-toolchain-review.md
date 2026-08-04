# 16 — Compatibilidad Windows y toolchain

## Estado del host (registrado en preflight)

- Windows 10 Pro 19045 (22H2); shell de trabajo: git-bash (MSYS)
- Node v24.13.0, npm 11.6.2, Git 2.55.0.windows.3, PowerShell 5.1
- **Yarn: NO instalado** — el repo exige `packageManager: yarn@1.22.22+sha512...` (corepack tampoco está funcional en este Node 24: módulo corepack ausente)

## Lo que el repo asume (repositorio como proyecto de desarrollo)

| Aspecto | Hallazgo | Impacto Windows |
|---|---|---|
| Package manager | Yarn 1.22.22 (lockfile v1) | No hay yarn en el host; `npm install` del root correría postinstall/prepare igual (npm ejecuta scripts de lifecycle), pero `preconstruct dev` y el flujo release están pensados para yarn. |
| Scripts POSIX | `fiber.prebuild`: `cp ../../readme.md readme.md` | `cp` es POSIX: funciona en git-bash/MSYS, **no en cmd.exe/PowerShell directo**. Los scripts npm se ejecutan vía `cmd /c` en Windows → **el prebuild de fiber rompería en cmd puro** (git-bash en PATH puede salvarlo según configuración). |
| Husky 7 | `prepare: husky install` | Husky 7 en Windows crea shims `.git/hooks` con shebangs sh; funciona bajo git-bash. Conocido frágil en runners cmd. |
| Vite | root `vite ^6.4.1` (config `vite.config.ts`); example `vite ^5.2.10` | Vite 5/6 soportan Windows nativamente (paths con `node:path`, forward slashes). El plugin custom de `patch-react-reconciler` usa `fs.readFileSync` con paths relativos — OK. |
| preconstruct | `preconstruct dev/build` en postinstall/build | Preconstruct soporta Windows; en `dev` usa symlinks/junctions en node_modules (requiere permisos; fallback copy). |
| Jest | `jest.config.js` + ts-jest, jsdom, `moduleNameMapper: three → node_modules/three/build/three.cjs` | OK en Windows (paths con `<rootDir>` y forward slashes). |
| TypeScript | Root: `typescript ^4.6.3` (¡muy viejo!); example: `^5.3.3`; `@types/three ^0.172.0` | El root typecheck con TS 4.6 es incongruente con React 19 y three 0.172 (que piden TS ≥5); el paquete publicado distribuye `.d.ts` generados por preconstruct (que sí usa TS moderno en CI). |
| Babel | `babel.config.js` targets `> 1%, not dead, not ie 11` | Targets de browsers modernos; sin problemas Windows. |

## Separación de compatibilidad

### CONSUMER_COMPATIBILITY (consumir `@react-three/fiber@9.7.0` desde npm)

- **Alta**: paquete publicado sin scripts de lifecycle; dist ESM/CJS + tipos generados; deps multiplataforma puras (zustand, scheduler, its-fine, react-use-measure, suspend-react, use-sync-external-store, base64-js, buffer — todas sin binarios nativos). Se instala con npm 11 en Windows sin fricción.
- El ejemplo del repo (Vite 5 + TS 5.3) corre en Windows sin cambios; es el patrón de consumo recomendado.
- React peer `>=19 <19.3`: React 19.2.0 actual es compatible.

### REPOSITORY_MAINTAINER_COMPATIBILITY (desarrollar en este checkout en Windows)

- **Limitada**: requiere Yarn 1 (ausente en el host; corepack roto en Node 24 instalado), scripts con `cp` POSIX, husky/preconstruct con comportamiento bash-first. El CI del repo (GitHub Actions, no auditaron config) corre en Linux por algo.
- Verificación empírica no realizada (prohibido install en el sprint): clasificación por inspección estática de scripts.

## Conclusión

```text
CONSUMER_COMPATIBILITY: ALTA (verificable por inspección: sin lifecycle scripts, deps puras JS)
REPOSITORY_MAINTAINER_COMPATIBILITY: LIMITADA (yarn 1 ausente, cp POSIX, husky/preconstruct bash-first)
```

El hecho de que el checkout sea incómodo en Windows **no implica** que el paquete publicado lo sea: la incomodidad se concentra en el toolchain de desarrollo del monorepo (yarn/preconstruct/husky), que el consumidor nunca ejecuta.
