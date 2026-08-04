#!/usr/bin/env node

/**
 * ASH RELAY onboarding capture matrix.
 *
 * Usage:
 *   node scripts/ash-relay-onboarding-capture.mjs \
 *     --dist <absolute-built-game-root> \
 *     --output <absolute-empty-evidence-root> \
 *     --browser <absolute-contractual-chromium-executable>
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { runDeterminismFlow } from "../packages/browser-dev-mcp/scripts/capture-harness/runner.js";

const SEED = 424242;
const TIME_MS = 2500;
const VIEWPOINTS = Object.freeze([
  "title",
  "tutorial",
  "encounter-1",
  "checkpoint",
  "encounter-2",
  "boss-phase-1",
  "boss-phase-2",
  "defeat",
  "victory",
  "mobile-active",
  "tutorial-identify-player",
  "tutorial-move",
  "tutorial-fire",
  "tutorial-objective",
  "tutorial-interact",
  "objective-combat-counter",
  "help-overlay",
  "mobile-interact",
]);
const MATRICES = Object.freeze([
  { id: "desktop-1280x720", width: 1280, height: 720 },
  { id: "mobile-412x915", width: 412, height: 915 },
  { id: "mobile-390x844", width: 390, height: 844 },
]);

class CaptureMatrixError extends Error {
  constructor(message, code = "CAPTURE_MATRIX_ERROR", details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || index + 1 >= argv.length) {
      throw new CaptureMatrixError(`invalid argument: ${key}`, "BAD_ARGUMENTS");
    }
    parsed[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function existingDirectory(value, label) {
  if (!value || !isAbsolute(value)) {
    throw new CaptureMatrixError(`${label} must be an absolute path`, "BAD_PATH");
  }
  const target = resolve(value);
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new CaptureMatrixError(`${label} does not exist or is not a directory`, "BAD_PATH");
  }
  return realpathSync(target);
}

function existingFile(value, label) {
  if (!value || !isAbsolute(value)) {
    throw new CaptureMatrixError(`${label} must be an absolute path`, "BAD_PATH");
  }
  const target = resolve(value);
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new CaptureMatrixError(`${label} does not exist or is not a file`, "BAD_PATH");
  }
  return realpathSync(target);
}

function emptyOutputRoot(value, dist) {
  if (!value || !isAbsolute(value)) {
    throw new CaptureMatrixError("--output must be an absolute path", "BAD_PATH");
  }
  const target = resolve(value);
  if (target === dist || target.startsWith(`${dist}\\`) || target.startsWith(`${dist}/`)) {
    throw new CaptureMatrixError("--output must not be inside the product dist", "BAD_PATH");
  }
  if (existsSync(target) && (!statSync(target).isDirectory() || readdirSync(target).length > 0)) {
    throw new CaptureMatrixError("--output must be absent or an empty directory", "STALE_OUTPUT");
  }
  mkdirSync(target, { recursive: true });
  return realpathSync(target);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function validateManifest(dist) {
  const path = join(dist, "capture-manifest.json");
  const manifest = readJson(existingFile(path, "dist/capture-manifest.json"));
  if (manifest.version !== 1 || manifest.requiresNativeWebGPU !== true
    || manifest.defaultSeed !== SEED || manifest.defaultTimeMs !== TIME_MS) {
    throw new CaptureMatrixError("capture manifest does not match the 06C contract", "MANIFEST_MISMATCH");
  }
  const missing = VIEWPOINTS.filter((viewpoint) => !manifest.viewpoints.includes(viewpoint));
  if (missing.length > 0) {
    throw new CaptureMatrixError("capture manifest is missing required viewpoints", "MANIFEST_MISMATCH", missing);
  }
  return { path, manifest };
}

function requestedViewpoints(value) {
  if (!value) return [...VIEWPOINTS];
  const selected = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (selected.length === 0 || new Set(selected).size !== selected.length
    || selected.some((viewpoint) => !VIEWPOINTS.includes(viewpoint))) {
    throw new CaptureMatrixError("--viewpoints must be a unique comma-separated subset", "BAD_VIEWPOINTS");
  }
  return selected;
}

function inspectRunReport(output, matrixId, tag, browser, browserSha256, expectedCaptures) {
  const report = readJson(join(output, matrixId, tag, "report.json"));
  const runtime = report.environment?.browser;
  const adapter = report.environment?.nativeWebGPU?.adapter;
  const browserMatches = runtime?.executablePath
    && realpathSync(runtime.executablePath) === browser
    && runtime.executableSha256 === browserSha256
    && runtime.requestedBackend === "native-webgpu";
  const diagnosticsPass = report.consoleErrors.length === 0
    && report.pageErrors.length === 0
    && report.blockedRequests.length === 0;
  const hardwarePass = report.environment?.nativeWebGPU?.ok === true
    && adapter?.isFallbackAdapter !== true;
  return {
    captures: report.captures.length,
    browserMatches,
    diagnosticsPass,
    hardwarePass,
    browser: runtime,
    adapter,
    pass: report.captures.length === expectedCaptures
      && browserMatches && diagnosticsPass && hardwarePass,
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const dist = existingDirectory(args.dist, "--dist");
  existingFile(join(dist, "index.html"), "dist/index.html");
  const browser = existingFile(args.browser, "--browser");
  const output = emptyOutputRoot(args.output, dist);
  const viewpoints = requestedViewpoints(args.viewpoints);
  const browserSha256 = sha256File(browser);
  const { path: manifestPath } = validateManifest(dist);
  process.env.DEVLAB_WEBGPU_BROWSER_PATH = browser;

  const results = [];
  for (const matrix of MATRICES) {
    const matrixOutput = join(output, matrix.id);
    const determinism = await runDeterminismFlow({
      fixtureRoot: dist,
      vendor: [],
      outputRoot: matrixOutput,
      seed: SEED,
      timeMs: TIME_MS,
      viewpoints,
      backend: "gpu",
      viewportWidth: matrix.width,
      viewportHeight: matrix.height,
      readyTimeoutMs: 30000,
      captureTimeoutMs: 30000,
      requireNativeWebGPU: true,
    });
    const runA = inspectRunReport(output, matrix.id, "run-a", browser, browserSha256, viewpoints.length);
    const runB = inspectRunReport(output, matrix.id, "run-b", browser, browserSha256, viewpoints.length);
    const exact = determinism.pngByteEquality === true
      && determinism.rgbaEquality === true
      && determinism.metricsNormalizedEquality === true
      && determinism.viewpointOrder === true
      && determinism.outputFileSetIdentical === true;
    results.push({ ...matrix, determinism, runA, runB, pass: exact && runA.pass && runB.pass });
  }

  const summary = {
    schemaVersion: 1,
    sessionId: "DEVLAB-ASH-RELAY-ONBOARDING-CLARITY-06C",
    status: results.every((result) => result.pass) ? "PASS" : "FAIL",
    inputs: {
      dist,
      output,
      browser,
      browserSha256,
      manifestSha256: sha256File(manifestPath),
      seed: SEED,
      timeMs: TIME_MS,
      viewpoints,
    },
    matrices: results,
  };
  writeJson(join(output, "summary.json"), summary);
  if (summary.status !== "PASS") {
    throw new CaptureMatrixError("one or more capture matrices failed", "MATRIX_FAILED", summary);
  }
  process.stdout.write(`PASS: ${results.length} matrices, ${viewpoints.length} viewpoints, two exact captures each\n`);
}

main().catch((error) => {
  const payload = {
    status: "FAIL",
    code: error.code || "UNEXPECTED_ERROR",
    message: error.message,
    details: error.details || null,
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});
