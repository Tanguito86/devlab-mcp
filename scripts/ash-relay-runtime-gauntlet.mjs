#!/usr/bin/env node

/**
 * ASH RELAY native-WebGPU runtime gauntlet.
 *
 * Usage:
 *   node scripts/ash-relay-runtime-gauntlet.mjs \
 *     --dist <absolute-built-fixture-root> \
 *     --output <absolute-empty-evidence-root> \
 *     --browser <absolute-contractual-chromium-executable>
 *
 * This runner deliberately uses the DevLab capture server, native-WebGPU
 * browser launcher, native adapter probe, and local-only request routing. It
 * never installs dependencies and never permits a page request off the
 * ephemeral loopback origin.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  parse as parsePath,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

import {
  installLocalOnlyRouting,
} from "../packages/browser-dev-mcp/scripts/capture-harness/capture.js";
import {
  launchCaptureBrowser,
  probeNativeWebGpu,
} from "../packages/browser-dev-mcp/scripts/capture-harness/browser-runtime.js";
import {
  runResourceStabilityFlow,
  runSensitivityFlow,
} from "../packages/browser-dev-mcp/scripts/capture-harness/runner.js";
import {
  CaptureServer,
} from "../packages/browser-dev-mcp/scripts/capture-harness/server.js";

const SCHEMA_VERSION = 1;
const SESSION_ID = "DEVLAB-ASH-RELAY-PILOT-05";
const SEED = 424242;
const CHANGED_SEED = 424243;
const CAPTURE_TIME_MS = 2500;
const DESKTOP_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 844 });
const PERFORMANCE_WARMUP_FRAMES = 30;
const PERFORMANCE_SAMPLE_FRAMES = 120;
const LIFECYCLE_CYCLES = 10;
const INPUT_RESPONSE_TIMEOUT_MS = 3000;
const PAGE_READY_TIMEOUT_MS = 30000;
let preparedFailureRoot = null;

const SEED_AFFECTED_VIEWPOINTS = Object.freeze([
  "encounter-1",
  "encounter-2",
  "defeat",
  "victory",
  "mobile-active",
]);

const PERFORMANCE_STATES = Object.freeze([
  {
    id: "idle",
    viewpoint: "title",
    viewport: DESKTOP_VIEWPORT,
    inputKind: "primary",
    stressTicks: 0,
  },
  {
    id: "encounter-1",
    viewpoint: "encounter-1",
    viewport: DESKTOP_VIEWPORT,
    inputKind: "attack",
    stressTicks: 0,
  },
  {
    id: "encounter-2",
    viewpoint: "encounter-2",
    viewport: DESKTOP_VIEWPORT,
    inputKind: "attack",
    stressTicks: 0,
  },
  {
    id: "boss",
    viewpoint: "boss-phase-2",
    viewport: DESKTOP_VIEWPORT,
    inputKind: "attack",
    stressTicks: 0,
  },
  {
    id: "stress",
    viewpoint: "boss-phase-2",
    viewport: DESKTOP_VIEWPORT,
    inputKind: "attack",
    stressTicks: 180,
  },
  {
    id: "mobile",
    viewpoint: "mobile-active",
    viewport: MOBILE_VIEWPORT,
    inputKind: "touch-attack",
    stressTicks: 0,
  },
]);

class GauntletError extends Error {
  constructor(message, code = "GAUNTLET_ERROR", details = null) {
    super(message);
    this.name = "GauntletError";
    this.code = code;
    this.details = details;
  }
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJson(outputRoot, filename, value) {
  writeFileSync(join(outputRoot, filename), json(value), { encoding: "utf8", flag: "wx" });
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function nearestRank(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[index];
}

function distribution(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return {
      samples: 0,
      minimum: null,
      mean: null,
      p50: null,
      p95: null,
      p99: null,
      maximum: null,
    };
  }
  return {
    samples: finite.length,
    minimum: round(Math.min(...finite)),
    mean: round(finite.reduce((sum, value) => sum + value, 0) / finite.length),
    p50: round(nearestRank(finite, 0.50)),
    p95: round(nearestRank(finite, 0.95)),
    p99: round(nearestRank(finite, 0.99)),
    maximum: round(Math.max(...finite)),
  };
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertNoSymlinkAncestors(path, label) {
  const absolute = resolve(path);
  const root = parsePath(absolute).root;
  const tail = absolute.slice(root.length).split(sep).filter(Boolean);
  let cursor = root;
  for (const segment of tail) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) break;
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      throw new GauntletError(`${label} contains a symbolic-link or junction segment: ${cursor}`, "UNSAFE_PATH");
    }
  }
}

function existingRegularFile(path, label) {
  if (!isAbsolute(path)) {
    throw new GauntletError(`${label} must be absolute`, "RELATIVE_PATH_REJECTED");
  }
  assertNoSymlinkAncestors(path, label);
  if (!existsSync(path)) throw new GauntletError(`${label} does not exist: ${path}`, "PATH_NOT_FOUND");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new GauntletError(`${label} must be a regular non-link file`, "UNSAFE_FILE");
  }
  return realpathSync(path);
}

function existingDirectory(path, label) {
  if (!isAbsolute(path)) {
    throw new GauntletError(`${label} must be absolute`, "RELATIVE_PATH_REJECTED");
  }
  assertNoSymlinkAncestors(path, label);
  if (!existsSync(path)) throw new GauntletError(`${label} does not exist: ${path}`, "PATH_NOT_FOUND");
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new GauntletError(`${label} must be a regular non-link directory`, "UNSAFE_DIRECTORY");
  }
  return realpathSync(path);
}

function isContained(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function prepareOutputRoot(path, distRoot) {
  if (!isAbsolute(path)) {
    throw new GauntletError("--output must be absolute", "RELATIVE_PATH_REJECTED");
  }
  const outputRoot = resolve(path);
  const filesystemRoot = parsePath(outputRoot).root;
  if (outputRoot === filesystemRoot) {
    throw new GauntletError("--output cannot be a filesystem root", "UNSAFE_OUTPUT_ROOT");
  }
  assertNoSymlinkAncestors(dirname(outputRoot), "output parent");
  if (outputRoot === distRoot || isContained(distRoot, outputRoot) || isContained(outputRoot, distRoot)) {
    throw new GauntletError("--output and --dist must not contain one another", "OVERLAPPING_ROOTS");
  }
  if (existsSync(outputRoot)) {
    const stat = lstatSync(outputRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new GauntletError("--output must be a non-link directory", "UNSAFE_OUTPUT_ROOT");
    }
    if (readdirSync(outputRoot).length > 0) {
      throw new GauntletError("--output must not already contain evidence", "STALE_OUTPUT");
    }
  } else {
    mkdirSync(outputRoot, { recursive: true });
  }
  return realpathSync(outputRoot);
}

function hashTree(root) {
  const files = [];
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new GauntletError(`dist contains a symbolic link or junction: ${relativePath}`, "UNSAFE_DIST_TREE");
      }
      if (entry.isDirectory()) visit(absolute, relativePath);
      else if (entry.isFile()) files.push({ path: relativePath, bytes: stat.size, sha256: sha256File(absolute) });
      else throw new GauntletError(`dist contains a non-regular entry: ${relativePath}`, "UNSAFE_DIST_TREE");
    }
  };
  visit(root);
  if (files.length === 0) throw new GauntletError("dist tree is empty", "EMPTY_DIST");
  const digest = createHash("sha256");
  for (const file of files) digest.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`);
  return { sha256: digest.digest("hex"), files };
}

function parseArguments(argv) {
  const values = new Map();
  const allowed = new Set(["--dist", "--output", "--browser"]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || typeof value !== "string" || value.startsWith("--")) {
      throw new GauntletError(
        "usage: ash-relay-runtime-gauntlet.mjs --dist <absolute> --output <absolute-empty> --browser <absolute>",
        "BAD_ARGUMENTS",
      );
    }
    if (values.has(key)) throw new GauntletError(`duplicate argument: ${key}`, "DUPLICATE_ARGUMENT");
    values.set(key, value);
  }
  if (argv.length !== 6 || [...allowed].some((key) => !values.has(key))) {
    throw new GauntletError(
      "usage: ash-relay-runtime-gauntlet.mjs --dist <absolute> --output <absolute-empty> --browser <absolute>",
      "BAD_ARGUMENTS",
    );
  }
  return {
    dist: values.get("--dist"),
    output: values.get("--output"),
    browser: values.get("--browser"),
  };
}

function samePath(left, right) {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function assertHardwareMetrics(metrics, label) {
  if (!metrics || metrics.rendererBackend !== "webgpu") {
    throw new GauntletError(`${label}: renderer is not native WebGPU`, "NON_WEBGPU_RENDERER", metrics);
  }
  if (metrics.adapter?.isFallbackAdapter === true || metrics.adapter?.softwareRenderer === true) {
    throw new GauntletError(`${label}: software/fallback adapter rejected`, "SOFTWARE_ADAPTER_REJECTED", metrics.adapter);
  }
  if (metrics.canvasCount !== 1 || metrics.activeLoopCount > 1) {
    throw new GauntletError(`${label}: duplicate canvas or animation loop`, "DUPLICATE_RUNTIME", metrics);
  }
}

function selectedMetrics(metrics) {
  return {
    drawCalls: metrics.drawCalls,
    triangles: metrics.triangles,
    geometries: metrics.geometries,
    textures: metrics.textures,
    programs: metrics.programs,
    viewpointApplied: metrics.viewpointApplied,
    phase: metrics.phase,
    health: metrics.health,
    checkpointAvailable: metrics.checkpointAvailable,
    activeEnemies: metrics.activeEnemies,
    deterministicStateHash: metrics.deterministicStateHash,
    canvasCount: metrics.canvasCount,
    activeLoopCount: metrics.activeLoopCount,
    paused: metrics.paused,
    frozen: metrics.frozen,
    rendererBackend: metrics.rendererBackend,
    inputListenerCount: metrics.inputListenerCount,
    audioVoiceCount: metrics.audioVoiceCount,
    audioState: metrics.audioState,
    rendererGeneration: metrics.rendererGeneration,
    adapter: metrics.adapter,
    pools: metrics.pools,
    resize: metrics.resize,
  };
}

function resourceDelta(before, after) {
  return Object.fromEntries(["geometries", "textures", "programs"].map((key) => [
    key,
    Number(after[key] || 0) - Number(before[key] || 0),
  ]));
}

function heapDelta(before, after) {
  if (!before || !after || before.usedJSHeapSize === null || after.usedJSHeapSize === null) return null;
  return after.usedJSHeapSize - before.usedJSHeapSize;
}

async function installDiagnostics(page, baseUrl, distRoot) {
  const record = {
    blockedRequests: [],
    consoleErrors: [],
    pageErrors: [],
  };
  await installLocalOnlyRouting(page, {
    baseUrl,
    fixtureRoot: distRoot,
    blocked: record.blockedRequests,
  });
  page.on("console", (message) => {
    if (message.type() === "error") record.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => record.pageErrors.push(String(error)));
  return record;
}

function assertNoPageFailures(record, label) {
  if (record.blockedRequests.length > 0) {
    throw new GauntletError(`${label}: non-loopback request blocked`, "EXTERNAL_REQUEST_BLOCKED", record);
  }
  if (record.consoleErrors.length > 0 || record.pageErrors.length > 0) {
    throw new GauntletError(`${label}: page runtime error`, "PAGE_RUNTIME_ERROR", record);
  }
}

async function waitForGameReady(page, baseUrl, { probe = false } = {}) {
  await page.waitForFunction(() => Boolean(
    window.__DEVLAB_CAPTURE__
      && window.__DEVLAB_CAPTURE_TEST__
      && window.__ASH_RELAY_TEST__,
  ), null, { timeout: PAGE_READY_TIMEOUT_MS });
  const surface = await page.evaluate(() => {
    const capture = window.__DEVLAB_CAPTURE__;
    const captureTest = window.__DEVLAB_CAPTURE_TEST__;
    const gameTest = window.__ASH_RELAY_TEST__;
    const captureMethods = [
      "ready", "setSeed", "setTime", "setViewpoint", "renderOnce", "getMetrics",
      "pause", "resume", "setFrozen", "shutdown",
    ];
    const captureTestMethods = [
      "destroyDevice", "lostObserved", "recoveryCount", "recoveryInProgress", "startLoop", "stopLoop",
    ];
    const gameTestMethods = [
      "snapshot", "diagnostics", "runAutopilot", "stepTicks", "restart", "restoreCheckpoint",
    ];
    return {
      version: capture?.version,
      missingCaptureMethods: captureMethods.filter((name) => typeof capture?.[name] !== "function"),
      missingCaptureTestMethods: captureTestMethods.filter((name) => typeof captureTest?.[name] !== "function"),
      missingGameTestMethods: gameTestMethods.filter((name) => typeof gameTest?.[name] !== "function"),
      sessionId: captureTest?.sessionId || null,
    };
  });
  if (surface.version !== 1
    || surface.sessionId !== SESSION_ID
    || surface.missingCaptureMethods.length > 0
    || surface.missingCaptureTestMethods.length > 0
    || surface.missingGameTestMethods.length > 0) {
    throw new GauntletError("ASH RELAY test/capture surface mismatch", "HOOK_CONTRACT_MISMATCH", surface);
  }
  await page.evaluate(() => window.__DEVLAB_CAPTURE__.ready());
  const nativeWebGPU = probe ? await probeNativeWebGpu(page, baseUrl) : null;
  const metrics = await page.evaluate(() => window.__DEVLAB_CAPTURE__.getMetrics());
  assertHardwareMetrics(metrics, "game ready");
  return { surface, metrics, nativeWebGPU };
}

async function openPage(browser, server, distRoot, {
  viewport,
  hasTouch = false,
  isMobile = false,
} = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch,
    isMobile,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const diagnostics = await installDiagnostics(page, server.baseUrl, distRoot);
  const response = await page.goto(`${server.baseUrl}/`, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_READY_TIMEOUT_MS,
  });
  if (!response || !response.ok()) {
    await context.close().catch(() => {});
    throw new GauntletError(`game document failed to load: ${response?.status() ?? "no response"}`, "PAGE_LOAD_FAILED");
  }
  const ready = await waitForGameReady(page, server.baseUrl, { probe: true });
  assertNoPageFailures(diagnostics, "page initialization");
  return { context, page, diagnostics, ready };
}

async function waitForPhase(page, phase, timeout = INPUT_RESPONSE_TIMEOUT_MS) {
  await page.waitForFunction(
    (expected) => window.__ASH_RELAY_TEST__?.snapshot()?.phase === expected,
    phase,
    { timeout },
  );
}

async function waitForPausedState(page, expected, timeout = INPUT_RESPONSE_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const paused = await page.evaluate(async () => {
      const metrics = await window.__DEVLAB_CAPTURE__?.getMetrics();
      return metrics?.paused === true;
    });
    if (paused === expected) return;
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 16));
  }
  throw new GauntletError(
    `pause state did not become ${expected ? "paused" : "resumed"} within ${timeout}ms`,
    "PAUSE_STATE_TIMEOUT",
  );
}

async function runtimeSnapshot(page) {
  return page.evaluate(async () => {
    const performanceMemory = performance.memory;
    const metrics = await window.__DEVLAB_CAPTURE__.getMetrics();
    return {
      metrics,
      snapshot: window.__ASH_RELAY_TEST__.snapshot(),
      diagnostics: window.__ASH_RELAY_TEST__.diagnostics(),
      heap: performanceMemory ? {
        usedJSHeapSize: Number(performanceMemory.usedJSHeapSize),
        totalJSHeapSize: Number(performanceMemory.totalJSHeapSize),
        jsHeapSizeLimit: Number(performanceMemory.jsHeapSizeLimit),
      } : {
        usedJSHeapSize: null,
        totalJSHeapSize: null,
        jsHeapSizeLimit: null,
      },
    };
  });
}

function playerDistance(before, after) {
  const dx = Number(after?.position?.x || 0) - Number(before?.position?.x || 0);
  const dz = Number(after?.position?.z || 0) - Number(before?.position?.z || 0);
  return Math.hypot(dx, dz);
}

function screenProjection(direction, portrait) {
  const offsetX = portrait ? 10.5 : 14.5;
  const offsetZ = portrait ? -18.5 : -14.7;
  const length = Math.hypot(offsetX, offsetZ);
  const forward = { x: -offsetX / length, z: -offsetZ / length };
  const right = { x: -forward.z, z: forward.x };
  return {
    right: Number(direction.x) * right.x + Number(direction.z) * right.z,
    up: Number(direction.x) * forward.x + Number(direction.z) * forward.z,
  };
}

function directionBetween(before, after) {
  return {
    x: Number(after.x) - Number(before.x),
    z: Number(after.z) - Number(before.z),
  };
}

function projectileAlignment(projectile, facing) {
  if (!projectile) return null;
  const velocityLength = Math.hypot(projectile.velocity.x, projectile.velocity.z);
  const facingLength = Math.hypot(facing.x, facing.z);
  if (velocityLength < 0.0001 || facingLength < 0.0001) return null;
  return (projectile.velocity.x * facing.x + projectile.velocity.z * facing.z)
    / (velocityLength * facingLength);
}

async function runDesktopControls(browser, server, distRoot) {
  const opened = await openPage(browser, server, distRoot, { viewport: DESKTOP_VIEWPORT });
  const { context, page, diagnostics, ready } = opened;
  try {
    await page.evaluate(async () => {
      await window.__DEVLAB_CAPTURE__.setSeed(424242);
      window.__DEVLAB_CAPTURE__.resume();
    });
    await page.keyboard.press("Enter");
    await waitForPhase(page, "tutorial");

    const before = await runtimeSnapshot(page);
    const canvas = await page.locator("#scene").boundingBox();
    if (!canvas) throw new GauntletError("desktop canvas has no layout box", "CONTROL_SURFACE_MISSING");
    await page.mouse.move(canvas.x + canvas.width * 0.78, canvas.y + canvas.height * 0.28);

    await page.keyboard.down("w");
    await page.waitForFunction(
      ({ x, z }) => {
        const player = window.__ASH_RELAY_TEST__?.snapshot()?.player?.position;
        return player && Math.hypot(player.x - x, player.z - z) > 0.15;
      },
      { x: before.snapshot.player.position.x, z: before.snapshot.player.position.z },
      { timeout: INPUT_RESPONSE_TIMEOUT_MS },
    );
    await page.keyboard.up("w");

    const afterMovement = await runtimeSnapshot(page);
    const movementScreen = screenProjection(directionBetween(
      before.snapshot.player.position,
      afterMovement.snapshot.player.position,
    ), false);

    const beforeShot = await runtimeSnapshot(page);
    const existingProjectileIds = new Set(beforeShot.snapshot.projectiles.map((projectile) => projectile.id));
    const shotsBefore = Number(beforeShot.diagnostics.shotsFired);
    const attackStartedAt = performance.now();
    await page.mouse.down({ button: "left" });
    await page.waitForFunction(
      (baseline) => Number(window.__ASH_RELAY_TEST__?.diagnostics()?.shotsFired || 0) > baseline,
      shotsBefore,
      { timeout: INPUT_RESPONSE_TIMEOUT_MS },
    );
    const mouseAttackLatencyApproxMs = round(performance.now() - attackStartedAt);
    await page.mouse.up({ button: "left" });
    const afterShot = await runtimeSnapshot(page);
    const firedProjectile = afterShot.snapshot.projectiles.find((projectile) =>
      projectile.owner === "player" && !existingProjectileIds.has(projectile.id));
    const aimScreen = screenProjection(afterShot.snapshot.player.facing, false);
    const shotAlignment = projectileAlignment(firedProjectile, afterShot.snapshot.player.facing);

    await page.keyboard.press("Escape");
    await waitForPausedState(page, true);
    const paused = await runtimeSnapshot(page);
    await page.keyboard.press("Escape");
    await waitForPausedState(page, false);
    const after = await runtimeSnapshot(page);

    const movementDistance = playerDistance(before.snapshot.player, after.snapshot.player);
    const shotsDelta = Number(after.diagnostics.shotsFired) - Number(before.diagnostics.shotsFired);
    const pass = movementDistance > 0.15
      && movementScreen.up > 0.12
      && Math.abs(movementScreen.right) < movementScreen.up * 0.25
      && shotsDelta > 0
      && aimScreen.right > 0.05
      && aimScreen.up > 0.05
      && shotAlignment !== null && shotAlignment > 0.999
      && paused.metrics.paused === true
      && after.metrics.paused === false
      && after.metrics.canvasCount === 1
      && after.metrics.activeLoopCount === 1;
    assertHardwareMetrics(after.metrics, "desktop controls");
    assertNoPageFailures(diagnostics, "desktop controls");
    return {
      viewport: DESKTOP_VIEWPORT,
      trustedInputs: ["keyboard:Enter", "keyboard:W", "mouse:pointermove", "mouse:left", "keyboard:Escape"],
      movementDistance: round(movementDistance),
      movementScreen: { right: round(movementScreen.right), up: round(movementScreen.up) },
      shotsDelta,
      aimScreen: { right: round(aimScreen.right), up: round(aimScreen.up) },
      shotAlignment: round(shotAlignment),
      mouseAttackLatencyApproxMs,
      pauseObserved: paused.metrics.paused,
      resumeObserved: !after.metrics.paused,
      initial: selectedMetrics(before.metrics),
      final: selectedMetrics(after.metrics),
      nativeWebGPU: ready.nativeWebGPU,
      diagnostics,
      pass,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function dispatchTouch(cdp, type, touchPoints) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints,
    modifiers: 0,
  });
}

function touchPoint(id, x, y) {
  return {
    id,
    x,
    y,
    radiusX: 8,
    radiusY: 8,
    force: 1,
  };
}

async function runTouchControls(browser, server, distRoot) {
  const opened = await openPage(browser, server, distRoot, {
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    isMobile: true,
  });
  const { context, page, diagnostics, ready } = opened;
  const cdp = await context.newCDPSession(page);
  try {
    await page.evaluate(async () => {
      await window.__DEVLAB_CAPTURE__.setSeed(424242);
      window.__DEVLAB_CAPTURE__.resume();
    });
    const primary = await page.locator("#primary-action").boundingBox();
    if (!primary) throw new GauntletError("mobile primary action has no layout box", "CONTROL_SURFACE_MISSING");
    await page.touchscreen.tap(primary.x + primary.width / 2, primary.y + primary.height / 2);
    await waitForPhase(page, "tutorial");

    const visibility = await page.evaluate(() => {
      const controls = document.querySelector("#touch-controls");
      const move = document.querySelector("#move-pad");
      const attack = document.querySelector("#attack-button");
      return {
        controlsDisplay: controls ? getComputedStyle(controls).display : "missing",
        moveVisible: Boolean(move && move.getBoundingClientRect().width > 0),
        attackVisible: Boolean(attack && attack.getBoundingClientRect().width > 0),
      };
    });
    const movePad = await page.locator("#move-pad").boundingBox();
    const attackButton = await page.locator("#attack-button").boundingBox();
    if (!movePad || !attackButton || !visibility.moveVisible || !visibility.attackVisible) {
      throw new GauntletError("mobile touch surfaces are not visible", "CONTROL_SURFACE_MISSING", visibility);
    }

    const before = await runtimeSnapshot(page);
    const moveCenter = {
      x: movePad.x + movePad.width / 2,
      y: movePad.y + movePad.height / 2,
    };
    const moveTarget = {
      x: moveCenter.x + movePad.width * 0.24,
      y: moveCenter.y - movePad.height * 0.24,
    };
    const moveStartedAt = performance.now();
    await dispatchTouch(cdp, "touchStart", [touchPoint(11, moveCenter.x, moveCenter.y)]);
    await dispatchTouch(cdp, "touchMove", [touchPoint(11, moveTarget.x, moveTarget.y)]);
    try {
      await page.waitForFunction(
        ({ x, z }) => {
          const player = window.__ASH_RELAY_TEST__?.snapshot()?.player?.position;
          return player && Math.hypot(player.x - x, player.z - z) > 0.15;
        },
        { x: before.snapshot.player.position.x, z: before.snapshot.player.position.z },
        { timeout: INPUT_RESPONSE_TIMEOUT_MS },
      );
    } finally {
      await dispatchTouch(cdp, "touchEnd", []);
    }
    const touchMoveLatencyApproxMs = round(performance.now() - moveStartedAt);

    const afterMovement = await runtimeSnapshot(page);
    const movementScreen = screenProjection(directionBetween(
      before.snapshot.player.position,
      afterMovement.snapshot.player.position,
    ), true);

    const beforeShot = await runtimeSnapshot(page);
    const existingProjectileIds = new Set(beforeShot.snapshot.projectiles.map((projectile) => projectile.id));
    const shotsBefore = Number(beforeShot.diagnostics.shotsFired);
    const attackCenter = {
      x: attackButton.x + attackButton.width / 2,
      y: attackButton.y + attackButton.height / 2,
    };
    const attackTarget = {
      x: attackCenter.x + attackButton.width * 0.24,
      y: attackCenter.y - attackButton.height * 0.24,
    };
    const attackStartedAt = performance.now();
    await dispatchTouch(cdp, "touchStart", [touchPoint(12, attackTarget.x, attackTarget.y)]);
    try {
      await page.waitForFunction(
        (baseline) => Number(window.__ASH_RELAY_TEST__?.diagnostics()?.shotsFired || 0) > baseline,
        shotsBefore,
        { timeout: INPUT_RESPONSE_TIMEOUT_MS },
      );
    } finally {
      await dispatchTouch(cdp, "touchEnd", []);
    }
    const touchAttackLatencyApproxMs = round(performance.now() - attackStartedAt);
    const afterShot = await runtimeSnapshot(page);
    const firedProjectile = afterShot.snapshot.projectiles.find((projectile) =>
      projectile.owner === "player" && !existingProjectileIds.has(projectile.id));
    const aimScreen = screenProjection(afterShot.snapshot.player.facing, true);
    const shotAlignment = projectileAlignment(firedProjectile, afterShot.snapshot.player.facing);

    const pause = await page.locator("#pause-button").boundingBox();
    if (!pause) throw new GauntletError("mobile pause button has no layout box", "CONTROL_SURFACE_MISSING");
    await page.touchscreen.tap(pause.x + pause.width / 2, pause.y + pause.height / 2);
    await waitForPausedState(page, true);
    const paused = await runtimeSnapshot(page);
    await page.touchscreen.tap(pause.x + pause.width / 2, pause.y + pause.height / 2);
    await waitForPausedState(page, false);
    const after = await runtimeSnapshot(page);

    const movementDistance = playerDistance(before.snapshot.player, after.snapshot.player);
    const shotsDelta = Number(after.diagnostics.shotsFired) - Number(before.diagnostics.shotsFired);
    const pass = visibility.controlsDisplay !== "none"
      && movementDistance > 0.15
      && movementScreen.right > 0.08
      && movementScreen.up > 0.08
      && shotsDelta > 0
      && aimScreen.right > 0.05
      && aimScreen.up > 0.05
      && shotAlignment !== null && shotAlignment > 0.999
      && paused.metrics.paused === true
      && after.metrics.paused === false
      && after.metrics.canvasCount === 1
      && after.metrics.activeLoopCount === 1;
    assertHardwareMetrics(after.metrics, "touch controls");
    assertNoPageFailures(diagnostics, "touch controls");
    return {
      viewport: MOBILE_VIEWPORT,
      chromiumTouchEmulation: { hasTouch: true, isMobile: true, protocol: "Input.dispatchTouchEvent" },
      visibility,
      movementDistance: round(movementDistance),
      movementScreen: { right: round(movementScreen.right), up: round(movementScreen.up) },
      shotsDelta,
      aimScreen: { right: round(aimScreen.right), up: round(aimScreen.up) },
      shotAlignment: round(shotAlignment),
      touchMoveLatencyApproxMs,
      touchAttackLatencyApproxMs,
      pauseObserved: paused.metrics.paused,
      resumeObserved: !after.metrics.paused,
      initial: selectedMetrics(before.metrics),
      final: selectedMetrics(after.metrics),
      nativeWebGPU: ready.nativeWebGPU,
      diagnostics,
      pass,
    };
  } finally {
    await cdp.detach().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function runControls(browser, server, distRoot) {
  const desktop = await runDesktopControls(browser, server, distRoot);
  const touch = await runTouchControls(browser, server, distRoot);
  return {
    schemaVersion: SCHEMA_VERSION,
    seed: SEED,
    desktop,
    touch,
    allPassed: desktop.pass && touch.pass,
  };
}

async function measureInputLatency(page, state) {
  return page.evaluate(async ({ seed, timeMs, viewpoint, inputKind, timeoutMs }) => {
    const capture = window.__DEVLAB_CAPTURE__;
    const captureTest = window.__DEVLAB_CAPTURE_TEST__;
    const gameTest = window.__ASH_RELAY_TEST__;
    await capture.setSeed(seed);
    await capture.setTime(timeMs);
    await capture.setViewpoint(viewpoint);
    capture.resume();
    await new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame()));

    const initialSnapshot = gameTest.snapshot();
    const initialDiagnostics = gameTest.diagnostics();
    const initialShots = Number(initialDiagnostics.shotsFired || 0);
    const startedAt = performance.now();
    let release = () => {};
    if (inputKind === "primary") {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    } else if (inputKind === "touch-attack") {
      const target = document.querySelector("#attack-button");
      if (!target) throw new Error("touch attack target missing");
      target.dispatchEvent(new PointerEvent("pointerdown", {
        pointerId: 91,
        pointerType: "touch",
        bubbles: true,
        cancelable: true,
        isPrimary: true,
      }));
      release = () => target.dispatchEvent(new PointerEvent("pointerup", {
        pointerId: 91,
        pointerType: "touch",
        bubbles: true,
        cancelable: true,
        isPrimary: true,
      }));
    } else {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      release = () => window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
    }

    let response = null;
    try {
      while (performance.now() - startedAt < timeoutMs) {
        await new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
        const snapshot = gameTest.snapshot();
        const diagnostics = gameTest.diagnostics();
        if (inputKind === "primary" && snapshot.phase !== initialSnapshot.phase) {
          response = { kind: "phase-change", from: initialSnapshot.phase, to: snapshot.phase };
          break;
        }
        if (inputKind !== "primary" && Number(diagnostics.shotsFired || 0) > initialShots) {
          response = {
            kind: "shot-fired",
            shotsDelta: Number(diagnostics.shotsFired || 0) - initialShots,
          };
          break;
        }
      }
    } finally {
      release();
      captureTest.stopLoop();
    }
    return {
      approximation: "synthetic DOM input dispatch to next observed fixed-step state change",
      inputKind,
      responded: response !== null,
      latencyMs: response === null ? null : performance.now() - startedAt,
      response,
    };
  }, {
    seed: SEED,
    timeMs: CAPTURE_TIME_MS,
    viewpoint: state.viewpoint,
    inputKind: state.inputKind,
    timeoutMs: INPUT_RESPONSE_TIMEOUT_MS,
  });
}

async function configureFrozenPerformanceState(page, state) {
  await page.setViewportSize(state.viewport);
  await page.evaluate(async ({ seed, timeMs, viewpoint, stressTicks }) => {
    const capture = window.__DEVLAB_CAPTURE__;
    const gameTest = window.__ASH_RELAY_TEST__;
    await capture.setSeed(seed);
    await capture.setTime(timeMs);
    await capture.setViewpoint(viewpoint);
    if (stressTicks > 0) gameTest.stepTicks(stressTicks);
    await capture.setFrozen(true, timeMs);
    await capture.renderOnce();
  }, {
    seed: SEED,
    timeMs: CAPTURE_TIME_MS,
    viewpoint: state.viewpoint,
    stressTicks: state.stressTicks,
  });
}

async function samplePerformanceState(page, state) {
  const inputLatency = await measureInputLatency(page, state);
  await configureFrozenPerformanceState(page, state);
  const sampled = await page.evaluate(async ({ warmupFrames, sampleFrames }) => {
    const capture = window.__DEVLAB_CAPTURE__;
    const heap = () => {
      const memory = performance.memory;
      return memory ? {
        usedJSHeapSize: Number(memory.usedJSHeapSize),
        totalJSHeapSize: Number(memory.totalJSHeapSize),
        jsHeapSizeLimit: Number(memory.jsHeapSizeLimit),
      } : {
        usedJSHeapSize: null,
        totalJSHeapSize: null,
        jsHeapSizeLimit: null,
      };
    };
    for (let index = 0; index < warmupFrames; index += 1) await capture.renderOnce();
    const before = await capture.getMetrics();
    const heapBefore = heap();
    const cpuRenderMs = [];
    const rafIntervalsMs = [];
    let previousRaf = null;
    for (let index = 0; index < sampleFrames; index += 1) {
      const rafTimestamp = await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      if (previousRaf !== null) rafIntervalsMs.push(rafTimestamp - previousRaf);
      previousRaf = rafTimestamp;
      const startedAt = performance.now();
      await capture.renderOnce();
      cpuRenderMs.push(performance.now() - startedAt);
    }
    const after = await capture.getMetrics();
    return {
      before,
      after,
      heapBefore,
      heapAfter: heap(),
      cpuRenderMs,
      rafIntervalsMs,
      innerSize: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
    };
  }, {
    warmupFrames: PERFORMANCE_WARMUP_FRAMES,
    sampleFrames: PERFORMANCE_SAMPLE_FRAMES,
  });

  assertHardwareMetrics(sampled.after, `performance/${state.id}`);
  const growth = resourceDelta(sampled.before, sampled.after);
  const renderDistribution = distribution(sampled.cpuRenderMs);
  const rafDistribution = distribution(sampled.rafIntervalsMs);
  const heapGrowthBytes = heapDelta(sampled.heapBefore, sampled.heapAfter);
  const exactViewport = sampled.innerSize.width === state.viewport.width
    && sampled.innerSize.height === state.viewport.height
    && sampled.after.resize.canvasWidth === state.viewport.width
    && sampled.after.resize.canvasHeight === state.viewport.height
    && sampled.after.resize.pixelRatio === 1;
  const resourceStable = Object.values(growth).every((value) => value <= 0);
  const samplingValid = renderDistribution.samples === PERFORMANCE_SAMPLE_FRAMES
    && rafDistribution.samples === PERFORMANCE_SAMPLE_FRAMES - 1;
  const target = {
    cpuRenderP95AtMostMs: 16.67,
    cpuRenderP99AtMostMs: 33.34,
    rafIntervalP95AtMostMs: 34,
  };
  const targetMet = renderDistribution.p95 <= target.cpuRenderP95AtMostMs
    && renderDistribution.p99 <= target.cpuRenderP99AtMostMs
    && rafDistribution.p95 <= target.rafIntervalP95AtMostMs;
  const pass = exactViewport
    && sampled.after.viewpointApplied === state.viewpoint
    && sampled.after.activeLoopCount === 0
    && inputLatency.responded
    && resourceStable
    && samplingValid
    && targetMet;

  return {
    state: state.id,
    recipe: {
      viewpoint: state.viewpoint,
      seed: SEED,
      timeMs: CAPTURE_TIME_MS,
      stressTicks: state.stressTicks,
      viewport: state.viewport,
      warmupFrames: PERFORMANCE_WARMUP_FRAMES,
      sampleFrames: PERFORMANCE_SAMPLE_FRAMES,
      frozenSimulation: true,
    },
    cpuRenderMs: {
      definition: "performance.now around awaited __DEVLAB_CAPTURE__.renderOnce",
      distribution: renderDistribution,
      raw: sampled.cpuRenderMs.map((value) => round(value)),
    },
    rafIntervalsMs: {
      definition: "successive requestAnimationFrame timestamps while the game loop is stopped",
      distribution: rafDistribution,
      raw: sampled.rafIntervalsMs.map((value) => round(value)),
    },
    inputLatencyApprox: {
      ...inputLatency,
      latencyMs: round(inputLatency.latencyMs),
    },
    heap: {
      supported: sampled.heapBefore.usedJSHeapSize !== null,
      before: sampled.heapBefore,
      after: sampled.heapAfter,
      growthBytes: heapGrowthBytes,
    },
    rendererBefore: selectedMetrics(sampled.before),
    rendererAfter: selectedMetrics(sampled.after),
    rendererResourceGrowth: growth,
    exactViewport,
    resourceStable,
    samplingValid,
    target,
    targetMet,
    pass,
  };
}

async function runPerformance(browser, server, distRoot) {
  const opened = await openPage(browser, server, distRoot, { viewport: DESKTOP_VIEWPORT });
  const { context, page, diagnostics, ready } = opened;
  try {
    const states = [];
    for (const state of PERFORMANCE_STATES) states.push(await samplePerformanceState(page, state));
    assertNoPageFailures(diagnostics, "performance");
    return {
      schemaVersion: SCHEMA_VERSION,
      percentileMethod: "nearest-rank",
      browserNativeWebGPU: ready.nativeWebGPU,
      states,
      diagnostics,
      allPassed: states.every((state) => state.pass),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function lifecycleStage(page, label) {
  const sample = await runtimeSnapshot(page);
  assertHardwareMetrics(sample.metrics, `lifecycle/${label}`);
  return {
    label,
    metrics: selectedMetrics(sample.metrics),
    heap: sample.heap,
  };
}

async function runLifecycle(browser, server, distRoot) {
  const opened = await openPage(browser, server, distRoot, { viewport: DESKTOP_VIEWPORT });
  const { context, page, diagnostics, ready } = opened;
  try {
    const cycles = [];
    for (let cycle = 1; cycle <= LIFECYCLE_CYCLES; cycle += 1) {
      const stages = [];
      const initial = await lifecycleStage(page, "start");
      stages.push(initial);

      await page.keyboard.press("Enter");
      await waitForPhase(page, "tutorial");
      stages.push(await lifecycleStage(page, "play"));

      await page.keyboard.press("Escape");
      await waitForPausedState(page, true);
      stages.push(await lifecycleStage(page, "pause"));

      await page.keyboard.press("Escape");
      await waitForPausedState(page, false);
      stages.push(await lifecycleStage(page, "resume"));

      await page.evaluate(() => window.__DEVLAB_CAPTURE_TEST__.stopLoop());
      const defeatResult = await page.evaluate(() => window.__ASH_RELAY_TEST__.runAutopilot("defeat", 180000));
      await page.evaluate(() => window.__DEVLAB_CAPTURE__.renderOnce());
      const defeat = await lifecycleStage(page, "defeat");
      stages.push(defeat);

      await page.evaluate(() => window.__DEVLAB_CAPTURE_TEST__.startLoop());
      await page.keyboard.press("r");
      const expectedRestartPhase = defeat.metrics.checkpointAvailable ? "checkpoint" : "tutorial";
      await waitForPhase(page, expectedRestartPhase);
      await page.evaluate(() => window.__DEVLAB_CAPTURE_TEST__.stopLoop());
      await page.evaluate(() => window.__DEVLAB_CAPTURE__.renderOnce());
      stages.push(await lifecycleStage(page, "restart"));

      const checkpointResult = await page.evaluate(() => window.__ASH_RELAY_TEST__.runAutopilot("checkpoint-restore", 180000));
      await page.evaluate(() => window.__DEVLAB_CAPTURE__.renderOnce());
      stages.push(await lifecycleStage(page, "checkpoint-restore"));

      const victoryResult = await page.evaluate(() => window.__ASH_RELAY_TEST__.runAutopilot("victory", 180000));
      await page.evaluate(() => window.__DEVLAB_CAPTURE__.renderOnce());
      const victory = await lifecycleStage(page, "victory");
      stages.push(victory);

      await page.reload({ waitUntil: "domcontentloaded", timeout: PAGE_READY_TIMEOUT_MS });
      await waitForGameReady(page, server.baseUrl, { probe: false });
      const afterReload = await lifecycleStage(page, "reload");
      stages.push(afterReload);

      const canvasSingle = stages.every((stage) => stage.metrics.canvasCount === 1);
      const loopSingle = stages.every((stage) => stage.metrics.activeLoopCount >= 0 && stage.metrics.activeLoopCount <= 1);
      const listenerBaseline = initial.metrics.inputListenerCount;
      const listenerStable = listenerBaseline > 0
        && stages.every((stage) => stage.metrics.inputListenerCount === listenerBaseline);
      const audioBounded = stages.every((stage) => stage.metrics.audioVoiceCount >= 0 && stage.metrics.audioVoiceCount <= 32);
      const reloadResourceGrowth = resourceDelta(initial.metrics, afterReload.metrics);
      const resourcesStableAfterReload = Object.values(reloadResourceGrowth).every((value) => value <= 0);
      const reloadHeapGrowthBytes = heapDelta(initial.heap, afterReload.heap);
      const heapBoundedAfterReload = reloadHeapGrowthBytes === null || reloadHeapGrowthBytes <= 96 * 1024 * 1024;
      const phasesCorrect = initial.metrics.phase === "title"
        && stages.find((stage) => stage.label === "play")?.metrics.phase === "tutorial"
        && stages.find((stage) => stage.label === "pause")?.metrics.paused === true
        && stages.find((stage) => stage.label === "resume")?.metrics.paused === false
        && stages.find((stage) => stage.label === "defeat")?.metrics.phase === "defeat"
        && stages.find((stage) => stage.label === "restart")?.metrics.phase === expectedRestartPhase
        && stages.find((stage) => stage.label === "checkpoint-restore")?.metrics.phase === "checkpoint"
        && victory.metrics.phase === "victory"
        && afterReload.metrics.phase === "title";
      const autopilotsCorrect = defeatResult.terminal === "defeat"
        && checkpointResult.terminal === "checkpoint"
        && victoryResult.terminal === "victory";
      const pass = canvasSingle
        && loopSingle
        && listenerStable
        && audioBounded
        && resourcesStableAfterReload
        && heapBoundedAfterReload
        && phasesCorrect
        && autopilotsCorrect;
      cycles.push({
        cycle,
        stages,
        autopilot: {
          defeat: defeatResult,
          checkpointRestore: checkpointResult,
          victory: victoryResult,
        },
        expectedRestartPhase,
        counters: {
          canvasSingle,
          loopSingle,
          inputListenerBaseline: listenerBaseline,
          listenerStable,
          audioBounded,
          reloadResourceGrowth,
          resourcesStableAfterReload,
          reloadHeapGrowthBytes,
          heapBoundedAfterReload,
        },
        phasesCorrect,
        autopilotsCorrect,
        pass,
      });
    }
    assertNoPageFailures(diagnostics, "lifecycle");
    return {
      schemaVersion: SCHEMA_VERSION,
      requestedCycles: LIFECYCLE_CYCLES,
      completedCycles: cycles.length,
      sequence: [
        "start", "play", "pause", "resume", "defeat", "restart",
        "checkpoint-restore", "victory", "reload",
      ],
      browserNativeWebGPU: ready.nativeWebGPU,
      cycles,
      diagnostics,
      allPassed: cycles.length === LIFECYCLE_CYCLES && cycles.every((cycle) => cycle.pass),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function runCustomGauntlet(config) {
  const server = new CaptureServer(config.dist);
  let browser = null;
  try {
    await server.start();
    const launched = await launchCaptureBrowser({ requireNativeWebGPU: true, backend: "gpu" });
    browser = launched.browser;
    if (!samePath(realpathSync(launched.metadata.executablePath), config.browser)
      || launched.metadata.executableSha256 !== config.browserSha256
      || launched.metadata.requestedBackend !== "native-webgpu") {
      throw new GauntletError("capture harness did not launch the contractual Chromium binary", "BROWSER_ATTESTATION_MISMATCH", launched.metadata);
    }

    const controls = await runControls(browser, server, config.dist);
    writeJson(config.output, "controls.json", controls);
    const performanceReport = await runPerformance(browser, server, config.dist);
    writeJson(config.output, "performance.json", performanceReport);
    const lifecycle = await runLifecycle(browser, server, config.dist);
    writeJson(config.output, "lifecycle.json", lifecycle);
    return {
      browser: launched.metadata,
      controls,
      performance: performanceReport,
      lifecycle,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close();
  }
}

async function runOfficialHarnessFlows(config) {
  const sensitivityOutput = join(config.output, "sensitivity");
  const sensitivity = await runSensitivityFlow({
    fixtureRoot: config.dist,
    vendor: [],
    outputRoot: sensitivityOutput,
    seed: SEED,
    timeMs: CAPTURE_TIME_MS,
    viewpoints: [...SEED_AFFECTED_VIEWPOINTS],
    backend: "gpu",
    viewportWidth: DESKTOP_VIEWPORT.width,
    viewportHeight: DESKTOP_VIEWPORT.height,
    readyTimeoutMs: PAGE_READY_TIMEOUT_MS,
    captureTimeoutMs: PAGE_READY_TIMEOUT_MS,
    requireNativeWebGPU: true,
  }, { seed2: CHANGED_SEED, timeMs2: null });

  const pairByViewpoint = new Map(sensitivity.pairs.map((pair) => [pair.viewpoint, pair]));
  const allExpectedChanged = sensitivity.expectedAffectedViewpoints.every(
    (viewpoint) => Number(pairByViewpoint.get(viewpoint)?.changedPixels || 0) > 0,
  );
  const sensitivityPass = sensitivity.controlledChangeDetected
    && sensitivity.unrelatedViewpointsChanged === 0
    && allExpectedChanged;

  const resourceOutput = join(config.output, "resource-stability");
  const resourceStability = await runResourceStabilityFlow({
    fixtureRoot: config.dist,
    vendor: [],
    outputRoot: resourceOutput,
    seed: SEED,
    timeMs: CAPTURE_TIME_MS,
    viewpoints: ["boss-phase-2"],
    backend: "gpu",
    viewportWidth: DESKTOP_VIEWPORT.width,
    viewportHeight: DESKTOP_VIEWPORT.height,
    requireNativeWebGPU: true,
  });
  const resourcePass = resourceStability.bounded === true
    && resourceStability.blockedRequests.length === 0
    && resourceStability.consoleErrors.length === 0
    && resourceStability.pageErrors.length === 0
    && resourceStability.nativeWebGPU?.adapter?.isFallbackAdapter !== true;

  return {
    sensitivity: {
      output: relative(config.output, sensitivityOutput).replaceAll("\\", "/"),
      result: sensitivity,
      allExpectedChanged,
      pass: sensitivityPass,
    },
    resourceStability: {
      output: relative(config.output, resourceOutput).replaceAll("\\", "/"),
      result: resourceStability,
      pass: resourcePass,
    },
    allPassed: sensitivityPass && resourcePass,
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const dist = existingDirectory(args.dist, "--dist");
  const indexPath = existingRegularFile(join(dist, "index.html"), "dist/index.html");
  const manifestPath = existingRegularFile(join(dist, "capture-manifest.json"), "dist/capture-manifest.json");
  const browser = existingRegularFile(args.browser, "--browser");
  const output = prepareOutputRoot(args.output, dist);
  preparedFailureRoot = output;
  const browserSha256 = sha256File(browser);
  const distTree = hashTree(dist);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== 1 || manifest.requiresNativeWebGPU !== true
    || manifest.defaultSeed !== SEED
    || manifest.defaultTimeMs !== CAPTURE_TIME_MS) {
    throw new GauntletError("capture manifest does not match the ASH RELAY runtime contract", "MANIFEST_MISMATCH", manifest);
  }
  for (const state of PERFORMANCE_STATES) {
    if (!manifest.viewpoints.includes(state.viewpoint)) {
      throw new GauntletError(`manifest is missing viewpoint ${state.viewpoint}`, "MANIFEST_MISMATCH");
    }
  }
  if (JSON.stringify(manifest.seedAffectedViewpoints) !== JSON.stringify(SEED_AFFECTED_VIEWPOINTS)) {
    throw new GauntletError("manifest seedAffectedViewpoints do not match the controlled sensitivity set", "MANIFEST_MISMATCH");
  }

  process.env.DEVLAB_WEBGPU_BROWSER_PATH = browser;
  const config = {
    dist,
    output,
    browser,
    browserSha256,
  };
  writeJson(output, "invocation.json", {
    schemaVersion: SCHEMA_VERSION,
    sessionId: SESSION_ID,
    inputs: {
      dist,
      output,
      browser,
      browserSha256,
      distTreeSha256: distTree.sha256,
      distFiles: distTree.files,
      indexSha256: sha256File(indexPath),
      manifestSha256: sha256File(manifestPath),
    },
    constants: {
      seed: SEED,
      changedSeed: CHANGED_SEED,
      captureTimeMs: CAPTURE_TIME_MS,
      desktopViewport: DESKTOP_VIEWPORT,
      mobileViewport: MOBILE_VIEWPORT,
      performanceWarmupFrames: PERFORMANCE_WARMUP_FRAMES,
      performanceSampleFrames: PERFORMANCE_SAMPLE_FRAMES,
      lifecycleCycles: LIFECYCLE_CYCLES,
    },
  });

  const custom = await runCustomGauntlet(config);
  const official = await runOfficialHarnessFlows(config);
  const allPassed = custom.controls.allPassed
    && custom.performance.allPassed
    && custom.lifecycle.allPassed
    && official.allPassed;
  const summary = {
    schemaVersion: SCHEMA_VERSION,
    sessionId: SESSION_ID,
    status: allPassed ? "PASS" : "FAIL",
    contractualBrowser: custom.browser,
    gates: {
      desktopControls: custom.controls.desktop.pass,
      touchControls: custom.controls.touch.pass,
      performance: custom.performance.allPassed,
      lifecycle10Cycles: custom.lifecycle.allPassed,
      sensitivity: official.sensitivity.pass,
      resourceStability: official.resourceStability.pass,
    },
    evidence: {
      controls: "controls.json",
      performance: "performance.json",
      lifecycle: "lifecycle.json",
      sensitivity: "sensitivity/sensitivity.json",
      resourceStability: "resource-stability/resource-stability.json",
    },
  };
  writeJson(output, "summary.json", summary);
  if (!allPassed) throw new GauntletError("one or more runtime gates failed", "MANDATORY_GATE_FAILED", summary.gates);
  process.stdout.write(json(summary));
}

const isDirectInvocation = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectInvocation) {
  main().catch((error) => {
    const failure = {
      schemaVersion: SCHEMA_VERSION,
      status: "FAIL",
      code: error?.code || "UNEXPECTED_ERROR",
      message: error instanceof Error ? error.message : String(error),
      details: error?.details || null,
      stack: error instanceof Error ? error.stack : null,
    };
    try {
      if (preparedFailureRoot && !existsSync(join(preparedFailureRoot, "failure.json"))) {
        writeFileSync(join(preparedFailureRoot, "failure.json"), json(failure), { encoding: "utf8", flag: "wx" });
      }
    } catch {
      // Preserve the primary failure; evidence writing is best effort here.
    }
    process.stderr.write(json(failure));
    process.exitCode = 1;
  });
}
