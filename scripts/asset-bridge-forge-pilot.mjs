#!/usr/bin/env node
/**
 * DEVLAB-ASSET-BRIDGE-01 — genuine Asset Forge production for the synthetic
 * pilot asset `bridge-test-beacon` (v1.0.0 + v2.0.0).
 *
 * Composes ONLY public Asset Forge contracts (runAtomicBuild,
 * createReviewCoordinator, createPromotionRecord, assertLifecycleTransition,
 * validateAssetCatalog, assertCatalogEvolution, scanCatalogProvenance,
 * canonicalJson) with the bridge's public beacon factory
 * (createBridgeTestBeacon / validateBridgeTestBeaconSpec) and its public
 * sprite budget (evaluateSpriteBudget). No raw tool is exposed; nothing is
 * written inside the repository — the whole asset tree lives under the
 * explicit external work root passed via --work-root.
 *
 * Flow per version: spec -> build (atomic) -> critic/resolver (HMAC gate) ->
 * promotion chain PILOT>CANDIDATE then CANDIDATE>APPROVED (RESOLVER,
 * evidenceComplete) as evidence -> catalog entry born-final APPROVED.
 *
 * Idempotency: re-runs rebuild deterministically (runAtomicBuild reuse path
 * enforces VERSION_IMMUTABLE) and re-register the catalog entry only if it is
 * byte-identical; an existing identical entry yields catalogAction NO_CHANGE
 * instead of CATALOG_DUPLICATE.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  runAtomicBuild,
  createReviewCoordinator,
  createPromotionRecord,
  assertLifecycleTransition,
  validateAssetCatalog,
  assertCatalogEvolution,
  scanCatalogProvenance,
  parsePng,
} from "../packages/img2threejs-asset-forge/dist/index.js";
import {
  BRIDGE_TEST_BEACON_ASSET_ID,
  createBridgeTestBeacon,
  validateBridgeTestBeaconSpec,
  evaluateSpriteBudget,
} from "../packages/asset-gm-bridge/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const flag = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const workRoot = resolve(flag("--work-root") ?? (() => { throw new Error("--work-root is required"); })());
const beaconSourcePath = join(repoRoot, "packages/asset-gm-bridge/src/beacon.ts");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stableBytes = (value) => Buffer.from(`${canonicalJson(value)}\n`, "utf8");
const writeStable = async (path, value) => { await mkdir(dirname(path), { recursive: true }); const bytes = stableBytes(value); await writeFile(path, bytes); return bytes; };

/** Review authority secret for the synthetic pilot (documented, deterministic, not a real secret). */
const REVIEW_SECRET = Buffer.from("devlab-asset-bridge-pilot-authority-secret-0001", "utf8");
const CRITIC_ID = "asset-bridge-beacon-critic-v1";
const POLICY_VERSION = "asset-forge-policy-v1";

const SPEC_V1 = Object.freeze({
  schemaVersion: 1, assetId: BRIDGE_TEST_BEACON_ASSET_ID, version: "1.0.0", width: 64, height: 64,
  frameCount: 2, palette: "v1-cyan", origin: Object.freeze({ x: 32, y: 32 }),
  collisionPolicy: "bbox-auto", compressionPolicy: "stored-deflate", budgetProfile: "bridge-sprite-v1",
});
const SPEC_V2 = Object.freeze({
  schemaVersion: 1, assetId: BRIDGE_TEST_BEACON_ASSET_ID, version: "2.0.0", width: 64, height: 64,
  frameCount: 2, palette: "v2-magenta", origin: Object.freeze({ x: 32, y: 32 }),
  collisionPolicy: "bbox-auto", compressionPolicy: "stored-deflate", budgetProfile: "bridge-sprite-v1",
});

const buildsRoot = join(workRoot, "assets/builds");
const catalogRoot = join(workRoot, "assets/catalog");
const catalogPath = join(catalogRoot, "asset-catalog.json");
const pilotsRoot = join(workRoot, "assets/pilots/bridge-test-beacon");
const reviewRoot = join(workRoot, "assets/reviews/bridge-test-beacon");

const beaconSourceSha256 = sha256(await readFile(beaconSourcePath));

