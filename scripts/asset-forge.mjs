#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../packages/browser-dev-mcp/node_modules/three/build/three.module.js";
import { GLTFExporter } from "../packages/browser-dev-mcp/node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "../packages/browser-dev-mcp/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import {
  ASSET_FORGE_CAPABILITY, BUDGET_PROFILES, AssetForgeError, canonicalAssetJson, canonicalJson,
  createCinderRelayDrone, createPromotionRecord, evaluateBudget, inspectGltf, resolveInsideRoot,
  runAtomicBuild, runBuildBatch, scanCatalogProvenance, validateAssetCatalog, validateAtlasBridgeManifest,
  validateCinderRelayDroneSpec,
} from "../packages/img2threejs-asset-forge/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url)); const repo = resolve(here, "..");
const catalogPath = join(repo, "assets", "catalog", "asset-catalog.json"); const buildsRoot = join(repo, "assets", "builds");
const specPath = join(repo, "assets", "pilots", "cinder-relay-drone", "cinder-relay-drone.spec.json");
const factorySourcePath = join(repo, "packages", "img2threejs-asset-forge", "src", "cinder-relay-drone.ts");
const pilotScript = join(repo, "scripts", "cinder-relay-drone-pilot.mjs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stableBytes = (value) => Buffer.from(`${canonicalJson(value)}\n`, "utf8");
const writeStable = async (path, value) => { await mkdir(dirname(path), { recursive: true }); const bytes = stableBytes(value); await writeFile(path, bytes); return bytes; };
const safeRepoRelative = (path) => { const value = relative(repo, path).split(sep).join("/"); if (!value || value === ".." || value.startsWith("../")) throw new AssetForgeError("PATH_POLICY", "path escapes repository"); return value; };

class NodeFileReader {
  result = null; onloadend = null; onerror = null;
  async readAsArrayBuffer(blob) { try { this.result = await blob.arrayBuffer(); this.onloadend?.(); } catch (error) { this.onerror?.(error); } }
  async readAsDataURL(blob) { try { const bytes = Buffer.from(await blob.arrayBuffer()); this.result = `data:${blob.type};base64,${bytes.toString("base64")}`; this.onloadend?.(); } catch (error) { this.onerror?.(error); } }
}
globalThis.FileReader = NodeFileReader;

async function loadCatalog() { return validateAssetCatalog(JSON.parse(await readFile(catalogPath, "utf8"))); }
function entryFor(catalog, assetId, version) { const entry = catalog.entries.find((candidate) => candidate.assetId === assetId && candidate.version === version); if (!entry) throw new AssetForgeError("ASSET_NOT_FOUND", `${assetId}@${version} is not in the catalog`); return entry; }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) throw new AssetForgeError("EXPORT_FAILED", "non-finite glTF number"); return JSON.stringify(value); }

async function runProcess(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: repo, env: { ...process.env, HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", NO_PROXY: "*" }, windowsHide: true, ...options }); let stdout = ""; let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; }); child.stderr?.on("data", (chunk) => { stderr += chunk; }); child.once("error", reject); child.once("close", (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new AssetForgeError("BUILD_FAILED", `${command} exited ${code}: ${stderr || stdout}`)));
  });
}

function canonicalDescription(asset, version) {
  const nodes = []; asset.root.traverse((node) => nodes.push({ name: node.name, parent: node.parent && node.parent !== asset.root ? node.parent.name : node === asset.root ? null : asset.root.name, position: [node.position.x, node.position.y, node.position.z], rotation: [node.rotation.x, node.rotation.y, node.rotation.z], scale: [node.scale.x, node.scale.y, node.scale.z], mesh: Boolean(node.geometry) }));
  return { schemaVersion: 1, assetId: "cinder-relay-drone", version, nodes, geometries: asset.geometryStatistics.geometries, materials: [...asset.materialStatistics.names], triangles: asset.geometryStatistics.triangles, bounds: asset.boundingBox };
}

