import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../browser-dev-mcp/node_modules/three/build/three.module.js";
import { GLTFExporter } from "../../browser-dev-mcp/node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "../../browser-dev-mcp/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { canonicalAssetJson, createCinderRelayDrone, createExportResult, inspectGltf } from "../dist/index.js";

class NodeFileReader {
  result = null; onloadend = null; onerror = null;
  async readAsArrayBuffer(blob) { try { this.result = await blob.arrayBuffer(); this.onloadend?.(); } catch (error) { this.onerror?.(error); } }
  async readAsDataURL(blob) { try { const bytes = Buffer.from(await blob.arrayBuffer()); this.result = `data:${blob.type};base64,${bytes.toString("base64")}`; this.onloadend?.(); } catch (error) { this.onerror?.(error); } }
}
globalThis.FileReader = NodeFileReader;
const specUrl = new URL("../../../assets/pilots/cinder-relay-drone/cinder-relay-drone.spec.json", import.meta.url);
const loadAsset = async () => createCinderRelayDrone(JSON.parse(await readFile(specUrl, "utf8")), { three: THREE, factoryVersion: "1.0.0" });
const exportGlb = async () => { const asset = await loadAsset(); try { return new Uint8Array(await new GLTFExporter().parseAsync(asset.root, { binary: true, trs: true, onlyVisible: true })); } finally { asset.dispose(); } };

test("GLTF EXPORT: Cinder GLB is deterministic, embedded and valid glTF 2.0", async () => {
  const first = await exportGlb(); const second = await exportGlb(); assert.deepEqual(first, second);
  const result = createExportResult("GLB", first, "packages/img2threejs-asset-forge/src/cinder-relay-drone.ts", "MIT"); assert.equal(result.byteSize, 86732); assert.match(result.sha256, /^[0-9a-f]{64}$/);
  const inspection = inspectGltf(first, "GLB"); assert.equal(inspection.version, "2.0"); assert.equal(inspection.nodes, 14); assert.equal(inspection.meshes, 10); assert.equal(inspection.materials, 5); assert.deepEqual(inspection.externalUris, []); assert.equal(inspection.finiteTransforms, true);
});

test("GLTF ROUND-TRIP: imported hierarchy, mesh count, materials and bounds remain essential-equivalent", async () => {
  const bytes = await exportGlb(); const imported = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  let nodes = 0; let meshes = 0; const materialNames = new Set(); const box = new THREE.Box3().setFromObject(imported.scene);
  imported.scene.traverse((node) => { nodes += 1; if (node.isMesh) { meshes += 1; const values = Array.isArray(node.material) ? node.material : [node.material]; for (const material of values) materialNames.add(material.name); } });
  assert.equal(nodes, 15); assert.equal(meshes, 10); assert.deepEqual([...materialNames].sort(), ["charcoal-metal", "ember-core", "maintenance-marker", "oxidized-steel", "sensor-cyan"]);
  assert.ok(box.min.distanceTo(new THREE.Vector3(-0.991666144102634, -0.6343189957220348, -0.48854070782661435)) < 1e-5); assert.ok(box.max.distanceTo(new THREE.Vector3(0.9143370308582632, 1.129161122170753, 0.5560999992489815)) < 1e-5);
});

test("CANONICAL JSON: stable consumer-neutral description is byte deterministic", () => {
  const description = { schemaVersion: 1, assetId: "fixture", version: "1.0.0", nodes: [{ name: "root", parent: null, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], mesh: false }], geometries: 0, materials: [], triangles: 0, bounds: { min: [0, 0, 0], max: [0, 0, 0] } };
  assert.deepEqual(canonicalAssetJson(description), canonicalAssetJson(structuredClone(description)));
});

test("GLTF SECURITY: remote URLs and malformed GLB are rejected", () => {
  const remote = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "https://example.test/a.bin", byteLength: 1 }] })); assert.throws(() => inspectGltf(remote, "GLTF"), /remote URL/);
  assert.throws(() => inspectGltf(Uint8Array.of(1, 2, 3), "GLB"), /header/);
});