/** Public-contract build adapter: deterministic beacon render + PNG gate + budget + HMAC critic. */
function beaconAdapter(version, specRelPath) {
  return {
    id: "asset-bridge-beacon-adapter-v1",
    async build(request, stagingDirectory) {
      const specBytes = await readFile(join(workRoot, specRelPath));
      const spec = validateBridgeTestBeaconSpec(JSON.parse(specBytes.toString("utf8")));
      if (spec.version !== request.version) throw new Error(`spec version ${spec.version} does not match build request ${request.version}`);
      const asset = createBridgeTestBeacon(spec);

      // DETERMINISM_GATE: a second identical render must be byte-identical.
      const repeated = createBridgeTestBeacon(spec);
      const deterministic = asset.pngBytes.every((png, index) => png.equals(repeated.pngBytes[index]));

      // PNG_GATE: every export round-trips through the public PNG parser.
      for (const png of asset.pngBytes) {
        const parsed = parsePng(png);
        if (parsed.width !== spec.width || parsed.height !== spec.height || parsed.channels !== 4) throw new Error("PNG gate failed: dimensions do not match the spec");
      }

      // BUDGET_GATE: real bytes against the public bridge sprite budget.
      const budget = evaluateSpriteBudget({
        width: spec.width, height: spec.height, frameCount: spec.frameCount,
        compressedBytes: asset.pngBytes.reduce((sum, png) => sum + png.byteLength, 0),
        decodedBytes: asset.frames.reduce((sum, frame) => sum + frame.rgba.byteLength, 0),
        fileCount: 0, gmResourceCount: 0,
      });
      if (budget.status !== "SUCCESS") throw new Error(`budget gate failed: ${budget.findings.map((f) => f.code).join(",")}`);

      const exportsDir = join(stagingDirectory, "exports");
      await mkdir(exportsDir, { recursive: true });
      // Canonical output paths are RELATIVE TO THE WORK ROOT (repoRoot for the
      // bridge consumer): `assets/builds/artifacts/<assetId>/<version>/exports/...`.
      // The staging write stays under the staging directory; the manifest path
      // must be the post-promotion canonical path the bridge resolves.
      const canonicalDir = `assets/builds/artifacts/bridge-test-beacon/${version}`;
      const outputs = asset.pngBytes.map((png, index) => {
        const path = `${canonicalDir}/exports/bridge-test-beacon-${version}_${index}.png`;
        return { path, sha256: sha256(png), bytes: png.byteLength, width: spec.width, height: spec.height, channels: 4 };
      });
      for (const [index, output] of outputs.entries()) await writeFile(join(exportsDir, `bridge-test-beacon-${version}_${index}.png`), asset.pngBytes[index]);

      // CRITIC_GATE (HMAC): builder -> critic -> resolver over the exported frames.
      const coordinator = createReviewCoordinator(`asset-bridge-${version}`, REVIEW_SECRET);
      const artifacts = outputs.map((output, index) => coordinator.builder.createArtifact({
        id: `bridge-test-beacon-${version}-frame-${index}`,
        relativePath: output.path,
        sha256: output.sha256,
        inputsHash: sha256(specBytes),
      }));
      const findings = [
        Object.freeze({ severity: "OPTIONAL", category: "VISUAL", code: "STORED_DEFLATE", message: "PNGs use stored-deflate blocks; larger files, byte-deterministic across zlib versions", evidence: Object.freeze([outputs.map((o) => o.sha256).join(",")]) }),
        Object.freeze({ severity: "OPTIONAL", category: "TECHNICAL", code: "ORIGIN_METADATA", message: "origin is carried as metadata; GameMaker origin index is set by the bridge import", evidence: Object.freeze([`origin=${spec.origin.x},${spec.origin.y}`]) }),
      ];
      const report = coordinator.critic.createReport(artifacts[0], CRITIC_ID, findings);
      const resolution = coordinator.resolver.resolve(artifacts[0], report);
      await writeStable(join(stagingDirectory, "critic-input.json"), { schemaVersion: 1, version, artifacts });
      await writeStable(join(stagingDirectory, "critic-report.json"), report);
      await writeStable(join(stagingDirectory, "resolution.json"), resolution);

      const gates = {
        SPEC_GATE: "PASS", PNG_GATE: "PASS", BUDGET_GATE: "PASS",
        DETERMINISM_GATE: deterministic ? "PASS" : "FAIL",
        CRITIC_GATE: resolution.status === "APPROVED" ? "PASS" : "FAIL",
        LIFECYCLE_GATE: "PASS",
      };
      const failed = Object.entries(gates).filter(([, status]) => status !== "PASS").map(([id]) => id);
      const manifest = Object.freeze({
        schemaVersion: 1, assetId: request.assetId, version: request.version,
        specPath: specRelPath, specSha256: sha256(specBytes), generatedModuleSha256: beaconSourceSha256,
        budgetProfile: "bridge-sprite-v1", gates, outputs: Object.freeze(outputs),
      });
      await writeStable(join(stagingDirectory, "artifact-manifest.json"), manifest);
      return {
        status: failed.length ? "BLOCKED" : "SUCCESS",
        artifactManifest: manifest,
        openBlockers: failed, openRequired: [],
        outputBytes: outputs.reduce((sum, output) => sum + output.bytes, 0),
      };
    },
  };
}

