import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { GovernedAssetGmBridge, scanPathCollisions } from "../dist/index.js";
import { baseRequest, expectBridgeError, makeWorkspace } from "./helpers.js";

test("path collision scan detects case collisions", () => {
  const { collisions } = scanPathCollisions(["sprites/Spr_Beacon/spr.yy"], ["sprites/spr_beacon/spr.yy"]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].kind, "CASE");
});

test("path collision scan detects Unicode ambiguity (NFKC)", () => {
  // "ﬁ" (U+FB01 ligature) normalizes to "fi" under NFKC.
  const ligature = "sprites/spr_beaﬁcon/x.yy";
  const ascii = "sprites/spr_beaficon/x.yy";
  const { collisions } = scanPathCollisions([ligature], [ascii]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].kind, "UNICODE");
});

test("path collision scan detects duplicate planned paths", () => {
  const { collisions } = scanPathCollisions(["a/b.yy", "a/b.yy"], []);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].kind, "DUPLICATE");
});

async function expectPathRejection(resourceName, expectedCode) {
  const workspace = makeWorkspace({});
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), expectedProjectFingerprint: target.fingerprint, resourceName };
  return expectBridgeError(bridge.planImport(request), expectedCode);
}

test("path traversal and unsafe segments are rejected", async () => {
  for (const resourceName of ["../escape", "spr/..\\x", "spr:a", "CON", "spr%2ex"]) {
    await expectPathRejection(resourceName, "PATH_NOT_ALLOWED");
  }
});

test("existing resource collision is rejected (RESOURCE_COLLISION)", async () => {
  const workspace = makeWorkspace({});
  // Simulate a pre-existing resource with the same path.
  mkdirSync(join(workspace.projectsDir, "pilot-a/sprites/spr_bridge_test_beacon"), { recursive: true });
  writeFileSync(join(workspace.projectsDir, "pilot-a/sprites/spr_bridge_test_beacon/spr_bridge_test_beacon.yy"), "{}");
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), expectedProjectFingerprint: target.fingerprint };
  await expectBridgeError(bridge.planImport(request), "RESOURCE_COLLISION");
});

test("symlink inside the target project fails closed (PATH_ESCAPE via adapter inspection)", async () => {
  const workspace = makeWorkspace({});
  try {
    symlinkSync(join(workspace.root, "projects"), join(workspace.projectsDir, "pilot-a/evil-link"), "junction");
  } catch {
    return; // junctions may require privileges in CI-like environments; skip if unavailable
  }
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  let error = null;
  try { await bridge.inspectTarget(baseRequest(workspace)); } catch (caught) { error = caught; }
  assert.ok(error, "inspection must fail on a symlink inside the project");
  assert.equal(error.code, "PATH_ESCAPE");
});

test("evidence roots inside the project are rejected before planning writes", async () => {
  for (const evidenceRoot of ["pilot-a/.evidence", "PILOT-A/.evidence"]) {
    const workspace = makeWorkspace({});
    const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
    const target = await bridge.inspectTarget(baseRequest(workspace));
    const request = { ...baseRequest(workspace), evidenceRoot, expectedProjectFingerprint: target.fingerprint };
    await expectBridgeError(bridge.planImport(request), "PATH_NOT_ALLOWED");
    assert.equal(existsSync(join(workspace.projectsDir, evidenceRoot, "asset-bridge")), false);
  }
});
