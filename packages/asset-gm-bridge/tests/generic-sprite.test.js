import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson } from "../../img2threejs-asset-forge/dist/index.js";
import { encodePng, GovernedAssetGmBridge, validateSpriteSpec } from "../dist/index.js";
import { expectBridgeError, FIXTURE_PROJECT } from "./helpers.js";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * A sprite that is NOT the pilot beacon: different assetId, no `palette`, and
 * `png-default` compression. Before GM-ASSET-IMPORT-01 the bridge rejected
 * every one of these at the spec gate.
 */
const RUNNER_SPEC = Object.freeze({
  schemaVersion: 1,
  assetId: "pixel-runner",
  version: "1.0.0",
  width: 16,
  height: 24,
  frameCount: 3,
  origin: Object.freeze({ x: 8, y: 24 }),
  collisionPolicy: "bbox-auto",
  compressionPolicy: "png-default",
  budgetProfile: "bridge-sprite-v1",
});

/** Deterministic frames: a solid block whose column shifts per frame. */
function renderFrames(spec) {
  const frames = [];
  for (let frame = 0; frame < spec.frameCount; frame += 1) {
    const rgba = new Uint8Array(spec.width * spec.height * 4);
    for (let y = 4; y < spec.height - 2; y += 1) {
      for (let x = 2 + frame; x < spec.width - 3; x += 1) {
        const offset = (y * spec.width + x) * 4;
        rgba[offset] = 40 + frame * 30;
        rgba[offset + 1] = 200;
        rgba[offset + 2] = 120;
        rgba[offset + 3] = 255;
      }
    }
    frames.push(encodePng(spec.width, spec.height, rgba));
  }
  return frames;
}

