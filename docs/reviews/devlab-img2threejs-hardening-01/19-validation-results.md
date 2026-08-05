# Resultados de validación

Todas las invocaciones pnpm finales usaron `corepack pnpm` con versión efectiva
`9.15.4`. Se invocaron `-r build`, `-r typecheck` y `-r test` directamente para no
delegar al wrapper pnpm externo desde los scripts root.

| Gate | Resultado |
| --- | --- |
| Frozen lockfile install | PASS |
| Build | 6/6 PASS |
| Typecheck | 6/6 PASS |
| Regresión workspace | 245/245 PASS |
| Asset-forge focal | 38/38 PASS |
| Visual-regression consumer | 9/9 PASS |
| AB-04 consumers | 43/43 PASS |
| Topdown focused baseline | 33/33 PASS |
| Capability registry | 3/3 PASS |
| JSON de archivos cambiados | 6/6 parse PASS |
| `git diff --check` | PASS |

Scans: secretos `0`, archivos cambiados mayores a 1 MiB `0`, APIs prohibidas de
generación `0`, APIs de red `0`, `inflateSync` fuera del parser canónico `0`. El scan
NO-COPY comparó 153 blobs tracked upstream contra 14 archivos del package DevLab y
encontró `0` hashes SHA-256 idénticos. El source externo permaneció limpio y en
`b604139f51d6831780240e8cf1d8b21a42401d0a`.

Los tests hostiles cubren TypeScript, PNG, rutas, roles, lifecycle, manifests y output
admission. Los 100 ciclos create/dispose terminan con cero recursos propios vivos.
