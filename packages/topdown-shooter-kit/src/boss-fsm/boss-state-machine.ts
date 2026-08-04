export type BossState = "INTRO" | "TELEGRAPH" | "COMMITTED_ATTACK" | "RECOVERY" | "VULNERABLE" | "TRANSITION" | "DEFEATED";
export interface BossPhaseDef<TPattern extends string> { readonly patterns: readonly TPattern[]; readonly introSeconds: number; readonly telegraphSeconds: number; readonly committedSeconds: number; readonly recoverySeconds: number; readonly vulnerableSeconds: number; readonly maxSimultaneousReinforcements: number; readonly maxReinforcementRequests: number }
export interface BossMetrics { readonly phaseSeconds: readonly [number, number]; readonly attacksExecuted: number; readonly windowsOpened: number; readonly transitionCount: number }
export interface BossEvents<TPattern extends string> { readonly stateChanged?: BossState; readonly attackStarted?: TPattern; readonly phaseChanged?: 2; readonly defeated?: true }

export class BossStateMachine<TPattern extends string> {
  private stateValue: BossState = "INTRO";
  private phaseValue: 1 | 2 = 1;
  private remaining: number;
  private healthValue: number;
  private patternIndex = 0;
  private previousAttackCompleted = false;
  private phaseTimes: [number, number] = [0, 0];
  private attacks = 0;
  private windows = 0;
  private transitions = 0;
  constructor(readonly maximumHealth: number, private readonly phases: readonly [BossPhaseDef<TPattern>, BossPhaseDef<TPattern>]) {
    if (!Number.isFinite(maximumHealth) || maximumHealth <= 0 || phases.some((phase) => phase.patterns.length === 0 || phase.telegraphSeconds <= 0)) throw new RangeError("boss configuration is invalid");
    this.healthValue = maximumHealth; this.remaining = phases[0].introSeconds;
  }
  update(dt: number): BossEvents<TPattern> {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
    if (this.stateValue === "DEFEATED") return {};
    this.phaseTimes[this.phaseValue - 1] += dt; this.remaining -= dt;
    if (this.remaining > 0) return {};
    const phase = this.phases[this.phaseValue - 1];
    if (this.stateValue === "INTRO" || this.stateValue === "VULNERABLE") return this.enter("TELEGRAPH", phase.telegraphSeconds);
    if (this.stateValue === "TELEGRAPH") { const pattern = phase.patterns[this.patternIndex++ % phase.patterns.length]!; this.attacks += 1; return { ...this.enter("COMMITTED_ATTACK", phase.committedSeconds), attackStarted: pattern } }
    if (this.stateValue === "COMMITTED_ATTACK") { this.previousAttackCompleted = true; return this.enter("RECOVERY", phase.recoverySeconds) }
    if (this.stateValue === "RECOVERY") { if (!this.previousAttackCompleted) throw new Error("vulnerability requires a completed attack"); this.previousAttackCompleted = false; this.windows += 1; return this.enter("VULNERABLE", phase.vulnerableSeconds) }
    if (this.stateValue === "TRANSITION") { this.phaseValue = 2; return { ...this.enter("TELEGRAPH", this.phases[1].telegraphSeconds), phaseChanged: 2 } }
    return {};
  }
  receiveDamage(amount: number): boolean {
    if (this.stateValue !== "VULNERABLE" || !Number.isFinite(amount) || amount <= 0) return false;
    this.healthValue = Math.max(0, this.healthValue - amount);
    if (this.healthValue === 0) { this.stateValue = "DEFEATED"; this.remaining = 0; return true }
    if (this.phaseValue === 1 && this.healthValue <= this.maximumHealth / 2) { this.stateValue = "TRANSITION"; this.remaining = 0; this.transitions += 1 }
    return true;
  }
  get state(): BossState { return this.stateValue }
  get phase(): 1 | 2 { return this.phaseValue }
  get vulnerable(): boolean { return this.stateValue === "VULNERABLE" }
  get health(): number { return this.healthValue }
  get metrics(): BossMetrics { return { phaseSeconds: [...this.phaseTimes], attacksExecuted: this.attacks, windowsOpened: this.windows, transitionCount: this.transitions } }
  private enter(state: BossState, seconds: number): BossEvents<TPattern> { this.stateValue = state; this.remaining = seconds; return { stateChanged: state } }
}
