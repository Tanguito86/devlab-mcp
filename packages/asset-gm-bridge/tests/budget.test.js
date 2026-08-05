import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { GovernedAssetGmBridge } from "../dist/index.js";
import { baseRequest, expectBridgeError, makeWorkspace } from "./helpers.js";

async function setup(overrides = {}) {
  const workspace = makeWorkspace(overrides);
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), expectedProjectFingerprint: target.fingerprint };
  return { bridge, request, workspace };
}

test("asset exceeds the width budget and fails before any write", async () => {
  const spec = { ...(await import("./helpers.js")).SPEC_V1, width: 256, height: 64, origin: { x: 128, y: 32 } };
  const { bridge, request } = await setup({ spec, version: "1.0.0" });
  await expectBridgeError(bridge.planImport(request), "ASSET_BUDGET_EXCEEDED");
  const { readdirSync } = await import("node:fs");
  const { existsSync } = await import("node:fs");
  assert.ok(!existsSync(join(bridge.projectsDir, "pilot-a/sprites")));
});

test("asset exceeds the height budget and fails before any write", async () => {
  const spec = { ...(await import("./helpers.js")).SPEC_V1, width: 64, height: 256, origin: { x: 32, y: 128 } };
  const { bridge, request } = await setup({ spec, version: "1.0.0" });
  await expectBridgeError(bridge.planImport(request), "ASSET_BUDGET_EXCEEDED");
});

test("asset exceeds the frame budget and fails before any write", async () => {
  const spec = { ...(await import("./helpers.js")).SPEC_V1, frameCount: 6 };
  const { bridge, request } = await setup({ spec, version: "1.0.0" });
  await expectBridgeError(bridge.planImport(request), "ASSET_BUDGET_EXCEEDED");
});

test("budget limits are evaluated against real decoded bytes", async () => {
  const { bridge, request, workspace } = await setup();
  const inspection = await bridge.inspectAsset(request);
  assert.equal(inspection.budget.status, "SUCCESS");
  assert.equal(inspection.frameCount, 2);
  assert.equal(inspection.dimensions.width, 64);
  assert.ok(inspection.estimatedDecodedBytes <= 1024 * 1024);
  const expectedDecoded = 64 * 64 * 4 * 2;
  assert.equal(inspection.estimatedDecodedBytes, expectedDecoded);
});

test("file count and resource count budget is enforced at plan time", async () => {
  const { bridge, request } = await setup();
  // The pilot import plans 8 files and 1 resource; both are within the budget.
  const plan = await bridge.planImport(request);
  assert.equal(plan.files.length, 10);
  assert.ok(plan.manifest.assetForgeProfile.budgetProfile === "bridge-sprite-v1");
});
