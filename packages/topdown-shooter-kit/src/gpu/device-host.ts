export interface DeviceGeneration<TDevice> { readonly device: TDevice; dispose(): void | Promise<void> }
export interface DeviceAdapter<TDevice> { create(generation: number): Promise<DeviceGeneration<TDevice>>; isHardware(device: TDevice): boolean }
export interface DeviceLoss { readonly reason: string; readonly message: string; readonly controlled: boolean }
export class DeviceHost<TDevice> {
  private current: DeviceGeneration<TDevice> | null = null;
  private generationValue = 0;
  private recovering = false;
  private recoveries = 0;
  private lossObservedValue = false;
  constructor(private readonly adapter: DeviceAdapter<TDevice>, private readonly simulationHash: () => string) {}
  async initialize(): Promise<TDevice> { if (this.current) return this.current.device; await this.rebuild(); return this.current!.device }
  async recover(_loss: DeviceLoss): Promise<TDevice> {
    if (this.recovering) throw new Error("device recovery already in progress");
    this.recovering = true; this.lossObservedValue = true; const before = this.simulationHash();
    try { await this.current?.dispose(); this.current = null; await this.rebuild(); if (this.simulationHash() !== before) throw new Error("device recovery mutated simulation state"); this.recoveries += 1; return this.current!.device } finally { this.recovering = false }
  }
  async dispose(): Promise<void> { await this.current?.dispose(); this.current = null }
  get generation(): number { return this.generationValue }
  get recoveryCount(): number { return this.recoveries }
  get recoveryInProgress(): boolean { return this.recovering }
  get lostObserved(): boolean { return this.lossObservedValue }
  private async rebuild(): Promise<void> { const next = this.generationValue + 1; const generation = await this.adapter.create(next); if (!this.adapter.isHardware(generation.device)) { await generation.dispose(); throw new Error("native hardware device required") } this.current = generation; this.generationValue = next }
}
