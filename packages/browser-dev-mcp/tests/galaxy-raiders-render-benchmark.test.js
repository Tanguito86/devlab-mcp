import assert from "node:assert/strict";
import test from "node:test";

import {
  attestHardwareCanvasGpu,
  classifyFrameBudget,
  createSyntheticBulletLoad,
  firstBudgetCrossing,
  FRAME_BUDGETS_MS,
  percentile,
  summarizeDurations,
} from "../scripts/galaxy-raiders-render-benchmark-core.js";
import { parseArgs } from "../scripts/galaxy-raiders-render-benchmark.js";

test("percentiles use nearest-rank ordering and reject invalid samples", () => {
  assert.equal(percentile([4, 1, 3, 2], 0.50), 2);
  assert.equal(percentile([4, 1, 3, 2], 0.95), 4);
  assert.throws(() => percentile([], 0.5), /at least one sample/);
  assert.throws(() => percentile([1, Number.NaN], 0.5), /finite/);
});

test("duration summary includes the requested tail percentiles", () => {
  const summary = summarizeDurations([1, 2, 3, 4, 5]);
  assert.deepEqual(
    { count: summary.count, min: summary.min, p50: summary.p50, p95: summary.p95, p99: summary.p99, max: summary.max },
    { count: 5, min: 1, p50: 3, p95: 5, p99: 5, max: 5 },
  );
});

test("frame budget classification accounts only for declared timer quantization", () => {
  assert.equal(classifyFrameBudget(8.4, FRAME_BUDGETS_MS.hz120).pass, true);
  assert.equal(classifyFrameBudget(8.5, FRAME_BUDGETS_MS.hz120).pass, false);
  assert.equal(classifyFrameBudget(16.7, FRAME_BUDGETS_MS.hz60).pass, true);
});

test("synthetic bullet loads are exact, deterministic and inside the canvas", () => {
  const first = createSyntheticBulletLoad(2000, 360, 640);
  const second = createSyntheticBulletLoad(2000, 360, 640);
  assert.equal(first.length, 2000);
  assert.deepEqual(first, second);
  assert.ok(first.every((bullet) => bullet.x >= 0 && bullet.x + bullet.w <= 360));
  assert.ok(first.every((bullet) => bullet.y >= 0 && bullet.y + bullet.h <= 640));
});

function gpuInfo(renderer = "ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11)") {
  return {
    gpu: {
      devices: [{ deviceString: "NVIDIA GeForce RTX 2060", driverVendor: "NVIDIA", driverVersion: "1" }],
      featureStatus: { gpu_compositing: "enabled", "2d_canvas": "enabled" },
      auxAttributes: { glRenderer: renderer, displayType: "ANGLE_D3D11", skiaBackendType: "GaneshGL" },
    },
  };
}

test("hardware GPU attestation accepts D3D11 and rejects software or disabled Canvas2D", () => {
  assert.match(attestHardwareCanvasGpu(gpuInfo()).renderer, /RTX 2060/);
  assert.throws(() => attestHardwareCanvasGpu(gpuInfo("ANGLE (Google, SwiftShader)")), /software renderer/);
  const disabled = gpuInfo();
  disabled.gpu.featureStatus["2d_canvas"] = "unavailable_software";
  assert.throws(() => attestHardwareCanvasGpu(disabled), /2d_canvas/);
});

test("first budget crossing returns the first failing fixed load", () => {
  const results = [
    { bulletCount: 700, budgets: { hz120: { pass: true } } },
    { bulletCount: 1400, budgets: { hz120: { pass: false } } },
    { bulletCount: 2000, budgets: { hz120: { pass: false } } },
  ];
  assert.equal(firstBudgetCrossing(results, "hz120"), 1400);
  assert.equal(firstBudgetCrossing(results, "hz60"), null);
});

test("CLI keeps the three fixed loads and rejects missing consumer roots", () => {
  assert.throws(() => parseArgs([]), /--game-root is required/);
  assert.throws(() => parseArgs(["--game-root", "Z:\\does-not-exist"]), /existing directory/);
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["--", "--help"]).help, true);
});
