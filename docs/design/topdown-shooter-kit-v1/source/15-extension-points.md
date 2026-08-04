# 15 — Puntos de extensión con herramientas futuras — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Ninguno de estos componentes se incorpora al kit en el primer sprint. Son sockets de integración diseñados, no dependencias.

| Herramienta | Rol futuro | Punto de extensión en el kit | Regla |
|---|---|---|---|
| **IMG2THREEJS** | asset factories | `AssetFactory` interface en el render adapter del consumidor: `createPlayer(config)`, `createEnemy(kind)`, `createProp(assetId)` — el kit define el CONTRATO de socket (id → mesh), no la factory | fuera del núcleo; el kit no importa img2threejs |
| **GVF (game-visual-forge)** | render-to-atlas y packaging | `VisualAtlas` contract: el render adapter puede empaquetar meshes/texturas a atlas; el kit solo exige identidad visual estable por kind (para determinismo de capturas) | integración en el consumidor; GVF empaqueta, el kit no |
| **R3F (react-three-fiber)** | arquitectura alternativa futura | `RenderAdapter` interface (snapshot → scene): si un juego futuro usa R3F, implementa el adapter con R3F; el kit no depende de React ni R3F | NO dependencia; el kit queda framework-agnostic en render |
| **Gaussian Splats** | adaptador ambiental futuro | `EnvironmentAdapter`: fondo/ambiente opcional inyectado al render; la sim (2D topdown) no interactúa con splats | fuera del core; opcional por consumidor |
| **IMAGE_GEN** | conceptos de assets (fuera del runtime) | el pipeline de conceptos vive en el flujo de desarrollo (DevLab docs), NO en el runtime; el kit solo consume assets finales vía AssetFactory | no entra al runtime del kit |
| **DEEPSEEK/HERMES** | critic contracts | el paquete crítico (ash-relay-critic-v2) ES el patrón: rúbrica + probes + gates por contrato; el kit expone `testing/` para que la crítica sea reproducible (bot runner, capture surface, determinismo) | los contratos de QA del kit alimentan futuras críticas de otros juegos |
| **CODEX** | builder e integrador | `16-codex-kit-07-brief.md` define el brief de implementación; los adapters del consumidor son el contrato de integración | Codex implementa el kit y los adapters de Ash Relay en KIT-07 |

## Principios de extensión

1. **Sockets, no dependencias**: el kit define interfaces; las herramientas se conectan desde el consumidor.
2. **Núcleo estable**: sim/input/pools/directores/FSM/lifecycle/captura no cambian su API por integraciones de assets o render alternativo.
3. **Determinismo preservado**: cualquier integración visual (atlas, splats, R3F) NO altera el snapshot ni el hash; solo el render.
4. **Captura estable**: el overlay determinista y el readback PNG/RGBA son el contrato de evidencia para futuras críticas y para DevLab.
5. **El kit es infraestructura**: nunca contiene arte, historia, mapas ni balance (ver 02 y 07-límites).
