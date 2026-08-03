# Determinism review

```text
RNG: mulberry32
DEFAULT_SEED: 1
RUNTIME_MATH_RANDOM_CALLS: 0
TEST_HOOKS_ALWAYS_EXPOSED: YES
TIMESTEP: VARIABLE / CLAMPED_TO_50MS
LIVE_REPLAY_BYTE_DETERMINISTIC: NO
FROZEN_STATE_PIXEL_DETERMINISTIC: ELIGIBLE_AFTER_DEVLAB_ADAPTER_VALIDATION
```

`seed`, `setState`, `setPausedForScreenshot`, `setReducedMotion` and
`hideDebugUi` are valuable concepts but require `ADAPT_WITH_BUILD_GUARD`.
Production builds must not expose state mutation or debug toggles. A benchmark
test build may expose an internal contract that reports the applied seed,
state/time, frame synchronization and capture readiness.

The loop uses `requestAnimationFrame` and `performance.now()` with variable
delta. Player and camera updates depend on that delta; the bot also holds input
for wall-clock durations. Therefore live runs must be compared statistically
for completion, softlocks, timing and performance—not by identical pixels,
frame counts or replay bytes.

Frozen states may require byte/pixel equality when simulation time, RNG, state,
motion, overlays, assets and render completion are controlled. A known state
change must also produce a measurable pixel change so a frozen or black capture
cannot pass accidentally.
