import { normalizeSeed } from "../simulation/random.js";

export const FogTier = {
  TIER_0: 0,
  TIER_1: 1,
  TIER_2: 2,
  TIER_3: 3,
} as const;

export type FogTier = (typeof FogTier)[keyof typeof FogTier];
type KnowledgeTier = 0 | 1 | 2;

export interface FogCell {
  readonly x: number;
  readonly y: number;
  readonly tier: FogTier;
  readonly obstacle: boolean;
}

export interface VisibilitySource {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly revealRadius: number;
  readonly detectionRadius: number;
}

interface FogCellState {
  knowledgeTier: KnowledgeTier;
  currentVisible: boolean;
}

export interface FogSnapshot {
  readonly schemaVersion: 1;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly updateBudgetCells: number;
  readonly sweepNumber: number;
  readonly cursor: number;
  readonly obstacles: readonly boolean[];
  readonly cells: readonly { readonly knowledgeTier: KnowledgeTier; readonly currentVisible: boolean }[];
  readonly activeSources: readonly VisibilitySource[] | null;
  readonly pendingCells: readonly ({ readonly knowledgeTier: KnowledgeTier; readonly currentVisible: boolean } | null)[] | null;
  readonly pendingTransitions: readonly FogTransition[];
}

export interface FogTransition {
  readonly x: number;
  readonly y: number;
  readonly from: FogTier;
  readonly to: FogTier;
}

export interface FogUpdateResult {
  readonly evaluatedCells: number;
  readonly sweepComplete: boolean;
  readonly transitions: readonly FogTransition[];
}

