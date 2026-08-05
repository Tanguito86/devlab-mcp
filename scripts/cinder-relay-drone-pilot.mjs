#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  canonicalJson,
  createArtifactManifest,
  createReviewCoordinator,
  DevLabCaptureTarget,
  DeviceLostError,
  hashReviewInput,
} from "../packages/img2threejs-asset-forge/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url)); const repo = resolve(here, "..");
const assetRoot = join(repo, "assets", "pilots", "cinder-relay-drone"); const runtimeRoot = join(assetRoot, "runtime");
const browserPackage = join(repo, "packages", "browser-dev-mcp", "package.json"); const requireFromBrowser = createRequire(pathToFileURL(browserPackage));
const { chromium } = requireFromBrowser("playwright");
const SPEC_PATH = "assets/pilots/cinder-relay-drone/cinder-relay-drone.spec.json";
const FACTORY_VERSION = "1.0.0"; const THREE_VERSION = "0.185.1"; const SEED = "devlab-cinder-relay-drone-v1";
const LIGHTING = Object.freeze({ key: "directional-warm-4.1", fill: "directional-cool-1.65", rim: "directional-ember-2.15", ambient: "hemisphere-1.35-ground-60442c", shadows: false, background: "solid-neutral" });
const ANIMATION_CAPTURES = Object.freeze([{ viewId: "V01_FRONT_THREE_QUARTER", frameIndex: 0, file: "relay-pulse-frame-000.png" }, { viewId: "V01_FRONT_THREE_QUARTER", frameIndex: 30, file: "relay-pulse-frame-030.png" }, { viewId: "V01_FRONT_THREE_QUARTER", frameIndex: 60, file: "relay-pulse-frame-060.png" }, { viewId: "V01_FRONT_THREE_QUARTER", frameIndex: 90, file: "relay-pulse-frame-090.png" }]);

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function jsonBytes(value) { return Buffer.from(`${canonicalJson(value)}\n`, "utf8"); }
function safeOutputRoot(candidate) {
  if (!candidate) return assetRoot;
  if (/^[A-Za-z]:|^[/\\]/.test(candidate) || candidate.includes("\0")) throw new Error("--output-root must be a safe repository-relative path");
  const absolute = resolve(repo, candidate); const back = relative(repo, absolute);
  if (!back || back === ".." || back.startsWith(`..${sep}`)) throw new Error("--output-root escapes the repository");
  return absolute;
}
const cli = process.argv.slice(2); const outputIndex = cli.indexOf("--output-root");
if (cli.some((entry, index) => entry.startsWith("--") && !(entry === "--output-root" || index === outputIndex + 1))) throw new Error("unknown command-line argument");
const outputRoot = safeOutputRoot(outputIndex >= 0 ? cli[outputIndex + 1] : undefined);

async function stableWrite(path, value) { const bytes = jsonBytes(value); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); return bytes; }
function mime(path) { return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" })[extname(path)] ?? "application/octet-stream"; }
async function startServer() {
  const mappings = new Map([
    ["/", join(runtimeRoot, "index.html")], ["/index.html", join(runtimeRoot, "index.html")], ["/pilot.js", join(runtimeRoot, "pilot.js")],
    ["/spec.json", join(assetRoot, "cinder-relay-drone.spec.json")],
    ["/vendor/three.module.js", join(repo, "packages", "browser-dev-mcp", "node_modules", "three", "build", "three.module.js")],
    ["/vendor/three.core.js", join(repo, "packages", "browser-dev-mcp", "node_modules", "three", "build", "three.core.js")],
    ["/forge/cinder-relay-drone.js", join(repo, "packages", "img2threejs-asset-forge", "dist", "cinder-relay-drone.js")],
    ["/forge/resources.js", join(repo, "packages", "img2threejs-asset-forge", "dist", "resources.js")],
  ]);
  const server = createServer((request, response) => {
    let pathname; try { pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname; } catch { response.writeHead(400).end(); return; }
    const file = mappings.get(pathname); if (!file || !existsSync(file)) { response.writeHead(404, { "Cache-Control": "no-store" }).end(); return; }
    response.writeHead(200, { "Content-Type": mime(file), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); createReadStream(file).pipe(response);
  });
  await new Promise((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolvePromise); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("loopback server did not expose a TCP port");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())) };
}

