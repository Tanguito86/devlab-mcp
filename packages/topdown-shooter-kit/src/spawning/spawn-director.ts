import type { Vec2 } from "../contracts/types.js";
import { BoundedQueue } from "./bounded-queue.js";

export type HatchState = "IDLE" | "TELEGRAPH" | "COMMIT";
export interface HatchDef { readonly id: string; readonly position: Vec2; readonly telegraphSeconds: number; readonly channels: number }
export interface SpawnRequest<TKind extends string> { readonly kind: TKind; readonly preferredHatchId?: string }
export interface SpawnCommit<TKind extends string> { readonly kind: TKind; readonly hatchId: string; readonly position: Vec2 }
interface ActiveHatch<TKind extends string> { request: SpawnRequest<TKind>; hatch: HatchDef; state: HatchState; remaining: number }

export class SpawnDirector<TKind extends string> {
  private readonly queue: BoundedQueue<SpawnRequest<TKind>>;
  private active: ActiveHatch<TKind> | null = null;
  constructor(readonly hatches: readonly HatchDef[], queueCapacity: number, private readonly minimumPlayerDistance: number) {
    if (hatches.length === 0 || new Set(hatches.map((hatch) => hatch.id)).size !== hatches.length) throw new Error("hatches must be non-empty and uniquely identified");
    if (hatches.some((hatch) => hatch.telegraphSeconds < 0.65 || hatch.channels < 2)) throw new Error("every hatch requires at least 0.65 seconds and two telegraph channels");
    this.queue = new BoundedQueue(queueCapacity);
  }
  request(kind: TKind, preferredHatchId?: string): boolean { return this.queue.enqueue({ kind, preferredHatchId }) }
  update(dt: number, player: Vec2): readonly SpawnCommit<TKind>[] {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
    if (!this.active) this.activateNext(player);
    if (!this.active) return [];
    this.active.remaining -= dt;
    if (this.active.remaining > 0) return [];
    if (this.active.state === "TELEGRAPH") { this.active.state = "COMMIT"; return [] }
    const commit = { kind: this.active.request.kind, hatchId: this.active.hatch.id, position: this.active.hatch.position };
    this.active = null; this.activateNext(player); return [commit];
  }
  clear(): void { this.queue.clear(); this.active = null }
  get pendingQueue(): number { return this.queue.pending }
  get hatchState(): HatchState { return this.active?.state ?? "IDLE" }
  get diagnostics(): { readonly pending: number; readonly capacity: number; readonly highWater: number; readonly rejected: number } { return this.queue.diagnostics }

  private activateNext(player: Vec2): void {
    const request = this.queue.peek(); if (!request) return;
    const preferred = request.preferredHatchId ? this.hatches.find((candidate) => candidate.id === request.preferredHatchId) : undefined;
    const ordered = preferred ? [preferred, ...this.hatches.filter((candidate) => candidate !== preferred)] : this.hatches;
    const hatch = ordered.find((candidate) => Math.hypot(candidate.position.x - player.x, candidate.position.z - player.z) >= this.minimumPlayerDistance);
    if (!hatch) return;
    this.queue.dequeue(); this.active = { request, hatch, state: "TELEGRAPH", remaining: hatch.telegraphSeconds };
  }
}
