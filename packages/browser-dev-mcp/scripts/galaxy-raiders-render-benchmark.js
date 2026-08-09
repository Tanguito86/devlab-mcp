#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CaptureServer } from "./capture-harness/server.js";
import { launchCaptureBrowser } from "./capture-harness/browser-runtime.js";
import {
  attestHardwareCanvasGpu,
  classifyFrameBudget,
  createSyntheticBulletLoad,
  firstBudgetCrossing,
  FRAME_BUDGETS_MS,
  GALAXY_RENDER_LOADS,
  summarizeDurations,
  TIMER_QUANTIZATION_TOLERANCE_MS,
} from "./galaxy-raiders-render-benchmark-core.js";

const DEFAULT_SAMPLES = 900;
const DEFAULT_WARMUP = 180;

function usage() {
  return [
    "Usage:",
    "  node scripts/galaxy-raiders-render-benchmark.js --game-root <Galaxy www> [options]",
    "",
    "Options:",
    `  --samples <n>   Measured rAF intervals per load (default ${DEFAULT_SAMPLES})`,
    `  --warmup <n>    Warm-up frames per load (default ${DEFAULT_WARMUP})`,
    "  --out <file>    Also write the JSON report to this explicit path",
    "  --help          Show this help",
    "",
    "The fixed benchmark loads are 700, 1400 and 2000 enemy bullets.",
    "The browser is always headed: hidden/headless rAF is not accepted as evidence.",
  ].join("\n");
}

function parsePositiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 30 || parsed > 10000) {
    throw new Error(`${name} must be an integer between 30 and 10000`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = { samples: DEFAULT_SAMPLES, warmup: DEFAULT_WARMUP, gameRoot: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") return { ...options, help: true };
    if (arg === "--game-root") options.gameRoot = argv[++index];
    else if (arg === "--samples") options.samples = parsePositiveInt(argv[++index], "--samples");
    else if (arg === "--warmup") options.warmup = parsePositiveInt(argv[++index], "--warmup");
    else if (arg === "--out") options.out = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.gameRoot) throw new Error("--game-root is required");
  options.gameRoot = resolve(options.gameRoot);
  if (!isAbsolute(options.gameRoot) || !existsSync(options.gameRoot) || !statSync(options.gameRoot).isDirectory()) {
    throw new Error("--game-root must resolve to an existing directory");
  }
  const indexPath = resolve(options.gameRoot, "index.html");
  if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
    throw new Error("--game-root must contain index.html");
  }
  if (options.out) options.out = resolve(options.out);
  return options;
}

