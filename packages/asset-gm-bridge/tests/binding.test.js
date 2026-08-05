import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { canonicalJson } from "../../img2threejs-asset-forge/dist/index.js";
import { planHash as adapterPlanHash } from "../../gm-ide-adapter/dist/internal.js";
import { GovernedAssetGmBridge } from "../dist/index.js";
import { baseRequest, expectBridgeError, makeWorkspace } from "./helpers.js";

async function setup(workspace = makeWorkspace({})) {
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), expectedProjectFingerprint: target.fingerprint };
  const plan = await bridge.planImport(request);
  return { bridge, request, plan, workspace };
}

const apply = (bridge, request, plan, bindingHash) => bridge.applyImport({ ...request, plan: plan.plan, planHash: plan.planHash, bindingHash, confirm: true, dryRun: false });

test("replacing the exported PNG after planning invalidates the plan", async () => {
  const { bridge, request, plan, workspace } = await setup();
  const pngPath = join(workspace.root, "assets/builds/artifacts/bridge-test-beacon/1.0.0/exports/bridge-test-beacon-1.0.0_1.png");
  const original = readFileSync(pngPath);
  writeFileSync(pngPath, Buffer.concat([original, Buffer.from([0])]));
  await expectBridgeError(apply(bridge, request, plan, plan.bindingHash), "STALE_OR_TAMPERED_PLAN");
});

test("changing one byte of the stored manifest invalidates the plan", async () => {
  const { bridge, request, plan } = await setup();
  const stored = join(bridge.projectsDir, ".evidence/asset-bridge/test-tx-0001/manifest.json");
  const bytes = readFileSync(stored, "utf8");
  writeFileSync(stored, bytes.replace("APPROVED", "APPROVE "));
  await expectBridgeError(apply(bridge, request, plan, plan.bindingHash), "STALE_OR_TAMPERED_PLAN");
});

test("altering the manifest allowlist invalidates the plan (binding recompute fails)", async () => {
  const { bridge, request, plan } = await setup();
  const stored = join(bridge.projectsDir, ".evidence/asset-bridge/test-tx-0001/manifest.json");
  const manifest = JSON.parse(readFileSync(stored, "utf8"));
  manifest.allowlist = [...manifest.allowlist, "objects/obj_asset_bridge_pilot/Create_0.gml"];
  writeFileSync(stored, `${canonicalJson(manifest)}\n`);
  await expectBridgeError(apply(bridge, request, plan, plan.bindingHash), "STALE_OR_TAMPERED_PLAN");
});

test("swapping the plan object invalidates the plan", async () => {
  const { bridge, request, plan } = await setup();
  const other = await bridge.planImport({ ...request, transactionId: "test-tx-0002" });
  // The plan hash no longer matches the binding record's adapter plan hash.
  await expectBridgeError(apply(bridge, request, other, plan.bindingHash), "STALE_OR_TAMPERED_PLAN");
});

test("same-transaction plan substitution is rejected by apply and verify", async () => {
  const { bridge, request, plan } = await setup();
  const hostile = Buffer.from("hostile same-transaction content", "utf8");
  const first = plan.plan.files[0];
  const forgedPlan = {
    ...plan.plan,
    files: [{
      ...first,
      afterContentBase64: hostile.toString("base64"),
      afterSha256: createHash("sha256").update(hostile).digest("hex"),
    }, ...plan.plan.files.slice(1)],
  };
  const forgedHash = adapterPlanHash(forgedPlan);
  await expectBridgeError(
    bridge.applyImport({ ...request, plan: forgedPlan, planHash: forgedHash, bindingHash: plan.bindingHash, confirm: true, dryRun: false }),
    "STALE_OR_TAMPERED_PLAN",
  );
  await expectBridgeError(
    bridge.verifyImport({ ...request, plan: forgedPlan, planHash: forgedHash, bindingHash: plan.bindingHash, levels: ["TEXT_VALID"] }),
    "STALE_OR_TAMPERED_PLAN",
  );
});

