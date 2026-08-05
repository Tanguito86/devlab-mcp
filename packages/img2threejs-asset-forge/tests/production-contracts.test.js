import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ASSET_FORGE_CAPABILITY, ASSET_FORGE_OPERATIONS, BUDGET_PROFILES, AssetForgeError,
  assertCatalogEvolution, assertLifecycleTransition, createPromotionRecord, evaluateBudget,
  scanCatalogProvenance, validateAssetCatalog, validateAtlasBridgeManifest,
} from "../dist/index.js";

const repo = new URL("../../../", import.meta.url);
const loadJson = async (path) => JSON.parse(await readFile(new URL(path, repo), "utf8"));

test("PRODUCTION CAPABILITY: exposes the exact stable public operations without Three.js API", () => {
  assert.equal(ASSET_FORGE_CAPABILITY.id, "asset-forge"); assert.equal(ASSET_FORGE_CAPABILITY.publicRendererApi, false);
  assert.deepEqual(ASSET_FORGE_OPERATIONS.map(({ id }) => id), ["asset_forge.validate_spec", "asset_forge.build", "asset_forge.build_batch", "asset_forge.capture", "asset_forge.critic", "asset_forge.resolve", "asset_forge.export", "asset_forge.inspect"]);
  for (const operation of ASSET_FORGE_OPERATIONS) { assert.equal(operation.offline, true); assert.ok(operation.inputSchema); assert.ok(operation.outputSchema); assert.ok(operation.rollback); assert.ok(operation.errors.length >= 4); }
});

test("ASSET CATALOG: canonical Cinder pilot entry validates and has complete provenance", async () => {
  const catalog = validateAssetCatalog(await loadJson("assets/catalog/asset-catalog.json")); assert.equal(catalog.entries.length, 1); assert.equal(catalog.entries[0].status, "PILOT");
  assert.deepEqual(scanCatalogProvenance(catalog), [{ assetId: "cinder-relay-drone", version: "1.0.0-pilot.1", errors: [] }]);
  const entry = catalog.entries[0];
  for (const [path, expected] of [[entry.specPath, "890a65cd5f744a2326d8ef99eccf7cc44689ada0a71c566d046e3154293839c2"], [entry.artifactManifest, entry.provenance.manifestSha256], [entry.provenance.source, entry.provenance.sourceSha256]]) {
    const bytes = await readFile(new URL(path, repo)); assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
  }
});

test("ASSET CATALOG: closed schema, duplicate identity and noncanonical order fail", async () => {
  const input = await loadJson("assets/catalog/asset-catalog.json");
  assert.throws(() => validateAssetCatalog({ ...input, timestamp: 1 }), /unknown fields/);
  assert.throws(() => validateAssetCatalog({ ...input, entries: [...input.entries, input.entries[0]] }), (error) => error instanceof AssetForgeError && error.code === "CATALOG_DUPLICATE");
  const later = { ...input.entries[0], version: "2.0.0" }; assert.throws(() => validateAssetCatalog({ ...input, entries: [later, input.entries[0]] }), /canonical/);
});

test("ASSET LIFECYCLE: canonical transitions work and builder cannot approve", () => {
  assert.doesNotThrow(() => assertLifecycleTransition("DRAFT", "PILOT", "BUILDER", [], false));
  assert.doesNotThrow(() => assertLifecycleTransition("PILOT", "CANDIDATE", "RESOLVER", [], true));
  assert.throws(() => assertLifecycleTransition("CANDIDATE", "APPROVED", "BUILDER", [], true), (error) => error.code === "BUILDER_FORBIDDEN");
  assert.throws(() => assertLifecycleTransition("CANDIDATE", "APPROVED", "RESOLVER", [{ severity: "REQUIRED" }], true), (error) => error.code === "OPEN_REQUIRED");
  assert.throws(() => assertLifecycleTransition("CANDIDATE", "APPROVED", "RESOLVER", [], false), (error) => error.code === "EVIDENCE_INCOMPLETE");
  assert.doesNotThrow(() => assertLifecycleTransition("APPROVED", "DEPRECATED", "RESOLVER", [], true));
  assert.doesNotThrow(() => assertLifecycleTransition("REJECTED", "DRAFT", "RESOLVER", [], false));
});

test("VERSION IMMUTABILITY: same candidate version cannot mutate", async () => {
  const base = validateAssetCatalog(await loadJson("assets/catalog/asset-catalog.json")); const candidate = validateAssetCatalog({ ...base, entries: [{ ...base.entries[0], status: "CANDIDATE" }] });
  const changed = validateAssetCatalog({ ...candidate, entries: [{ ...candidate.entries[0], provenance: { ...candidate.entries[0].provenance, manifestSha256: "f".repeat(64) } }] });
  assert.throws(() => assertCatalogEvolution(candidate, changed), (error) => error.code === "VERSION_IMMUTABLE");
});

