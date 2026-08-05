import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { assertSafeRelativePath, createArtifactManifest, DevLabCaptureTarget, FakeCaptureAdapter, MinimumRendererCaptureAdapter, resolveSecureArtifactPath, writeArtifactFileExclusive } from "../dist/index.js";

const optionsHash = "f".repeat(64); const cameraHash = "a".repeat(64); const sceneHash = "b".repeat(64);
const session = { runId: "run-01", seed: "seed-01", background: "transparent", views: [{ id: "front", cameraSpecHash: cameraHash }], outputFormat: "raw-rgba" };
const frameRequest = { frameId: "frame-01", viewId: "front", sceneSpecHash: sceneHash, optionsHash };
const config = { id: "fake-ci", width: 256, height: 256, pixelRatio: 1, colorSpace: "srgb", alpha: true, backend: "fake" };

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); let crcTable;
function crc32(bytes) { crcTable ??= Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function pngChunk(type, payload = Buffer.alloc(0)) { const name = Buffer.from(type); const output = Buffer.alloc(12 + payload.length); output.writeUInt32BE(payload.length, 0); name.copy(output, 4); payload.copy(output, 8); output.writeUInt32BE(crc32(Buffer.concat([name, payload])), 8 + payload.length); return output; }
function testPng(width, height) { const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6; return Buffer.concat([pngSignature, pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(Buffer.alloc(height * (1 + width * 4)))), pngChunk("IEND")]); }

test("capture lifecycle is deterministic and runId-independent", async () => {
  const target = new DevLabCaptureTarget(new FakeCaptureAdapter(), config);
  await target.begin(session); const first = await target.captureFrame(frameRequest); const second = await target.captureFrame(frameRequest); const summary = await target.end();
  assert.equal(first.sha256, second.sha256); assert.equal(first.sequence, 1); assert.equal(second.sequence, 2); assert.equal(summary.frameCount, 2);
  assert.match(first.relativePath, /^captures\/front-frame-01-000001-[0-9a-f]{16}\.rgba$/); assert.deepEqual([first.frameId, first.viewId, first.pixelRatio, first.rendererBackend, first.cameraSpecHash, first.sceneSpecHash], ["frame-01", "front", 1, "fake", cameraHash, sceneHash]);
  await target.begin({ ...session, runId: "run-02" }); const otherRun = await target.captureFrame(frameRequest); await target.end(); assert.equal(first.sha256, otherRun.sha256); assert.equal(first.relativePath, otherRun.relativePath);
  await target.begin({ ...session, runId: "run-03", seed: "seed-02" }); const differentSeed = await target.captureFrame(frameRequest); await target.end(); assert.notEqual(first.sha256, differentSeed.sha256);
});

test("device loss preserves complete request, requires recovery, and retries explicitly", async () => {
  const adapter = new FakeCaptureAdapter(); const target = new DevLabCaptureTarget(adapter, config); await target.begin(session); adapter.loseNextCapture();
  await assert.rejects(target.captureFrame(frameRequest), /device lost/); assert.equal(target.state, "DEVICE_LOST"); assert.equal(target.lastFailure.request.viewId, "front");
  await assert.rejects(target.captureFrame(frameRequest), /DEVICE_LOST/); await target.recover();
  await assert.rejects(target.captureFrame({ ...frameRequest, frameId: "changed" }), /preserve/); const frame = await target.captureFrame(frameRequest); assert.equal(frame.sequence, 1); await target.end();
  await target.dispose(); assert.equal(target.state, "DISPOSED"); await target.dispose();
});

test("capture rejects ambiguous session text and resource-exhausting target dimensions", async () => {
  assert.throws(() => new DevLabCaptureTarget(new FakeCaptureAdapter(), { ...config, width: 4097 }), /invalid/);
  assert.throws(() => new DevLabCaptureTarget(new FakeCaptureAdapter(), { ...config, alpha: "yes" }), /invalid/);
  assert.throws(() => new DevLabCaptureTarget(new FakeCaptureAdapter(), { ...config, width: 4096, height: 4096, pixelRatio: 2 }), /physical dimensions/);
  const target = new DevLabCaptureTarget(new FakeCaptureAdapter(), config); await assert.rejects(target.begin({ ...session, runId: "bad\nrun" }), /invalid/); await assert.rejects(target.begin({ ...session, seed: "x".repeat(129) }), /invalid/);
});

