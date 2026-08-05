import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../img2threejs-asset-forge/dist/index.js";
import { createBridgeTestBeacon } from "../dist/index.js";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const here = fileURLToPath(new URL(".", import.meta.url));
export const FIXTURE_PROJECT = join(here, "../../../fixtures/gamemaker/asset-bridge-pilot");

export const SPEC_V1 = Object.freeze({
  schemaVersion: 1, assetId: "bridge-test-beacon", version: "1.0.0", width: 64, height: 64,
  frameCount: 2, palette: "v1-cyan", origin: Object.freeze({ x: 32, y: 32 }),
  collisionPolicy: "bbox-auto", compressionPolicy: "stored-deflate", budgetProfile: "bridge-sprite-v1",
});
export const SPEC_V2 = Object.freeze({
  ...SPEC_V1, version: "2.0.0", palette: "v2-magenta",
});

export function buildAssetArtifacts(root, spec, status = "APPROVED") {
  const version = spec.version;
  const artifactDir = join(root, "assets/builds/artifacts/bridge-test-beacon", version);
  const exportsDir = join(artifactDir, "exports");
  mkdirSync(exportsDir, { recursive: true });
  const specPath = join(root, "assets/pilots/bridge-test-beacon", `${version}.spec.json`);
  mkdirSync(join(root, "assets/pilots/bridge-test-beacon"), { recursive: true });
  writeFileSync(specPath, `${canonicalJson(spec)}\n`);
  const asset = createBridgeTestBeacon(spec);
  const outputs = asset.pngBytes.map((png, index) => {
    const path = `assets/builds/artifacts/bridge-test-beacon/${version}/exports/bridge-test-beacon-${version}_${index}.png`;
    writeFileSync(join(exportsDir, `bridge-test-beacon-${version}_${index}.png`), png);
    return Object.freeze({ path, sha256: sha256(png), bytes: png.byteLength, width: spec.width, height: spec.height, channels: 4 });
  });
  const artifact = Object.freeze({
    schemaVersion: 1, assetId: "bridge-test-beacon", version,
    specPath: `assets/pilots/bridge-test-beacon/${version}.spec.json`,
    specSha256: sha256(readFileSync(specPath)),
    generatedModuleSha256: "0".repeat(64),
    budgetProfile: "bridge-sprite-v1",
    gates: Object.freeze({ SPEC_GATE: "PASS", BUDGET_GATE: "PASS", PNG_GATE: "PASS", DETERMINISM_GATE: "PASS", LIFECYCLE_GATE: "PASS" }),
    outputs: Object.freeze(outputs),
  });
  writeFileSync(join(artifactDir, "artifact-manifest.json"), `${canonicalJson(artifact)}\n`);
  const exportPaths = outputs.map(({ path }) => `assets/builds/artifacts/bridge-test-beacon/${version}/${path}`);
  const entry = Object.freeze({
    assetId: "bridge-test-beacon", version, status, assetClass: "bridge-sprite",
    specPath: `assets/pilots/bridge-test-beacon/${version}.spec.json`,
    factoryCapability: "asset-forge",
    artifactManifest: `assets/builds/artifacts/bridge-test-beacon/${version}/artifact-manifest.json`,
    budgetProfile: "bridge-sprite-v1",
    criticProfiles: Object.freeze([]),
    rendererTargets: Object.freeze(["webgl"]),
    exports: Object.freeze(exportPaths),
    provenance: Object.freeze({
      manifest: `assets/builds/artifacts/bridge-test-beacon/${version}/artifact-manifest.json`,
      source: "packages/asset-gm-bridge/src/beacon.ts",
      sourceSha256: "0".repeat(64),
      license: "MIT",
      manifestSha256: sha256(readFileSync(join(artifactDir, "artifact-manifest.json"))),
    }),
  });
  return Object.freeze({ specPath, artifactDir, entry, asset });
}

export function writeCatalog(root, entries) {
  const catalog = Object.freeze({ schemaVersion: 1, migration: "asset-catalog-v1", entries: Object.freeze(entries) });
  mkdirSync(join(root, "assets/catalog"), { recursive: true });
  writeFileSync(join(root, "assets/catalog/asset-catalog.json"), `${canonicalJson(catalog)}\n`);
  return catalog;
}

/** Builds a complete temp workspace with catalog, artifacts and a GM project copy. */
export function makeWorkspace({ status = "APPROVED", version = "1.0.0", spec = SPEC_V1, extraEntries = [], extraVersions = [] } = {}) {
  const root = join(tmpdir(), `asset-bridge-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  const entries = [buildAssetArtifacts(root, spec, status).entry];
  for (const extra of extraVersions) entries.push(buildAssetArtifacts(root, extra.spec ?? SPEC_V1, extra.status ?? "APPROVED").entry);
  writeCatalog(root, [...extraEntries, ...entries].sort((a, b) => `${a.assetId}@${a.version}`.localeCompare(`${b.assetId}@${b.version}`)));
  const projectsDir = join(root, "projects");
  mkdirSync(projectsDir, { recursive: true });
  const projectRoot = "pilot-a";
  cpSync(FIXTURE_PROJECT, join(projectsDir, projectRoot), { recursive: true });
  return Object.freeze({
    root, projectsDir, projectRoot,
    catalogPath: join(root, "assets/catalog/asset-catalog.json"),
    bridge: null,
    assetEntry: entries[0],
  });
}

export const baseRequest = (workspace, overrides = {}) => Object.freeze({
  capability: "ASSET_GM_BRIDGE_V1",
  projectRoot: workspace.projectRoot,
  evidenceRoot: ".evidence",
  transactionId: "test-tx-0001",
  assetId: "bridge-test-beacon",
  assetVersion: "1.0.0",
  resourceName: "spr_bridge_test_beacon",
  expectedProjectFingerprint: null,
  expectedHead: null,
  timeoutMs: 60_000,
  verificationPolicy: Object.freeze({ projectLoad: false, compile: false, runtime: "forbidden" }),
  ...overrides,
});

export async function expectBridgeError(promise, code) {
  let error = null;
  try { await promise; } catch (caught) { error = caught; }
  if (!error || error.code !== code) {
    const actual = error ? `${error.code}: ${error.message}` : "no error thrown";
    throw new Error(`expected ${code} but got ${actual}`);
  }
  return error;
}
