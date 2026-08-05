# Threat model

| Activo | Entrada hostil | Riesgo | Control requerido |
| --- | --- | --- | --- |
| Módulo TypeScript | nombres, comentarios, números y objetos | inyección o output no compilable | identificadores ASCII validados, JSON canónico, números finitos, cero normalizado |
| Memoria/CPU | bytes PNG | zip bomb, overflow, asignación excesiva | límites antes de asignar/inflar y tamaño exacto esperado |
| Filesystem | rutas de artefactos | traversal, rutas absolutas, symlinks | normalización relativa, containment y rechazo de symlinks |
| Decisión de calidad | reporte del builder | autoaprobación o mutación de evidencia | roles separados e inputs inmutables |
| GPU/JS heap | recursos de modelo | pérdidas, doble dispose, shared corruption | ownership explícito e idempotencia |
| Evidencia | captura y manifiesto | hashes inestables o estados ambiguos | secuencia determinista, SHA-256 y máquina de estados |

## Confianza

Se confía en el coordinador local y en el toolchain pinneado. No se confía en specs,
imágenes, paths, nombres, metadatos ni resultados del builder. Un `CriticReport` tampoco
es aprobación: el Resolver aplica una política cerrada y reproducible.

## Fuera de alcance

No se prueba WebGPU real, calidad artística, equivalencia con upstream, rendimiento en
hardware ni la construcción del asset piloto.