async function exportCinder(stagingDirectory, version) {
  const started = performance.now(); const spec = JSON.parse(await readFile(specPath, "utf8")); validateCinderRelayDroneSpec(spec); const asset = await createCinderRelayDrone(spec, { three: THREE, factoryVersion: "1.0.0" });
  try {
    const exportsDirectory = join(stagingDirectory, "exports"); await mkdir(exportsDirectory, { recursive: true });
    const exporter = new GLTFExporter(); const rawGltf = await exporter.parseAsync(asset.root, { binary: false, trs: true, onlyVisible: true }); const gltfBytes = Buffer.from(`${stableStringify(rawGltf)}\n`, "utf8");
    const glbBytes = Buffer.from(await exporter.parseAsync(asset.root, { binary: true, trs: true, onlyVisible: true })); const canonicalBytes = Buffer.from(canonicalAssetJson(canonicalDescription(asset, version)));
    const gltfInspection = inspectGltf(gltfBytes, "GLTF"); const glbInspection = inspectGltf(glbBytes, "GLB");
    const imported = await new GLTFLoader().parseAsync(glbBytes.buffer.slice(glbBytes.byteOffset, glbBytes.byteOffset + glbBytes.byteLength), ""); let nodes = 0; let meshes = 0; let triangles = 0; const materials = new Set(); const names = [];
    imported.scene.traverse((node) => { nodes += 1; if (node !== imported.scene) names.push(node.name); if (node.isMesh) { meshes += 1; const geometry = node.geometry; triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3; for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material.name); } });
    const importedBounds = new THREE.Box3().setFromObject(imported.scene); const roundTrip = Object.freeze({ schemaVersion: 1, status: "PASS", source: { nodes: canonicalDescription(asset, version).nodes.length, meshes: asset.geometryStatistics.drawCalls, triangles: asset.geometryStatistics.triangles, materials: asset.materialStatistics.materials, bounds: asset.boundingBox, names: canonicalDescription(asset, version).nodes.map(({ name }) => name).sort() }, imported: { nodes, meshes, triangles, materials: materials.size, bounds: { min: importedBounds.min.toArray(), max: importedBounds.max.toArray() }, names: names.sort() }, checks: { hierarchyPresent: nodes === canonicalDescription(asset, version).nodes.length + 1, meshCount: meshes === asset.geometryStatistics.drawCalls, materials: materials.size === asset.materialStatistics.materials, triangles: triangles === 2504, bounds: importedBounds.min.distanceTo(new THREE.Vector3(...asset.boundingBox.min)) < 1e-5 && importedBounds.max.distanceTo(new THREE.Vector3(...asset.boundingBox.max)) < 1e-5, finiteTransforms: glbInspection.finiteTransforms, localBuffers: glbInspection.externalUris.length === 0 } });
    if (Object.values(roundTrip.checks).some((value) => value !== true)) throw new AssetForgeError("ROUNDTRIP_FAILED", `round-trip mismatch: ${JSON.stringify(roundTrip.checks)}`);
    await writeFile(join(exportsDirectory, "cinder-relay-drone.gltf"), gltfBytes); await writeFile(join(exportsDirectory, "cinder-relay-drone.glb"), glbBytes); await writeFile(join(exportsDirectory, "cinder-relay-drone.canonical.json"), canonicalBytes);
    const roundTripBytes = await writeStable(join(exportsDirectory, "roundtrip-report.json"), roundTrip); const report = { schemaVersion: 1, assetId: "cinder-relay-drone", version, formats: { CANONICAL_JSON: { path: "exports/cinder-relay-drone.canonical.json", sha256: hash(canonicalBytes), bytes: canonicalBytes.length }, GLTF: { path: "exports/cinder-relay-drone.gltf", sha256: hash(gltfBytes), bytes: gltfBytes.length, inspection: gltfInspection }, GLB: { path: "exports/cinder-relay-drone.glb", sha256: hash(glbBytes), bytes: glbBytes.length, inspection: glbInspection } }, roundTrip: { path: "exports/roundtrip-report.json", sha256: hash(roundTripBytes) }, provenance: { source: "packages/img2threejs-asset-forge/src/cinder-relay-drone.ts", license: "MIT", externalUrls: [] } };
    const reportBytes = await writeStable(join(exportsDirectory, "export-report.json"), report); return { report, reportBytes, elapsedMs: performance.now() - started, bytes: gltfBytes.length + glbBytes.length + canonicalBytes.length + roundTripBytes.length + reportBytes.length };
  } finally { asset.dispose(); }
}

async function collectDeterministicOutputs(stagingDirectory, paths) {
  const outputs = []; for (const path of [...paths].sort()) { const bytes = await readFile(join(stagingDirectory, ...path.split("/"))); outputs.push({ path, sha256: hash(bytes), bytes: bytes.length }); } return outputs;
}

