import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { GovernedAssetGmBridge } from "../dist/index.js";
import { baseRequest, makeWorkspace, PILOT_INSTRUMENTED } from "./helpers.js";

async function setup() {
  const workspace = makeWorkspace({});
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), ...PILOT_INSTRUMENTED, expectedProjectFingerprint: target.fingerprint };
  const plan = await bridge.planImport(request);
  return { bridge, request, plan, workspace, baselineFingerprint: target.fingerprint };
}

const apply = (bridge, request, plan) => bridge.applyImport({ ...request, plan: plan.plan, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, dryRun: false });

const projectFiles = (bridge) => {
  const root = join(bridge.projectsDir, "pilot-a");
  const walk = (dir) => {
    const output = {};
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) Object.assign(output, walk(full));
      else {
        const key = full.slice(root.length + 1).split("\\").join("/");
        output[key] = readFileSync(full, "utf8");
      }
    }
    return output;
  };
  return walk(root);
};

test("positive import applies, is idempotent (NO_CHANGE), and rolls back byte-exact", async () => {
  const { bridge, request, plan, baselineFingerprint } = await setup();
  const before = projectFiles(bridge);
  const applied = await apply(bridge, request, plan);
  assert.equal(applied.state, "APPLIED");
  assert.equal(applied.applied, true);
  const afterFirst = projectFiles(bridge);
  const spriteFolder = join(bridge.projectsDir, "pilot-a/sprites/spr_bridge_test_beacon");
  assert.ok(readFileSync(join(spriteFolder, "layers/0/default.png")).byteLength > 0);
  assert.ok(readFileSync(join(spriteFolder, "layers/1/default.png")).byteLength > 0);
  const yyp = JSON.parse(afterFirst["AssetBridgePilot.yyp"].replace(/,\s*([}\]])/g, "$1"));
  assert.equal(yyp.resources.filter((resource) => resource.id.path === "sprites/spr_bridge_test_beacon/spr_bridge_test_beacon.yy").length, 1);
  assert.match(afterFirst["objects/obj_asset_bridge_pilot/Create_0.gml"], /GM_ASSET_BRIDGE_BEACON_VERSION 1/);

  // Idempotency: same plan again â†’ NO_CHANGE, zero file changes, zero new IDs, zero duplicates.
  const second = await apply(bridge, request, plan);
  assert.equal(second.state, "NO_CHANGE");
  assert.equal(second.changedFiles.length, 0);
  const afterSecond = projectFiles(bridge);
  assert.deepEqual(Object.keys(afterSecond).sort(), Object.keys(afterFirst).sort());
  for (const path of Object.keys(afterFirst)) assert.equal(afterSecond[path], afterFirst[path]);
  const yyp2 = JSON.parse(afterSecond["AssetBridgePilot.yyp"].replace(/,\s*([}\]])/g, "$1"));
  assert.equal(yyp2.resources.filter((resource) => resource.id.path === "sprites/spr_bridge_test_beacon/spr_bridge_test_beacon.yy").length, 1);

  // Rollback â†’ byte-exact restore of the baseline.
  const current = await bridge.inspectTarget(request);
  const rollback = await bridge.rollbackImport({ ...request, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, expectedProjectFingerprint: current.fingerprint });
  assert.equal(rollback.byteExact, true);
  const afterRollback = projectFiles(bridge);
  assert.deepEqual(Object.keys(afterRollback).sort(), Object.keys(before).sort());
  for (const path of Object.keys(before)) assert.equal(afterRollback[path], before[path]);
  assert.equal(afterRollback["objects/obj_asset_bridge_pilot/Create_0.gml"], before["objects/obj_asset_bridge_pilot/Create_0.gml"]);
  assert.equal(rollback.projectFingerprint, baselineFingerprint);
});

test("dry-run applies nothing", async () => {
  const { bridge, request, plan } = await setup();
  const dry = await bridge.applyImport({ ...request, plan: plan.plan, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, dryRun: true });
  assert.equal(dry.state, "DRY_RUN");
  assert.equal(dry.applied, false);
  const files = projectFiles(bridge);
  assert.ok(!("sprites/spr_bridge_test_beacon/spr_bridge_test_beacon.yy" in files));
});

test("repeat planImport is deterministic and the second apply reports NO_CHANGE for a fresh plan", async () => {
  const { bridge, request } = await setup();
  const first = await bridge.planImport(request);
  const second = await bridge.planImport(request);
  assert.equal(second.bindingHash, first.bindingHash);
  assert.equal(second.manifestHash, first.manifestHash);
  assert.equal(second.planHash, first.planHash);
  const applied = await apply(bridge, request, second);
  assert.equal(applied.state, "APPLIED");
  const noChange = await apply(bridge, request, second);
  assert.equal(noChange.state, "NO_CHANGE");
});
