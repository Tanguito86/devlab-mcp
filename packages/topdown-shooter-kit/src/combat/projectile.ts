import type { Vec2 } from "../contracts/types.js";

export interface ProjectileLaunch {
  readonly position: Vec2;
  readonly direction: Vec2;
  readonly velocity: Vec2;
}

export function launchProjectile(position: Vec2, aim: Vec2, speed: number): ProjectileLaunch {
  if (!Number.isFinite(speed) || speed < 0) throw new RangeError("projectile speed must be finite and non-negative");
  const length = Math.hypot(aim.x, aim.z);
  if (length <= 1e-9) throw new RangeError("projectile aim must be non-zero");
  const direction = { x: aim.x / length, z: aim.z / length };
  return {
    position: { ...position },
    direction,
    velocity: { x: direction.x * speed, z: direction.z * speed },
  };
}
