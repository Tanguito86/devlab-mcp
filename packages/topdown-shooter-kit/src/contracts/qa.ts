export const REUSABLE_QA_CONTRACTS = Object.freeze([
  "TITLE_TO_VICTORY", "SOFTLOCKS", "RESTART_CLEAN", "CHECKPOINT_RESTORE",
  "PAUSE_FREEZE", "FROZEN_DETERMINISM", "VISIBILITY_EXACT_FREEZE",
  "LOCAL_ASSET_INTEGRITY", "EXPERIENCE_V2_VALID", "FOG_REPLAY_DETERMINISM",
  "POOL_BOUNDS", "HATCH_QUEUE_BOUNDS",
  "BOSS_FSM_PROGRESS", "LISTENER_DUPLICATION", "LOOP_DUPLICATION",
  "AUDIO_DUPLICATION", "RESOURCE_GROWTH", "DEVICE_LOSS_RECOVERY", "TOUCH_MAIN_PATH",
] as const);

export type ReusableQaContract = typeof REUSABLE_QA_CONTRACTS[number];

export function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative`);
}

export function assertUnitDirection(x: number, z: number, label: string): void {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > 1 + 1e-9) {
    throw new RangeError(`${label} must be finite and normalized`);
  }
}
