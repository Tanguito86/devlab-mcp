import assert from "node:assert/strict";
import test from "node:test";
import { GovernedAssetGmBridge } from "../dist/index.js";
import { baseRequest, expectBridgeError, makeWorkspace } from "./helpers.js";

async function planFor(workspace, overrides = {}) {
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget({ ...baseRequest(workspace), ...overrides });
  return { bridge, target, request: { ...baseRequest(workspace), ...overrides, expectedProjectFingerprint: target.fingerprint } };
}

test("lifecycle gate blocks every non-APPROVED state at plan time", async () => {
  for (const status of ["DRAFT", "PILOT", "CANDIDATE", "DEPRECATED", "REJECTED"]) {
    const workspace = makeWorkspace({ status });
    const { bridge, request } = await planFor(workspace);
    await expectBridgeError(bridge.planImport(request), "ASSET_NOT_APPROVED");
  }
});

test("lifecycle gate allows APPROVED", async () => {
  const workspace = makeWorkspace({ status: "APPROVED" });
  const { bridge, request } = await planFor(workspace);
  const plan = await bridge.planImport(request);
  assert.equal(plan.asset.status, "APPROVED");
  assert.equal(plan.manifest.assetLifecycle, "APPROVED");
});

test("lifecycle change after planning invalidates the plan (STALE_OR_TAMPERED_PLAN)", async () => {
  const workspace = makeWorkspace({ status: "APPROVED" });
  const { bridge, request } = await planFor(workspace);
  const plan = await bridge.planImport(request);
  // Asset flips to DEPRECATED after the plan was created.
  const catalogPath = workspace.catalogPath;
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { canonicalJson } = await import("../../img2threejs-asset-forge/dist/index.js");
  const catalog = JSON.parse(await import("node:fs/promises").then((m) => m.readFile(catalogPath, "utf8")));
  catalog.entries = catalog.entries.map((entry) => entry.version === "1.0.0" ? { ...entry, status: "DEPRECATED" } : entry);
  writeFileSync(catalogPath, `${canonicalJson(catalog)}\n`);
  await expectBridgeError(
    bridge.applyImport({ ...request, plan: plan.plan, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, dryRun: false }),
    "STALE_OR_TAMPERED_PLAN",
  );
});

test("asset missing from catalog fails closed", async () => {
  const workspace = makeWorkspace({});
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  await expectBridgeError(bridge.inspectAsset({ ...baseRequest(workspace), assetVersion: "9.9.9" }), "ASSET_NOT_FOUND");
});

test("no hidden bypass flag or debug argument exists", () => {
  const workspace = makeWorkspace({ status: "DRAFT" });
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  // Any request field is ignored by the gate; the status is read from the catalog only.
  assert.equal(typeof bridge.planImport, "function");
  const request = { ...baseRequest(workspace), force: true, bypassLifecycle: true, debug: true };
  // The request must still fail with ASSET_NOT_APPROVED; extra fields cannot reach the gate.
  return expectBridgeError(bridge.inspectAsset(request).then(() => bridge.planImport({ ...request, expectedProjectFingerprint: "a".repeat(64) })), "ASSET_NOT_APPROVED");
});
