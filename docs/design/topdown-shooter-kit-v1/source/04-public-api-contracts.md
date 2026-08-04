# 04 — Contratos de API pública propuestos — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Interfaces de REFERENCIA. Cada una documenta: responsabilidad, inputs, outputs, ownership, serialization, pause, restart, device-loss y test hooks. Estilo TypeScript, orientadas a juegos arcade pequeños (sin abstracciones innecesarias).

## 1. TopdownSimulation

```ts
interface TopdownSimulation {
  readonly seed: number;
  step(input: InputSnapshot): SimulationSnapshot;   // fixed-step 60Hz; input parcial permitido
  getSnapshot(): SimulationSnapshot;                 // lectura pura
  getDiagnostics(): SimulationDiagnostics;           // contadores + pools + hash
  setCaptureState(state: CaptureState): SimulationSnapshot; // frozen determinista
  restartRun(): void;                                // seed original, estado limpio, floors/colas clear
  restoreCheckpoint(): boolean;                      // estado contractual del checkpoint
}
```
- **Responsabilidad**: autoridad del mundo de juego; sin render, sin DOM.
- **Inputs**: `InputSnapshot` (o parcial). **Outputs**: `SimulationSnapshot` inmutable.
- **Ownership**: todo el estado de simulación (juego) — el kit define el contrato, el consumidor implementa el contenido.
- **Serialization**: snapshot proyectado (serializable); checkpoint via CheckpointProvider.
- **Pause**: el loop externo congela; la sim no avanza sin step().
- **Restart**: restartRun() = limpio y determinista (seed, pools, floors, colas, sin residuos).
- **Device-loss**: la sim NO se entera (el GPU host vive fuera).
- **Test hooks**: getDiagnostics().deterministicStateHash; setCaptureState.

## 2. PlayerController

```ts
interface PlayerController {
  update(dt: number, input: InputSnapshot, world: WorldContext): PlayerState;
}
interface PlayerConfig { speed: number; acceleration: number; damping: number; radius: number; }
interface PlayerState { position: Vec2; velocity: Vec2; facing: Vec2; health: number; invulnerabilitySeconds: number; }
```
- **Responsabilidad**: movimiento + facing + salud + i-frames (sin disparo — eso es CombatCore).
- **Ownership**: PlayerState (pertenece a la sim del consumidor).
- **Pause/Restart/Device-loss**: derivados del lifecycle; sin estado global.

## 3. InputSnapshot

```ts
interface InputSnapshot {
  readonly moveX: number; readonly moveZ: number;
  readonly aimX: number; readonly aimZ: number;      // mundo (ya convertido)
  readonly attack: boolean; readonly activate: boolean;
  readonly start: boolean; readonly restart: boolean; readonly pause: boolean;
}
```
- **Responsabilidad**: frame de input normalizado (capa pública). Los adapters (keyboard/touch) producen esto.
- **Ownership**: efímero (por frame).

## 4. ProjectilePool

```ts
interface ProjectilePool<TKind extends string> {
  readonly capacity: number; readonly activeCount: number;
  readonly highWater: number; readonly dropped: number;
  acquire(spec: ProjectileSpec<TKind>): ProjectileHandle | null; // null = overflow policy
  release(handle: ProjectileHandle): void;
  update(dt: number, collide: (p: ProjectileHandle) => void): void;
  clear(): void;
}
```
- **Ownership**: slots del pool.
- **Overflow policy**: `drop` (skip) o `recycle` (seguro); NUNCA crecimiento ilimitado.
- **Restart/Checkpoint**: clear() en ambos; device-loss: pool de datos no se toca.

## 5. EffectPool

```ts
interface EffectPool {
  spawn(kind: EffectKind, position: Vec2, intensity: number, hostile: boolean): void;
  update(dt: number): void; clear(): void;
}
```
- **Ownership/overflow**: igual que ProjectilePool; agotamiento = skip cosmético.

## 6. EncounterDirector

```ts
interface EncounterDirector {
  readonly phase: string;                    // id de fase del consumidor
  update(dt: number, world: WorldContext): EncounterEvents; // spawn requests, transiciones
  readonly activeBudget: number; readonly queueBudget: number;
  readonly pendingQueue: number;             // 0..queueBudget
}
interface EncounterDef {
  id: string;
  entry: (world: WorldContext) => boolean;
  beats: BeatDef[];                          // [condición, acciones]
  success: (world: WorldContext) => boolean;
  budget: { active: number; queue: number };
  failureRecovery: "restart" | "checkpoint";
}
```
- **Responsabilidad**: secuencia de encuentros, beats, budgets, cola acotada, condiciones de éxito.
- **Softlock recovery**: si un enemigo se pierde (borde), el director NO se traba (regla del contrato v2).

## 7. SpawnDirector

