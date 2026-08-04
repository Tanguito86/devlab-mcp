export interface FixedStepOptions { readonly stepSeconds?: number; readonly maxCatchUpSteps?: number }
export interface FixedStepResult { readonly steps: number; readonly alpha: number; readonly simulationSeconds: number; readonly droppedSeconds: number }

export class FixedStepAccumulator {
  readonly stepSeconds: number;
  readonly maxCatchUpSteps: number;
  private accumulatorSeconds = 0;
  private currentSimulationSeconds = 0;
  private paused = true;
  private frozen = true;

  constructor(options: FixedStepOptions = {}) {
    this.stepSeconds = options.stepSeconds ?? 1 / 60;
    this.maxCatchUpSteps = options.maxCatchUpSteps ?? 8;
    if (!Number.isFinite(this.stepSeconds) || this.stepSeconds <= 0) throw new RangeError("stepSeconds must be positive and finite");
    if (!Number.isInteger(this.maxCatchUpSteps) || this.maxCatchUpSteps < 1) throw new RangeError("maxCatchUpSteps must be a positive integer");
  }

  get simulationSeconds(): number { return this.currentSimulationSeconds }
  get interpolationAlpha(): number { return this.accumulatorSeconds / this.stepSeconds }
  get isPaused(): boolean { return this.paused }
  get isFrozen(): boolean { return this.frozen }
  pause(): void { this.paused = true }
  resume(): void { this.frozen = false; this.paused = false; this.accumulatorSeconds = 0 }
  reset(): void { this.accumulatorSeconds = 0; this.currentSimulationSeconds = 0; this.paused = true; this.frozen = true }

  freezeAt(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("frozen time must be finite and non-negative");
    this.currentSimulationSeconds = milliseconds / 1000;
    this.accumulatorSeconds = 0;
    this.paused = true;
    this.frozen = true;
  }

  advance(deltaSeconds: number, update: (stepSeconds: number) => void): FixedStepResult {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError("deltaSeconds must be finite and non-negative");
    if (this.paused || this.frozen) return this.result(0, 0);
    const maximum = this.stepSeconds * this.maxCatchUpSteps;
    const accepted = Math.min(deltaSeconds, maximum);
    let dropped = deltaSeconds - accepted;
    this.accumulatorSeconds = Math.min(this.accumulatorSeconds + accepted, maximum);
    let steps = 0;
    while (this.accumulatorSeconds + Number.EPSILON >= this.stepSeconds && steps < this.maxCatchUpSteps) {
      update(this.stepSeconds);
      this.currentSimulationSeconds += this.stepSeconds;
      this.accumulatorSeconds -= this.stepSeconds;
      steps += 1;
    }
    this.accumulatorSeconds = Math.max(0, this.accumulatorSeconds);
    if (this.accumulatorSeconds >= this.stepSeconds) {
      const excess = Math.floor(this.accumulatorSeconds / this.stepSeconds) * this.stepSeconds;
      dropped += excess;
      this.accumulatorSeconds -= excess;
    }
    return this.result(steps, dropped);
  }

  private result(steps: number, droppedSeconds: number): FixedStepResult {
    return { steps, alpha: this.interpolationAlpha, simulationSeconds: this.currentSimulationSeconds, droppedSeconds };
  }
}

export const FIXED_STEP_HZ = 60;
