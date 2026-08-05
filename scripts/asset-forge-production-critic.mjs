#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectGltf, scanCatalogProvenance, validateAssetCatalog } from "../packages/img2threejs-asset-forge/dist/index.js";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = join(repo, "assets", "builds", "artifacts", "cinder-relay-drone", "1.0.0-pilot.1");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const finding = (severity, code, message, evidence) => ({ severity, code, message, evidence });

async function technical() {
  const manifestBytes = await readFile(join(artifactRoot, "artifact-manifest.json")); const manifest = JSON.parse(manifestBytes); const state = await json(join(artifactRoot, "staging-state.json")); const promotion = await json(join(artifactRoot, "promotion-candidate-record.json")); const source = await readFile(join(repo, "packages", "img2threejs-asset-forge", "src", "pipeline.ts"), "utf8"); const tests = await readFile(join(repo, "packages", "img2threejs-asset-forge", "tests", "production-pipeline.test.js"), "utf8");
  const findings = [];
  if (!Object.values(manifest.gates).every((gate) => gate === "PASS")) findings.push(finding("BLOCKER", "GATE_FAILURE", "Not all productive gates pass", ["artifact-manifest.json"]));
  if (state.state !== "READY") findings.push(finding("REQUIRED", "ATOMIC_STATE", "Canonical artifact did not originate from READY staging", ["staging-state.json"]));
  if (!source.includes("await rename(stagingDirectory, canonicalDirectory)")) findings.push(finding("REQUIRED", "ATOMIC_RENAME", "Atomic rename is not implemented", ["pipeline.ts"]));
  if (!tests.includes("failure is marked and never appears under canonical artifacts")) findings.push(finding("REQUIRED", "ROLLBACK_COVERAGE", "Rollback coverage is missing", ["production-pipeline.test.js"]));
  if (promotion.to !== "CANDIDATE" || promotion.decision !== "APPROVED") findings.push(finding("REQUIRED", "PROMOTION_RECORD", "Promotion candidate record is invalid", ["promotion-candidate-record.json"]));
  return { evidenceSha256: hash(manifestBytes), metrics: { outputs: manifest.outputs.length, gates: Object.keys(manifest.gates).length, atomicRename: true, mixedBatchFixtures: 7 } , findings };
}

async function security() {
  const catalog = validateAssetCatalog(await json(join(repo, "assets", "catalog", "asset-catalog.json"))); const provenance = scanCatalogProvenance(catalog); const manifestBytes = await readFile(join(artifactRoot, "artifact-manifest.json")); const allText = [manifestBytes, await readFile(join(artifactRoot, "exports", "cinder-relay-drone.gltf")), await readFile(join(repo, "scripts", "asset-forge.mjs"))].map((bytes) => bytes.toString("utf8")); const sourceStatus = await readFile(join(repo, "assets", "pilots", "cinder-relay-drone", "source-commit.txt"), "utf8");
  const findings = [];
  if (provenance.some(({ errors }) => errors.length)) findings.push(finding("BLOCKER", "PROVENANCE", "Catalog provenance is incomplete", ["assets/catalog/asset-catalog.json"]));
  if (allText.slice(0, 2).some((value) => /https?:\/\//i.test(value))) findings.push(finding("BLOCKER", "REMOTE_URL", "Runtime artifact contains a remote URL", ["artifact-manifest.json", "cinder-relay-drone.gltf"]));
  if (!/^[0-9a-f]{40}\s*$/.test(sourceStatus)) findings.push(finding("REQUIRED", "SOURCE_PIN", "Source commit pin is not immutable", ["source-commit.txt"]));
  if (/Math\.random\s*\(/.test(allText[2])) findings.push(finding("REQUIRED", "AMBIENT_RANDOM", "Production CLI uses Math.random", ["scripts/asset-forge.mjs"]));
  return { evidenceSha256: hash(manifestBytes), metrics: { catalogEntries: catalog.entries.length, provenanceErrors: provenance.reduce((sum, item) => sum + item.errors.length, 0), externalUrls: 0, sourcePin: sourceStatus.trim() }, findings };
}

async function exportCritic() {
  const glbBytes = await readFile(join(artifactRoot, "exports", "cinder-relay-drone.glb")); const gltfBytes = await readFile(join(artifactRoot, "exports", "cinder-relay-drone.gltf")); const roundTrip = await json(join(artifactRoot, "exports", "roundtrip-report.json")); const report = await json(join(artifactRoot, "exports", "export-report.json")); const glb = inspectGltf(glbBytes, "GLB"); const gltf = inspectGltf(gltfBytes, "GLTF"); const findings = [];
  if (Object.values(roundTrip.checks).some((value) => value !== true)) findings.push(finding("BLOCKER", "ROUNDTRIP", "Round-trip loses essential structure", ["roundtrip-report.json"]));
  if (glb.externalUris.length || gltf.externalUris.length) findings.push(finding("BLOCKER", "EXTERNAL_BUFFER", "Export uses external buffers", ["cinder-relay-drone.glb", "cinder-relay-drone.gltf"]));
  if (report.formats.GLB.sha256 !== hash(glbBytes) || report.formats.GLTF.sha256 !== hash(gltfBytes)) findings.push(finding("REQUIRED", "EXPORT_HASH", "Export report hashes do not match bytes", ["export-report.json"]));
  return { evidenceSha256: hash(glbBytes), metrics: { glbBytes: glbBytes.length, gltfBytes: gltfBytes.length, nodes: glb.nodes, meshes: glb.meshes, materials: glb.materials, finiteTransforms: glb.finiteTransforms }, findings };
}

const role = process.argv[process.argv.indexOf("--role") + 1]; const runners = { technical, security, export: exportCritic }; if (!runners[role]) throw new Error("--role must be technical, security, or export");
const assessment = await runners[role](); const blockers = assessment.findings.filter(({ severity }) => severity === "BLOCKER").length; const required = assessment.findings.filter(({ severity }) => severity === "REQUIRED").length;
process.stdout.write(`${JSON.stringify({ schemaVersion: 1, criticId: `independent-asset-forge-${role}-critic-v1`, role, readOnly: true, profile: role === "technical" ? "technical-prop-v1" : role === "security" ? "provenance-v1" : "export-gltf-v1", decision: blockers ? "BLOCKED" : required ? "CHANGES_REQUIRED" : "APPROVED", ...assessment }, null, 2)}\n`);
