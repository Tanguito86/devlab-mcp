# Frontera NO-COPY

## Regla

El source pinneado se usa únicamente para inventariar ideas, riesgos y contratos. No se
copian funciones, módulos, fixtures, plantillas, prompts, dependencias ni assets. No se
modifica ni ejecuta su pipeline.

## Implementación autorizada

DevLab puede escribir una implementación independiente basada en requisitos públicos y
en los defectos observados:

- serialización de datos mediante JSON y validación propia de identificadores;
- parser PNG canónico, acotado y fail-closed;
- separación tipada Builder/Critic/Resolver;
- ciclo de vida explícito de recursos;
- captura determinista con adaptador mínimo;
- rutas relativas seguras y manifiestos con hashes.

La nueva biblioteca no dependerá en runtime del checkout externo ni importará sus
módulos. Sus tests usarán fixtures sintéticos creados dentro de DevLab.

## Prohibiciones

- vendorear código Apache del upstream;
- aplicar parches sobre el checkout externo;
- instalarlo globalmente o en el workspace;
- reutilizar nombres de archivos como prueba de equivalencia funcional;
- ejecutar el piloto o afirmar fidelidad visual;
- atribuir a DevLab resultados que solo aparecen en documentación upstream.

Esta frontera fue materializada antes de crear código de producto para el sprint.
