import type { DirectionTransform, Vec2 } from "../contracts/types.js";
export function createCameraGroundTransform(offsetX: number, offsetZ: number): DirectionTransform {
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetZ) || Math.hypot(offsetX, offsetZ) < 1e-9) throw new RangeError("camera ground offset must be finite and non-zero");
  const length = Math.hypot(offsetX, offsetZ); const forward = { x: -offsetX / length, z: -offsetZ / length }; const right = { x: -forward.z, z: forward.x };
  return {
    screenToWorld(screenRight, screenUp): Vec2 { return { x: right.x * screenRight + forward.x * screenUp, z: right.z * screenRight + forward.z * screenUp } },
    worldToScreen(world): { readonly right: number; readonly up: number } { return { right: world.x * right.x + world.z * right.z, up: world.x * forward.x + world.z * forward.z } },
  };
}
