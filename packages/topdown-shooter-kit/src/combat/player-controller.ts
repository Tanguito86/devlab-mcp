import type { InputSnapshot, Vec2 } from "../contracts/types.js";
export interface PlayerConfig { readonly speed: number; readonly acceleration: number; readonly damping: number; readonly radius: number }
export interface PlayerState { position: Vec2; velocity: Vec2; facing: Vec2; health: number; invulnerabilitySeconds: number }
export interface PlayerBounds { clamp(position: Vec2, radius: number): Vec2 }

export class PlayerController {
  constructor(readonly config: PlayerConfig) {
    if (Object.values(config).some((value) => !Number.isFinite(value) || value < 0)) throw new RangeError("player configuration must be finite and non-negative");
  }
  update(dt: number, input: InputSnapshot, state: PlayerState, bounds: PlayerBounds): PlayerState {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
    const moveLength = Math.hypot(input.moveX, input.moveZ);
    const desired = moveLength > 1e-9 ? { x: input.moveX / Math.max(1, moveLength) * this.config.speed, z: input.moveZ / Math.max(1, moveLength) * this.config.speed } : { x: 0, z: 0 };
    const blend = Math.min(1, (moveLength > 1e-9 ? this.config.acceleration : this.config.damping) * dt);
    const velocity = { x: state.velocity.x + (desired.x - state.velocity.x) * blend, z: state.velocity.z + (desired.z - state.velocity.z) * blend };
    const position = bounds.clamp({ x: state.position.x + velocity.x * dt, z: state.position.z + velocity.z * dt }, this.config.radius);
    const aimLength = Math.hypot(input.aimX, input.aimZ);
    const facing = aimLength > 1e-9 ? { x: input.aimX / aimLength, z: input.aimZ / aimLength } : state.facing;
    return { ...state, position, velocity, facing, invulnerabilitySeconds: Math.max(0, state.invulnerabilitySeconds - dt) };
  }
}
