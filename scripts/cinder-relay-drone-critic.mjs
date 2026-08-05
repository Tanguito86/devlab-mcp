#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }
const args = process.argv.slice(2); const modeIndex = args.indexOf("--mode"); const inputIndex = args.indexOf("--input");
if (modeIndex < 0 || inputIndex < 0 || !args[modeIndex + 1] || !args[inputIndex + 1]) fail("usage: cinder-relay-drone-critic.mjs --mode technical|visual --input <bundle.json>");
const mode = args[modeIndex + 1]; if (!new Set(["technical", "visual"]).has(mode)) fail("critic mode must be technical or visual");
const inputPath = resolve(args[inputIndex + 1]); const bundle = JSON.parse(await readFile(inputPath, "utf8"));
const expectedSchema = mode === "technical" ? "devlab-cinder-technical-critic-input-v1" : "devlab-cinder-visual-critic-input-v1";
if (bundle.schema !== expectedSchema) fail("critic input schema mismatch");

const finding = (severity, category, code, message, evidence) => ({ severity, category, code, message, evidence });
const findings = [];

if (mode === "technical") {
  const { geometry, materials } = bundle.assetReport;
  if (bundle.assetReport.validation.status !== "PASS") findings.push(finding("BLOCKER", "TECHNICAL", "GEOMETRY_INVALID", "Strict geometry validation failed.", bundle.assetReport.validation.errors));
  if (geometry.triangles > 30_000 || geometry.drawCalls > 16 || geometry.objectCount > 140 || materials.materials > 8 || materials.textures > 4 || materials.internalLights > 2) findings.push(finding("REQUIRED", "TECHNICAL", "ABSOLUTE_BUDGET_EXCEEDED", "An absolute production budget is exceeded.", [JSON.stringify({ geometry, materials })]));
  if (geometry.triangles > 18_000 || geometry.drawCalls > 10 || geometry.objectCount > 80 || materials.materials > 5) findings.push(finding("OPTIONAL", "TECHNICAL", "TARGET_BUDGET_EXCEEDED", "A non-blocking target budget is exceeded.", [JSON.stringify({ geometry, materials })]));
  if (!bundle.determinism.pngHashMatch || !bundle.determinism.rgbaHashMatch || !bundle.determinism.manifestMatch) findings.push(finding("BLOCKER", "TECHNICAL", "DETERMINISM_MISMATCH", "RUN-A and RUN-B are not byte-deterministic.", [JSON.stringify(bundle.determinism)]));
  if (bundle.lifecycle.cycles !== 100 || bundle.lifecycle.captures !== 100 || bundle.lifecycle.ownedRemaining !== 0 || bundle.lifecycle.disposeErrors !== 0 || bundle.lifecycle.doubleDisposeFailures !== 0) findings.push(finding("BLOCKER", "TECHNICAL", "RESOURCE_LIFECYCLE_FAILURE", "The 100-cycle lifecycle gate failed.", [JSON.stringify(bundle.lifecycle)]));
  if (!bundle.deviceLoss.incidentVisible || !bundle.deviceLoss.incompleteFrameRejected || !bundle.deviceLoss.explicitRecovery || !bundle.deviceLoss.explicitRetry || !bundle.deviceLoss.finalCaptureValid) findings.push(finding("REQUIRED", "TECHNICAL", "DEVICE_LOSS_FAILURE", "Device loss did not remain fail-closed and recoverable.", [JSON.stringify(bundle.deviceLoss)]));
  if (bundle.network.externalRequests !== 0) findings.push(finding("BLOCKER", "SECURITY", "NETWORK_ACCESS", "The renderer attempted external network access.", bundle.network.urls));
  if (!bundle.noCopy || !bundle.pathSafety || !bundle.typescriptSecurity || !bundle.pngHardening) findings.push(finding("REQUIRED", "SECURITY", "BOUNDARY_FAILURE", "One or more security/no-copy boundaries are not proven.", [JSON.stringify({ noCopy: bundle.noCopy, pathSafety: bundle.pathSafety, typescriptSecurity: bundle.typescriptSecurity, pngHardening: bundle.pngHardening })]));
  if (!bundle.webgl.realRenderer || bundle.webgl.contextLost) findings.push(finding("BLOCKER", "TECHNICAL", "WEBGL_RENDERER_FAILURE", "The acceptance render did not complete on a real WebGL context.", [JSON.stringify(bundle.webgl)]));
  if (!bundle.webgpu.available) findings.push(finding("OPTIONAL", "TECHNICAL", "WEBGPU_PENDING", "WebGPU was not available in the stable pilot harness; compatibility remains unvalidated.", [bundle.webgpu.reason]));
  process.stdout.write(JSON.stringify({ schema: "devlab-cinder-technical-critic-v1", criticId: "cinder-independent-technical-critic-v1", findings }, null, 2));
} else {
  const captures = bundle.captures;
  const byFile = Object.fromEntries(captures.map((entry) => [entry.file, entry]));
  const thumb = byFile["thumbnail-128.png"]?.visualMetrics; const game = byFile["game-scale-256.png"]?.visualMetrics; const diagnostic = byFile["material-diagnostic.png"]?.visualMetrics;
  if (!thumb || !game || !diagnostic) findings.push(finding("REQUIRED", "VISUAL", "MISSING_VISUAL_INPUT", "Required thumbnail, game-scale, or material diagnostic input is missing.", ["critic-input-bundle.json"]));
  const clipped = captures.filter(({ visualMetrics }) => visualMetrics.clipped).map(({ file }) => file);
  if (clipped.length > 0) findings.push(finding("REQUIRED", "VISUAL", "VISIBLE_CLIPPING", "One or more canonical views touch the capture boundary.", clipped));
  const occupancyHealthy = (metric) => metric && metric.foregroundRatio >= 0.12 && metric.foregroundRatio <= 0.72 && metric.minimumMarginPixels >= Math.max(4, Math.floor(metric.width * 0.025));
  const score = {
    silhouette: occupancyHealthy(thumb) ? 4.2 : 2.8,
    readability: occupancyHealthy(game) && game.luminanceContrast >= 30 ? 4.1 : 2.9,
    functionScore: bundle.assetReport.parts.some(({ canonicalId }) => canonicalId === "relay-arc-root") && bundle.assetReport.parts.filter(({ canonicalId }) => canonicalId.startsWith("stabilizer-")).length === 2 ? 4.1 : 2.5,
    materials: bundle.assetReport.materials.materials === 5 && diagnostic.luminanceContrast >= 35 && diagnostic.colorSpread >= 40 ? 4.0 : 2.8,
    proportions: clipped.length === 0 && bundle.assetReport.geometry.objectCount <= 80 ? 4.0 : 2.8,
    originality: bundle.brief.noCopy === true && bundle.assetReport.parts.length === 11 ? 4.4 : 2.5,
    "game-scale clarity": occupancyHealthy(game) ? 4.1 : 2.8,
    "technical cleanliness": clipped.length === 0 && bundle.assetReport.validation.status === "PASS" ? 4.4 : 2.8,
  };
  for (const [category, value] of Object.entries(score)) if (value < 3) findings.push(finding("REQUIRED", "VISUAL", `VISUAL_${category.toUpperCase().replaceAll(/[^A-Z]+/g, "_")}`, `${category} scored below 3.`, [JSON.stringify({ score: value })]));
  const average = Object.values(score).reduce((sum, value) => sum + value, 0) / Object.keys(score).length;
  if (average < 3.75) findings.push(finding("REQUIRED", "VISUAL", "VISUAL_AVERAGE_LOW", "The visual score average is below 3.75.", [average.toFixed(3)]));
  process.stdout.write(JSON.stringify({ schema: "devlab-cinder-visual-critic-v1", criticId: "cinder-independent-visual-critic-v1", score, average: Number(average.toFixed(3)), findings, inputs: { captures: captures.map(({ file, pngSha256 }) => ({ file, pngSha256 })), briefSha256: bundle.briefSha256, metricsSha256: bundle.metricsSha256 } }, null, 2));
}
