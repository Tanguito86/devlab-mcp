export interface Vec2 { readonly x: number; readonly z: number }

export interface InputSnapshot {
  readonly moveX: number;
  readonly moveZ: number;
  readonly aimX: number;
  readonly aimZ: number;
  readonly attack: boolean;
  readonly activate: boolean;
  readonly start: boolean;
  readonly restart: boolean;
  readonly pause: boolean;
}

export const EMPTY_INPUT: InputSnapshot = Object.freeze({
  moveX: 0, moveZ: 0, aimX: 0, aimZ: 1,
  attack: false, activate: false, start: false, restart: false, pause: false,
});

export interface PoolSnapshot {
  readonly active: number;
  readonly capacity: number;
  readonly highWater: number;
  readonly dropped: number;
}

export interface DirectionTransform {
  screenToWorld(screenRight: number, screenUp: number): Vec2;
  worldToScreen(world: Vec2): { readonly right: number; readonly up: number };
}

export interface TopdownSimulation<TSnapshot, TDiagnostics> {
  readonly seed: number;
  step(input: InputSnapshot): TSnapshot;
  getSnapshot(): TSnapshot;
  getDiagnostics(): TDiagnostics;
  setCaptureState(state: string): TSnapshot;
  restartRun(): void;
  restoreCheckpoint(): boolean;
}

export interface CaptureStateProvider<TFrame, TMetrics> {
  readonly viewpoints: readonly string[];
  apply(state: string): void;
  renderOnce(): Promise<void>;
  readFrame(): Promise<TFrame>;
  getMetrics(): Promise<TMetrics>;
}

export interface BotObjectiveAdapter<TSnapshot> {
  nextObjective(snapshot: TSnapshot): InputSnapshot;
}
