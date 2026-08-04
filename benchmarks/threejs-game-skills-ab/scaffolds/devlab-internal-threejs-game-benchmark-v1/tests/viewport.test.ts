import assert from "node:assert/strict";
import test from "node:test";

import { computeViewportPlan } from "../src/core/viewport.js";

test("landscape desktop resize preserves aspect and bounds DPR", () => {
  const plan = computeViewportPlan(1_200, 675, 3);
  assert.equal(plan.width, 1_200);
  assert.equal(plan.height, 675);
  assert.equal(plan.aspect, 16 / 9);
  assert.equal(plan.pixelRatio, 2);
  assert.equal(plan.renderTargetSize, 225);
});

test("portrait mobile resize remains valid at device scale factor one", () => {
  const plan = computeViewportPlan(360, 800, 1);
  assert.equal(plan.width, 360);
  assert.equal(plan.height, 800);
  assert.equal(plan.aspect, 0.45);
  assert.equal(plan.pixelRatio, 1);
  assert.equal(plan.renderTargetSize, 120);
});

test("invalid viewport input fails closed", () => {
  assert.throws(() => computeViewportPlan(0, 800, 1), /positive finite/);
  assert.throws(() => computeViewportPlan(360, Number.NaN, 1), /positive finite/);
});
