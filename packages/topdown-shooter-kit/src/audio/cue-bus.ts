export interface CueEvent { readonly name: string; readonly intensity: number }
export class CueBus {
  private unlockedValue = false;
  private pausedValue = false;
  private disposed = false;
  private listeners = new Set<(event: CueEvent) => void>();
  unlock(): void { if (!this.disposed) this.unlockedValue = true }
  pause(): void { this.pausedValue = true }
  resume(): void { this.pausedValue = false }
  subscribe(listener: (event: CueEvent) => void): () => void { if (this.disposed) throw new Error("cue bus disposed"); this.listeners.add(listener); return () => this.listeners.delete(listener) }
  cue(name: string, intensity: number): boolean { if (this.disposed || this.pausedValue || !this.unlockedValue) return false; if (!name || !Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new RangeError("invalid cue"); const event = { name, intensity }; for (const listener of this.listeners) listener(event); return true }
  dispose(): void { this.disposed = true; this.listeners.clear() }
  get voiceCount(): number { return 0 }
  get unlocked(): boolean { return this.unlockedValue }
}