test("minimum renderer adapter forwards readback, recovery, and disposal", async () => {
  const calls = []; const adapter = new MinimumRendererCaptureAdapter({ readFrame: async (request) => { calls.push(request.viewId); return new Uint8Array(4); }, recoverDevice: async () => { calls.push("recover"); }, disposeRenderer: async () => { calls.push("dispose"); } });
  const target = new DevLabCaptureTarget(adapter, { ...config, width: 1, height: 1, backend: "webgl" }); await target.begin(session); await target.captureFrame(frameRequest); await target.end(); await adapter.recover(); await target.dispose(); assert.deepEqual(calls, ["front", "recover", "dispose"]);
});

test("capture admits exact raw RGBA only and does not sequence partial output", async () => {
  let valid = false; const adapter = { capture: async () => valid ? new Uint8Array(16) : new Uint8Array(1), recover: async () => {}, dispose: async () => {} };
  const target = new DevLabCaptureTarget(adapter, { ...config, width: 2, height: 2 }); await target.begin(session);
  await assert.rejects(target.captureFrame(frameRequest), /does not match expected 16/); assert.equal(target.state, "READY"); valid = true;
  const frame = await target.captureFrame(frameRequest); assert.equal(frame.sequence, 1); assert.equal(frame.byteLength, 16); await target.end();
});

test("capture validates PNG structure and physical dimensions before sequencing", async () => {
  let bytes = testPng(2, 1); const adapter = { capture: async () => bytes, recover: async () => {}, dispose: async () => {} };
  const target = new DevLabCaptureTarget(adapter, { ...config, width: 1, height: 1, backend: "webgpu" }); await target.begin({ ...session, outputFormat: "png" });
  await assert.rejects(target.captureFrame(frameRequest), /do not match expected/); assert.equal(target.state, "READY"); bytes = testPng(1, 1);
  const frame = await target.captureFrame(frameRequest); assert.equal(frame.sequence, 1); assert.equal(frame.rendererBackend, "webgpu"); await target.end();
});

test("concurrent dispose calls share one adapter teardown", async () => {
  let calls = 0; let finish; const gate = new Promise((resolve) => { finish = resolve; }); const adapter = { capture: async () => new Uint8Array([1]), recover: async () => {}, dispose: async () => { calls += 1; await gate; } };
  const target = new DevLabCaptureTarget(adapter, config); const first = target.dispose(); const second = target.dispose(); assert.strictEqual(first, second); assert.equal(calls, 1); finish(); await first; assert.equal(target.state, "DISPOSED");
});

test("artifact path policy rejects traversal, absolutes, ADS, devices, and aliases", () => {
  for (const path of ["../outside", "a/../../outside", "/absolute", "C:\\outside", "\\\\server\\share", "a//b", "a/./b", "a\0b", "a/b\\c", "file:stream", "%2e%2e/out", "CON/file", "name./file"]) assert.throws(() => assertSafeRelativePath(path));
  assert.equal(assertSafeRelativePath("renders/front.png"), "renders/front.png");
});