function makeGenericWorkspace(spec = RUNNER_SPEC, status = "APPROVED") {
  const root = join(tmpdir(), `generic-sprite-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const artifactDir = join(root, `assets/builds/artifacts/${spec.assetId}`, spec.version);
  const exportsDir = join(artifactDir, "exports");
  mkdirSync(exportsDir, { recursive: true });
  mkdirSync(join(root, `assets/pilots/${spec.assetId}`), { recursive: true });

  const specRelative = `assets/pilots/${spec.assetId}/${spec.version}.spec.json`;
  const specPath = join(root, specRelative);
  writeFileSync(specPath, `${canonicalJson(spec)}\n`);

  const pngs = renderFrames(spec);
  const outputs = pngs.map((png, index) => {
    const relative = `assets/builds/artifacts/${spec.assetId}/${spec.version}/exports/${spec.assetId}-${spec.version}_${index}.png`;
    writeFileSync(join(root, relative), png);
    return { path: relative, sha256: sha256(png), bytes: png.byteLength, width: spec.width, height: spec.height, channels: 4 };
  });

  const artifactRelative = `assets/builds/artifacts/${spec.assetId}/${spec.version}/artifact-manifest.json`;
  const artifact = {
    schemaVersion: 1, assetId: spec.assetId, version: spec.version, specPath: specRelative,
    specSha256: sha256(readFileSync(specPath)), generatedModuleSha256: "0".repeat(64),
    budgetProfile: spec.budgetProfile,
    gates: { SPEC_GATE: "PASS", BUDGET_GATE: "PASS", PNG_GATE: "PASS", DETERMINISM_GATE: "PASS", LIFECYCLE_GATE: "PASS" },
    outputs,
  };
  writeFileSync(join(root, artifactRelative), `${canonicalJson(artifact)}\n`);

  const entry = {
    assetId: spec.assetId, version: spec.version, status, assetClass: "bridge-sprite",
    specPath: specRelative, factoryCapability: "asset-forge", artifactManifest: artifactRelative,
    budgetProfile: spec.budgetProfile, criticProfiles: [], rendererTargets: ["webgl"],
    exports: outputs.map(({ path }) => path),
    provenance: {
      manifest: artifactRelative, source: "packages/asset-gm-bridge/tests/generic-sprite.test.js",
      sourceSha256: "0".repeat(64), license: "MIT",
      manifestSha256: sha256(readFileSync(join(root, artifactRelative))),
    },
  };
  mkdirSync(join(root, "assets/catalog"), { recursive: true });
  writeFileSync(join(root, "assets/catalog/asset-catalog.json"), `${canonicalJson({ schemaVersion: 1, migration: "asset-catalog-v1", entries: [entry] })}\n`);

  const projectsDir = join(root, "projects");
  mkdirSync(projectsDir, { recursive: true });
  cpSync(FIXTURE_PROJECT, join(projectsDir, "pilot-a"), { recursive: true });
  return { root, projectsDir, catalogPath: join(root, "assets/catalog/asset-catalog.json"), spec };
}

function makeRequest(workspace, overrides = {}) {
  return {
    capability: "ASSET_GM_BRIDGE_V1",
    projectRoot: "pilot-a",
    evidenceRoot: ".evidence",
    transactionId: "generic-tx-0001",
    assetId: workspace.spec.assetId,
    assetVersion: workspace.spec.version,
    resourceName: "spr_pixel_runner",
    expectedProjectFingerprint: null,
    expectedHead: null,
    timeoutMs: 60_000,
    verificationPolicy: { projectLoad: false, compile: false, runtime: "forbidden" },
    ...overrides,
  };
}

async function boot(workspace) {
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(makeRequest(workspace));
  return { bridge, request: makeRequest(workspace, { expectedProjectFingerprint: target.fingerprint }), baseline: target.fingerprint };
}

test("SPEC: a real sprite spec with no palette and png-default compression validates", () => {
  const spec = validateSpriteSpec(RUNNER_SPEC);
  assert.equal(spec.assetId, "pixel-runner");
  assert.equal(spec.palette, undefined);
  assert.equal(spec.compressionPolicy, "png-default");
});

test("SPEC: the pilot beacon spec still validates unchanged", () => {
  const beacon = {
    schemaVersion: 1, assetId: "bridge-test-beacon", version: "1.0.0", width: 64, height: 64,
    frameCount: 2, palette: "v1-cyan", origin: { x: 32, y: 32 },
    collisionPolicy: "bbox-auto", compressionPolicy: "stored-deflate", budgetProfile: "bridge-sprite-v1",
  };
  assert.equal(validateSpriteSpec(beacon).palette, "v1-cyan");
});

test("SPEC: unknown fields, bad identity and out-of-bounds origin are rejected", () => {
  const cases = [
    ["unknown field", { ...RUNNER_SPEC, sneaky: true }],
    ["missing field", (() => { const { width, ...rest } = RUNNER_SPEC; return rest; })()],
    ["uppercase assetId", { ...RUNNER_SPEC, assetId: "PixelRunner" }],
    ["path-like assetId", { ...RUNNER_SPEC, assetId: "../escape" }],
    ["non-semver version", { ...RUNNER_SPEC, version: "one" }],
    ["zero frames", { ...RUNNER_SPEC, frameCount: 0 }],
    ["oversized width", { ...RUNNER_SPEC, width: 99999 }],
    ["origin outside bounds", { ...RUNNER_SPEC, origin: { x: 999, y: 0 } }],
    ["unknown compression", { ...RUNNER_SPEC, compressionPolicy: "brotli" }],
    ["unknown budget profile", { ...RUNNER_SPEC, budgetProfile: "unlimited" }],
  ];
  for (const [label, value] of cases) {
    assert.throws(() => validateSpriteSpec(value), (error) => error.code === "SPEC_INVALID", label);
  }
});

test("IMPORT: a non-beacon sprite plans, applies and rolls back byte-exactly", async () => {
  const workspace = makeGenericWorkspace();
  try {
    const { bridge, request, baseline } = await boot(workspace);

    const plan = await bridge.planImport(request);
    assert.equal(plan.manifest.resourceName, "spr_pixel_runner");
    assert.equal(plan.manifest.instrumentation, "NONE");
    assert.equal(plan.manifest.frameCount, 3);
    assert.deepEqual(plan.manifest.dimensions, { width: 16, height: 24 });
    // Sprite .yy + .yyp + .resource_order + two images per frame; no object code.
    assert.equal(plan.files.length, 3 + RUNNER_SPEC.frameCount * 2);
    assert.equal(plan.files.some(({ path }) => path.endsWith(".gml")), false);

    const applied = await bridge.applyImport({ ...request, plan: plan.plan, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, dryRun: false });
    assert.equal(applied.state, "APPLIED");

    const projectRoot = join(workspace.projectsDir, "pilot-a");
    assert.ok(existsSync(join(projectRoot, "sprites/spr_pixel_runner/spr_pixel_runner.yy")));
    for (let frame = 0; frame < RUNNER_SPEC.frameCount; frame += 1) {
      assert.ok(existsSync(join(projectRoot, `sprites/spr_pixel_runner/${frame}.png`)), `composite frame ${frame}`);
      assert.ok(existsSync(join(projectRoot, `sprites/spr_pixel_runner/layers/${frame}/default.png`)), `layer frame ${frame}`);
    }
    const yyp = readFileSync(join(projectRoot, "AssetBridgePilot.yyp"), "utf8");
    assert.ok(yyp.includes("sprites/spr_pixel_runner/spr_pixel_runner.yy"));
    // The pilot object's code is untouched by a plain import.
    assert.equal(readFileSync(join(projectRoot, "objects/obj_asset_bridge_pilot/Create_0.gml"), "utf8").includes("GM_ASSET_BRIDGE_BEACON_APPLIED 1"), false);

    const current = await bridge.inspectTarget(request);
    const rolled = await bridge.rollbackImport({ ...request, expectedProjectFingerprint: current.fingerprint, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true });
    assert.equal(rolled.restored, true);
    assert.equal(rolled.byteExact, true);
    const restored = await bridge.inspectTarget(request);
    assert.equal(restored.fingerprint, baseline);
    // Every imported FILE is gone and the .yyp no longer references the sprite.
    assert.equal(existsSync(join(projectRoot, "sprites/spr_pixel_runner/spr_pixel_runner.yy")), false);
    for (let frame = 0; frame < RUNNER_SPEC.frameCount; frame += 1) {
      assert.equal(existsSync(join(projectRoot, `sprites/spr_pixel_runner/${frame}.png`)), false);
      assert.equal(existsSync(join(projectRoot, `sprites/spr_pixel_runner/layers/${frame}/default.png`)), false);
    }
    assert.equal(readFileSync(join(projectRoot, "AssetBridgePilot.yyp"), "utf8").includes("spr_pixel_runner"), false);
    // Known and accepted: rollback restores file bytes, not directory structure,
    // so the empty sprites/<name>/ tree it created stays behind. The project
    // fingerprint covers files only, GameMaker keys off the .yyp resource list,
    // and Git does not track empty directories, so the residue is inert.
    assert.equal(restored.files.some(({ path }) => path.startsWith("sprites/spr_pixel_runner/")), false);
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("IMPORT: the sprite .yy carries the spec's real dimensions and frame count", async () => {
  const workspace = makeGenericWorkspace();
  try {
    const { bridge, request } = await boot(workspace);
    const plan = await bridge.planImport(request);
    const yyFile = plan.plan.files.find(({ path }) => path === "sprites/spr_pixel_runner/spr_pixel_runner.yy");
    const yy = Buffer.from(yyFile.afterContentBase64, "base64").toString("utf8");
    assert.match(yy, /"width":16,/);
    assert.match(yy, /"height":24,/);
    assert.equal((yy.match(/"\$GMSpriteFrame":"v1",/g) ?? []).length, 3);
    assert.match(yy, /"%Name":"spr_pixel_runner",/);
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("IMPORT: instrumentation is refused when the pilot object is absent", async () => {
  const workspace = makeGenericWorkspace();
  try {
    const { bridge, request } = await boot(workspace);
    rmSync(join(workspace.projectsDir, "pilot-a/objects/obj_asset_bridge_pilot"), { recursive: true, force: true });
    const target = await bridge.inspectTarget(request);
    await expectBridgeError(
      bridge.planImport({ ...request, expectedProjectFingerprint: target.fingerprint, instrumentation: "PILOT_BEACON_V1" }),
      "PATH_NOT_ALLOWED",
    );
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("IMPORT: an unknown instrumentation mode is refused", async () => {
  const workspace = makeGenericWorkspace();
  try {
    const { bridge, request } = await boot(workspace);
    await expectBridgeError(bridge.planImport({ ...request, instrumentation: "ARBITRARY" }), "INVALID_REQUEST");
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("IMPORT: a spec whose assetId disagrees with the catalog entry is refused", async () => {
  const workspace = makeGenericWorkspace();
  try {
    const specPath = join(workspace.root, `assets/pilots/${RUNNER_SPEC.assetId}/${RUNNER_SPEC.version}.spec.json`);
    writeFileSync(specPath, `${canonicalJson({ ...RUNNER_SPEC, assetId: "other-sprite" })}\n`);
    const { bridge, request } = await boot(workspace);
    // The artifact manifest pins the spec digest, so tampering trips that gate first.
    await expectBridgeError(bridge.planImport(request), "ASSET_HASH_MISMATCH");
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("IMPORT: a resourceName outside the naming policy is refused", async () => {
  const workspace = makeGenericWorkspace();
  try {
    const { bridge, request } = await boot(workspace);
    await expectBridgeError(bridge.planImport({ ...request, resourceName: "runner" }), "INVALID_REQUEST");
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("IMPORT: a case-variant of the canonical resource name is refused", async () => {
  const workspace = makeGenericWorkspace();
  try {
    const { bridge, request } = await boot(workspace);
    await expectBridgeError(bridge.planImport({ ...request, resourceName: "spr_Pixel_Runner" }), "CASE_COLLISION");
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("IMPORT: a non-APPROVED sprite never reaches planning", async () => {
  const workspace = makeGenericWorkspace(RUNNER_SPEC, "DRAFT");
  try {
    const { bridge, request } = await boot(workspace);
    await expectBridgeError(bridge.planImport(request), "ASSET_NOT_APPROVED");
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});
