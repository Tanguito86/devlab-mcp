const UINT32_RANGE = 4_294_967_296;
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) throw new RangeError("seed must be finite");
  return Math.trunc(seed) >>> 0;
}
export class SeededRandom {
  private state: number;
  constructor(seed: number) { this.state = normalizeSeed(seed) }
  get position(): number { return this.state >>> 0 }
  restorePosition(position: number): void { this.state = normalizeSeed(position) }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let value = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  }
  range(minimum: number, maximum: number): number {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum) throw new RangeError("range bounds must be finite and ordered");
    return minimum + (maximum - minimum) * this.next();
  }
}
