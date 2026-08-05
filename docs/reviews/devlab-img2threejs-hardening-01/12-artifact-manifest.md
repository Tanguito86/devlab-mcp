# Artifact manifest v1

`createArtifactManifest` materializa el contrato del próximo piloto con:

- `artifactId` y `buildId`;
- nombre, versión, source commit y versión de Three.js del generator;
- spec path relativo y SHA-256;
- target/backend (`webgl`, `webgpu` o `fake`), dimensiones, cámara y opciones de captura;
- seed y declaración `fixed: true`;
- métricas de generación, memoria estimada, PNG, recursos, dispose y capturas;
- manifest de provenance relativo;
- outputs ordenados por path.

Cada output registra secuencia, path, media type, bytes, SHA-256, dimensiones opcionales,
productor, licencia y procedencia. Paths duplicados, hashes inválidos, dimensiones no
positivas y determinismo no fijo fallan antes de producir el manifest.