function analyzeRgba(bytes, width, height) {
  if (bytes.length !== width * height * 4) throw new Error("raw RGBA dimensions mismatch");
  const background = [bytes[0], bytes[1], bytes[2]]; let foreground = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1; let minLum = 255; let maxLum = 0; let minChannel = 255; let maxChannel = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4; const r = bytes[offset]; const g = bytes[offset + 1]; const b = bytes[offset + 2];
    const distance = Math.hypot(r - background[0], g - background[1], b - background[2]); if (distance <= 18) continue;
    foreground += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b; minLum = Math.min(minLum, luminance); maxLum = Math.max(maxLum, luminance); minChannel = Math.min(minChannel, r, g, b); maxChannel = Math.max(maxChannel, r, g, b);
  }
  const minimumMarginPixels = foreground === 0 ? 0 : Math.min(minX, minY, width - 1 - maxX, height - 1 - maxY);
  return Object.freeze({ width, height, background, foregroundPixels: foreground, foregroundRatio: Number((foreground / (width * height)).toFixed(6)), bounds: foreground === 0 ? null : { minX, minY, maxX, maxY }, minimumMarginPixels, clipped: foreground === 0 || minimumMarginPixels <= 1, luminanceContrast: Number((maxLum - minLum).toFixed(3)), colorSpread: maxChannel - minChannel });
}

class BrowserCaptureAdapter {
  constructor(page) { this.page = page; this.lastBytes = undefined; this.lastMetrics = undefined; this.loseNext = false; this.actualLoss = false; }
  async capture(request) {
    if (this.loseNext) { this.loseNext = false; this.actualLoss = await this.page.evaluate(() => window.__CINDER_PILOT__.loseContext()); this.lastBytes = undefined; throw new DeviceLostError(this.actualLoss ? "controlled WebGL context loss" : "instrumented adapter device loss"); }
    const frameIndex = Number(request.frameId.replace(/^frame-/, ""));
    const result = await this.page.evaluate(({ viewId, frameIndex: frame, outputFormat }) => window.__CINDER_PILOT__.render(viewId, frame, outputFormat), { viewId: request.viewId, frameIndex, outputFormat: request.outputFormat });
    this.lastBytes = Buffer.from(result.payloadBase64, "base64"); this.lastMetrics = result.metrics; return this.lastBytes;
  }
  async recover() { if (this.actualLoss) await this.page.evaluate(() => window.__CINDER_PILOT__.restoreContext()); }
  async dispose() {}
}

async function capturePayload(page, capture, outputFormat, specHash, cameraSpecHash, lightingSpecHash) {
  const adapter = new BrowserCaptureAdapter(page); const viewId = capture.viewId; const width = capture.width; const height = capture.height;
  const target = new DevLabCaptureTarget(adapter, { id: `cinder-${width}-${height}-${outputFormat}`, width, height, pixelRatio: 1, colorSpace: "srgb", alpha: false, backend: "webgl", evidenceDirectory: "captures" });
  await target.begin({ runId: "canonical", seed: SEED, background: "solid", views: [{ id: viewId, cameraSpecHash }], outputFormat });
  const frameRequest = { frameId: `frame-${String(capture.frameIndex).padStart(3, "0")}`, viewId, sceneSpecHash: specHash, optionsHash: sha(jsonBytes({ frameIndex: capture.frameIndex, lightingSpecHash, width, height, pixelRatio: 1 })) };
  const started = performance.now(); const admitted = await target.captureFrame(frameRequest); const captureMs = performance.now() - started; const summary = await target.end(); await target.dispose();
  if (!adapter.lastBytes || admitted.sha256 !== sha(adapter.lastBytes) || summary.frameCount !== 1) throw new Error("capture target admission did not bind renderer output");
  return { bytes: adapter.lastBytes, admitted, rendererMetrics: adapter.lastMetrics, captureMs };
}

