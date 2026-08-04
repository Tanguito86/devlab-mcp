import type { PoolSnapshot } from "../contracts/types.js";
export interface PoolHandle<T> { readonly id: number; readonly value: T }
interface Slot<T> { active: boolean; value: T }

export class Pool<T> {
  private readonly slots: Slot<T>[];
  private currentActive = 0;
  private peak = 0;
  private rejected = 0;
  constructor(readonly capacity: number, factory: (id: number) => T) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("capacity must be a positive integer");
    this.slots = Array.from({ length: capacity }, (_, id) => ({ active: false, value: factory(id) }));
  }
  acquire(initialize?: (value: T) => void): PoolHandle<T> | null {
    const id = this.slots.findIndex((slot) => !slot.active);
    if (id < 0) { this.rejected += 1; return null }
    const slot = this.slots[id]!; slot.active = true; initialize?.(slot.value);
    this.currentActive += 1; this.peak = Math.max(this.peak, this.currentActive);
    return { id, value: slot.value };
  }
  release(handle: PoolHandle<T>): void {
    const slot = this.slots[handle.id];
    if (!slot || slot.value !== handle.value || !slot.active) return;
    slot.active = false; this.currentActive -= 1;
  }
  forEachActive(visitor: (handle: PoolHandle<T>) => void): void { this.slots.forEach((slot, id) => { if (slot.active) visitor({ id, value: slot.value }) }) }
  clear(): void { for (const slot of this.slots) slot.active = false; this.currentActive = 0 }
  get snapshot(): PoolSnapshot { return { active: this.currentActive, capacity: this.capacity, highWater: this.peak, dropped: this.rejected } }
}

/** Semantic pool names exposed by the public kit contract. */
export class ProjectilePool<T> extends Pool<T> {}
export class EffectPool<T> extends Pool<T> {}