function tryExec(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

function sourceIdentity(gameRoot) {
  const indexPath = resolve(gameRoot, "index.html");
  return {
    root: gameRoot,
    indexSha256: createHash("sha256").update(readFileSync(indexPath)).digest("hex"),
    gitHead: tryExec("git", ["-C", gameRoot, "rev-parse", "HEAD"]),
    gitStatusPorcelain: tryExec("git", ["-C", gameRoot, "status", "--short"]),
  };
}

function hostIdentity() {
  const base = {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    cpu: os.cpus()[0]?.model || null,
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  };
  if (process.platform !== "win32") return base;
  const script = [
    "$os=Get-CimInstance Win32_OperatingSystem",
    "$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1",
    "$gpu=Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate,VideoProcessor",
    "[pscustomobject]@{OS=$os.Caption;OSVersion=$os.Version;CPU=$cpu.Name;Cores=$cpu.NumberOfCores;Logical=$cpu.NumberOfLogicalProcessors;RAMBytes=[int64]$os.TotalVisibleMemorySize*1024;Video=$gpu} | ConvertTo-Json -Depth 4 -Compress",
  ].join("; ");
  const details = tryExec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
  return { ...base, windows: details ? JSON.parse(details) : null };
}

async function prepareGalaxyPage(page, baseUrl) {
  await page.addInitScript(() => {
    try { localStorage.setItem("gr_onboarding_v1", "skipped"); } catch {}
  });
  await page.goto(baseUrl, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => (
    document.querySelector("canvas#game")
    && typeof window.Renderer?.draw === "function"
    && window.GameLoop
    && typeof window.__GR_MCP__?.getState === "function"
  ), null, { timeout: 15000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__GR_MCP__?.getState?.().gameState === "playing", null, { timeout: 15000 });
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(1000);
  return page.evaluate(() => {
    window.syncEncounterDirectorGlobals?.();
    window.GameLoop.stop();
    const canvas = document.querySelector("canvas#game");
    if (!canvas) throw new Error("Galaxy canvas#game disappeared");
    for (const key of ["enemies", "bullets", "particles", "powerUps", "mines", "satellites", "ufoRewards"]) {
      if (Array.isArray(window[key])) window[key].length = 0;
    }
    if (!Array.isArray(window.enemyBullets)) throw new Error("window.enemyBullets is unavailable");
    window.enemyBullets.length = 0;
    return {
      visibilityState: document.visibilityState,
      canvas: { width: canvas.width, height: canvas.height },
      mcpVersion: window.__GR_MCP__?.version || null,
      debugJumpType: typeof window.__GR_DEBUG_JUMP_TO_LEVEL,
      rendererType: typeof window.Renderer?.draw,
      gameLoopStopped: window.GameLoop.isRunning === false,
    };
  });
}

async function measureLoad(page, bulletCount, samples, warmup, canvas) {
  const bullets = createSyntheticBulletLoad(bulletCount, canvas.width, canvas.height);
  const raw = await page.evaluate(async ({ injectedBullets, sampleCount, warmupFrames }) => {
    if (document.visibilityState !== "visible") throw new Error("benchmark page is not visible");
    if (window.GameLoop?.isRunning) throw new Error("Galaxy GameLoop must be stopped for render isolation");
    if (!Array.isArray(window.enemyBullets)) throw new Error("window.enemyBullets is unavailable");
    window.enemyBullets.length = 0;
    window.enemyBullets.push(...injectedBullets);
    const exactBefore = window.enemyBullets.length;
    if (exactBefore !== injectedBullets.length) throw new Error("exact bullet load was not installed");

    const intervals = [];
    const renderDurations = [];
    let warm = 0;
    let previousTimestamp = null;

    await new Promise((resolveMeasure) => {
      function frame(timestamp) {
        if (warm < warmupFrames) {
          window.Renderer.draw();
          warm += 1;
          requestAnimationFrame(frame);
          return;
        }
        if (previousTimestamp !== null) intervals.push(timestamp - previousTimestamp);
        previousTimestamp = timestamp;
        const renderStart = performance.now();
        window.Renderer.draw();
        const renderDuration = performance.now() - renderStart;
        if (intervals.length > 0) renderDurations.push(renderDuration);
        if (intervals.length >= sampleCount) resolveMeasure();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    return {
      intervals,
      renderDurations: renderDurations.slice(0, sampleCount),
      exactBefore,
      exactAfter: window.enemyBullets.length,
      visibilityState: document.visibilityState,
    };
  }, { injectedBullets: bullets, sampleCount: samples, warmupFrames: warmup });

  if (raw.exactBefore !== bulletCount || raw.exactAfter !== bulletCount) {
    throw new Error(`bullet load drifted during measurement: ${raw.exactBefore} -> ${raw.exactAfter}`);
  }
  const raf = summarizeDurations(raw.intervals);
  const instrumentedRender = summarizeDurations(raw.renderDurations);
  return {
    bulletCount,
    exactCountBefore: raw.exactBefore,
    exactCountAfter: raw.exactAfter,
    visibilityState: raw.visibilityState,
    rafIntervalMs: raf,
    effectiveRefreshHzAtP50: 1000 / raf.p50,
    instrumentedRenderMs: instrumentedRender,
    budgets: {
      hz120: classifyFrameBudget(raf.p95, FRAME_BUDGETS_MS.hz120),
      hz60: classifyFrameBudget(raf.p95, FRAME_BUDGETS_MS.hz60),
    },
  };
}

export async function runBenchmark(options) {
  const server = new CaptureServer(options.gameRoot);
  let browser;
  try {
    await server.start();
    const launched = await launchCaptureBrowser({ backend: "gpu", headless: false });
    browser = launched.browser;
    const cdp = await browser.newBrowserCDPSession();
    const systemInfo = await cdp.send("SystemInfo.getInfo");
    const gpu = attestHardwareCanvasGpu(systemInfo);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.bringToFront();
    const pageContract = await prepareGalaxyPage(page, server.baseUrl);
    if (pageContract.visibilityState !== "visible" || !pageContract.gameLoopStopped) {
      throw new Error("headed visible render-isolation precondition failed");
    }

    const baseline = await measureLoad(page, 0, options.samples, options.warmup, pageContract.canvas);
    const results = [];
    for (const load of GALAXY_RENDER_LOADS) {
      results.push(await measureLoad(page, load, options.samples, options.warmup, pageContract.canvas));
    }

    const host = hostIdentity();
    const hostVideos = host.windows?.Video;
    const hostVideoList = Array.isArray(hostVideos) ? hostVideos : (hostVideos ? [hostVideos] : []);
    const activeRefreshRates = hostVideoList
      .map((video) => Number(video.CurrentRefreshRate))
      .filter((value) => Number.isFinite(value) && value > 0);
    const maxHostRefreshHz = activeRefreshRates.length ? Math.max(...activeRefreshRates) : null;
    const baselineQualification = {
      hz120: maxHostRefreshHz !== null && maxHostRefreshHz >= 120 && baseline.budgets.hz120.pass,
      hz60: maxHostRefreshHz !== null && maxHostRefreshHz >= 60 && baseline.budgets.hz60.pass,
    };

    return {
      schemaVersion: 1,
      benchmark: "DEVLAB-GALAXY-RAIDERS-CANVAS2D-RENDER",
      generatedAt: new Date().toISOString(),
      methodology: {
        primary: "successive requestAnimationFrame callback timestamp intervals around isolated full Galaxy Renderer.draw frames",
        secondary: "performance.now duration around Renderer.draw; Canvas2D command submission only, not treated as end-to-end render time",
        headed: true,
        gameLoopIsolated: true,
        warmupFramesPerLoad: options.warmup,
        measuredIntervalsPerLoad: options.samples,
        fixedBulletLoads: GALAXY_RENDER_LOADS,
        bulletFixture: {
          kind: "basic",
          color: "#ff5050",
          sourceType: "alien1",
          dimensions: { width: 4, height: 8 },
          velocity: { x: 0, y: 0 },
          placement: "deterministic tiled positions inside the 360x640 canvas",
        },
        timerQuantizationToleranceMs: TIMER_QUANTIZATION_TOLERANCE_MS,
        frameBudgetsMs: FRAME_BUDGETS_MS,
      },
      source: sourceIdentity(options.gameRoot),
      host,
      browser: launched.metadata,
      gpu,
      pageContract,
      baseline,
      baselineQualification,
      results,
      firstBudgetCrossing: {
        hz120: baselineQualification.hz120 ? firstBudgetCrossing(results, "hz120") : "BASELINE_NOT_QUALIFIED",
        hz60: baselineQualification.hz60 ? firstBudgetCrossing(results, "hz60") : "BASELINE_NOT_QUALIFIED",
      },
    };
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const report = await runBenchmark(options);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (options.out) writeFileSync(options.out, json, { encoding: "utf8", flag: "wx" });
    process.stdout.write(json);
  } catch (error) {
    console.error(`Galaxy render benchmark failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
