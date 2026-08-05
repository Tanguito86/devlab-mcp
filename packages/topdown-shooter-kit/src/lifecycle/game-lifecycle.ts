import { ResourceOwner } from "./resource-owner.js";
export interface LifecycleAdapter { startLoop(): void; stopLoop(): void; restartSimulation(): void; restoreCheckpoint(): boolean; clearTransientInfrastructure(): void }
export class GameLifecycle {
  private started = false;
  private pausedValue = false;
  private disposed = false;
  private loopActive = false;
  readonly resources = new ResourceOwner();
  constructor(private readonly adapter: LifecycleAdapter) {}
  start(): void { this.assertOpen(); if (this.started) return; this.started = true; this.startLoop() }
  startPaused(): void { this.assertOpen(); if (this.started) return; this.started = true; this.pausedValue = true }
  pause(): void { this.assertOpen(); if (!this.started || this.pausedValue) return; this.pausedValue = true; this.stopLoop() }
  resume(): void { this.assertOpen(); if (!this.started || !this.pausedValue) return; this.pausedValue = false; this.startLoop() }
  restart(): void { this.assertOpen(); this.adapter.restartSimulation(); this.adapter.clearTransientInfrastructure(); if (this.started && !this.pausedValue) this.startLoop() }
  restore(): boolean { this.assertOpen(); const restored = this.adapter.restoreCheckpoint(); if (restored) this.adapter.clearTransientInfrastructure(); return restored }
  async dispose(): Promise<void> { if (this.disposed) return; this.disposed = true; this.stopLoop(); await this.resources.shutdown() }
  get activeLoopCount(): number { return this.loopActive ? 1 : 0 }
  get paused(): boolean { return this.pausedValue }
  private startLoop(): void { if (this.loopActive) return; this.adapter.startLoop(); this.loopActive = true }
  private stopLoop(): void { if (!this.loopActive) return; this.adapter.stopLoop(); this.loopActive = false }
  private assertOpen(): void { if (this.disposed) throw new Error("lifecycle is disposed") }
}
