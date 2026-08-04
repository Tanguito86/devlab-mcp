# 04 — Revisión de licencia y procedencia

Pin: `0a107412ac64667b1908422e859447952f57feef` — pmndrs/react-three-fiber (release 9.7.0 / test-renderer 9.1.1)

## Resultado

```text
ROOT_LICENSE: VERIFIED (MIT)
SUBPACKAGE_LICENSES: VERIFIED (MIT en los 3 paquetes)
SUBASSET_LICENSES: ENUMERATED_AS_UNRESOLVED (assets de ejemplo de procedencia externa, sin NOTICE en el repo)
COMMERCIAL_USE: ALLOWED_WITH_ATTRIBUTION
```

## Licencias declaradas

| Ruta | Licencia declarada | Verificación |
|---|---|---|
| `LICENSE` (raíz) | MIT — `Copyright (c) 2019-2025 Poimandres` | ✅ texto legal MIT completo, coincide con EXPECTED_COPYRIGHT |
| `packages/fiber/package.json` | MIT | ✅ |
| `packages/test-renderer/package.json` | MIT | ✅ |
| `packages/eslint-plugin/package.json` | MIT | ✅ |
| `package.json` raíz | MIT | ✅ |
| `readme.md`, docs | sin licencia propia (cubiertas por la raíz) | ✅ |

No hay subpaquetes con licencia distinta (sin Apache/BSD/ISC en ningún package.json del repo). No hay `NOTICE` ni `LICENSE-*` adicionales.

## Assets y archivos con posible otra procedencia

1. **Modelos de ejemplo** (`example/public/`): `Parrot.glb`, `Stork.glb`, `apple.gltf`, `bottle.gltf`, `farm.gltf`, `lightning.gltf`, `ramen.gltf`
   - Procedencia reconocible: sample models clásicos del ecosistema three.js / glTF-Sample-Models de Khronos (Parrot y Stork provienen de los ejemplos de three.js, derivados de modelos de Khronos/Mirada; apple/bottle/farm/lightning/ramen son glTF sample models de Khronos).
   - El repositorio **no incluye NOTICE ni atribución** para estos archivos. Los sample models de Khronos se distribuyen bajo CC-BY 4.0 (con atribución a sus autores originales) y algunos como CC0.
   - **Estado: ENUMERATED_AS_UNRESOLVED** — la procedencia es identificable pero la atribución exacta por archivo no está documentada en el tree. No bloquea uso comercial del código (los modelos no se distribuyen en el paquete npm: `example/` queda excluida del paquete por `.npmignore`/`files`), pero si se copian al juego propio hay que atribuir.

2. **Imágenes de docs/marca** (`docs/banner-*.jpg`, `logo.jpg`, `preview.jpg`, `basic-app.gif`, `example/public/pmndrs.png`, `react.png`, `three.png`): material del propio proyecto pmndrs y logos de terceros (React, Three.js) usados como marca en el example. Uso de logos sujeto a las marcas respectivas (no es licencia de código); irrelevante para integración en DevLab salvo que se redistribuyan esos logos.

3. **Snapshots de tests** (`packages/fiber/tests/__snapshots__/`, `packages/test-renderer/src/__tests__/__snapshots__/`): generados por Jest, cobertura del propio repo. Sin problema de licencia.

4. **Código derivado/parcheado**: `packages/fiber/react-reconciler/` (generado, gitignored) es una **transpilación ESM del paquete `react-reconciler`** (MIT, Facebook/Meta, npm) realizada por el `postinstall` (vite build). El código fuente de react-reconciler no se incluye en el repo; el artefacto generado conserva la licencia MIT de React (MIT con copyright Facebook, Inc.). El `patch-react-reconciler` **no modifica el comportamiento** (ver 06): solo transpila CJS→ESM. Atribución: la licencia MIT de React ya viaja en el paquete publicado (`react-reconciler/LICENSE` dentro del tarball npm). Nota: esto se considera código derivado distribuidor — el MIT de React permite la redistribución con el aviso de copyright; el tarball npm lo incluye.

5. **`vite.config.ts`**: tooling de build del repo (Vite, MIT). No es código del producto.

## Política de atribución propuesta para integración futura (DevLab)

- Mantener el aviso `MIT — Copyright (c) 2019-2025 Poimandres` en cualquier distribución/redistribución de código R3F (o el archivo LICENSE del paquete npm consumido, que ya lo incluye).
- No redistribuir los `.glb/.gltf` del `example/` sin añadir atribución CC-BY 4.0 a los autores originales de los sample models (Khronos glTF-Sample-Models). Recomendación: **no usar esos modelos en DevLab**; usar assets propios o con licencia explícita (CC0).
- No redistribuir logos de React/Three.js como parte de material de marca de DevLab.
- El componente `react-reconciler` embebido conserva su propia licencia MIT (Facebook); no requiere acción adicional si se consume el paquete publicado sin re-empaquetar.

## Conclusión

`ROOT_LICENSE: VERIFIED` — `SUBPACKAGE_LICENSES: VERIFIED` — `SUBASSET_LICENSES: ENUMERATED_AS_UNRESOLVED` (solo assets de ejemplo, fuera del paquete publicado) — `COMMERCIAL_USE: ALLOWED_WITH_ATTRIBUTION`.
