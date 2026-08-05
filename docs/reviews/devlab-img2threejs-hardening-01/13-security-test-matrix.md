# Matriz de tests de seguridad

| Superficie | Casos cubiertos | Resultado focalizado |
| --- | --- | --- |
| TypeScript | newline/code, `${...}`, backticks, traversal, reservadas, NUL, 100k, NaN, Infinity, -0, overflow numérico, colisiones | PASS |
| PNG | firma, truncación, dimensiones, chunks, orden, CRC, inflate bomb, IEND, trailing, color/interlace/filter, metadatos | PASS |
| Roles | autoaprobación ausente, evidencia obligatoria, inmutabilidad, hash binding, severidades | PASS |
| Paths | traversal POSIX/Windows, absolutas, drive, UNC, NUL, segmentos ambiguos, junction | PASS |
| Manifest | orden, hashes, paths únicos, provenance y determinismo fijo | PASS |
| Capture | hash estable, secuencia, device loss, recovery, retry, dispose, alpha runtime, RGBA truncado, PNG corrupto/dimensiones | PASS |

Conteo focalizado del package después del gauntlet: `38/38`. Consumers delegados:
visual-regression `9/9` y suites AB-04 relacionadas `43/43`.