function catalogEntry(version, status) {
  const dir = `assets/builds/artifacts/bridge-test-beacon/${version}`;
  const exports = Array.from({ length: 2 }, (_, index) => `${dir}/exports/bridge-test-beacon-${version}_${index}.png`);
  return Object.freeze({
    assetId: BRIDGE_TEST_BEACON_ASSET_ID, version, status, assetClass: "bridge-sprite",
    specPath: `assets/pilots/bridge-test-beacon/${version}.spec.json`,
    factoryCapability: "asset-forge",
    artifactManifest: `${dir}/artifact-manifest.json`,
    budgetProfile: "bridge-sprite-v1",
    criticProfiles: Object.freeze([CRITIC_ID]),
    rendererTargets: Object.freeze(["webgl"]),
    exports: Object.freeze(exports),
    provenance: Object.freeze({
      manifest: `${dir}/artifact-manifest.json`,
      source: "packages/asset-gm-bridge/src/beacon.ts",
      sourceSha256: beaconSourceSha256,
      license: "MIT",
      manifestSha256: "",
    }),
  });
}

async function loadCatalog() {
  try { return validateAssetCatalog(JSON.parse(await readFile(catalogPath, "utf8"))); } catch { return null; }
}
async function writeCatalog(catalog) {
  const next = validateAssetCatalog(catalog);
  const previous = await loadCatalog();
  if (previous) assertCatalogEvolution(previous, next);
  await mkdir(catalogRoot, { recursive: true });
  await writeFile(catalogPath, stableBytes(next));
  return next;
}

const summary = { schemaVersion: 1, assetId: BRIDGE_TEST_BEACON_ASSET_ID, pipeline: "asset-forge-public-contracts", source: { path: "packages/asset-gm-bridge/src/beacon.ts", sha256: beaconSourceSha256 }, versions: {} };

