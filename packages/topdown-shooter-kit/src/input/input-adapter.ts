import { EMPTY_INPUT, type DirectionTransform, type InputSnapshot, type Vec2 } from "../contracts/types.js";

type Action = "attack" | "activate";
const MOVE_KEYS = new Map<string, readonly [number, number]>([["KeyW", [0, 1]], ["ArrowUp", [0, 1]], ["KeyS", [0, -1]], ["ArrowDown", [0, -1]], ["KeyA", [-1, 0]], ["ArrowLeft", [-1, 0]], ["KeyD", [1, 0]], ["ArrowRight", [1, 0]]]);

export class PublicInputAdapter {
  private readonly keys = new Set<string>();
  private movePointer: number | null = null;
  private actionPointers = new Map<Action, number>();
  private touchMove: Vec2 = { x: 0, z: 0 };
  private touchAim: Vec2 = { x: 0, z: 1 };
  private aim: Vec2 = { x: 0, z: 1 };
  private start = false;
  private restart = false;
  private pause = false;

  constructor(private readonly transform: DirectionTransform) {}

  keyDown(code: string): void {
    this.keys.add(code);
    if (code === "Enter") this.start = true;
    if (code === "KeyR") this.restart = true;
    if (code === "Escape" || code === "KeyP") this.pause = true;
  }
  keyUp(code: string): void { this.keys.delete(code) }
  setCursorWorld(direction: Vec2): void { this.aim = normalize(direction, this.aim) }
  beginMove(pointerId: number): void { this.movePointer = pointerId }
  move(pointerId: number, screenRight: number, screenUp: number): void {
    if (this.movePointer !== pointerId) return;
    this.touchMove = normalize({ x: screenRight, z: screenUp }, { x: 0, z: 0 });
  }
  beginAction(action: Action, pointerId: number, screenRight: number, screenUp: number): void {
    this.actionPointers.set(action, pointerId);
    if (action === "attack") this.touchAim = normalize({ x: screenRight, z: screenUp }, this.touchAim);
  }
  cancel(pointerId: number): void {
    if (this.movePointer === pointerId) { this.movePointer = null; this.touchMove = { x: 0, z: 0 } }
    for (const [action, owner] of this.actionPointers) if (owner === pointerId) this.actionPointers.delete(action);
  }
  blur(): void { this.keys.clear(); this.movePointer = null; this.actionPointers.clear(); this.touchMove = { x: 0, z: 0 } }

  frame(): InputSnapshot {
    let right = this.movePointer === null ? 0 : this.touchMove.x;
    let up = this.movePointer === null ? 0 : this.touchMove.z;
    for (const key of this.keys) {
      const delta = MOVE_KEYS.get(key);
      if (delta) { right += delta[0]; up += delta[1] }
    }
    const move = this.transform.screenToWorld(...components(normalize({ x: right, z: up }, { x: 0, z: 0 })));
    const touchAttacking = this.actionPointers.has("attack");
    const aim = touchAttacking ? this.transform.screenToWorld(this.touchAim.x, this.touchAim.z) : this.aim;
    const snapshot = { ...EMPTY_INPUT, moveX: move.x, moveZ: move.z, aimX: aim.x, aimZ: aim.z, attack: touchAttacking || this.keys.has("Space"), activate: this.actionPointers.has("activate") || this.keys.has("KeyE"), start: this.start, restart: this.restart, pause: this.pause };
    this.start = false; this.restart = false; this.pause = false;
    return snapshot;
  }
}

function components(value: Vec2): [number, number] { return [value.x, value.z] }
function normalize(value: Vec2, fallback: Vec2): Vec2 {
  const length = Math.hypot(value.x, value.z);
  return length > 1e-9 ? { x: value.x / Math.max(1, length), z: value.z / Math.max(1, length) } : fallback;
}
