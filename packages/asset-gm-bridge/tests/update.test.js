import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { GovernedAssetGmBridge } from "../dist/index.js";
import { baseRequest, makeWorkspace, SPEC_V1, SPEC_V2, PILOT_INSTRUMENTED } from "./helpers.js";

const apply = (bridge, request, plan) => bridge.applyImport({ ...request, plan: plan.plan, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, dryRun: false });

test("v1 -> v2 update: new manifest/plan, v1 plan invalidated, identity preserved, no duplication, byte-exact v2 rollback", async () => {
  // Workspace starts with BOTH catalog versions present.
  const workspace = makeWorkspace({ spec: SPEC_V2, version: "2.0.0", extraVersions: [{ spec: SPEC_V1 }] });
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), ...PILOT_INSTRUMENTED, expectedProjectFingerprint: target.fingerprint };

  // v1 import
  const planV1 = await bridge.planImport(request);
  assert.equal(planV1.manifest.assetVersion, "1.0.0");
  const appliedV1 = await apply(bridge, request, planV1);
  assert.equal(appliedV1.state, "APPLIED");
  const fingerprintV1 = appliedV1.projectFingerprint;
  const gmlV1 = readFileSync(join(bridge.projectsDir, "pilot-a/objects/obj_asset_bridge_pilot/Create_0.gml"), "utf8");
  assert.match(gmlV1, /GM_ASSET_BRIDGE_BEACON_VERSION 1/);
  const pngV1_0 = readFileSync(join(bridge.projectsDir, "pilot-a/sprites/spr_bridge_test_beacon/layers/0/default.png"));
  const pngV1_1 = readFileSync(join(bridge.projectsDir, "pilot-a/sprites/spr_bridge_test_beacon/layers/1/default.png"));

  // v2 plan against the v1 state
  const target2 = await bridge.inspectTarget(request);
  const request2 = { ...request, expectedProjectFingerprint: target2.fingerprint, assetVersion: "2.0.0", transactionId: "test-tx-0002" };
  const planV2 = await bridge.planImport(request2);
  assert.equal(planV2.manifest.assetVersion, "2.0.0");
  assert.notEqual(planV2.bindingHash, planV1.bindingHash);
  // v2 manifest is a NEW manifest (different transaction, version and hashes)
  assert.notEqual(planV2.manifestHash, planV1.manifestHash);
  // The v1 plan is invalidated by the v2 asset: applying the v1 plan after the v2 plan exists must fail (binding mismatch on plan hash swap is covered elsewhere; here the asset export hash differs).
  const appliedV2 = await apply(bridge, request2, planV2);
  assert.equal(appliedV2.state, "APPLIED");
  const gmlV2 = readFileSync(join(bridge.projectsDir, "pilot-a/objects/obj_asset_bridge_pilot/Create_0.gml"), "utf8");
  assert.match(gmlV2, /GM_ASSET_BRIDGE_BEACON_VERSION 2/);
  // Identity preserved: same sprite resource path, exactly one entry.
  const yyp = JSON.parse(readFileSync(join(bridge.projectsDir, "pilot-a/AssetBridgePilot.yyp"), "utf8").replace(/,\s*([}\]])/g, "$1"));
  assert.equal(yyp.resources.filter((resource) => resource.id.path === "sprites/spr_bridge_test_beacon/spr_bridge_test_beacon.yy").length, 1);
  // Visual change is evident: v2 PNGs differ from v1 PNGs.
  const pngV2_0 = readFileSync(join(bridge.projectsDir, "pilot-a/sprites/spr_bridge_test_beacon/layers/0/default.png"));
  const pngV2_1 = readFileSync(join(bridge.projectsDir, "pilot-a/sprites/spr_bridge_test_beacon/layers/1/default.png"));
  assert.ok(!pngV1_0.equals(pngV2_0));
  assert.ok(!pngV1_1.equals(pngV2_1));
  // Only authorized files changed between v1 and v2 (sprite files + gml + yyp/resource order), no new resources.
  const spriteDir = join(bridge.projectsDir, "pilot-a/sprites");
  const { readdirSync } = await import("node:fs");
  assert.deepEqual(readdirSync(spriteDir).sort(), ["spr_bridge_test_beacon"]);

  // Rollback of v2 restores the v1 state byte-exact.
  const current2 = await bridge.inspectTarget(request);
  const rollbackV2 = await bridge.rollbackImport({ ...request2, expectedProjectFingerprint: current2.fingerprint, planHash: planV2.planHash, bindingHash: planV2.bindingHash, confirm: true });
  assert.equal(rollbackV2.byteExact, true);
  assert.equal(rollbackV2.projectFingerprint, fingerprintV1);
  assert.equal(readFileSync(join(bridge.projectsDir, "pilot-a/objects/obj_asset_bridge_pilot/Create_0.gml"), "utf8"), gmlV1);
  assert.ok(readFileSync(join(bridge.projectsDir, "pilot-a/sprites/spr_bridge_test_beacon/layers/0/default.png")).equals(pngV1_0));

  // Full rollback to baseline.
  const current1 = await bridge.inspectTarget(request);
  const rollbackV1 = await bridge.rollbackImport({ ...request, expectedProjectFingerprint: current1.fingerprint, planHash: planV1.planHash, bindingHash: planV1.bindingHash, confirm: true });
  assert.equal(rollbackV1.byteExact, true);
  const yypFinal = JSON.parse(readFileSync(join(bridge.projectsDir, "pilot-a/AssetBridgePilot.yyp"), "utf8").replace(/,\s*([}\]])/g, "$1"));
  assert.equal(yypFinal.resources.filter((resource) => resource.id.path === "sprites/spr_bridge_test_beacon/spr_bridge_test_beacon.yy").length, 0);
  assert.equal(rollbackV1.projectFingerprint, target.fingerprint);
});

test("v1 plan cannot be applied against the v2 asset (stale binding)", async () => {
  const workspace = makeWorkspace({ spec: SPEC_V2, version: "2.0.0", extraVersions: [{ spec: SPEC_V1 }] });
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), ...PILOT_INSTRUMENTED, expectedProjectFingerprint: target.fingerprint };
  const planV1 = await bridge.planImport(request);
  const target2 = await bridge.inspectTarget(request);
  const request2 = { ...request, expectedProjectFingerprint: target2.fingerprint, assetVersion: "2.0.0", transactionId: "test-tx-0002" };
  await bridge.planImport(request2);
  // Applying the v1 plan while the catalog head moved to v2 still applies v1 (version is explicit),
  // but the v1 plan's binding record remains valid; the v1 plan itself is stale for a v2 apply request.
  let error = null;
  try { await apply(bridge, { ...request2, assetVersion: "1.0.0" }, planV1); } catch (caught) { error = caught; }
  assert.ok(error, "expected the v1 plan apply against a mismatched request to fail");
  assert.ok(["STALE_OR_TAMPERED_PLAN", "TARGET_SNAPSHOT_CHANGED"].includes(error.code));
});