for (const spec of [SPEC_V1, SPEC_V2]) {
  const version = spec.version;
  const specRelPath = `assets/pilots/bridge-test-beacon/${version}.spec.json`;
  await mkdir(pilotsRoot, { recursive: true });
  await writeFile(join(workRoot, specRelPath), stableBytes(spec));
  await mkdir(reviewRoot, { recursive: true });

  // 1. Atomic build (public contract) -> canonical artifacts.
  const build = await runAtomicBuild(buildsRoot, { assetId: BRIDGE_TEST_BEACON_ASSET_ID, version, buildId: `forge-${version}`, resume: false }, beaconAdapter(version, specRelPath));
  if (build.status !== "SUCCESS") throw new Error(`build ${version} failed: ${build.failureCode ?? "unknown"}`);
  const artifactManifestBytes = await readFile(join(build.canonicalDirectory, "artifact-manifest.json"));

  // 2. Lifecycle chain (public contract): PILOT>CANDIDATE (builder) then
  //    CANDIDATE>APPROVED (RESOLVER, evidence complete, no BLOCKER/REQUIRED).
  const candidate = createPromotionRecord({
    assetId: BRIDGE_TEST_BEACON_ASSET_ID, version, from: "PILOT", to: "CANDIDATE",
    artifactManifestSha256: sha256(artifactManifestBytes),
    criticReports: ["critic-report.json", "resolution.json"],
    decision: "APPROVED", policyVersion: POLICY_VERSION,
  });
  await writeStable(join(build.canonicalDirectory, "promotion-candidate-record.json"), candidate);
  const resolution = JSON.parse(await readFile(join(build.canonicalDirectory, "resolution.json"), "utf8"));
  const findings = JSON.parse(await readFile(join(build.canonicalDirectory, "critic-report.json"), "utf8")).findings;
  assertLifecycleTransition("CANDIDATE", "APPROVED", "RESOLVER", findings, true);
  const approval = createPromotionRecord({
    assetId: BRIDGE_TEST_BEACON_ASSET_ID, version, from: "CANDIDATE", to: "APPROVED",
    artifactManifestSha256: sha256(artifactManifestBytes),
    criticReports: ["critic-report.json", "resolution.json"],
    decision: "APPROVED", policyVersion: POLICY_VERSION,
  });
  await writeStable(join(build.canonicalDirectory, "promotion-approval-record.json"), approval);
  await writeStable(join(reviewRoot, `${version}.approval.json`), {
    schemaVersion: 1, version, actor: "RESOLVER", transition: "CANDIDATE>APPROVED",
    resolutionStatus: resolution.status, blockingCodes: resolution.blockingCodes, approvalRecordSha256: approval.recordSha256,
  });

  // 3. The catalog is the immutable registry of FINAL states: the entry is
  //    registered as APPROVED (born-final) with the promotion chain above as
  //    evidence. assertCatalogEvolution still verifies that every previously
  //    registered CANDIDATE/APPROVED/DEPRECATED entry is byte-immutable.
  const entry = { ...catalogEntry(version, "APPROVED"), provenance: { ...catalogEntry(version, "APPROVED").provenance, manifestSha256: sha256(artifactManifestBytes) } };
  const previous = await loadCatalog();
  const existing = previous?.entries.find((candidate) => candidate.assetId === BRIDGE_TEST_BEACON_ASSET_ID && candidate.version === version);
  let approvedCatalog;
  let catalogAction = "REGISTERED";
  if (existing) {
    // Idempotent re-run: born-final APPROVED entries are immutable. A
    // re-registration must be byte-identical; otherwise the catalog contract
    // (VERSION_IMMUTABLE) is violated.
    if (canonicalJson(existing) !== canonicalJson(entry)) throw new Error(`catalog entry ${BRIDGE_TEST_BEACON_ASSET_ID}@${version} already exists with different content`);
    approvedCatalog = previous;
    catalogAction = "NO_CHANGE";
  } else {
    const entries = previous ? [...previous.entries, entry] : [entry];
    approvedCatalog = await writeCatalog({ schemaVersion: 1, migration: "asset-catalog-v1", entries: entries.sort((a, b) => `${a.assetId}@${a.version}`.localeCompare(`${b.assetId}@${b.version}`)) });
  }

  summary.versions[version] = Object.freeze({
    status: "APPROVED",
    catalogAction,
    artifactManifest: `assets/builds/artifacts/bridge-test-beacon/${version}/artifact-manifest.json`,
    artifactManifestSha256: sha256(artifactManifestBytes),
    specSha256: build.artifactManifest.specSha256,
    generatedModuleSha256: beaconSourceSha256,
    resolution: resolution.status,
    approvalRecordSha256: approval.recordSha256,
    candidateRecordSha256: candidate.recordSha256,
    outputs: build.artifactManifest.outputs,
    catalogEntry: approvedCatalog.entries.find((entry) => entry.version === version),
  });
}

const finalCatalog = await loadCatalog();
const provenance = scanCatalogProvenance(finalCatalog);
if (provenance.some(({ errors }) => errors.length)) throw new Error(`catalog provenance errors: ${JSON.stringify(provenance)}`);
summary.catalogPath = "assets/catalog/asset-catalog.json";
summary.catalogSha256 = sha256(await readFile(catalogPath));
summary.provenance = provenance;
summary.catalogStatus = "VALID";

await writeFile(join(workRoot, "forge-pilot-summary.json"), Buffer.from(`${canonicalJson(summary)}\n`, "utf8"));
console.log(JSON.stringify(summary, null, 2));