```ts
interface SpawnDirector {
  request(kind: EnemyKind, hatchId: string): boolean; // false si cola llena (defer/reject)
  update(dt: number, world: WorldContext): SpawnEvents;
  clear(): void;
}
type HatchState = "IDLE" | "TELEGRAPH" | "COMMIT";
interface HatchDef { id: string; position: Vec2; telegraphSeconds: number; }
```
- **Lifecycle**: HATCH_IDLE → HATCH_TELEGRAPH (≥0.65s, 2 canales visuales) → SPAWN_COMMIT → ENEMY_ACTIVE.
- **Commit seguro**: nunca dentro del radio del jugador; hatch inválido → reintenta (colas).
- **Restart/Checkpoint**: clear() en ambos.

## 8. CheckpointProvider

```ts
interface CheckpointProvider {
  commit(state: SimulationSnapshot): void;              // solo en estado permitido
  restore(): CheckpointRestoreResult;                    // estado contractual exacto
  readonly available: boolean;
}
interface CheckpointContract {
  allowedStates: readonly string[];                      // fases donde se puede commitear
  forbiddenTransients: readonly string[];                // pools/colas/hatches/telegraphs/efectos
  rngPolicy: "retain-current-stream";                    // v2: sin rewind
  healthPolicy: { restoreTo: number };                   // 100
}
```
- **Ownership**: snapshot proyectado (core attached, relays, health, posición del marcador).

## 9. BossStateMachine

```ts
type BossState = "INTRO" | "TELEGRAPH" | "COMMITTED_ATTACK" | "RECOVERY" | "VULNERABLE" | "TRANSITION" | "DEFEATED";
interface BossStateMachine {
  readonly state: BossState;
  readonly phase: 1 | 2;
  readonly vulnerable: boolean;
  update(dt: number, world: WorldContext): BossEvents;   // ataques, ventanas, transiciones
  receiveDamage(amount: number): boolean;                // true solo si VULNERABLE
  readonly metrics: BossMetrics;                         // tiempo por fase, ataques, ventanas, daño en telegraph/safe-zone
}
interface BossPhaseDef {
  telegraphs: PatternDef[];                              // sweep, fan, directed…
  safeZone: (world: WorldContext) => ZoneDef | null;
  reinforcements: { maxSimultaneous: number; maxRequests: number };
}
```
- **Causalidad**: VULNERABLE abre SOLO tras COMMITTED_ATTACK→RECOVERY (nunca reloj global).
- **Transiciones**: evento explícito entre FSM completadas; DOUBLE_PHASE_TRANSITION prohibido.

## 10. GameLifecycle

```ts
interface GameLifecycle {
  start(): void; pause(): void; resume(): void;
  restart(): void; restore(): void; dispose(): Promise<void>;
  readonly activeLoopCount: number; readonly paused: boolean;
}
```
- **Garantías**: sin handlers/loops/audio duplicados; pause edge-triggered; restart sin rebind; dispose idempotente.

## 11. CaptureStateProvider

```ts
interface CaptureStateProvider {
  readonly viewpoints: readonly string[];
  apply(state: string): void;            // frozen exacto (seed offset + tiempo)
  renderOnce(): Promise<void>;
  readFrame(): Promise<DevLabFrame>;     // PNG + RGBA
  getMetrics(): Promise<CaptureMetrics>; // draw calls, pools, loops, listeners, audio, hash, adapter
}
```
- **Loopback-only**: superficie de captura SOLO en localhost (contrato de seguridad).

## 12. BotObjectiveAdapter

```ts
interface BotObjectiveAdapter {
  nextObjective(snapshot: SimulationSnapshot): ObjectiveAction;
}
type ObjectiveAction = { moveTo?: Vec2; attack?: TargetId | null; activate?: boolean; start?: boolean; restart?: boolean };
```
- **Responsabilidad**: traducir el estado del juego a intenciones del bot (objetivos declarativos por juego).
- **Uso**: el kit provee el runner (10 seeds, gates, softlock window); el consumidor provee los objetivos.

## Reglas transversales de API

1. Snapshots inmutables y serializables (JSON-safe), con `deterministicStateHash`.
2. Sin `Math.random` en runtime del kit (todo por SeededRandom inyectado).
3. Sin Three.js en el núcleo; los snapshots son números/strings.
4. Cada interfaz declara su comportamiento en pause/restart/checkpoint/device-loss (tabla abajo).
5. Test hooks: la surface de test expone snapshot/diagnostics/stepTicks/restart/restore + loop/device controles — SOLO loopback.

| Interfaz | Pause | Restart | Checkpoint | Device-loss |
|---|---|---|---|---|
| TopdownSimulation | no avanza sin step | restartRun limpio | restore contractual | intacta |
| PlayerController | congela | reset | restaura | intacta |
| ProjectilePool/EffectPool | congela | clear | clear | intacta |
| EncounterDirector | congela | reset | estado contractual | intacta |
| SpawnDirector | congela | clear | clear | intacta |
| CheckpointProvider | — | limpiar floors | — | intacta |
| BossStateMachine | congela | reset | estado contractual | intacta |
| GameLifecycle | — | sin rebind | — | rebuild GPU generación |
| CaptureStateProvider | frozen | seed | viewpoint | settlement/render |
| BotObjectiveAdapter | — | — | — | — |
