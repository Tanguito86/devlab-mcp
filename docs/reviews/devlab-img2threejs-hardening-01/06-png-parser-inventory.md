# Inventario de parsers PNG

La revisión del pin externo encontró cinco decodificadores completos duplicados. Todos
leen el archivo entero, concatenan `IDAT` y llaman a `zlib.decompress` antes de demostrar
un presupuesto de salida. Tampoco prueban de forma completa CRC, unicidad/orden de IHDR,
IEND obligatorio, trailing bytes, cantidad de chunks o límites de metadatos.

DevLab no adapta esas copias. Introduce un único `parsePng` canónico y obliga a futuros
consumidores del adapter a pasar por él. Los lectores parciales upstream se registran
como superficie adicional, no como nuevas copias del decoder completo.

El gauntlet encontró además dos decoders completos dentro del baseline DevLab:
`visual-regression-mcp/ImageComparator.ts` y `scripts/threejs-game-skills-ab04.mjs`.
Ambos fueron eliminados como implementaciones independientes y ahora delegan en
`parsePng`. Resultado DevLab: una implementación canónica, dos consumers; `inflateSync`
solo aparece en `packages/img2threejs-asset-forge/src/png.ts`. Las cinco copias upstream
permanecen sin modificar por la frontera read-only.
