# 02 — Matriz genérico vs específico — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Clasificación de cada elemento del inventario (01-runtime-inventory.json). Criterio: si el sistema puede servir a otro shooter cenital sin cambios de contenido → GENERIC; si necesita una adaptación → GENERIC_WITH_ADAPTER; si es contenido → ASH_RELAY_SPECIFIC; si es deuda → DO_NOT_EXTRACT.

## GENERIC_CORE — entra al kit tal cual (puro, sin contenido)

| Elemento | Sistema | Nota |
|---|---|---|
| FixedStepAccumulator | SYS-02 | puro, determinista, pause/freeze exacta |
| ResourceOwner | SYS-25 | LIFO idempotente |
| computeViewportPlan | SYS-26 | desktop/portrait, resize inerte |
| SeededRandom | core/random.ts | Mulberry32 seedable (no inventariado aparte, es parte del contrato de sim) |
| GameLifecycle (restart/pause/resume/dispose) | SYS-17, SYS-18 | mecanismo puro |
| WebGpuDeviceHost | SYS-24 | fail-closed + device loss (infraestructura) |
| Game loop (rAF único) | SYS-01 | loop sin contenido |

## GENERIC_WITH_ADAPTER — entra al kit con una interfaz de adaptación

| Elemento | Sistema | Adapter requerido |
|---|---|---|
| InputController | SYS-04/05 | bindings DOM (qué teclas/botones); salida: InputSnapshot |
| PlayerController (movimiento+aim) | SYS-06/07 | config (speed/accel/damping), arena, cámara (screenToWorld) |
| CombatCore (disparo + pools) | SYS-08/09/10 | kinds de proyectil/efecto, daños, cooldowns |
| EnemyLifecycle | SYS-11 | IA por kind (pursuit/lane), stats, radio de colisión |
| EncounterDirector | SYS-12/13 | fases del juego, budgets, secuencia |
| SpawnDirector (hatches) | SYS-14 | posiciones de hatch, duración del telegraph |
| HoldObjective (relay activation) | SYS-15 | radio, duración, floor config |
| CheckpointProvider | SYS-16 | qué serializar (snapshot projection) |
| BossStateMachine | SYS-19 | patrones por fase (ataques, telegraphs), HP |
| AudioCueBus | SYS-21 | specs de cues (frecuencias/duración) |
| HudBindings | SYS-20 | textos, layout, fases → OverlayModel |
| BotObjectiveAdapter | SYS-23 | objetivos del bot (nodos, boss, evac) |
| CaptureStateProvider | SYS-22 | viewpoints del juego, seed offsets |

## ASH_RELAY_SPECIFIC — contenido, NO entra al kit

| Elemento | Razón |
|---|---|
| Cinder Scrapper (kind, stats 30/42, contacto 6/7, weave) | IA/estadísticas de contenido |
| Arc Sentry (kind, stats 44/56, bolt, apertura 0.32s) | IA/estadísticas de contenido |
| Relay Custodian (540 HP, patrones sweep/fan) | contenido del boss |
| Node 01/02 (posiciones -7.2,-0.5 / 7.1,6.2) | mapa |
| Coordenadas de arena (-12..12, -10..14) y hatches | mapa |
| Valores de balance (speed 8.5, cooldown 0.145, daño 18, budgets 2/2, 5/5, 2/3) | balance (config del consumidor) |
| Story text (title/modal/copy) | historia |
| Paleta visual (cyan/orange, materiales core/conduit/overload) | arte |
| HUD final (ASH RELAY // CINDER UNIT 04, SECTOR 01-03) | contenido |
| Audio concreto (specs de los 8 cues) | contenido |
| Fases de misión (encounter-1, checkpoint, …) como nombres | contenido |

## DO_NOT_EXTRACT — deuda/ataduras, no mover

| Elemento | Razón |
|---|---|
| updatePhaseLogic con waves por timeouts (build actual) | será reemplazado por encounter director con colas (06B); extraerlo ahora = duplicar lógica obsoleta |
| updateGuardian con ciclo temporal + refuerzos infinitos (build actual) | REWRITE en 06B (FSM v2); NO extraer el ciclo temporal |
| updateNodeActivation sin floor (build actual) | REWRITE en 06B (floor 75%); extraer sin floor = heredar el bug AR-01 |
| fusion attack/activate en touch (AR-09) | REWRITE en 06B (intención inequívoca); no extraer el diseño defectuoso |
| spawnEncounterOne/Two con coordenadas crudas | será reemplazado por hatches (06B) |
| `__ASH_RELAY_TEST__` (surface específica) | reemplazada por BotObjectiveAdapter + test surface genérica |
| constants duplicadas (ASH_RELAY_SEED en scripts y sim) | limpiar en la extracción, no copiar |
| CaptureOverlay (CanvasTexture HUD) | genérico en patrón pero el dibujado (drawTitle/drawHud/drawBoss) es 100% contenido — el kit lleva el MECANISMO (overlay determinista), el dibujo queda en el consumidor |

## Regla de oro de la separación

El kit NO contiene: nombres de enemigos, valores de balance, mapa, historia, arte ni HUD final.
El kit SÍ contiene: mecanismos, contratos, máquinas de estado, pools, lifecycle, captura, QA.
Cada juego consumidor provee: kinds, stats, niveles, textos, paleta, audio concreto y budgets.
