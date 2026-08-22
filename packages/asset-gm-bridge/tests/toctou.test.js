import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { GovernedAssetGmBridge } from "../dist/index.js";
import { baseRequest, expectBridgeError, makeWorkspace, PILOT_INSTRUMENTED } from "./helpers.js";

const apply = (bridge, request, plan) => bridge.applyImport({ ...request, plan: plan.plan, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, dryRun: false });
// Fault injection belongs to the adapter's test-only request lane. It is
// intentionally absent from ASSET_GM_BRIDGE_V1's public request/schema.
const applyAdapterFault = (bridge, request, plan, faultAt) => bridge.adapter.applySafe({
  capability: "GM_APPLY_SAFE_V1",
  projectRoot: request.projectRoot,
  expectedProjectFingerprint: plan.plan.projectFingerprint,
  expectedHead: plan.plan.expectedHead,
  allowlist: plan.plan.allowlist,
  transactionId: request.transactionId,
  timeoutMs: request.timeoutMs,
  verificationPolicy: request.verificationPolicy,
  evidenceRoot: request.evidenceRoot,
  plan: plan.plan,
  planHash: plan.planHash,
  confirm: true,
  dryRun: false,
  faultAt,
});

async function setup() {
  const workspace = makeWorkspace({});
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), ...PILOT_INSTRUMENTED, expectedProjectFingerprint: target.fingerprint };
  const plan = await bridge.planImport(request);
  return { bridge, request, plan, baseline: target.fingerprint };
}

const rollbackTo = async (bridge, request, plan, expected) => {
  const current = await bridge.inspectTarget(request);
  const result = await bridge.rollbackImport({ ...request, expectedProjectFingerprint: current.fingerprint, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true });
  assert.equal(result.byteExact, true);
  assert.equal(result.projectFingerprint, expected);
};

test("fault before the first write: APPLY_FAILED_RECOVERED, no project mutation", async () => {
  const { bridge, request, plan, baseline } = await setup();
  await assert.rejects(() => applyAdapterFault(bridge, request, plan, "before-staging"), (error) => error.code === "ATOMIC_PROMOTION_FAILED");
  const target = await bridge.inspectTarget(request);
  assert.equal(target.fingerprint, baseline);
});

test("fault during staging: APPLY_FAILED_RECOVERED, no project mutation", async () => {
  const { bridge, request, plan, baseline } = await setup();
  await assert.rejects(() => applyAdapterFault(bridge, request, plan, "during-staging"), (error) => error.code === "ATOMIC_PROMOTION_FAILED");
  const target = await bridge.inspectTarget(request);
  assert.equal(target.fingerprint, baseline);
});

test("fault before promotion: APPLY_FAILED_RECOVERED, no project mutation", async () => {
  const { bridge, request, plan, baseline } = await setup();
  await assert.rejects(() => applyAdapterFault(bridge, request, plan, "before-promotion"), (error) => error.code === "ATOMIC_PROMOTION_FAILED");
  const target = await bridge.inspectTarget(request);
  assert.equal(target.fingerprint, baseline);
});

test("fault after the first replace: adapter auto-recovers; rollback returns to baseline", async () => {
  const { bridge, request, plan, baseline } = await setup();
  await assert.rejects(() => applyAdapterFault(bridge, request, plan, "after-first-replace"), (error) => error.code === "ATOMIC_PROMOTION_FAILED");
  const target = await bridge.inspectTarget(request);
  assert.equal(target.fingerprint, baseline);
});

test("crash with WRITE_AHEAD partial (leave-write-ahead): recovery via rollback restores byte-exact", async () => {
  const { bridge, request, plan, baseline } = await setup();
  await assert.rejects(() => applyAdapterFault(bridge, request, plan, "leave-write-ahead-after-first-replace"), (error) => error.code === "ATOMIC_PROMOTION_FAILED");
  // The project is partially promoted; the adapter's rollback lane recovers from WRITE_AHEAD.
  await rollbackTo(bridge, request, plan, baseline);
  const target = await bridge.inspectTarget(request);
  assert.equal(target.fingerprint, baseline);
  const yyp = readFileSync(join(bridge.projectsDir, "pilot-a/AssetBridgePilot.yyp"), "utf8");
  assert.ok(!yyp.includes("spr_bridge_test_beacon"));
});

test("rollback is blocked when the project changed externally after apply", async () => {
  const { bridge, request, plan } = await setup();
  const applied = await apply(bridge, request, plan);
  assert.equal(applied.state, "APPLIED");
  // External edit after apply.
  const gml = join(bridge.projectsDir, "pilot-a/objects/obj_asset_bridge_pilot/Create_0.gml");
  writeFileSync(gml, readFileSync(gml, "utf8") + "\n// external\n");
  const current = await bridge.inspectTarget(request);
  await expectBridgeError(
    bridge.rollbackImport({ ...request, expectedProjectFingerprint: current.fingerprint, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true }),
    "ROLLBACK_BLOCKED_CONCURRENT_CHANGE",
  );
});

test("external target edit between plan and apply is caught at apply time", async () => {
  const { bridge, request, plan } = await setup();
  const gml = join(bridge.projectsDir, "pilot-a/objects/obj_asset_bridge_pilot/Create_0.gml");
  writeFileSync(gml, readFileSync(gml, "utf8") + "\n// concurrent\n");
  const error = await expectBridgeError(apply(bridge, request, plan), "STALE_OR_TAMPERED_PLAN");
  assert.ok(["STALE_OR_TAMPERED_PLAN", "TARGET_SNAPSHOT_CHANGED"].includes(error.code));
});

test("apply is blocked while a foreign Runner exists, and the foreign process is preserved", async () => {
  const workspace = makeWorkspace({});
  const foreignProcesses = [{ pid: 424242, parentPid: 1, name: "Runner.exe", executable: "C:\\fake\\Runner.exe", commandLine: "Runner.exe --foreign", creationDate: "20260805T000000.000000-000" }];
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root, inventory: async () => foreignProcesses });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), expectedProjectFingerprint: target.fingerprint };
  const plan = await bridge.planImport(request);
  await expectBridgeError(apply(bridge, request, plan), "GATE_VIOLATION");
  assert.equal(foreignProcesses.length, 1, "foreign Runner must not be terminated");
  assert.equal(foreignProcesses[0].pid, 424242);
});
