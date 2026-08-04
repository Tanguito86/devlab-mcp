import type { BotObjectiveAdapter, InputSnapshot, TopdownSimulation } from "../contracts/types.js";
export interface BotGate<TSnapshot> { readonly name: string; pass(snapshot: TSnapshot): boolean }
export interface BotRunResult<TSnapshot> { readonly result: "PASS" | "FAIL"; readonly ticks: number; readonly softlocks: number; readonly finalSnapshot: TSnapshot; readonly failedGates: readonly string[] }
export function runBot<TSnapshot, TDiagnostics>(simulation: TopdownSimulation<TSnapshot, TDiagnostics>, adapter: BotObjectiveAdapter<TSnapshot>, gates: readonly BotGate<TSnapshot>[], options: { readonly maximumTicks: number; readonly softlockWindowTicks: number; readonly progressHash: (snapshot: TSnapshot) => string }): BotRunResult<TSnapshot> {
  let previousHash = options.progressHash(simulation.getSnapshot()); let stalled = 0; let softlocks = 0; let ticks = 0;
  for (; ticks < options.maximumTicks; ticks += 1) {
    const before = simulation.getSnapshot(); const input: InputSnapshot = adapter.nextObjective(before); const after = simulation.step(input); const hash = options.progressHash(after);
    if (hash === previousHash) stalled += 1; else stalled = 0;
    previousHash = hash;
    if (stalled === options.softlockWindowTicks) softlocks += 1;
    if (gates.every((gate) => gate.pass(after))) break;
  }
  const finalSnapshot = simulation.getSnapshot(); const failedGates = gates.filter((gate) => !gate.pass(finalSnapshot)).map((gate) => gate.name);
  return { result: failedGates.length === 0 && softlocks === 0 ? "PASS" : "FAIL", ticks, softlocks, finalSnapshot, failedGates };
}
export const DEFAULT_BOT_SEEDS = Object.freeze([424242, 424243, 424244, 424245, 424246, 424247, 424248, 424249, 424250, 424251]);