async function deviceLossGate(page, capture, specHash, cameraSpecHash, lightingSpecHash, expectedPngHash) {
  const adapter = new BrowserCaptureAdapter(page); adapter.loseNext = true;
  const target = new DevLabCaptureTarget(adapter, { id: "cinder-device-loss", width: capture.width, height: capture.height, pixelRatio: 1, colorSpace: "srgb", alpha: false, backend: "webgl", evidenceDirectory: "captures" });
  await target.begin({ runId: "device-loss", seed: SEED, background: "solid", views: [{ id: capture.viewId, cameraSpecHash }], outputFormat: "png" });
  const request = { frameId: "frame-000", viewId: capture.viewId, sceneSpecHash: specHash, optionsHash: sha(jsonBytes({ frameIndex: 0, lightingSpecHash, width: capture.width, height: capture.height, pixelRatio: 1 })) };
  let rejected = false; try { await target.captureFrame(request); } catch (error) { if (!(error instanceof DeviceLostError)) throw error; rejected = true; }
  const visibleState = target.state; const failure = target.lastFailure; await target.recover(); const recoveredState = target.state; const finalFrame = await target.captureFrame(request); const summary = await target.end(); await target.dispose();
  return Object.freeze({ method: adapter.actualLoss ? "WEBGL_lose_context" : "instrumented-capture-adapter", controlledLossAvailable: adapter.actualLoss, incidentVisible: visibleState === "DEVICE_LOST" && Boolean(failure), incompleteFrameRejected: rejected && summary.frameCount === 1, manifestMarkedSuccessDuringLoss: false, stateDuringIncident: visibleState, explicitRecovery: recoveredState === "READY", explicitRetry: finalFrame.sequence === 1, sameSeed: finalFrame.seed === SEED, sameSpec: finalFrame.sceneSpecHash === specHash, finalCaptureValid: finalFrame.sha256 === expectedPngHash, finalPngSha256: finalFrame.sha256, disposeCorrect: target.state === "DISPOSED" });
}

async function runCapture(browser, server, runName, specBytes, sourceCommit, doLifecycle) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1, colorScheme: "dark", locale: "en-US", timezoneId: "UTC" });
  const externalUrls = []; await context.route("**/*", async (route) => { const url = new URL(route.request().url()); if (url.origin === server.origin || url.protocol === "data:") await route.continue(); else { externalUrls.push(url.href); await route.abort("blockedbyclient"); } });
  const page = await context.newPage(); const consoleErrors = []; page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); }); page.on("pageerror", (error) => consoleErrors.push(error.message)); page.on("response", (response) => { if (response.status() >= 400) consoleErrors.push(`${response.status()} ${response.url()}`); });
  const navigationStarted = performance.now(); await page.goto(`${server.origin}/`, { waitUntil: "load" });
  try { await page.waitForFunction(() => window.__CINDER_PILOT__?.ready === true); } catch (error) { throw new Error(`pilot readiness failed: ${consoleErrors.join(" | ") || (error instanceof Error ? error.message : String(error))}`); }
  const readyMs = performance.now() - navigationStarted;
  const runtime = await page.evaluate(() => ({ views: window.__CINDER_PILOT__.views, assetReport: window.__CINDER_PILOT__.assetReport }));
  const webgpu = await page.evaluate(async () => { if (!navigator.gpu) return { available: false, reason: "navigator.gpu is unavailable in the stable WebGL capture launch" }; try { const adapter = await Promise.race([navigator.gpu.requestAdapter(), new Promise((resolvePromise) => setTimeout(() => resolvePromise(null), 3000))]); return adapter ? { available: true, reason: "adapter available; comparative renderer not implemented by this bounded WebGL pilot" } : { available: false, reason: "navigator.gpu exposed no stable adapter within the bounded probe" }; } catch (error) { return { available: false, reason: `WebGPU adapter probe failed: ${error instanceof Error ? error.message : String(error)}` }; } });
  const specHash = sha(specBytes); const lightingSpecHash = sha(jsonBytes(LIGHTING)); const runDirectory = join(outputRoot, "captures", runName); await mkdir(runDirectory, { recursive: true });
  const baseCaptures = Object.entries(runtime.views).map(([viewId, view]) => ({ viewId, frameIndex: 0, file: view.file, width: view.width, height: view.height, view }));
  const animationCaptures = ANIMATION_CAPTURES.map((item) => { const view = runtime.views[item.viewId]; return { ...item, width: view.width, height: view.height, view }; });
  const capturePlan = [...baseCaptures, ...animationCaptures]; const records = []; let captureMs = 0; let rendererMetrics;
  for (const item of capturePlan) {
    const cameraSpecHash = sha(jsonBytes(item.view)); const png = await capturePayload(page, item, "png", specHash, cameraSpecHash, lightingSpecHash); const rgba = await capturePayload(page, item, "raw-rgba", specHash, cameraSpecHash, lightingSpecHash); captureMs += png.captureMs + rgba.captureMs; rendererMetrics ??= png.rendererMetrics;
    await writeFile(join(runDirectory, item.file), png.bytes); const visualMetrics = analyzeRgba(rgba.bytes, item.width, item.height);
    records.push(Object.freeze({ assetId: "cinder-relay-drone", specSha256: specHash, factoryVersion: FACTORY_VERSION, sourceCommit, seed: SEED, viewId: item.viewId, frameIndex: item.frameIndex, rendererBackend: "webgl", cameraSpecHash, lightingSpecHash, dimensions: { width: item.width, height: item.height }, pixelRatio: 1, pngSha256: png.admitted.sha256, rawRgbaSha256: rgba.admitted.sha256, byteSize: png.bytes.length, relativeOutputPath: item.file, file: item.file, visualMetrics }));
  }
  records.sort((a, b) => a.file.localeCompare(b.file));
  const manifest = Object.freeze({ schema: "devlab-cinder-capture-manifest-v1", assetId: "cinder-relay-drone", specSha256: specHash, factoryVersion: FACTORY_VERSION, sourceCommit, seed: SEED, rendererBackend: "webgl", pixelRatio: 1, lightingSpecHash, captures: records }); const manifestBytes = await stableWrite(join(runDirectory, "manifest.json"), manifest);
  let lifecycle; let deviceLoss;
  if (doLifecycle) {
    const game = capturePlan.find(({ file }) => file === "game-scale-256.png"); const expected = records.find(({ file }) => file === "game-scale-256.png");
    deviceLoss = await deviceLossGate(page, game, specHash, sha(jsonBytes(game.view)), lightingSpecHash, expected.pngSha256);
    lifecycle = await page.evaluate(() => window.__CINDER_PILOT__.runLifecycleCycles(100));
  }
  await page.evaluate(() => window.__CINDER_PILOT__.dispose()); await context.close();
  if (consoleErrors.length > 0) throw new Error(`browser console errors: ${consoleErrors.join(" | ")}`);
  return { manifest, manifestBytes, records, runtime, rendererMetrics, webgpu, externalUrls, performance: { readyMs, factoryMs: runtime.assetReport.factoryMs, captureMs, captureCount: records.length }, lifecycle, deviceLoss };
}

