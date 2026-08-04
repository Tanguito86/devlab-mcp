export class BoundedQueue<T> {
  private readonly slots: (T | undefined)[];
  private head = 0;
  private size = 0;
  private highWater = 0;
  private rejected = 0;
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 0) throw new RangeError("queue capacity must be a non-negative integer");
    this.slots = Array.from({ length: capacity });
  }
  enqueue(value: T): boolean {
    if (this.size >= this.capacity) { this.rejected += 1; return false }
    this.slots[(this.head + this.size) % this.capacity] = value;
    this.size += 1; this.highWater = Math.max(this.highWater, this.size); return true;
  }
  peek(): T | undefined { return this.size === 0 ? undefined : this.slots[this.head] }
  dequeue(): T | undefined {
    if (this.size === 0) return undefined;
    const value = this.slots[this.head]; this.slots[this.head] = undefined;
    this.head = this.capacity === 0 ? 0 : (this.head + 1) % this.capacity; this.size -= 1; return value;
  }
  clear(): void { this.slots.fill(undefined); this.head = 0; this.size = 0 }
  get pending(): number { return this.size }
  get diagnostics(): { readonly pending: number; readonly capacity: number; readonly highWater: number; readonly rejected: number } { return { pending: this.size, capacity: this.capacity, highWater: this.highWater, rejected: this.rejected } }
}
