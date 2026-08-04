# 06 — Auditoría de instalación y scripts

Pin `0a107412` — react-three-fiber monorepo (Yarn 1 workspaces). **Nada de esto se ejecutó** (ver gates: DEPENDENCIES_INSTALLED: 0, POSTINSTALL_EXECUTED: 0). Esta es una auditoría estática de los scripts declarados y su semántica.

## Scripts del root (`package.json`)

| Script | Comando | Clasificación | Efecto / notas |
|---|---|---|---|
| `postinstall` | `preconstruct dev && yarn patch-react-reconciler` | FILESYSTEM_MUTATING / BUILD_ONLY | Genera `dist/` de cada paquete (preconstruct dev) y transpila react-reconciler (ver abajo). Solo escribe paths gitignored. **Se activa con cualquier `yarn install` del repo.** |
| `patch-react-reconciler` | `vite build` | FILESYSTEM_MUTATING / BUILD_ONLY | **No parchea código**: transpila CJS→ESM. Ver detalle abajo. |
| `prepare` | `husky install` | FILESYSTEM_MUTATING (local) | Instala shims de husky en `.git/hooks` (no tracked). Se activa con `yarn install` y con `npm install` local del root. |
| `build` | `preconstruct build` | BUILD_ONLY / FILESYSTEM_MUTATING | Genera `dist/` + `*.d.ts` por paquete; corre `prebuild` de cada paquete. |
| `dev` | `preconstruct dev` | BUILD_ONLY | Watcher de build. |
| `examples` | `yarn workspace example dev` | NETWORK_CAPABLE (dev server) | Levanta Vite (puerto local). No se ejecutó. |
| `test` / `test:watch` | `jest --coverage` / `jest --watchAll` | BUILD_ONLY (test) | Jest + jsdom; ejecuta código del repo en Node, sin browser. |
| `typecheck` | `tsc --noEmit ... --strict` | STATIC_SAFE | Solo lectura. |
| `validate` | `preconstruct validate` | STATIC_SAFE | Validación de config preconstruct. |
| `eslint` / `eslint:fix` | `eslint ...` / `--fix` | STATIC_SAFE / FILESYSTEM_MUTATING | El fix reescribe archivos tracked. |
| `format` / `format:fix` | `prettier --check .` / `--write .` | STATIC_SAFE / FILESYSTEM_MUTATING | Idem. |
| `changeset:add` / `vers` | changeset add / version | FILESYSTEM_MUTATING (dev) | Edita changesets/package.json/CHANGELOGs. |
| `release` | `yarn build && yarn changeset publish` | PUBLISH_CAPABLE | Publica a npm. |
| `analyze-fiber` / `analyze-test` | `cd packages/<pkg> && npm publish --dry-run` | PUBLISH_CAPABLE / NETWORK_CAPABLE | `npm publish --dry-run` contacta el registry (auth/metadata) aunque no publique. |
| `codegen:eslint` | `cd packages/eslint-plugin && yarn codegen` | BUILD_ONLY / FILESYSTEM_MUTATING | ts-node `scripts/codegen.ts` (genera docs del plugin). |

## Scripts de paquetes

- `packages/fiber`: `prebuild` = `cp ../../readme.md readme.md` → FILESYSTEM_MUTATING (sobrescribe `packages/fiber/readme.md`, que es tracked e idéntico; corre en cada build). Sin otros scripts.
- `packages/test-renderer`: sin scripts. **Sin postinstall ni prepare propios.**
- `packages/eslint-plugin`: `codegen` = `ts-node scripts/codegen.ts` → BUILD_ONLY.

## Qué hace exactamente `patch-react-reconciler` (vite.config.ts)

- `outDir: 'packages/fiber/react-reconciler'` — escribe en un path **gitignored**.
- Entradas: `packages/fiber/node_modules/react-reconciler/index.js` (CJS) y `.../cjs/react-reconciler-constants.production.js`.
- Plugins: (1) transpila `exports.X = Y` → `export const X = Y` en los constants y quita `"use strict"`; (2) copia los `.d.ts` de `@types/react-reconciler`; (3) minifica con esbuild.
- Conclusión: **no altera semántica de react-reconciler** — solo lo vuelve consumible como ESM desde el paquete fiber (`import Reconciler from '../../react-reconciler/index.js'` en `src/core/reconciler.tsx:4`). El nombre del script (`patch-`) es engañoso; no hay parche de comportamiento.
- **Version-bound**: depende de que `react-reconciler@^0.33.0` esté en `node_modules` (lockfile fija 0.33.0). Un bump del range sin regenerar el artefacto rompería el import.