export interface FogSystemOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly obstacles?: readonly { readonly x: number; readonly y: number }[];
  readonly updateBudgetCells?: number;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`);
  return value;
}

function effectiveTier(cell: FogCellState): FogTier {
  return cell.currentVisible ? FogTier.TIER_3 : cell.knowledgeTier;
}

function copySource(source: VisibilitySource): VisibilitySource {
  return { id: source.id, x: source.x, y: source.y, revealRadius: source.revealRadius, detectionRadius: source.detectionRadius };
}

export class FogSystem {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly updateBudgetCells: number;
  private readonly obstacles: boolean[];
  private cells: FogCellState[];
  private sweepNumber = 0;
  private cursor = 0;
  private activeSources: VisibilitySource[] | null = null;
  private pendingCells: (FogCellState | null)[] | null = null;
  private pendingTransitions: FogTransition[] = [];

  constructor(options: FogSystemOptions) {
    this.width = positiveInteger(options.width, "width");
    this.height = positiveInteger(options.height, "height");
    this.seed = normalizeSeed(options.seed);
    this.updateBudgetCells = positiveInteger(options.updateBudgetCells ?? this.width * this.height, "updateBudgetCells");
    this.obstacles = Array.from({ length: this.width * this.height }, () => false);
    for (const obstacle of options.obstacles ?? []) {
      this.assertCoordinate(obstacle.x, obstacle.y);
      const index = this.indexOf(obstacle.x, obstacle.y);
      if (this.obstacles[index]) throw new RangeError(`duplicate obstacle at ${obstacle.x},${obstacle.y}`);
      this.obstacles[index] = true;
    }
    this.cells = this.createUnknownCells();
  }

  update(sources: readonly VisibilitySource[]): FogUpdateResult {
    let transitions: FogTransition[] = [];
    if (this.activeSources === null) this.beginSweep(sources);
    let evaluatedCells = 0;
    const cellCount = this.cells.length;
    const scanStart = this.scanStart();
    while (this.cursor < cellCount && evaluatedCells < this.updateBudgetCells) {
      const index = (scanStart + this.cursor) % cellCount;
      this.evaluateCell(index, this.activeSources!);
      this.cursor += 1;
      evaluatedCells += 1;
    }
    const sweepComplete = this.cursor === cellCount;
    if (sweepComplete) {
      this.cells = this.pendingCells as FogCellState[];
      transitions = this.pendingTransitions;
      this.activeSources = null;
      this.pendingCells = null;
      this.pendingTransitions = [];
      this.cursor = 0;
    }
    return { evaluatedCells, sweepComplete, transitions };
  }

  getCell(x: number, y: number): FogCell {
    this.assertCoordinate(x, y);
    const index = this.indexOf(x, y);
    return { x, y, tier: effectiveTier(this.cells[index]!), obstacle: this.obstacles[index]! };
  }

  getSnapshot(): FogSnapshot {
    return {
      schemaVersion: 1,
      width: this.width,
      height: this.height,
      seed: this.seed,
      updateBudgetCells: this.updateBudgetCells,
      sweepNumber: this.sweepNumber,
      cursor: this.cursor,
      obstacles: [...this.obstacles],
      cells: this.cells.map((cell) => ({ ...cell })),
      activeSources: this.activeSources?.map(copySource) ?? null,
      pendingCells: this.pendingCells?.map((cell) => cell ? { ...cell } : null) ?? null,
      pendingTransitions: this.pendingTransitions.map((transition) => ({ ...transition })),
    };
  }

  serialize(): string { return `${JSON.stringify(this.getSnapshot())}\n`; }

  restore(snapshot: FogSnapshot): void {
    this.assertSnapshot(snapshot);
    this.cells = snapshot.cells.map((cell) => ({ knowledgeTier: cell.knowledgeTier, currentVisible: cell.currentVisible }));
    this.sweepNumber = snapshot.sweepNumber;
    this.cursor = snapshot.cursor;
    this.activeSources = snapshot.activeSources?.map(copySource) ?? null;
    this.pendingCells = snapshot.pendingCells?.map((cell) => cell ? { knowledgeTier: cell.knowledgeTier, currentVisible: cell.currentVisible } : null) ?? null;
    this.pendingTransitions = snapshot.pendingTransitions.map((transition) => ({ ...transition }));
  }

  restart(): void {
    this.cells = this.createUnknownCells();
    this.sweepNumber = 0;
    this.cursor = 0;
    this.activeSources = null;
    this.pendingCells = null;
    this.pendingTransitions = [];
  }

  private beginSweep(sources: readonly VisibilitySource[]): void {
    this.activeSources = this.validateAndSortSources(sources);
    this.pendingCells = new Array<FogCellState | null>(this.cells.length).fill(null);
    this.pendingTransitions = [];
    this.sweepNumber += 1;
    this.cursor = 0;
  }

  private evaluateCell(index: number, sources: readonly VisibilitySource[]): void {
    const committed = this.cells[index]!;
    const before = effectiveTier(committed);
    const cell: FogCellState = { knowledgeTier: committed.knowledgeTier, currentVisible: false };
    this.pendingCells![index] = cell;
    const x = index % this.width;
    const y = Math.floor(index / this.width);
    let detected = false;
    let visible = false;
    for (const source of sources) {
      const distanceSquared = (source.x - x) ** 2 + (source.y - y) ** 2;
      if (distanceSquared > source.detectionRadius ** 2 || !this.hasLineOfSight(source.x, source.y, x, y)) continue;
      detected = true;
      if (distanceSquared <= source.revealRadius ** 2) { visible = true; break; }
    }
    if (visible) { cell.knowledgeTier = FogTier.TIER_2; cell.currentVisible = true; }
    else if (detected && cell.knowledgeTier < FogTier.TIER_1) cell.knowledgeTier = FogTier.TIER_1;
    this.recordTransition(index, before, effectiveTier(cell), this.pendingTransitions);
  }

  private hasLineOfSight(fromX: number, fromY: number, toX: number, toY: number): boolean {
    let x = fromX;
    let y = fromY;
    const dx = Math.abs(toX - fromX);
    const dy = Math.abs(toY - fromY);
    const stepX = fromX < toX ? 1 : -1;
    const stepY = fromY < toY ? 1 : -1;
    let error = dx - dy;
    while (x !== toX || y !== toY) {
      const doubled = error * 2;
      if (doubled > -dy) { error -= dy; x += stepX; }
      if (doubled < dx) { error += dx; y += stepY; }
      if (x === toX && y === toY) return true;
      if (this.obstacles[this.indexOf(x, y)]) return false;
    }
    return true;
  }

  private recordTransition(index: number, from: FogTier, to: FogTier, transitions: FogTransition[]): void {
    if (from === to) return;
    transitions.push({ x: index % this.width, y: Math.floor(index / this.width), from, to });
  }

  private validateAndSortSources(sources: readonly VisibilitySource[]): VisibilitySource[] {
    const ids = new Set<string>();
    const result = sources.map((source) => {
      if (typeof source.id !== "string" || source.id.length === 0) throw new TypeError("visibility source id must be non-empty");
      if (ids.has(source.id)) throw new RangeError(`duplicate visibility source id: ${source.id}`);
      ids.add(source.id);
      this.assertCoordinate(source.x, source.y);
      if (!Number.isFinite(source.revealRadius) || source.revealRadius < 0) throw new RangeError("revealRadius must be finite and non-negative");
      if (!Number.isFinite(source.detectionRadius) || source.detectionRadius < source.revealRadius) throw new RangeError("detectionRadius must be finite and at least revealRadius");
      return copySource(source);
    });
    return result.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  }

  private assertSnapshot(snapshot: FogSnapshot): void {
    if (!snapshot || snapshot.schemaVersion !== 1) throw new TypeError("fog snapshot schemaVersion must be 1");
    if (snapshot.width !== this.width || snapshot.height !== this.height || snapshot.seed !== this.seed || snapshot.updateBudgetCells !== this.updateBudgetCells) throw new RangeError("fog snapshot configuration mismatch");
    if (snapshot.obstacles.length !== this.obstacles.length || snapshot.obstacles.some((value, index) => typeof value !== "boolean" || value !== this.obstacles[index])) throw new RangeError("fog snapshot obstacle map mismatch");
    if (snapshot.cells.length !== this.cells.length || snapshot.cells.some((cell) => !this.isValidCellState(cell))) throw new TypeError("fog snapshot contains invalid cells");
    if (!Number.isSafeInteger(snapshot.sweepNumber) || snapshot.sweepNumber < 0) throw new RangeError("fog snapshot sweepNumber is invalid");
    if (!Number.isSafeInteger(snapshot.cursor) || snapshot.cursor < 0 || snapshot.cursor >= this.cells.length) throw new RangeError("fog snapshot cursor is invalid");
    if (!Array.isArray(snapshot.pendingTransitions) || snapshot.pendingTransitions.some((transition) => !this.isValidTransition(transition))) throw new TypeError("fog snapshot contains invalid transitions");
    if (snapshot.activeSources === null) {
      if (snapshot.cursor !== 0 || snapshot.pendingCells !== null || snapshot.pendingTransitions.length !== 0) throw new RangeError("completed fog snapshot cannot contain pending sweep state");
    } else {
      const sorted = this.validateAndSortSources(snapshot.activeSources);
      if (sorted.some((source, index) => source.id !== snapshot.activeSources![index]!.id)) throw new RangeError("fog snapshot visibility sources must be in canonical ID order");
      if (snapshot.pendingCells === null || snapshot.pendingCells.length !== this.cells.length) throw new TypeError("active fog snapshot requires pending cells");
      const scanStart = ((this.seed + Math.imul(snapshot.sweepNumber, 0x9e3779b1)) >>> 0) % this.cells.length;
      if (snapshot.pendingCells.some((cell, index) => {
        const scanOffset = (index - scanStart + this.cells.length) % this.cells.length;
        return scanOffset < snapshot.cursor ? cell === null || !this.isValidCellState(cell) : cell !== null;
      })) throw new TypeError("active fog snapshot requires canonical pending cells");
      if (snapshot.pendingTransitions.length > snapshot.cursor) throw new RangeError("fog snapshot has more transitions than evaluated cells");
      const expectedTransitions: FogTransition[] = [];
      for (let offset = 0; offset < snapshot.cursor; offset += 1) {
        const index = (scanStart + offset) % this.cells.length;
        const from = effectiveTier(snapshot.cells[index]!);
        const to = effectiveTier(snapshot.pendingCells[index]!);
        if (from !== to) expectedTransitions.push({ x: index % this.width, y: Math.floor(index / this.width), from, to });
      }
      if (expectedTransitions.length !== snapshot.pendingTransitions.length || expectedTransitions.some((expected, index) => {
        const actual = snapshot.pendingTransitions[index]!;
        return expected.x !== actual.x || expected.y !== actual.y || expected.from !== actual.from || expected.to !== actual.to;
      })) throw new RangeError("fog snapshot transitions do not match pending cells");
    }
  }

  private scanStart(): number {
    return ((this.seed + Math.imul(this.sweepNumber, 0x9e3779b1)) >>> 0) % this.cells.length;
  }

  private isValidCellState(cell: { readonly knowledgeTier: KnowledgeTier; readonly currentVisible: boolean }): boolean {
    return Number.isInteger(cell.knowledgeTier) && cell.knowledgeTier >= 0 && cell.knowledgeTier <= 2 && typeof cell.currentVisible === "boolean" && (!cell.currentVisible || cell.knowledgeTier === FogTier.TIER_2);
  }

  private isValidTransition(transition: FogTransition): boolean {
    return Number.isSafeInteger(transition.x) && Number.isSafeInteger(transition.y) && transition.x >= 0 && transition.y >= 0 && transition.x < this.width && transition.y < this.height
      && Number.isInteger(transition.from) && transition.from >= 0 && transition.from <= 3
      && Number.isInteger(transition.to) && transition.to >= 0 && transition.to <= 3 && transition.from !== transition.to;
  }

  private createUnknownCells(): FogCellState[] { return Array.from({ length: this.width * this.height }, () => ({ knowledgeTier: 0, currentVisible: false })); }
  private indexOf(x: number, y: number): number { return y * this.width + x; }
  private assertCoordinate(x: number, y: number): void {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) throw new RangeError(`coordinate outside fog grid: ${x},${y}`);
  }
}
