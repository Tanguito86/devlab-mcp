import type { FixedStepResult } from "../simulation/fixed-step.js";
import { FixedStepAccumulator } from "../simulation/fixed-step.js";
import { GameLifecycle } from "./game-lifecycle.js";

export interface VisibilityStateSource {
  readonly hidden: boolean;
  subscribe(listener: (hidden: boolean) => void): () => void;
}

export interface VisibilityDocumentLike {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export type VisibilityLifecycleEventKind = "VISIBILITY_HIDDEN" | "VISIBILITY_VISIBLE";

export interface VisibilityLifecycleEvent {
  readonly sequence: number;
  readonly kind: VisibilityLifecycleEventKind;
  readonly reason: "document-hidden" | "document-visible";
  readonly monotonicMilliseconds: number;
  readonly simulationSeconds: number;
  readonly manualPauseActive: boolean;
}

export interface VisibilityLifecycleOptions {
  readonly now?: () => number;
  readonly simulationSeconds?: () => number;
  readonly onEvent?: (event: VisibilityLifecycleEvent) => void;
}

export function createDocumentVisibilitySource(document: VisibilityDocumentLike): VisibilityStateSource {
  return {
    get hidden(): boolean { return document.hidden; },
    subscribe(listener: (hidden: boolean) => void): () => void {
      const handle = (): void => listener(document.hidden);
      document.addEventListener("visibilitychange", handle);
      return (): void => document.removeEventListener("visibilitychange", handle);
    },
  };
}

export class VisibilityLifecycleAdapter {
  private readonly now: () => number;
  private readonly simulationSeconds: () => number;
  private readonly onEvent: (event: VisibilityLifecycleEvent) => void;
  private unsubscribe: (() => void) | null = null;
  private hiddenValue = false;
  private manualPauseValue = false;
  private discardExternalElapsed = false;
  private sequence = 0;
  private lastTimestamp = -1;

  constructor(
    private readonly lifecycle: GameLifecycle,
    private readonly source: VisibilityStateSource,
    options: VisibilityLifecycleOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.simulationSeconds = options.simulationSeconds ?? (() => 0);
    this.onEvent = options.onEvent ?? (() => undefined);
  }

  start(): void {
    if (this.unsubscribe) return;
    if (this.source.hidden || this.manualPauseValue) this.lifecycle.startPaused();
    else this.lifecycle.start();
    this.unsubscribe = this.source.subscribe((hidden) => this.applyVisibility(hidden));
    this.applyVisibility(this.source.hidden);
  }

  pauseManually(): void {
    if (this.manualPauseValue) return;
    this.manualPauseValue = true;
    this.lifecycle.pause();
  }

  resumeManually(): void {
    if (!this.manualPauseValue) return;
    this.manualPauseValue = false;
    this.discardExternalElapsed = true;
    if (!this.hiddenValue) this.lifecycle.resume();
  }

  restartSession(): void {
    this.lifecycle.restart();
    this.discardExternalElapsed = true;
  }

  restoreCheckpoint(): boolean {
    const restored = this.lifecycle.restore();
    if (restored) this.discardExternalElapsed = true;
    return restored;
  }

  advance(
    clock: FixedStepAccumulator,
    externalElapsedSeconds: number,
    update: (stepSeconds: number) => void,
  ): FixedStepResult {
    if (!Number.isFinite(externalElapsedSeconds) || externalElapsedSeconds < 0) {
      throw new RangeError("externalElapsedSeconds must be finite and non-negative");
    }
    if (this.hiddenValue || this.manualPauseValue || this.lifecycle.paused) {
      return clock.advance(0, update);
    }
    if (this.discardExternalElapsed) {
      this.discardExternalElapsed = false;
      return clock.advance(0, update);
    }
    return clock.advance(externalElapsedSeconds, update);
  }

  async dispose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.lifecycle.dispose();
  }

  get hidden(): boolean { return this.hiddenValue; }
  get manuallyPaused(): boolean { return this.manualPauseValue; }
  get pendingElapsedDiscard(): boolean { return this.discardExternalElapsed; }

  private applyVisibility(hidden: boolean): void {
    if (hidden === this.hiddenValue) return;
    this.hiddenValue = hidden;
    this.discardExternalElapsed = true;
    if (hidden) this.lifecycle.pause();
    else if (!this.manualPauseValue) this.lifecycle.resume();
    this.sequence += 1;
    this.onEvent({
      sequence: this.sequence,
      kind: hidden ? "VISIBILITY_HIDDEN" : "VISIBILITY_VISIBLE",
      reason: hidden ? "document-hidden" : "document-visible",
      monotonicMilliseconds: this.readMonotonicTimestamp(),
      simulationSeconds: this.readSimulationSeconds(),
      manualPauseActive: this.manualPauseValue,
    });
  }

  private readMonotonicTimestamp(): number {
    const timestamp = this.now();
    if (!Number.isFinite(timestamp) || timestamp < 0) throw new RangeError("lifecycle timestamp must be finite and non-negative");
    if (timestamp < this.lastTimestamp) throw new RangeError("lifecycle timestamp must be monotonic");
    this.lastTimestamp = timestamp;
    return timestamp;
  }

  private readSimulationSeconds(): number {
    const value = this.simulationSeconds();
    if (!Number.isFinite(value) || value < 0) throw new RangeError("simulation time must be finite and non-negative");
    return value;
  }
}
