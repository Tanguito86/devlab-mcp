import assert from "node:assert/strict";
import test from "node:test";

import { FixedStepAccumulator, FIXED_STEP_HZ } from "../src/core/fixed-step.js";

test("the default simulation step is exactly 60 Hz", () => {
  const clock = new FixedStepAccumulator();
  assert.equal(FIXED_STEP_HZ, 60);
  assert.equal(clock.stepSeconds, 1 / 60);
});

test("the accumulator catches up in fixed steps and exposes interpolation", () => {
  const clock = new FixedStepAccumulator({ stepSeconds: 0.1, maxCatchUpSteps: 4 });
  const updates: number[] = [];
  clock.resume();
  const result = clock.advance(0.25, (step) => updates.push(step));

  assert.deepEqual(updates, [0.1, 0.1]);
  assert.equal(result.steps, 2);
  assert.ok(Math.abs(result.alpha - 0.5) < 1e-9);
  assert.ok(Math.abs(result.simulationSeconds - 0.2) < 1e-9);
  assert.equal(result.droppedSeconds, 0);
});

test("catch-up is bounded and excess wall time is reported as dropped", () => {
  const clock = new FixedStepAccumulator({ stepSeconds: 0.1, maxCatchUpSteps: 3 });
  let updates = 0;
  clock.resume();
  const result = clock.advance(1, () => {
    updates += 1;
  });

  assert.equal(updates, 3);
  assert.equal(result.steps, 3);
  assert.ok(Math.abs(result.droppedSeconds - 0.7) < 1e-9);
  assert.ok(result.alpha >= 0 && result.alpha < 1);
});

test("frozen capture time cannot advance until explicitly resumed", () => {
  const clock = new FixedStepAccumulator();
  let updates = 0;
  clock.freezeAt(2_500);
  const frozen = clock.advance(10, () => {
    updates += 1;
  });

  assert.equal(updates, 0);
  assert.equal(frozen.simulationSeconds, 2.5);
  assert.equal(frozen.alpha, 0);
  assert.equal(clock.isFrozen, true);
  assert.equal(clock.isPaused, true);
});