## Husky / git hooks

- `.husky/pre-commit` (tracked, modo 100755): `npx pretty-quick --staged` → NETWORK_CAPABLE (npx puede descargar) + FILESYSTEM_MUTATING (formatea staged). `prepare` (husky install) es lo que lo activa; el archivo en sí es el hook real.
- Nota de scan: `example/src/index.tsx` figura con modo 100755 en el index git — bit de ejecutable accidental, es un módulo TSX normal; falso positivo, sin riesgo.
- Los hooks **no corren en clone/checkout** (solo con `husky install` vía `prepare` en install local).

## ¿Puede un install cambiar el checkout?

| Mutación | ¿Tracked? | ¿Ocurre con install? |
|---|---|---|
| `dist/` (preconstruct dev/build) | No (gitignored) | Sí (postinstall) |
| `packages/fiber/react-reconciler/` (vite build) | No (gitignored) | Sí (postinstall) |
| `.git/hooks` (husky install) | No (git interno) | Sí (prepare) |
| `readme.md` de fiber (prebuild cp) | Sí, pero contenido idéntico | No (solo en build) |
| `coverage/` | No (gitignored) | No (solo test) |

**Riesgo de un `yarn install` desde el checkout: bajo para el árbol tracked** (nada tracked se modifica), pero el postinstall **ejecuta código del toolchain** (preconstruct + vite + minificación) y `prepare` toca `.git/hooks`; `npx` en el pre-commit puede descargar de la red. El checkout no queda reproducible sin yarn 1 (`packageManager: yarn@1.22.22` con hash de integridad).

## Reproducibilidad del lockfile

`yarn.lock` v1 (11558 líneas) con `resolved` + `integrity` SHA-512 por entrada → reproducible bajo Yarn 1.22.22. Versiones fijadas de interés: react 19.2.0, react-dom 19.2.0, react-reconciler 0.33.0 (fiber), scheduler 0.27.0, zustand 5.0.3 (fiber) / 4.5.2 (example), three 0.172.0, its-fine 2.0.0, suspend-react 0.1.3, use-sync-external-store 1.4.0. Sin dependencias de git ni tarballs http en las entradas clave.

## Riesgo comparado: instalar desde checkout vs. consumir paquete publicado

| Dimensión | Checkout (monorepo) | Paquete publicado (npm) |
|---|---|---|
| Scripts en install | postinstall + prepare (toolchain propio) | **Ninguno** (fiber/test-renderer/eslint-plugin no declaran postinstall/prepare) |
| Requiere | yarn 1.22.22 (o corepack) | npm/pnpm/yarn cualquiera |
| Artefactos | dist/ + react-reconciler/ generados localmente | Ya incluidos en el tarball |
| Superficie de ejecución | preconstruct, vite, husky, npx (red) | Solo deps normales (zustand, scheduler, its-fine, etc.) |
| Herramientas no disponibles en este host | yarn y corepack **no instalados** | npm 11 OK |

**Conclusión: consumir `@react-three/fiber@9.7.0` desde npm es significativamente más seguro y portable que instalar desde el checkout** (cero scripts post-install en el paquete publicado). Para el intake actual no se instaló nada (gates: DEPENDENCIES_INSTALLED 0, POSTINSTALL_EXECUTED 0).

## Clasificación final de scripts

- STATIC_SAFE: `typecheck`, `validate`, `eslint` (sin fix), `format` (check)
- BUILD_ONLY: `build`, `dev`, `test`, `test:watch`, `codegen`, `prebuild` (cp)
- FILESYSTEM_MUTATING: `postinstall`, `patch-react-reconciler`, `prepare`, `vers`, `eslint:fix`, `format:fix`, `codegen:eslint`, pre-commit hook
- NETWORK_CAPABLE: `examples` (dev server), pre-commit (`npx`), `analyze-*` (npm publish dry-run contacta registry)
- PUBLISH_CAPABLE: `release`, `analyze-fiber`, `analyze-test`
- UNSAFE_FOR_INTAKE: ninguno en ejecución automática por clone; `release` y `analyze-*` jamás deben correrse en un intake; `postinstall`/`prepare` solo si se autoriza install explícito.