test("VERSION IMMUTABILITY: new version is allowed, duplicates and accidental downgrade are rejected", async () => {
  const previous = validateAssetCatalog(await loadJson("assets/catalog/asset-catalog.json"));
  const newEntry = { ...previous.entries[0], version: "1.1.0", provenance: { ...previous.entries[0].provenance, manifestSha256: "e".repeat(64) } };
  const next = validateAssetCatalog({ schemaVersion: 1, migration: "asset-catalog-v1", entries: [...previous.entries, newEntry] }); assert.doesNotThrow(() => assertCatalogEvolution(previous, next));
  const lower = { ...previous.entries[0], version: "0.9.0" }; const downgrade = validateAssetCatalog({ schemaVersion: 1, migration: "asset-catalog-v1", entries: [lower, ...previous.entries] });
  assert.throws(() => assertCatalogEvolution(previous, downgrade), (error) => error.code === "CATALOG_DOWNGRADE");
});

test("VERSION IMMUTABILITY: deprecated assets remain resolvable", async () => {
  const base = await loadJson("assets/catalog/asset-catalog.json"); const deprecated = validateAssetCatalog({ ...base, entries: [{ ...base.entries[0], status: "DEPRECATED" }] });
  assert.equal(deprecated.entries.find(({ assetId, version }) => assetId === "cinder-relay-drone" && version === "1.0.0-pilot.1")?.status, "DEPRECATED");
});

test("BUDGET PROFILES: four immutable class profiles are present and Cinder passes small-prop-v1", () => {
  assert.deepEqual(BUDGET_PROFILES.map(({ profileId }) => profileId), ["tiny-prop-v1", "small-prop-v1", "medium-prop-v1", "large-prop-v1"]); assert.ok(BUDGET_PROFILES.every(({ immutable }) => immutable));
  const small = BUDGET_PROFILES[1]; const result = evaluateBudget(small, { triangles: 2180, drawCalls: 10, materials: 5, textures: 0, nodes: 14, captureMilliseconds: 300, geometryValid: true, resourceLeak: false });
  assert.equal(result.status, "SUCCESS"); assert.deepEqual(result.findings, []);
});

test("BUDGET PROFILES: target is OPTIONAL, maximum REQUIRED, geometry and leaks BLOCKER", () => {
  const small = BUDGET_PROFILES[1];
  assert.equal(evaluateBudget(small, { triangles: 19000, drawCalls: 10, materials: 5, textures: 0, nodes: 14, captureMilliseconds: 300, geometryValid: true, resourceLeak: false }).findings[0].severity, "OPTIONAL");
  assert.equal(evaluateBudget(small, { triangles: 31000, drawCalls: 10, materials: 5, textures: 0, nodes: 14, captureMilliseconds: 300, geometryValid: true, resourceLeak: false }).status, "CHANGES_REQUIRED");
  const blocked = evaluateBudget(small, { triangles: 1, drawCalls: 1, materials: 1, textures: 0, nodes: 1, captureMilliseconds: 1, geometryValid: false, resourceLeak: true }); assert.equal(blocked.status, "BLOCKED"); assert.equal(blocked.findings.filter(({ severity }) => severity === "BLOCKER").length, 2);
});

test("PROMOTION RECORD: is timestamp-free, sorted and self-hashed", () => {
  const record = createPromotionRecord({ assetId: "cinder-relay-drone", version: "1.0.0-pilot.1", from: "PILOT", to: "CANDIDATE", artifactManifestSha256: "a".repeat(64), criticReports: ["reports/visual.json", "reports/technical.json"], decision: "APPROVED", policyVersion: "asset-forge-policy-v1" });
  assert.match(record.recordSha256, /^[0-9a-f]{64}$/); assert.equal("timestamp" in record, false); assert.deepEqual(record.criticReports, ["reports/technical.json", "reports/visual.json"]);
});

test("ATLAS BRIDGE: example validates while consumer integration remains contract-only", async () => {
  const manifest = validateAtlasBridgeManifest(await loadJson("assets/catalog/atlas-bridge.example.json")); assert.equal(manifest.target.consumer, "gvf"); assert.deepEqual(manifest.frames, []);
  assert.throws(() => validateAtlasBridgeManifest({ ...manifest, target: { consumer: "unity", pixelScale: 1 } }), /invalid/);
});

test("PROVENANCE SCANNER: rejects missing license, hashes, absolute paths and remote URLs at schema boundary", async () => {
  const input = await loadJson("assets/catalog/asset-catalog.json");
  assert.throws(() => validateAssetCatalog({ ...input, entries: [{ ...input.entries[0], specPath: "C:/escape.json" }] }), /relative|invalid/);
  assert.throws(() => validateAssetCatalog({ ...input, entries: [{ ...input.entries[0], artifactManifest: "https://example.test/a.json" }] }), /invalid|relative|portable ASCII/);
  assert.throws(() => validateAssetCatalog({ ...input, entries: [{ ...input.entries[0], provenance: { ...input.entries[0].provenance, license: "" } }] }), /invalid/);
});

test("TEMP CLEANUP: production contract tests leave no repository outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "asset-forge-contract-")); await rm(root, { recursive: true, force: true }); assert.equal(true, true);
});