test("reusing a plan on another fixture fails closed", async () => {
  const { bridge, request, plan } = await setup();
  const { cpSync } = await import("node:fs");
  cpSync(join(bridge.projectsDir, "pilot-a"), join(bridge.projectsDir, "pilot-b"), { recursive: true });
  const other = { ...request, projectRoot: "pilot-b" };
  await expectBridgeError(apply(bridge, other, plan, plan.bindingHash), "STALE_OR_TAMPERED_PLAN");
});

test("editing a target file before apply fails closed", async () => {
  const { bridge, request, plan } = await setup();
  const gmlPath = join(bridge.projectsDir, "pilot-a/objects/obj_asset_bridge_pilot/Create_0.gml");
  writeFileSync(gmlPath, readFileSync(gmlPath, "utf8") + "\n// tampered\n");
  await expectBridgeError(apply(bridge, request, plan, plan.bindingHash), "STALE_OR_TAMPERED_PLAN");
});

test("path case change of the resource name fails closed", async () => {
  const { bridge, request } = await setup();
  await expectBridgeError(bridge.planImport({ ...request, resourceName: "spr_Bridge_Test_Beacon" }), "CASE_COLLISION");
});

test("wrong binding hash is rejected without side effects", async () => {
  const { bridge, request, plan } = await setup();
  const parse = (path) => JSON.parse(readFileSync(path, "utf8").replace(/,\s*([}\]])/g, "$1"));
  const before = parse(join(bridge.projectsDir, "pilot-a/AssetBridgePilot.yyp"));
  await expectBridgeError(apply(bridge, request, plan, "f".repeat(64)), "STALE_OR_TAMPERED_PLAN");
  const after = parse(join(bridge.projectsDir, "pilot-a/AssetBridgePilot.yyp"));
  assert.equal(before.resources.length, after.resources.length);
});

test("plan is invalidated when Git HEAD changes between plan and apply", async () => {
  const workspace = makeWorkspace({});
  const { execFileSync } = await import("node:child_process");
  const projectDir = join(workspace.projectsDir, "pilot-a");
  execFileSync("git", ["init", "-q"], { cwd: projectDir });
  execFileSync("git", ["add", "."], { cwd: projectDir });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "initial"], { cwd: projectDir });
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), expectedProjectFingerprint: target.fingerprint, expectedHead: target.gitHead };
  const plan = await bridge.planImport(request);
  writeFileSync(join(projectDir, "note.txt"), "external change\n");
  execFileSync("git", ["add", "."], { cwd: projectDir });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "external"], { cwd: projectDir });
  await expectBridgeError(apply(bridge, request, plan, plan.bindingHash), "STALE_OR_TAMPERED_PLAN");
});

test("asset manifest tamper between plan and apply is detected", async () => {
  const { bridge, request, plan, workspace } = await setup();
  const manifestPath = join(workspace.root, "assets/builds/artifacts/bridge-test-beacon/1.0.0/artifact-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.outputs = manifest.outputs.map((output, index) => (index === 1 ? { ...output, bytes: output.bytes + 1 } : output));
  writeFileSync(manifestPath, `${canonicalJson(manifest)}\n`);
  await expectBridgeError(apply(bridge, request, plan, plan.bindingHash), "STALE_OR_TAMPERED_PLAN");
});

test("spec file tamper between plan and apply is detected", async () => {
  const { bridge, request, plan, workspace } = await setup();
  const specPath = join(workspace.root, "assets/pilots/bridge-test-beacon/1.0.0.spec.json");
  writeFileSync(specPath, readFileSync(specPath, "utf8").replace("v1-cyan", "v2-magenta"));
  await expectBridgeError(apply(bridge, request, plan, plan.bindingHash), "STALE_OR_TAMPERED_PLAN");
});
