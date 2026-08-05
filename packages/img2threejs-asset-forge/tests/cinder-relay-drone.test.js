import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../browser-dev-mcp/node_modules/three/build/three.module.js";
import {
  createArtifactManifest,
  createCinderRelayDrone,
  createReviewCoordinator,
  hashReviewInput,
  validateCinderRelayDroneSpec,
} from "../dist/index.js";

const specUrl = new URL("../../../assets/pilots/cinder-relay-drone/cinder-relay-drone.spec.json", import.meta.url);
const loadSpec = async () => JSON.parse(await readFile(specUrl, "utf8"));
const createAsset = async () => createCinderRelayDrone(await loadSpec(), { three: THREE, factoryVersion: "1.0.0" });

test("CINDER SPEC: canonical closed spec passes and unknown fields fail", async () => {
  const spec = await loadSpec(); assert.doesNotThrow(() => validateCinderRelayDroneSpec(spec));
  assert.throws(() => validateCinderRelayDroneSpec({ ...spec, timestamp: 1 }), /closed/);
  assert.throws(() => validateCinderRelayDroneSpec({ ...spec, seed: "other" }), /identity/);
});

test("CINDER FACTORY: deterministic hierarchy, transforms, anchors, and bounds", async () => {
  const first = await createAsset(); const second = await createAsset();
  const project = (asset) => ({ stats: asset.geometryStatistics, materials: asset.materialStatistics, bounds: asset.boundingBox, sphere: asset.boundingSphere, anchors: asset.anchorPoints, parts: asset.parts });
  assert.deepEqual(project(first), project(second)); assert.equal(first.root.name, "cinder-relay-drone"); assert.equal(first.parts.length, 11);
  first.dispose(); second.dispose();
});

test("CINDER GEOMETRY: strict validation and absolute budgets pass", async () => {
  const asset = await createAsset(); assert.equal(asset.validation.status, "PASS"); assert.deepEqual(asset.validation.errors, []);
  assert.ok(asset.geometryStatistics.triangles <= 30_000); assert.ok(asset.geometryStatistics.drawCalls <= 16); assert.ok(asset.geometryStatistics.objectCount <= 140);
  assert.ok(asset.materialStatistics.materials <= 8); assert.equal(asset.materialStatistics.textures, 0); asset.dispose();
});

test("CINDER CAPTURE: canonical metadata fixes seed, animation, and frame clock", async () => {
  const asset = await createAsset(); assert.deepEqual(asset.captureMetadata, { assetId: "cinder-relay-drone", seed: "devlab-cinder-relay-drone-v1", factoryVersion: "1.0.0", animation: "relay-pulse", durationSeconds: 2, logicalHz: 60 }); asset.dispose();
});

test("CINDER DETERMINISM: relay-pulse is frame-indexed and repeats at 120 frames", async () => {
  const asset = await createAsset(); const ember = asset.resources.find(({ resource }) => resource.name === "ember-core").resource;
  asset.applyRelayPulse(30); const at30 = ember.emissiveIntensity; asset.applyRelayPulse(150); assert.equal(ember.emissiveIntensity, at30);
  asset.applyRelayPulse(0); const at0 = ember.emissiveIntensity; asset.applyRelayPulse(120); assert.equal(ember.emissiveIntensity, at0);
  assert.throws(() => asset.applyRelayPulse(-1), /non-negative/); asset.dispose();
});

test("CINDER DISPOSE: 100 real Three.js create/dispose cycles leave zero owned and double-dispose", async () => {
  for (let cycle = 0; cycle < 100; cycle += 1) {
    const asset = await createAsset(); const first = asset.dispose(); const second = asset.dispose();
    assert.equal(first.errors.length, 0); assert.equal(first.disposed.geometry, 10); assert.equal(first.disposed.material, 5); assert.equal(second.alreadyDisposed, true); assert.equal(second.errors.length, 0);
  }
});

test("CINDER CRITIC: builder cannot approve and REQUIRED remains fail-closed", async () => {
  const coordinator = createReviewCoordinator("cinder-test", Buffer.alloc(32, 7));
  const artifact = coordinator.builder.createArtifact({ id: "cinder", relativePath: "assets/pilots/cinder-relay-drone/artifact-manifest.json", sha256: "a".repeat(64), inputsHash: "b".repeat(64) });
  assert.equal("resolve" in coordinator.builder, false);
  const report = coordinator.critic.createReport(artifact, "independent-test-critic", [{ severity: "REQUIRED", category: "TECHNICAL", code: "TEST_REQUIRED", message: "deliberate gate", evidence: ["test"] }]);
  assert.equal(coordinator.resolver.resolve(artifact, report).status, "CHANGES_REQUIRED");
});

test("CINDER MANIFEST: pilot inputs remain byte-canonical under output reordering", async () => {
  const common = { artifactId: "cinder-relay-drone", buildId: "pilot-v1", generator: { name: "devlab-cinder-relay-drone", version: "1.0.0", sourceCommit: "6c447e9448aee35fc5cb185e1f6f8a505ffb8903", threeVersion: "0.185.1" }, input: { specPath: "assets/pilots/cinder-relay-drone/cinder-relay-drone.spec.json", sha256: "c".repeat(64) }, capture: { target: "cinder-webgl", backend: "webgl", dimensions: { width: 1024, height: 1024 }, cameraParameters: { views: 10 }, options: { pixelRatio: 1 } }, determinism: { seed: "devlab-cinder-relay-drone-v1", fixed: true }, performance: { generationMs: 0, estimatedPeakMemoryBytes: 0, pngBytesRead: 0, decodedBytes: 0, geometries: 10, materials: 5, textures: 0, disposeMs: 0, captures: 28 }, provenance: { manifest: "assets/pilots/cinder-relay-drone/capture-manifest.json" } };
  const a = { path: "captures/a.png", type: "image/png", bytes: Uint8Array.of(1), producer: "pilot", license: "MIT", provenance: "original" };
  const b = { path: "geometry-report.json", type: "application/json", bytes: Uint8Array.of(2), producer: "pilot", license: "MIT", provenance: "original" };
  assert.equal(hashReviewInput(createArtifactManifest({ ...common, outputs: [a, b] })), hashReviewInput(createArtifactManifest({ ...common, outputs: [b, a] })));
});
