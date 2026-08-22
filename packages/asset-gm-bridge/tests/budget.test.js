import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { GovernedAssetGmBridge } from "../dist/index.js";
import { baseRequest, expectBridgeError, makeWorkspace, PILOT_INSTRUMENTED } from "./helpers.js";

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
  // A plain import plans the sprite .yy, the .yyp, the .resource_order and two
  // images per frame -- and nothing else. No object code is touched.
  const plan = await bridge.planImport(request);
  assert.equal(plan.files.length, 7);
  assert.equal(plan.manifest.instrumentation, "NONE");
  assert.equal(plan.files.some(({ path }) => path.endsWith(".gml")), false);
  assert.ok(plan.manifest.assetForgeProfile.budgetProfile === "bridge-sprite-v1");
});

test("pilot instrumentation adds exactly the three pilot GML files", async () => {
  const { bridge, request } = await setup();
  const plain = await bridge.planImport(request);
  const instrumented = await bridge.planImport({ ...request, ...PILOT_INSTRUMENTED, transactionId: "test-tx-instrumented" });
  assert.equal(instrumented.files.length, plain.files.length + 3);
  assert.equal(instrumented.manifest.instrumentation, "PILOT_BEACON_V1");
  assert.deepEqual(
    instrumented.files.map(({ path }) => path).filter((path) => path.endsWith(".gml")).sort(),
    [
      "objects/obj_asset_bridge_pilot/Create_0.gml",
      "objects/obj_asset_bridge_pilot/Draw_0.gml",
      "objects/obj_asset_bridge_pilot/Step_0.gml",
    ],
  );
});
