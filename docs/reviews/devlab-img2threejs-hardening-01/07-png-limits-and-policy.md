# Límites y política PNG

| Constante | Valor |
| --- | ---: |
| `MAX_PNG_BYTES` | 16 MiB |
| `MAX_WIDTH` | 4096 |
| `MAX_HEIGHT` | 4096 |
| `MAX_PIXELS` | 16,777,216 |
| `MAX_DECODED_BYTES` | 64 MiB |
| `MAX_CHUNKS` | 1024 |
| `MAX_CHUNK_BYTES` | 8 MiB |
| `MAX_METADATA_BYTES` | 1 MiB |

Política: firma exacta; IHDR único, primero y de 13 bytes; dimensiones no nulas y sin
overflow; únicamente profundidad 8, color 0/2/4/6, compresión y filtro 0 e interlace 0;
CRC obligatorio para todos los chunks; IDAT contiguos; IEND único y final; ningún byte
posterior. Los chunks críticos desconocidos se rechazan. El inflado recibe un límite de
salida igual al tamaño filtrado exacto esperado y debe consumirlo exactamente.

Todo rechazo público usa `PngPolicyError` con código estable. Los consumers de archivo
usan `parsePngFile`, que valida tipo y `stat.size` antes de una lectura acotada por file
descriptor; el parser nunca recibe silenciosamente un archivo mayor a `MAX_PNG_BYTES`.
