export interface FixedStepOptions {
  readonly stepSeconds?: number;
  readonly maxCatchUpSteps?: number;
}

export interface FixedStepResult {
  readonly steps: number;
  readonly alpha: number;
  readonly simulationSeconds: number;
  readonly droppedSeconds: number;
}

const DEFAULT_STEP_SECONDS = 1 / 60;
const DEFAULT_MAX_CATCH_UP_STEPS = 8;

/**
 * A deterministic fixed-step accumulator. It owns simulation time only; the
 * renderer remains free to interpolate between the last two simulated states.
 */
export class FixedStepAccumulator {
  readonly stepSeconds: number;
  readonly maxCatchUpSteps: number;

  private accumulatorSeconds = 0;
  private currentSimulationSeconds = 0;
  private paused = true;
  private frozen = true;

  constructor(options: FixedStepOptions = {}) {
    this.stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
    this.maxCatchUpSteps = options.maxCatchUpSteps ?? DEFAULT_MAX_CATCH_UP_STEPS;

    if (!Number.isFinite(this.stepSeconds) || this.stepSeconds <= 0) {
      throw new RangeError("stepSeconds must be a positive finite number");
    }
    if (!Number.isInteger(this.maxCatchUpSteps) || this.maxCatchUpSteps < 1) {
      throw new RangeError("maxCatchUpSteps must be a positive integer");
    }
  }

  get simulationSeconds(): number {
    return this.currentSimulationSeconds;
  }

  get interpolationAlpha(): number {
    return this.accumulatorSeconds / this.stepSeconds;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.frozen = false;
    this.paused = false;
    this.accumulatorSeconds = 0;
  }

  freezeAt(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError("frozen time must be a finite non-negative number");
    }
    this.currentSimulationSeconds = milliseconds / 1000;
    this.accumulatorSeconds = 0;
    this.paused = true;
    this.frozen = true;
  }

  advance(deltaSeconds: number, update: (stepSeconds: number) => void): FixedStepResult {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("deltaSeconds must be a finite non-negative number");
    }
    if (this.paused || this.frozen) {
      return this.result(0, 0);
    }

    const maximumAccumulated = this.stepSeconds * this.maxCatchUpSteps;
    const acceptedDelta = Math.min(deltaSeconds, maximumAccumulated);
    let droppedSeconds = deltaSeconds - acceptedDelta;
    this.accumulatorSeconds = Math.min(
      this.accumulatorSeconds + acceptedDelta,
      maximumAccumulated,
    );

    let steps = 0;
    while (this.accumulatorSeconds + Number.EPSILON >= this.stepSeconds
      && steps < this.maxCatchUpSteps) {
      update(this.stepSeconds);
      this.currentSimulationSeconds += this.stepSeconds;
      this.accumulatorSeconds -= this.stepSeconds;
      steps += 1;
    }

    // Floating point drift can leave a tiny negative residue after subtraction.
    this.accumulatorSeconds = Math.max(0, this.accumulatorSeconds);
    if (this.accumulatorSeconds >= this.stepSeconds) {
      const unprocessedSteps = Math.floor(this.accumulatorSeconds / this.stepSeconds);
      const unprocessedSeconds = unprocessedSteps * this.stepSeconds;
      droppedSeconds += unprocessedSeconds;
      this.accumulatorSeconds -= unprocessedSeconds;
    }

    return this.result(steps, droppedSeconds);
  }

  private result(steps: number, droppedSeconds: number): FixedStepResult {
    return {
      steps,
      alpha: this.interpolationAlpha,
      simulationSeconds: this.currentSimulationSeconds,
      droppedSeconds,
    };
  }
}

export const FIXED_STEP_HZ = 60;