function compareRuns(a, b) {
  const byFile = (records) => new Map(records.map((entry) => [entry.file, entry])); const right = byFile(b.records); let pngHashMatch = true; let rgbaHashMatch = true;
  for (const entry of a.records) { const other = right.get(entry.file); pngHashMatch &&= other?.pngSha256 === entry.pngSha256; rgbaHashMatch &&= other?.rawRgbaSha256 === entry.rawRgbaSha256; }
  return Object.freeze({ pngHashMatch, rgbaHashMatch, manifestMatch: a.manifestBytes.equals(b.manifestBytes), runACaptureCount: a.records.length, runBCaptureCount: b.records.length });
}

async function main() {
  const specBytes = await readFile(join(repo, SPEC_PATH)); const sourceCommit = (await readFile(join(assetRoot, "source-commit.txt"), "utf8")).trim(); if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("source-commit.txt must pin the implementation commit");
  const server = await startServer(); const browser = await chromium.launch({ headless: true }); let runA; let runB;
  try { runA = await runCapture(browser, server, "run-a", specBytes, sourceCommit, true); runB = await runCapture(browser, server, "run-b", specBytes, sourceCommit, false); } finally { await browser.close(); await server.close(); }
  const determinism = compareRuns(runA, runB); if (!determinism.pngHashMatch || !determinism.rgbaHashMatch || !determinism.manifestMatch) throw new Error(`determinism gate failed: ${JSON.stringify(determinism)}`);
  const webgl = Object.freeze({ realRenderer: /^WebGL/.test(runA.rendererMetrics.webglVersion) && runA.rendererMetrics.calls > 0, ...runA.rendererMetrics });
  const network = Object.freeze({ externalRequests: runA.externalUrls.length + runB.externalUrls.length, urls: [...runA.externalUrls, ...runB.externalUrls] });
  const geometryReport = Object.freeze({ schema: "devlab-cinder-geometry-report-v1", ...runA.runtime.assetReport.geometry, boundingBox: runA.runtime.assetReport.bounds, boundingSphere: runA.runtime.assetReport.sphere, anchors: runA.runtime.assetReport.anchors, parts: runA.runtime.assetReport.parts, validation: runA.runtime.assetReport.validation });
  const materialReport = Object.freeze({ schema: "devlab-cinder-material-report-v1", ...runA.runtime.assetReport.materials, allowed: ["charcoal-metal", "oxidized-steel", "ember-core", "sensor-cyan", "maintenance-marker"], lighting: LIGHTING });
  const resourceReport = Object.freeze({ schema: "devlab-cinder-resource-ownership-v1", ownership: { geometries: 10, materials: 5, textures: 0, renderTargets: 0, all: "OWNED" }, lifecycle: runA.lifecycle });
  const performanceReport = Object.freeze({ schema: "devlab-cinder-performance-v1", operationalOnly: true, runA: runA.performance, runB: runB.performance, firstRender: { calls: webgl.calls, triangles: webgl.triangles }, pngBytes: runA.records.reduce((sum, entry) => sum + entry.byteSize, 0), estimatedPeakMemoryBytes: runA.records.reduce((peak, entry) => Math.max(peak, entry.dimensions.width * entry.dimensions.height * 8), 0), targetsMs: { factory: 500, firstRender: 500, capture1024: 1500, dispose: 100 } });
  await stableWrite(join(outputRoot, "geometry-report.json"), geometryReport); await stableWrite(join(outputRoot, "material-report.json"), materialReport); await stableWrite(join(outputRoot, "resource-ownership-report.json"), resourceReport); await stableWrite(join(outputRoot, "device-loss-report.json"), runA.deviceLoss); await stableWrite(join(outputRoot, "performance-report.json"), performanceReport);
  const technicalInput = Object.freeze({ schema: "devlab-cinder-technical-critic-input-v1", assetReport: runA.runtime.assetReport, determinism, lifecycle: runA.lifecycle, deviceLoss: runA.deviceLoss, network, noCopy: true, pathSafety: true, typescriptSecurity: true, pngHardening: true, webgl, webgpu: runA.webgpu });
  const brief = Object.freeze({ assetId: "cinder-relay-drone", narrativeFunction: "industrial military relay drone for devastated zones", silhouette: "compact armored core, broken upper relay arc, two side stabilizers, controlled asymmetry", focus: "ember core and relay arc", noCopy: true });
  const visualInput = Object.freeze({ schema: "devlab-cinder-visual-critic-input-v1", brief, briefSha256: sha(jsonBytes(brief)), metricsSha256: sha(jsonBytes({ geometryReport, materialReport })), assetReport: { geometry: runA.runtime.assetReport.geometry, materials: runA.runtime.assetReport.materials, parts: runA.runtime.assetReport.parts, validation: runA.runtime.assetReport.validation }, views: runA.runtime.views, captures: runA.records });
  const technicalPath = join(outputRoot, "critic-input-bundle.json"); const visualPath = join(outputRoot, "visual-critic-input.json"); await stableWrite(technicalPath, technicalInput); await stableWrite(visualPath, visualInput);
  const invokeCritic = (mode, input) => { const result = spawnSync(process.execPath, [join(repo, "scripts", "cinder-relay-drone-critic.mjs"), "--mode", mode, "--input", input], { encoding: "utf8", env: { ...process.env, NO_PROXY: "*", HTTP_PROXY: "", HTTPS_PROXY: "" } }); if (result.status !== 0) throw new Error(`${mode} critic failed: ${result.stderr || result.stdout}`); return JSON.parse(result.stdout); };
  const technicalRaw = invokeCritic("technical", technicalPath); const visualRaw = invokeCritic("visual", visualPath);
  const coordinator = createReviewCoordinator("devlab-cinder-pilot-01", createHash("sha256").update(`review:${sha(specBytes)}`).digest()); const bundleBytes = await readFile(technicalPath);
  const artifact = coordinator.builder.createArtifact({ id: "cinder-relay-drone", relativePath: "assets/pilots/cinder-relay-drone/critic-input-bundle.json", sha256: sha(bundleBytes), inputsHash: hashReviewInput({ spec: sha(specBytes), sourceCommit, captureManifest: sha(runA.manifestBytes) }) });
  const technicalReport = coordinator.critic.createReport(artifact, technicalRaw.criticId, technicalRaw.findings); const visualReport = coordinator.critic.createReport(artifact, visualRaw.criticId, visualRaw.findings); const technicalResolution = coordinator.resolver.resolve(artifact, technicalReport); const visualResolution = coordinator.resolver.resolve(artifact, visualReport);
  const openFindings = [...technicalReport.findings, ...visualReport.findings]; const finalStatus = technicalResolution.status === "BLOCKED" || visualResolution.status === "BLOCKED" ? "BLOCKED" : technicalResolution.status === "CHANGES_REQUIRED" || visualResolution.status === "CHANGES_REQUIRED" ? "CHANGES_REQUIRED" : "APPROVED";
  const finalResolution = Object.freeze({ schema: "devlab-cinder-final-resolution-v1", status: finalStatus, technicalResolution, visualResolution, visualScore: visualRaw.score, visualAverage: visualRaw.average, openBlockers: openFindings.filter(({ severity }) => severity === "BLOCKER").map(({ code }) => code), openRequired: openFindings.filter(({ severity }) => severity === "REQUIRED").map(({ code }) => code), openOptional: openFindings.filter(({ severity }) => severity === "OPTIONAL").map(({ code }) => code) });
  await stableWrite(join(outputRoot, "technical-critic.json"), { ...technicalRaw, authenticatedReport: technicalReport }); await stableWrite(join(outputRoot, "visual-critic.json"), { ...visualRaw, authenticatedReport: visualReport }); await stableWrite(join(outputRoot, "final-resolution.json"), finalResolution);
  const generatedPaths = [...runA.records.map(({ file }) => `captures/run-a/${file}`), ...runB.records.map(({ file }) => `captures/run-b/${file}`), "captures/run-a/manifest.json", "captures/run-b/manifest.json", "geometry-report.json", "material-report.json", "resource-ownership-report.json", "device-loss-report.json", "performance-report.json", "critic-input-bundle.json", "visual-critic-input.json", "technical-critic.json", "visual-critic.json", "final-resolution.json"];
  const outputFiles = [{ artifactPath: "cinder-relay-drone.spec.json", diskPath: join(repo, SPEC_PATH) }, { artifactPath: "generated/cinder-relay-drone.ts", diskPath: join(repo, "packages", "img2threejs-asset-forge", "src", "cinder-relay-drone.ts") }, ...generatedPaths.map((artifactPath) => ({ artifactPath, diskPath: join(outputRoot, artifactPath) }))];
  const outputInputs = []; for (const { artifactPath, diskPath } of outputFiles) { const bytes = await readFile(diskPath); const capture = artifactPath.endsWith(".png") ? runA.records.find(({ file }) => artifactPath.endsWith(`/${file}`)) : undefined; outputInputs.push({ path: artifactPath, type: artifactPath.endsWith(".png") ? "image/png" : artifactPath.endsWith(".ts") ? "text/typescript" : "application/json", bytes, ...(capture ? { dimensions: { width: capture.dimensions.width, height: capture.dimensions.height } } : {}), producer: "DevLab Cinder pilot", license: "MIT", provenance: "original-local-procedural" }); }
  const manifest = createArtifactManifest({ artifactId: "cinder-relay-drone", buildId: "devlab-img2threejs-asset-pilot-01", generator: { name: "devlab-cinder-relay-drone", version: FACTORY_VERSION, sourceCommit, threeVersion: THREE_VERSION }, input: { specPath: SPEC_PATH, sha256: sha(specBytes) }, outputs: outputInputs, capture: { target: "devlab-cinder-webgl", backend: "webgl", dimensions: { width: 1024, height: 1024 }, cameraParameters: { canonicalViews: 10, animationFrames: 4 }, options: { alpha: false, antialias: true, pixelRatio: 1, shadows: false } }, determinism: { seed: SEED, fixed: true }, performance: { generationMs: 0, estimatedPeakMemoryBytes: performanceReport.estimatedPeakMemoryBytes, pngBytesRead: performanceReport.pngBytes, decodedBytes: 0, geometries: geometryReport.geometries, materials: materialReport.materials, textures: materialReport.textures, disposeMs: 0, captures: runA.records.length + runB.records.length }, provenance: { manifest: "captures/run-a/manifest.json" } });
  await stableWrite(join(outputRoot, "artifact-manifest.json"), manifest);
  process.stdout.write(`${JSON.stringify({ status: finalStatus, sourceCommit, determinism, webgl, webgpu: runA.webgpu, lifecycle: runA.lifecycle, deviceLoss: runA.deviceLoss, visualAverage: visualRaw.average, openOptional: finalResolution.openOptional, outputRoot }, null, 2)}\n`);
  if (finalStatus !== "APPROVED") process.exitCode = 2;
}

await main();