function cinderAdapter(entry) {
  return { id: "cinder-production-adapter-v1", async build(request, stagingDirectory) {
    const pipelineStarted = performance.now(); const relativeStaging = safeRepoRelative(stagingDirectory); await runProcess(process.execPath, [pilotScript, "--output-root", relativeStaging]);
    const pilotManifestBytes = await readFile(join(stagingDirectory, "artifact-manifest.json")); await writeFile(join(stagingDirectory, "pilot-artifact-manifest.json"), pilotManifestBytes);
    const resolution = JSON.parse(await readFile(join(stagingDirectory, "final-resolution.json"), "utf8")); const geometry = JSON.parse(await readFile(join(stagingDirectory, "geometry-report.json"), "utf8")); const resources = JSON.parse(await readFile(join(stagingDirectory, "resource-ownership-report.json"), "utf8")); const performanceReport = JSON.parse(await readFile(join(stagingDirectory, "performance-report.json"), "utf8"));
    const budget = BUDGET_PROFILES.find(({ profileId }) => profileId === entry.budgetProfile); if (!budget) throw new AssetForgeError("BUDGET_PROFILE_MISSING", entry.budgetProfile);
    const budgetResult = evaluateBudget(budget, { triangles: geometry.triangles, drawCalls: geometry.drawCalls, materials: geometry.materials ?? 5, textures: 0, nodes: geometry.objectCount, captureMilliseconds: Math.max(performanceReport.runA.maxCapture1024Ms, performanceReport.runB.maxCapture1024Ms), geometryValid: geometry.validation.status === "PASS", resourceLeak: resources.lifecycle.ownedRemaining !== 0 || resources.lifecycle.disposeErrors !== 0 });
    const exportResult = await exportCinder(stagingDirectory, request.version); const catalog = await loadCatalog(); const provenance = scanCatalogProvenance(catalog).find(({ assetId, version }) => assetId === request.assetId && version === request.version); if (!provenance || provenance.errors.length) throw new AssetForgeError("PROVENANCE_FAILED", provenance?.errors.join(",") ?? "missing catalog entry");
    const gates = { TECHNICAL_GATE: resolution.technicalResolution.status === "APPROVED" && budgetResult.status === "SUCCESS" ? "PASS" : "FAIL", VISUAL_GATE: resolution.visualResolution.status === "APPROVED" ? "PASS" : "FAIL", PROVENANCE_GATE: "PASS", EXPORT_GATE: exportResult.report.formats.GLB.inspection.externalUris.length === 0 ? "PASS" : "FAIL", LIFECYCLE_GATE: entry.status === "PILOT" ? "PASS" : "FAIL" };
    const deterministicPaths = ["captures/run-a/manifest.json", "captures/run-b/manifest.json", "geometry-report.json", "material-report.json", "resource-ownership-report.json", "device-loss-report.json", "critic-input-bundle.json", "visual-critic-input.json", "technical-critic.json", "visual-critic.json", "final-resolution.json", "pilot-artifact-manifest.json", "exports/cinder-relay-drone.gltf", "exports/cinder-relay-drone.glb", "exports/cinder-relay-drone.canonical.json", "exports/roundtrip-report.json", "exports/export-report.json"];
    const outputs = await collectDeterministicOutputs(stagingDirectory, deterministicPaths); const content = { schemaVersion: 1, assetId: request.assetId, version: request.version, pipelineVersion: "asset-forge-production-v1", specSha256: hash(await readFile(specPath)), generatedModuleSha256: hash(await readFile(factorySourcePath)), budgetProfile: entry.budgetProfile, criticProfiles: [...entry.criticProfiles], rendererTargets: [...entry.rendererTargets], gates, outputs };
    const contentBytes = await writeStable(join(stagingDirectory, "content-manifest.json"), content); const promotion = createPromotionRecord({ assetId: request.assetId, version: request.version, from: "PILOT", to: "CANDIDATE", artifactManifestSha256: hash(contentBytes), criticReports: ["technical-critic.json", "visual-critic.json", "exports/export-report.json"], decision: Object.values(gates).every((gate) => gate === "PASS") ? "APPROVED" : "REJECTED", policyVersion: "asset-forge-policy-v1" }); await writeStable(join(stagingDirectory, "promotion-candidate-record.json"), promotion);
    const manifest = { ...content, contentManifestSha256: hash(contentBytes), promotionCandidateRecordSha256: hash(await readFile(join(stagingDirectory, "promotion-candidate-record.json"))) };
    await writeStable(join(stagingDirectory, "production-performance.json"), { schemaVersion: 1, operationalOnly: true, buildMilliseconds: performanceReport.runA.factoryMs, captureMilliseconds: performanceReport.runA.captureMs, exportMilliseconds: exportResult.elapsedMs, criticMilliseconds: 0, totalPipelineMilliseconds: performance.now() - pipelineStarted, stagingBytes: outputs.reduce((sum, output) => sum + output.bytes, 0), finalArtifactBytes: outputs.reduce((sum, output) => sum + output.bytes, 0), peakMemoryEstimateBytes: performanceReport.estimatedPeakMemoryBytes, disposeMilliseconds: performanceReport.cleanup.maxMs });
    const failedGates = Object.entries(gates).filter(([, status]) => status !== "PASS").map(([id]) => id); const blockers = [...resolution.openBlockers, ...failedGates]; const required = [...resolution.openRequired, ...budgetResult.findings.filter(({ severity }) => severity === "REQUIRED").map(({ code }) => code)];
    return { status: blockers.length ? "BLOCKED" : required.length ? "CHANGES_REQUIRED" : "SUCCESS", artifactManifest: manifest, openBlockers: blockers, openRequired: required, outputBytes: outputs.reduce((sum, output) => sum + output.bytes, 0) };
  } };
}

