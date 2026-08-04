export interface CheckpointContract<TState, TRecord> {
  readonly allowedStates: readonly string[];
  readonly rngPolicy: "retain-current-stream";
  readonly healthPolicy: { readonly restoreTo: number };
  phase(state: TState): string;
  project(state: TState): TRecord;
  restore(record: TRecord, currentRngPosition: number): TState;
  hasForbiddenTransients(state: TState): boolean;
}

export class CheckpointProvider<TState, TRecord> {
  private record: TRecord | null = null;
  constructor(readonly contract: CheckpointContract<TState, TRecord>) {}
  commit(state: TState): boolean {
    if (!this.contract.allowedStates.includes(this.contract.phase(state)) || this.contract.hasForbiddenTransients(state)) return false;
    this.record = structuredClone(this.contract.project(state)); return true;
  }
  restore(currentRngPosition: number): TState | null { return this.record === null ? null : this.contract.restore(structuredClone(this.record), currentRngPosition) }
  clear(): void { this.record = null }
  get available(): boolean { return this.record !== null }
}
