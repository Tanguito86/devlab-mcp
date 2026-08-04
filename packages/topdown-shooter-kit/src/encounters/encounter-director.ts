export interface EncounterWorld { readonly activeHostiles: number; readonly flags: ReadonlySet<string> }
export interface EncounterAction<TSpawn extends string> { readonly spawn?: readonly TSpawn[]; readonly setFlags?: readonly string[] }
export interface BeatDef<TSpawn extends string> { readonly id: string; readonly when: (world: EncounterWorld) => boolean; readonly action: EncounterAction<TSpawn> }
export interface EncounterDef<TSpawn extends string> { readonly id: string; readonly entry: (world: EncounterWorld) => boolean; readonly beats: readonly BeatDef<TSpawn>[]; readonly success: (world: EncounterWorld) => boolean; readonly budget: { readonly active: number; readonly queue: number }; readonly failureRecovery: "restart" | "checkpoint" }

export class EncounterDirector<TSpawn extends string> {
  private current: EncounterDef<TSpawn> | null = null;
  private beatIndex = 0;
  constructor(private readonly definitions: readonly EncounterDef<TSpawn>[]) {
    if (new Set(definitions.map((definition) => definition.id)).size !== definitions.length) throw new Error("encounter ids must be unique");
    for (const definition of definitions) if (definition.budget.active < 0 || definition.budget.queue < 0) throw new RangeError("encounter budgets must be non-negative");
  }
  update(world: EncounterWorld): EncounterAction<TSpawn> {
    if (!this.current) { this.current = this.definitions.find((definition) => definition.entry(world)) ?? null; this.beatIndex = 0 }
    if (!this.current || this.current.success(world)) return {};
    const beat = this.current.beats[this.beatIndex];
    if (!beat || !beat.when(world)) return {};
    this.beatIndex += 1; return beat.action;
  }
  completeIfSuccessful(world: EncounterWorld): boolean { if (!this.current?.success(world)) return false; this.current = null; this.beatIndex = 0; return true }
  reset(): void { this.current = null; this.beatIndex = 0 }
  get phase(): string { return this.current?.id ?? "idle" }
  get activeBudget(): number { return this.current?.budget.active ?? 0 }
  get queueBudget(): number { return this.current?.budget.queue ?? 0 }
}