const fixtureAdapter = (id, mode) => ({ id: `fixture-${id}`, async build(request) { if (mode === "throw") throw new AssetForgeError(id, id); const blocked = mode === "blocked"; const required = mode === "required"; return { status: blocked ? "BLOCKED" : required ? "CHANGES_REQUIRED" : "SUCCESS", artifactManifest: { schemaVersion: 1, assetId: request.assetId, fixture: id }, openBlockers: blocked ? [id] : [], openRequired: required ? [id] : [], outputBytes: 0 }; } });

async function commandBuild(assetId, version, buildId) { const catalog = await loadCatalog(); const entry = entryFor(catalog, assetId, version); return runAtomicBuild(buildsRoot, { assetId, version, buildId, resume: false }, cinderAdapter(entry)); }
async function commandBatch(mode, batchId) {
  if (mode === "fixtures") {
    const root = join(buildsRoot, "fixture-runs"); await rm(root, { recursive: true, force: true }); const assets = [["valid-asset", "SUCCESS", "ok"], ["invalid-spec", "SPEC_INVALID", "throw"], ["budget-exceeded", "BUDGET_MAX", "required"], ["factory-missing", "FACTORY_MISSING", "throw"], ["capture-failed", "CAPTURE_FAILED", "throw"], ["critic-required", "CRITIC_REQUIRED", "required"], ["dispose-failed", "DISPOSE_FAILED", "blocked"]].map(([assetId, id, fixtureMode]) => ({ assetId, version: "1.0.0", adapter: fixtureAdapter(id, fixtureMode) }));
    const result = await runBuildBatch(root, { batchId, concurrency: 2, resume: false, assets }); await rm(root, { recursive: true, force: true }); return result;
  }
  const catalog = await loadCatalog(); const assets = catalog.entries.map((entry) => ({ assetId: entry.assetId, version: entry.version, adapter: cinderAdapter(entry) })); return runBuildBatch(buildsRoot, { batchId, concurrency: 1, resume: false, assets });
}

function option(args, name, fallback) { const index = args.indexOf(name); if (index < 0) return fallback; const value = args[index + 1]; if (!value || value.startsWith("--")) throw new AssetForgeError("INVALID_INPUT", `${name} requires a value`); return value; }
async function main() {
  const [command, subject, ...args] = process.argv.slice(2); let result;
  if (command === "validate-catalog") { const catalog = await loadCatalog(); const atlas = validateAtlasBridgeManifest(JSON.parse(await readFile(join(repo, "assets", "catalog", "atlas-bridge.example.json"), "utf8"))); result = { status: "SUCCESS", entries: catalog.entries.length, provenance: scanCatalogProvenance(catalog), atlasBridge: atlas.schemaVersion, capability: ASSET_FORGE_CAPABILITY.id }; }
  else if (command === "validate-spec") { const value = JSON.parse(await readFile(specPath, "utf8")); validateCinderRelayDroneSpec(value); result = { status: "SUCCESS", assetId: value.assetId, specSha256: hash(await readFile(specPath)) }; }
  else if (command === "build") { if (!subject) throw new AssetForgeError("INVALID_INPUT", "build requires assetId"); result = await commandBuild(subject, option(args, "--version", "1.0.0-pilot.1"), option(args, "--build-id", "manual-build")); }
  else if (command === "build-batch") result = await commandBatch(subject === "fixtures" ? "fixtures" : "catalog", option(args, "--batch-id", subject === "fixtures" ? "fixture-batch" : "catalog-batch"));
  else if (command === "inspect") { if (!subject) throw new AssetForgeError("INVALID_INPUT", "inspect requires assetId"); const version = option(args, "--version", "1.0.0-pilot.1"); const path = resolveInsideRoot(buildsRoot, `artifacts/${subject}/${version}/artifact-manifest.json`); result = { status: "SUCCESS", artifactManifest: JSON.parse(await readFile(path, "utf8")), path: safeRepoRelative(path) }; }
  else if (command === "clean-staging") { const staging = join(buildsRoot, "staging"); if (existsSync(staging)) await rm(staging, { recursive: true, force: true }); result = { status: "SUCCESS", removed: "assets/builds/staging" }; }
  else throw new AssetForgeError("INVALID_INPUT", "usage: asset-forge validate-catalog|validate-spec|build <assetId> --version <version>|build-batch [catalog|fixtures]|inspect <assetId>");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.status === "BLOCKED" || result.status === "CHANGES_REQUIRED") process.exitCode = 2;
}

await main().catch((error) => { process.stderr.write(`${JSON.stringify({ status: "BLOCKED", code: error instanceof AssetForgeError ? error.code : "INTERNAL_FAILURE", message: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 1; });
