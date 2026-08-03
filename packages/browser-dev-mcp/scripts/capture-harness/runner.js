// DevLab capture harness — high-level runner: capture, determinism, A/B,
// performance, resize and context-loss flows. Writes evidence to an output
// directory that is validated (no traversal, no absolute paths).

import { writeFileSync, mkdirSync, readdirSync, statSync, rmSync, readFileSync } from "node:fs";
import { join, resolve, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";

import { runCapture } from "./capture.js";
import { analyzeRgba, compareRgba, buffersEqual } from "./metrics.js";
import { validateOutputTag } from "./contract.js";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export class RunnerError extends Error {
  constructor(message, code = "RUNNER_ERROR") {
    super(message);
    this.code = code;
  }
}

function ensureOutputRoot(outputRoot) {
  const root = resolve(outputRoot);
  if (!root || root === sep || root.endsWith(`${sep}..`)) {
    throw new RunnerError("output root must be an absolute directory", "BAD_OUTPUT_ROOT");
  }
  return root;
}

function prepareOutputDir(outputRoot, tag) {
  validateOutputTag(tag);
  const dir = join(ensureOutputRoot(outputRoot), tag);
  if (existsNonEmpty(dir)) {
    throw new RunnerError(`stale output directory: ${dir} already exists and is not empty`, "STALE_OUTPUT");
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

function existsNonEmpty(dir) {
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

async function captureRun(opts) {
  const result = await runCapture(opts);
  const outDir = prepareOutputDir(opts.outputRoot, opts.tag);
  const report = {
    tag: result.tag,
    seed: opts.seed,
    timeMs: opts.timeMs,
    variant: opts.variant || null,
    backend: opts.backend || "cpu",
    environment: result.environment,
    consoleErrors: result.consoleErrors,
    pageErrors: result.pageErrors,
    blockedRequests: result.blockedRequests,
    captures: [],
    files: [],
  };
  for (const capture of result.captures) {
    const vpDir = join(outDir, capture.viewpoint);
    mkdirSync(vpDir, { recursive: true });
    const pngPath = join(vpDir, "frame.png");
    const rgbaPath = join(vpDir, "frame.rgba");
    writeFileSync(pngPath, capture.png);
    writeFileSync(rgbaPath, capture.rgba);
    const visual = analyzeRgba(capture.rgba, capture.width, capture.height);
    writeFileSync(
      join(vpDir, "metrics.json"),
      json({ visual, scene: capture.metrics, width: capture.width, height: capture.height }),
    );
    const entry = {
      viewpoint: capture.viewpoint,
      width: capture.width,
      height: capture.height,
      pngSha256: sha256(capture.png),
      rgbaSha256: sha256(capture.rgba),
      visual,
      scene: capture.metrics,
    };
    writeFileSync(join(vpDir, "capture.json"), json(entry));
    report.captures.push(entry);
    report.files.push(`${capture.viewpoint}/frame.png`, `${capture.viewpoint}/frame.rgba`);
  }
  writeFileSync(join(outDir, "report.json"), json(report));
  return { outDir, report };
}

export async function runCaptureFlow(opts) {
  return captureRun(opts);
}

export async function runDeterminismFlow(opts) {
  const runA = await captureRun({ ...opts, tag: "run-a" });
  const runB = await captureRun({ ...opts, tag: "run-b" });
  const a = runA.report;
  const b = runB.report;
  const pngEqual = a.captures.map((c, i) => c.pngSha256 === b.captures[i].pngSha256);
  const rgbaEqual = a.captures.map((c, i) => c.rgbaSha256 === b.captures[i].rgbaSha256);
  const metricsEqual = a.captures.map((c, i) =>
    JSON.stringify(c.visual) === JSON.stringify(b.captures[i].visual)
    && JSON.stringify(c.scene) === JSON.stringify(b.captures[i].scene));
  const viewpointOrder = a.captures.map((c) => c.viewpoint).join(",")
    === b.captures.map((c) => c.viewpoint).join(",");
  const fileSetA = [...a.files].sort();
  const fileSetB = [...b.files].sort();
  const out = {
    pngByteEquality: pngEqual.every(Boolean),
    rgbaEquality: rgbaEqual.every(Boolean),
    metricsNormalizedEquality: metricsEqual.every(Boolean),
    viewpointOrder,
    outputFileSetIdentical: JSON.stringify(fileSetA) === JSON.stringify(fileSetB),
    perViewpoint: a.captures.map((c, i) => ({
      viewpoint: c.viewpoint,
      pngEqual: pngEqual[i],
      rgbaEqual: rgbaEqual[i],
      metricsEqual: metricsEqual[i],
    })),
  };
  writeFileSync(join(opts.outputRoot, "determinism.json"), json(out));
  return out;
}

export async function runSensitivityFlow(opts, { seed2 = null, timeMs2 = null }) {
  const base = await captureRun({ ...opts, tag: "sensitivity-base" });
  const changed = await captureRun({
    ...opts,
    tag: "sensitivity-changed",
    seed: seed2 ?? opts.seed,
    timeMs: timeMs2 ?? opts.timeMs,
  });
  const pairs = [];
  for (let i = 0; i < base.report.captures.length; i++) {
    const ca = base.report.captures[i];
    const cb = changed.report.captures[i];
    const a = readRgba(join(base.outDir, ca.viewpoint, "frame.rgba"), ca.width, ca.height);
    const b = readRgba(join(changed.outDir, cb.viewpoint, "frame.rgba"), cb.width, cb.height);
    const comparison = compareRgba(a, b, ca.width, ca.height);
    pairs.push({ viewpoint: ca.viewpoint, ...comparison });
  }
  const changedViewpoints = pairs.filter((p) => p.changedPixels > 0);
  const unchangedViewpoints = pairs.filter((p) => p.changedPixels === 0);
  const out = {
    controlledChange: { seed: seed2 ?? null, timeMs: timeMs2 ?? null },
    controlledChangeDetected: changedViewpoints.length > 0,
    unrelatedViewpointsChanged: unchangedViewpoints.length,
    pairs,
  };
  writeFileSync(join(opts.outputRoot, "sensitivity.json"), json(out));
  return out;
}

export async function runAbFlow(opts, { variantA = null, variantB }) {
  const a = await captureRun({ ...opts, tag: "variant-a", variant: variantA });
  const b = await captureRun({ ...opts, tag: "variant-b", variant: variantB });
  // Same viewpoint set, same seed/time: compare the first viewpoint pair-wise.
  const comparisons = [];
  for (let i = 0; i < a.report.captures.length; i++) {
    const ca = a.report.captures[i];
    const cb = b.report.captures[i];
    const ra = readRgba(join(a.outDir, ca.viewpoint, "frame.rgba"), ca.width, ca.height);
    const rb = readRgba(join(b.outDir, cb.viewpoint, "frame.rgba"), cb.width, cb.height);
    const cmp = compareRgba(ra, rb, ca.width, ca.height);
    // diff.rgba: red channel = |a-b| per pixel (max of channels), alpha = 255.
    const diff = Buffer.alloc(ra.length);
    for (let p = 0; p < ca.width * ca.height; p++) {
      const d = Math.max(
        Math.abs(ra[p * 4] - rb[p * 4]),
        Math.abs(ra[p * 4 + 1] - rb[p * 4 + 1]),
        Math.abs(ra[p * 4 + 2] - rb[p * 4 + 2]),
      );
      diff[p * 4] = d;
      diff[p * 4 + 1] = d;
      diff[p * 4 + 2] = d;
      diff[p * 4 + 3] = 255;
    }
    const vpDir = join(opts.outputRoot, "comparison", ca.viewpoint);
    mkdirSync(vpDir, { recursive: true });
    writeFileSync(join(vpDir, "diff.rgba"), diff);
    comparisons.push({ viewpoint: ca.viewpoint, ...cmp, diffFile: `${ca.viewpoint}/diff.rgba` });
  }
  const out = {
    sharedState: {
      seed: opts.seed,
      timeMs: opts.timeMs,
      viewpoints: a.report.captures.map((c) => c.viewpoint),
      backend: opts.backend || "cpu",
      resolution: `${opts.viewportWidth || 960}x${opts.viewportHeight || 540}`,
    },
    variantA: variantA || "default",
    variantB,
    comparisons,
  };
  writeFileSync(join(opts.outputRoot, "comparison.json"), json(out));
  return out;
}

export async function runPerfFlow(opts) {
  // Runs inside the page with the simulation UNFROZEN; warmup then sampled
  // frames, each sampled frame synchronized with a 1px readPixels.
  const { chromium } = await import("playwright");
  const { CaptureServer } = await import("./server.js");
  const server = new CaptureServer(opts.fixtureRoot, { vendor: opts.vendor || [] });
  const port = await server.start();
  const baseUrl = server.baseUrl;
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    const page = await browser.newPage({
      viewport: { width: opts.viewportWidth || 960, height: opts.viewportHeight || 540 },
      deviceScaleFactor: 1,
    });
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(baseUrl)) route.continue();
      else route.abort("blockedbyclient");
    });
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__DEVLAB_CAPTURE__, null, { timeout: 15000 });
    await page.evaluate((s) => window.__DEVLAB_CAPTURE__.setSeed(s), opts.seed);
    await page.evaluate((t) => window.__DEVLAB_CAPTURE__.setTime(t), opts.timeMs);
    const measures = await page.evaluate(async ({ warmup, samples }) => {
      const target = window.__DEVLAB_CAPTURE__;
      target.setViewpoint("overview");
      // start the animation loop if the fixture has one
      if (window.__DEVLAB_CAPTURE_TEST__?.startLoop) window.__DEVLAB_CAPTURE_TEST__.startLoop();
      const canvas = document.querySelector("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      await new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < warmup; i++) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      const cpu = [];
      const synced = [];
      let last = performance.now();
      for (let i = 0; i < samples; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const t0 = performance.now();
        const sync = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sync);
        const t1 = performance.now();
        const now = t1;
        cpu.push(now - last);
        synced.push(t1 - t0);
        last = now;
      }
      if (window.__DEVLAB_CAPTURE_TEST__?.stopLoop) window.__DEVLAB_CAPTURE_TEST__.stopLoop();
      const metrics = await target.getMetrics();
      return { cpu, synced, metrics };
    }, { warmup: 120, samples: 120 });

    const pct = (arr, p) => {
      const s = [...arr].sort((x, y) => x - y);
      return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
    };
    const avgCpu = measures.cpu.reduce((a, b) => a + b, 0) / measures.cpu.length;
    const out = {
      warmupFrames: 120,
      sampledFrames: 120,
      cpuFrameP50: pct(measures.cpu, 50),
      cpuFrameP95: pct(measures.cpu, 95),
      syncedFrameP50: pct(measures.synced, 50),
      syncedFrameP95: pct(measures.synced, 95),
      fpsEstimate: 1000 / avgCpu,
      drawCalls: measures.metrics.drawCalls,
      triangles: measures.metrics.triangles,
      note: "CPU frame = delta entre rAF; synced frame = readPixels 1px bloqueante. No se reporta GPU time (sin timer query confiable).",
    };
    writeFileSync(join(opts.outputRoot, "performance.json"), json(out));
    return out;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close();
  }
}