test("secure artifact writer requires coordinator-owned root and rejects junction traversal", () => {
  const root = mkdtempSync(join(tmpdir(), "devlab-path-root-")); const outside = mkdtempSync(join(tmpdir(), "devlab-path-outside-"));
  try {
    mkdirSync(join(root, "renders")); const written = writeArtifactFileExclusive(root, "renders/front.bin", new Uint8Array([1, 2, 3])); assert.deepEqual([...readFileSync(written)], [1, 2, 3]); assert.throws(() => writeArtifactFileExclusive(root, "renders/front.bin", new Uint8Array([4])), /exist/i);
    writeFileSync(join(outside, "secret.txt"), "secret"); symlinkSync(outside, join(root, "linked"), "junction"); assert.throws(() => resolveSecureArtifactPath(root, "linked/secret.txt"), /symbolic link/);
    if (process.platform !== "win32") { chmodSync(root, 0o777); assert.throws(() => writeArtifactFileExclusive(root, "renders/unsafe.bin", new Uint8Array([1])), /writable/); chmodSync(root, 0o700); }
  } finally { try { chmodSync(root, 0o700); } catch {} rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

const performance = { generationMs: 10, estimatedPeakMemoryBytes: 1024, pngBytesRead: 100, decodedBytes: 400, geometries: 1, materials: 1, textures: 1, disposeMs: 1, captures: 2 };
const manifestBase = { artifactId: "asset-1", buildId: "build-1", generator: { name: "devlab-safe-forge", version: "0.1.0", sourceCommit: "c".repeat(40), threeVersion: "0.185.1" }, input: { specPath: "specs/asset.json", sha256: "d".repeat(64) }, capture: { target: "fake-ci", backend: "fake", dimensions: { width: 512, height: 512 }, cameraParameters: { fov: 35, projection: "perspective" }, options: { alpha: false, samples: 1 } }, determinism: { seed: "seed-1", fixed: true }, performance, provenance: { manifest: "manifests/provenance.json" } };
const output = { path: "a/output.json", type: "application/json", bytes: new TextEncoder().encode("{}"), dimensions: { width: 1, height: 1 }, producer: "devlab", license: "MIT", provenance: "generated" };

test("artifact manifests are byte-deterministic across input and output ordering", () => {
  const other = { path: "z/output.bin", type: "application/octet-stream", bytes: new TextEncoder().encode("z"), producer: "devlab", license: "MIT", provenance: "generated" };
  const left = createArtifactManifest({ ...manifestBase, outputs: [other, output] });
  const reorderedOutput = { ...output, dimensions: { height: 1, width: 1 } };
  const reordered = { ...manifestBase, generator: { threeVersion: "0.185.1", sourceCommit: "c".repeat(40), version: "0.1.0", name: "devlab-safe-forge" }, capture: { ...manifestBase.capture, dimensions: { height: 512, width: 512 } }, determinism: { fixed: true, seed: "seed-1" }, performance: Object.fromEntries(Object.entries(performance).reverse()), outputs: [reorderedOutput, other] };
  const right = createArtifactManifest(reordered); assert.equal(JSON.stringify(left), JSON.stringify(right)); assert.deepEqual(left.outputs.map(({ path }) => path), ["a/output.json", "z/output.bin"]);
  const otherSeed = createArtifactManifest({ ...manifestBase, determinism: { seed: "seed-2", fixed: true }, outputs: [output] }); assert.notDeepEqual(left.determinism, otherSeed.determinism);
  const otherRun = createArtifactManifest({ ...manifestBase, buildId: "build-2", outputs: [other, output] }); assert.deepEqual(left.outputs, otherRun.outputs);
});

test("artifact manifest runtime schema rejects missing, wrong, duplicate, and unpinned inputs", () => {
  assert.throws(() => createArtifactManifest({ ...manifestBase, input: { ...manifestBase.input, sha256: "bad" }, outputs: [output] }), /SHA-256/);
  assert.throws(() => createArtifactManifest({ ...manifestBase, outputs: [output, output] }), /unique/);
  assert.throws(() => createArtifactManifest({ ...manifestBase, outputs: [output, { ...output, path: "A/OUTPUT.JSON" }] }), /case-folding/);
  assert.throws(() => createArtifactManifest({ ...manifestBase, capture: { ...manifestBase.capture, backend: "other" }, outputs: [output] }), /backend/);
  assert.throws(() => createArtifactManifest({ ...manifestBase, generator: { ...manifestBase.generator, sourceCommit: "internal" }, outputs: [output] }), /sourceCommit/);
  assert.throws(() => createArtifactManifest({ ...manifestBase, determinism: { seed: "seed", fixed: 1 }, outputs: [output] }), /fixed/);
  assert.throws(() => createArtifactManifest({ ...manifestBase, performance: {}, outputs: [output] }), /performance/);
  assert.throws(() => createArtifactManifest({ ...manifestBase, capture: { ...manifestBase.capture, options: { bad: {} } }, outputs: [output] }), /capture.options/);
});
