import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ASEPRITE_ENV,
  canonicalJson,
  ingestAsepriteSprite,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  ORIGIN_PRESET_NAMES,
  ORIGIN_PRESETS,
  parseAsepriteMetadata,
  resolveAsepriteExecutable,
  resolveTimeoutMs,
} from "../dist/index.js";
import { GovernedAssetGmBridge, validateSpriteSpec } from "@tanguito/devlab-asset-gm-bridge";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const FIXTURE = new URL("../../../fixtures/aseprite/ingest-pilot.aseprite", import.meta.url).pathname.replace(/^\//, "");
const GM_FIXTURE = new URL("../../../fixtures/gamemaker/asset-bridge-pilot/", import.meta.url).pathname.replace(/^\//, "");

/**
 * The real-Aseprite lane runs only where DEVLAB_ASEPRITE points at a working
 * install. CI has none and exercises the pure lanes instead; a skip means "not
 * verifiable on this host", never "assumed to pass".
 */
const asepriteConfigured = Boolean(process.env[ASEPRITE_ENV]);
const realAseprite = asepriteConfigured ? {} : { skip: `requires ${ASEPRITE_ENV} to point at a working Aseprite install` };

const META = (overrides = {}) => JSON.stringify({
  frames: [
    { filename: "a 0", sourceSize: { w: 16, h: 24 }, duration: 100 },
    { filename: "a 1", sourceSize: { w: 16, h: 24 }, duration: 100 },
  ],
  meta: { format: "RGBA8888", version: "1.3.18.1-x64" },
  ...overrides,
});

test("EXECUTABLE: comes only from the environment and must be named Aseprite", async () => {
  await assert.rejects(() => resolveAsepriteExecutable({}), (error) => error.code === "ASEPRITE_NOT_CONFIGURED");
  await assert.rejects(() => resolveAsepriteExecutable({ [ASEPRITE_ENV]: "aseprite" }), (error) => error.code === "ASEPRITE_NOT_CONFIGURED");
  const wrongName = process.platform === "win32" ? "C:\\tools\\Evil.exe" : "/tools/evil";
  await assert.rejects(() => resolveAsepriteExecutable({ [ASEPRITE_ENV]: wrongName }), (error) => error.code === "ASEPRITE_NOT_CONFIGURED");
  const absent = process.platform === "win32" ? "C:\\nope\\Aseprite.exe" : "/nope/aseprite";
  await assert.rejects(() => resolveAsepriteExecutable({ [ASEPRITE_ENV]: absent }), (error) => error.code === "ASEPRITE_NOT_FOUND");
});

test("TIMEOUT: bounded on both ends", () => {
  assert.equal(resolveTimeoutMs(undefined) > 0, true);
  assert.equal(resolveTimeoutMs(MIN_TIMEOUT_MS), MIN_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs(MAX_TIMEOUT_MS), MAX_TIMEOUT_MS);
  for (const bad of [0, -1, 1.5, MIN_TIMEOUT_MS - 1, MAX_TIMEOUT_MS + 1]) {
    assert.throws(() => resolveTimeoutMs(bad), (error) => error.code === "ASEPRITE_NOT_CONFIGURED");
  }
});

test("METADATA: a well-formed document yields frames, size and version", () => {
  const metadata = parseAsepriteMetadata(META());
  assert.equal(metadata.frameCount, 2);
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 24);
  assert.equal(metadata.format, "RGBA8888");
  assert.equal(metadata.asepriteVersion, "1.3.18.1-x64");
});

test("METADATA: indexed and greyscale sources are refused, not silently converted", () => {
  assert.throws(
    () => parseAsepriteMetadata(META({ meta: { format: "I8", version: "1.3" } })),
    (error) => error.code === "ASEPRITE_METADATA_INVALID" && /RGBA8888/.test(error.message),
  );
});

test("METADATA: malformed, empty and ragged documents fail closed", () => {
  assert.throws(() => parseAsepriteMetadata("not json"), (error) => error.code === "ASEPRITE_METADATA_INVALID");
  assert.throws(() => parseAsepriteMetadata(JSON.stringify({ frames: [], meta: {} })), (error) => error.code === "ASEPRITE_METADATA_INVALID");
  const ragged = JSON.stringify({
    frames: [
      { sourceSize: { w: 16, h: 24 }, duration: 100 },
      { sourceSize: { w: 8, h: 24 }, duration: 100 },
    ],
    meta: { format: "RGBA8888", version: "1.3" },
  });
  assert.throws(() => parseAsepriteMetadata(ragged), (error) => /one canvas size/.test(error.message));
});

test("ORIGIN: every preset lands inside the sprite bounds", () => {
  for (const preset of ORIGIN_PRESET_NAMES) {
    const point = ORIGIN_PRESETS[preset](16, 24);
    assert.ok(point.x >= 0 && point.x <= 16, `${preset} x`);
    assert.ok(point.y >= 0 && point.y <= 24, `${preset} y`);
  }
  assert.deepEqual(ORIGIN_PRESETS["top-left"](16, 24), { x: 0, y: 0 });
  assert.deepEqual(ORIGIN_PRESETS["bottom-centre"](16, 24), { x: 8, y: 24 });
  assert.deepEqual(ORIGIN_PRESETS.centre(16, 24), { x: 8, y: 12 });
});

test("CANONICAL JSON: keys are sorted and output is stable", () => {
  assert.equal(canonicalJson({ z: 1, a: [2, { b: true, a: false }] }), '{"a":[2,{"a":false,"b":true}],"z":1}');
  assert.equal(canonicalJson({ a: 1 }), canonicalJson({ a: 1 }));
});

test("IDENTITY: a bad assetId or version is refused before Aseprite is touched", async () => {
  const root = mkdtempSync(join(tmpdir(), "ingest-id-"));
  try {
    for (const [assetId, version] of [["Bad_Id", "1.0.0"], ["ok-id", "one"], ["../escape", "1.0.0"]]) {
      await assert.rejects(
        () => ingestAsepriteSprite({ source: FIXTURE, repoRoot: root, assetId, version, env: {} }),
        (error) => error.code === "ASEPRITE_METADATA_INVALID",
        `${assetId}@${version}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REAL: ingest emits a spec the bridge accepts, with an earned determinism gate", { ...realAseprite }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ingest-real-"));
  try {
    const result = await ingestAsepriteSprite({
      source: FIXTURE, repoRoot: root, assetId: "ingest-pilot", version: "1.0.0", origin: "bottom-centre",
    });

    assert.equal(result.deterministic, true);
    assert.equal(result.frames.length, 3);
    assert.equal(result.spec.width, 16);
    assert.equal(result.spec.height, 24);
    assert.deepEqual(result.spec.origin, { x: 8, y: 24 });
    assert.equal(result.spec.compressionPolicy, "png-default");
    assert.match(result.asepriteVersion, /^\d+\./);

    // The emitted spec must satisfy the bridge's own gate.
    assert.doesNotThrow(() => validateSpriteSpec(JSON.parse(readFileSync(join(root, result.specPath), "utf8"))));

    // Every frame really landed and its digest matches the manifest.
    const artifact = JSON.parse(readFileSync(join(root, result.artifactManifestPath), "utf8"));
    assert.equal(artifact.gates.DETERMINISM_GATE, "PASS");
    assert.equal(artifact.specSha256, result.specSha256);
    for (const output of artifact.outputs) {
      const bytes = readFileSync(join(root, output.path));
      assert.equal(sha256(bytes), output.sha256);
      assert.equal(output.channels, 4);
    }

    // Ingest never approves its own output.
    assert.equal(result.catalogEntry.status, "DRAFT");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REAL: an ingested sprite imports into GameMaker and rolls back byte-exactly", { ...realAseprite }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ingest-import-"));
  try {
    const ingested = await ingestAsepriteSprite({
      source: FIXTURE, repoRoot: root, assetId: "ingest-pilot", version: "1.0.0", origin: "centre",
    });

    // Promotion to APPROVED is the human step the ingest deliberately omits.
    const entry = { ...ingested.catalogEntry, status: "APPROVED" };
    mkdirSync(join(root, "assets/catalog"), { recursive: true });
    writeFileSync(
      join(root, "assets/catalog/asset-catalog.json"),
      `${canonicalJson({ schemaVersion: 1, migration: "asset-catalog-v1", entries: [entry] })}\n`,
    );

    const projectsDir = join(root, "projects");
    mkdirSync(projectsDir, { recursive: true });
    cpSync(GM_FIXTURE, join(projectsDir, "game"), { recursive: true });

    const bridge = new GovernedAssetGmBridge(projectsDir, { catalogPath: join(root, "assets/catalog/asset-catalog.json"), repoRoot: root });
    const base = {
      capability: "ASSET_GM_BRIDGE_V1", projectRoot: "game", evidenceRoot: ".evidence",
      transactionId: "ingest-import-001", assetId: "ingest-pilot", assetVersion: "1.0.0",
      resourceName: "spr_ingest_pilot", expectedProjectFingerprint: null, expectedHead: null,
      timeoutMs: 60_000, verificationPolicy: { projectLoad: false, compile: false, runtime: "forbidden" },
    };

    const before = await bridge.inspectTarget(base);
    const request = { ...base, expectedProjectFingerprint: before.fingerprint };
    const plan = await bridge.planImport(request);
    assert.equal(plan.manifest.frameCount, 3);
    assert.equal(plan.manifest.instrumentation, "NONE");

    const applied = await bridge.applyImport({ ...request, plan: plan.plan, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, dryRun: false });
    assert.equal(applied.state, "APPLIED");

    const gameRoot = join(projectsDir, "game");
    assert.ok(existsSync(join(gameRoot, "sprites/spr_ingest_pilot/spr_ingest_pilot.yy")));
    // The bytes GameMaker gets are the bytes Aseprite produced.
    const imported = readFileSync(join(gameRoot, "sprites/spr_ingest_pilot/1.png"));
    assert.equal(sha256(imported), ingested.frames[1].sha256);

    const current = await bridge.inspectTarget(request);
    const rolled = await bridge.rollbackImport({ ...request, expectedProjectFingerprint: current.fingerprint, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true });
    assert.equal(rolled.byteExact, true);
    const restored = await bridge.inspectTarget(request);
    assert.equal(restored.fingerprint, before.fingerprint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REAL: re-ingesting the same source reproduces identical bytes", { ...realAseprite }, async () => {
  const first = mkdtempSync(join(tmpdir(), "ingest-det-a-"));
  const second = mkdtempSync(join(tmpdir(), "ingest-det-b-"));
  try {
    const options = { source: FIXTURE, assetId: "ingest-pilot", version: "1.0.0", origin: "centre" };
    const a = await ingestAsepriteSprite({ ...options, repoRoot: first });
    const b = await ingestAsepriteSprite({ ...options, repoRoot: second });
    assert.equal(a.specSha256, b.specSha256);
    assert.deepEqual(a.frames.map(({ sha256: digest }) => digest), b.frames.map(({ sha256: digest }) => digest));
    assert.equal(
      readFileSync(join(first, a.artifactManifestPath), "utf8"),
      readFileSync(join(second, b.artifactManifestPath), "utf8"),
    );
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});