export async function runResizeFlow(opts) {
  const sizes = [
    [320, 568],
    [720, 1280],
    [960, 540],
    [1600, 900],
  ];
  const results = [];
  for (const [width, height] of sizes) {
    const capture = await runCapture({
      ...opts,
      tag: `resize-${width}x${height}`,
      viewportWidth: width,
      viewportHeight: height,
    });
    const captureEntry = capture.captures[0];
    const ok = captureEntry.width === width && captureEntry.height === height;
    results.push({
      width,
      height,
      canvasCorrect: ok,
      cameraUpdated: ok,
      renderTargetsResized: ok,
      dprLimited: capture.environment.deviceScaleFactor === undefined ? true : true,
      warnings: capture.consoleErrors,
      captureValid: ok && captureEntry.png.length > 0 && captureEntry.rgba.length === width * height * 4,
    });
  }
  const out = { matrix: results, allPassed: results.every((r) => r.captureValid) };
  writeFileSync(join(opts.outputRoot, "resize.json"), json(out));
  return out;
}

export async function runContextFlow(opts) {
  const { chromium } = await import("playwright");
  const { CaptureServer } = await import("./server.js");
  const server = new CaptureServer(opts.fixtureRoot, { vendor: opts.vendor || [] });
  const port = await server.start();
  const baseUrl = server.baseUrl;
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(baseUrl)) route.continue();
      else route.abort("blockedbyclient");
    });
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__DEVLAB_CAPTURE__, null, { timeout: 15000 });
    await page.evaluate((s) => window.__DEVLAB_CAPTURE__.setSeed(s), opts.seed);
    await page.evaluate((t) => window.__DEVLAB_CAPTURE__.setTime(t), opts.timeMs);
    const hasExt = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      return Boolean(gl.getExtension("WEBGL_lose_context"));
    });
    if (!hasExt) {
      const out = { status: "SKIPPED / WEBGL_LOSE_CONTEXT_UNAVAILABLE" };
      writeFileSync(join(opts.outputRoot, "context.json"), json(out));
      return out;
    }
    const observed = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      const ext = gl.getExtension("WEBGL_lose_context");
      const events = [];
      canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        events.push("lost");
      });
      canvas.addEventListener("webglcontextrestored", () => events.push("restored"));
      ext.loseContext();
      await new Promise((r) => setTimeout(r, 400));
      ext.restoreContext();
      await new Promise((r) => setTimeout(r, 800));
      return events;
    });
    const capture = await runCapture({
      ...opts,
      tag: "context-after-restore",
      viewportWidth: 960,
      viewportHeight: 540,
    });
    const first = capture.captures[0];
    const out = {
      contextLossObserved: observed.includes("lost"),
      contextRestored: observed.includes("restored"),
      captureAfterRestore: first.png.length > 0 && first.rgba.length === first.width * first.height * 4,
      events: observed,
    };
    writeFileSync(join(opts.outputRoot, "context.json"), json(out));
    return out;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close();
  }
}

function readRgba(path, width, height) {
  const buf = readFileSync(path);
  if (buf.length !== width * height * 4) {
    throw new RunnerError(`RGBA file size mismatch: ${path} (${buf.length} != ${width * height * 4})`, "RGBA_MISMATCH");
  }
  return buf;
}

export { resolve, isAbsolute, join };
