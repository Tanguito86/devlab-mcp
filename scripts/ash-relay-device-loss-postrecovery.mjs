#!/usr/bin/env node

/**
 * Same-page post-device-loss validation for ASH RELAY.
 *
 * This supplements DevLab's generic context-loss flow with the product
 * contract's live-state, trusted-input, procedural-audio, and loop checks.
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

import {
  installLocalOnlyRouting,
} from "../packages/browser-dev-mcp/scripts/capture-harness/capture.js";
import {
  launchCaptureBrowser,
  probeNativeWebGpu,
} from "../packages/browser-dev-mcp/scripts/capture-harness/browser-runtime.js";
import {
  CaptureServer,
} from "../packages/browser-dev-mcp/scripts/capture-harness/server.js";

const SESSION_ID = "DEVLAB-ASH-RELAY-PILOT-05";
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const READY_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 5_000;
let outputRoot = null;

class ValidationError extends Error {
  constructor(message, code = "DEVICE_LOSS_VALIDATION_ERROR", details = null) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.details = details;
  }
}

function json(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function parseArguments(argv) {
  const allowed = new Set(["--dist", "--output", "--browser", "--state"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || typeof value !== "string" || value.startsWith("--")) {
      throw new ValidationError(
        "usage: ash-relay-device-loss-postrecovery.mjs --dist <absolute> --output <absolute-new-directory> --browser <absolute> [--state <viewpoint>]",
        "BAD_ARGUMENTS",
      );
    }
    if (values.has(key)) throw new ValidationError("duplicate argument: " + key, "BAD_ARGUMENTS");
    values.set(key, value);
  }
  const required = ["--dist", "--output", "--browser"];
  if ((argv.length !== 6 && argv.length !== 8) || required.some((key) => !values.has(key))) {
    throw new ValidationError(
      "usage: ash-relay-device-loss-postrecovery.mjs --dist <absolute> --output <absolute-new-directory> --browser <absolute> [--state <viewpoint>]",
      "BAD_ARGUMENTS",
    );
  }
  const parsed = Object.fromEntries([...values].map(([key, value]) => [key.slice(2), value]));
  parsed.state ??= "tutorial";
  const allowedStates = new Set([
    "tutorial", "encounter-1", "checkpoint", "boss-phase-1", "boss-phase-2",
    "tutorial-identify-player", "tutorial-move", "tutorial-fire", "tutorial-objective",
    "tutorial-interact", "objective-combat-counter", "mobile-interact",
  ]);
  if (!allowedStates.has(parsed.state)) {
    throw new ValidationError("--state is not an allowed ASH RELAY recovery checkpoint", "BAD_ARGUMENTS");
  }
  return parsed;
}

function assertNoLinkedAncestors(candidate, label) {
  const absolute = resolve(candidate);
  const root = parsePath(absolute).root;
  const tail = absolute.slice(root.length).split(sep).filter(Boolean);
  let cursor = root;
  for (const segment of tail) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) break;
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      throw new ValidationError(label + " contains a symbolic-link or junction segment: " + cursor, "UNSAFE_PATH");
    }
  }
}

function existingDirectory(candidate, label) {
  if (!isAbsolute(candidate)) throw new ValidationError(label + " must be absolute", "UNSAFE_PATH");
  assertNoLinkedAncestors(candidate, label);
  if (!existsSync(candidate)) throw new ValidationError(label + " does not exist: " + candidate, "PATH_NOT_FOUND");
  const stat = lstatSync(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new ValidationError(label + " must be a regular directory", "UNSAFE_PATH");
  }
  return realpathSync(candidate);
}

function existingFile(candidate, label) {
  if (!isAbsolute(candidate)) throw new ValidationError(label + " must be absolute", "UNSAFE_PATH");
  assertNoLinkedAncestors(candidate, label);
  if (!existsSync(candidate)) throw new ValidationError(label + " does not exist: " + candidate, "PATH_NOT_FOUND");
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new ValidationError(label + " must be a regular file", "UNSAFE_PATH");
  }
  return realpathSync(candidate);
}

function contained(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}

function prepareOutput(candidate, dist) {
  if (!isAbsolute(candidate)) throw new ValidationError("--output must be absolute", "UNSAFE_OUTPUT");
  const absolute = resolve(candidate);
  if (absolute === parsePath(absolute).root) {
    throw new ValidationError("--output cannot be a filesystem root", "UNSAFE_OUTPUT");
  }
  if (absolute === dist || contained(dist, absolute) || contained(absolute, dist)) {
    throw new ValidationError("--output and --dist must not overlap", "UNSAFE_OUTPUT");
  }
  assertNoLinkedAncestors(dirname(absolute), "output parent");
  if (existsSync(absolute)) {
    throw new ValidationError("--output must be a new directory", "STALE_OUTPUT");
  }
  mkdirSync(absolute, { recursive: false });
  return realpathSync(absolute);
}

function hashTree(root) {
  const files = [];
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      const rel = prefix ? prefix + "/" + entry.name : entry.name;
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new ValidationError("dist contains a linked entry: " + rel, "UNSAFE_DIST");
      if (entry.isDirectory()) visit(absolute, rel);
      else if (entry.isFile()) files.push({ path: rel, bytes: stat.size, sha256: sha256File(absolute) });
      else throw new ValidationError("dist contains a non-regular entry: " + rel, "UNSAFE_DIST");
    }
  };
  visit(root);
  const digest = createHash("sha256");
  for (const file of files) digest.update(file.path + "\0" + file.bytes + "\0" + file.sha256 + "\n");
  return { sha256: digest.digest("hex"), files };
}

function samePath(left, right) {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

async function delay(milliseconds) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function poll(read, accept, label, timeout = ACTION_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await read();
    if (accept(latest)) return latest;
    await delay(10);
  }
  throw new ValidationError(label + " timed out", "POST_RECOVERY_TIMEOUT", latest);
}

async function readRuntime(page) {
  return page.evaluate(async () => ({
    metrics: await window.__DEVLAB_CAPTURE__.getMetrics(),
    snapshot: window.__ASH_RELAY_TEST__.snapshot(),
    diagnostics: window.__ASH_RELAY_TEST__.diagnostics(),
  }));
}

function playerDistance(before, after) {
  return Math.hypot(
    Number(after.x) - Number(before.x),
    Number(after.z) - Number(before.z),
  );
}

function landscapeScreenProjection(direction) {
  const offsetX = 14.5;
  const offsetZ = -14.7;
  const length = Math.hypot(offsetX, offsetZ);
  const forward = { x: -offsetX / length, z: -offsetZ / length };
  const right = { x: -forward.z, z: forward.x };
  return {
    right: Number(direction.x) * right.x + Number(direction.z) * right.z,
    up: Number(direction.x) * forward.x + Number(direction.z) * forward.z,
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

async function exerciseTrustedInputAndAudio(page, label) {
  const before = await readRuntime(page);
  await page.keyboard.down("w");
  let moved;
  try {
    moved = await poll(
      () => readRuntime(page),
      (value) => playerDistance(before.snapshot.player.position, value.snapshot.player.position) > 0.15,
      label + " movement",
    );
  } finally {
    await page.keyboard.up("w");
  }

  const movementScreen = landscapeScreenProjection({
    x: moved.snapshot.player.position.x - before.snapshot.player.position.x,
    z: moved.snapshot.player.position.z - before.snapshot.player.position.z,
  });

  const canvas = await page.locator("#scene").boundingBox();
  if (!canvas) throw new ValidationError(label + " canvas has no layout box", "CONTROL_SURFACE_MISSING");
  await page.mouse.move(canvas.x + canvas.width * 0.76, canvas.y + canvas.height * 0.31);
  const beforeShot = await readRuntime(page);
  const existingProjectileIds = new Set(beforeShot.snapshot.projectiles.map((projectile) => projectile.id));
  const shotsBefore = Number(beforeShot.diagnostics.shotsFired);
  let fired;
  await page.mouse.down({ button: "left" });
  try {
    fired = await poll(
      () => readRuntime(page),
      (value) => Number(value.diagnostics.shotsFired) > shotsBefore
        && Number(value.metrics.audioVoiceCount) > 0,
      label + " attack/audio voice",
    );
  } finally {
    await page.mouse.up({ button: "left" });
  }

  const firedProjectile = fired.snapshot.projectiles.find((projectile) =>
    projectile.owner === "player" && !existingProjectileIds.has(projectile.id));
  const aimScreen = landscapeScreenProjection(fired.snapshot.player.facing);
  const shotAlignment = projectileAlignment(firedProjectile, fired.snapshot.player.facing);

  return {
    movementDistance: playerDistance(before.snapshot.player.position, moved.snapshot.player.position),
    movementScreen,
    shotsDelta: Number(fired.diagnostics.shotsFired) - shotsBefore,
    aimScreen,
    shotAlignment,
    audioVoiceObserved: Number(fired.metrics.audioVoiceCount) > 0,
    audioState: fired.metrics.audioState,
    inputListenerCount: fired.metrics.inputListenerCount,
    rendererGeneration: fired.metrics.rendererGeneration,
  };
}

async function run(config) {
  process.env.DEVLAB_WEBGPU_BROWSER_PATH = config.browser;
  const server = new CaptureServer(config.dist);
  let browser = null;
  let context = null;
  const diagnostics = { blockedRequests: [], consoleErrors: [], pageErrors: [] };
  try {
    await server.start();
    const launched = await launchCaptureBrowser({ requireNativeWebGPU: true, backend: "gpu" });
    browser = launched.browser;
    if (!samePath(realpathSync(launched.metadata.executablePath), config.browser)
      || launched.metadata.executableSha256 !== config.browserSha256
      || launched.metadata.requestedBackend !== "native-webgpu") {
      throw new ValidationError("contractual Chromium attestation mismatch", "BROWSER_MISMATCH", launched.metadata);
    }

    context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await installLocalOnlyRouting(page, {
      baseUrl: server.baseUrl,
      fixtureRoot: config.dist,
      blocked: diagnostics.blockedRequests,
    });
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error)));

    const response = await page.goto(server.baseUrl + "/", {
      waitUntil: "domcontentloaded",
      timeout: READY_TIMEOUT_MS,
    });
    if (!response?.ok()) throw new ValidationError("game document failed to load", "PAGE_LOAD_FAILED");
    await page.waitForFunction(() => Boolean(
      window.__DEVLAB_CAPTURE__
      && window.__DEVLAB_CAPTURE_TEST__
      && window.__ASH_RELAY_TEST__,
    ), null, { timeout: READY_TIMEOUT_MS });
    const surface = await page.evaluate(() => ({
      version: window.__DEVLAB_CAPTURE__.version,
      sessionId: window.__DEVLAB_CAPTURE_TEST__.sessionId,
    }));
    if (surface.version !== 1 || surface.sessionId !== SESSION_ID) {
      throw new ValidationError("loopback test surface mismatch", "HOOK_MISMATCH", surface);
    }
    await page.evaluate(() => window.__DEVLAB_CAPTURE__.ready());
    const nativeWebGPU = await probeNativeWebGpu(page, server.baseUrl);
    if (!nativeWebGPU.ok || nativeWebGPU.adapter?.isFallbackAdapter === true) {
      throw new ValidationError("native hardware WebGPU attestation failed", "NON_HARDWARE_WEBGPU", nativeWebGPU);
    }

    await page.keyboard.press("Enter");
    await poll(
      () => readRuntime(page),
      (value) => value.snapshot.phase === "tutorial" && value.metrics.audioState === "running",
      "initial gameplay/audio start",
    );
    await page.evaluate(async (state) => {
      await window.__DEVLAB_CAPTURE__.setViewpoint(state);
      await window.__DEVLAB_CAPTURE__.setFrozen(false);
    }, config.state);
    const requestedState = await poll(
      () => readRuntime(page),
      (value) => requestedCaptureStateReached(value.snapshot, config.state)
        && value.metrics.audioState === "running",
      "requested live device-loss state",
    );
    const beforeLossControls = await exerciseTrustedInputAndAudio(page, "before loss");

    await page.evaluate(() => window.__DEVLAB_CAPTURE_TEST__.stopLoop());
    const beforeLoss = await poll(
      () => readRuntime(page),
      (value) => value.metrics.activeLoopCount === 0,
      "pre-loss loop stop",
    );
    const beforeSnapshotJson = JSON.stringify(beforeLoss.snapshot);
    const beforeSnapshotSha256 = sha256Bytes(Buffer.from(beforeSnapshotJson, "utf8"));

    const deviceLossTriggered = await page.evaluate(() => window.__DEVLAB_CAPTURE_TEST__.destroyDevice());
    if (!deviceLossTriggered) throw new ValidationError("device loss hook returned false", "LOSS_NOT_TRIGGERED");
    const afterLossStopped = await poll(
      () => readRuntime(page),
      (value) => value.metrics.lostObserved === true
        && value.metrics.recoveryCount >= 1
        && value.metrics.recoveryInProgress === false
        && value.metrics.rendererGeneration === beforeLoss.metrics.rendererGeneration + 1,
      "device recovery",
      READY_TIMEOUT_MS,
    );
    const afterSnapshotJson = JSON.stringify(afterLossStopped.snapshot);
    const afterSnapshotSha256 = sha256Bytes(Buffer.from(afterSnapshotJson, "utf8"));
    const stateCoherence = {
      snapshotByteEqual: beforeSnapshotJson === afterSnapshotJson,
      snapshotSha256Before: beforeSnapshotSha256,
      snapshotSha256After: afterSnapshotSha256,
      deterministicStateHashBefore: beforeLoss.metrics.deterministicStateHash,
      deterministicStateHashAfter: afterLossStopped.metrics.deterministicStateHash,
      deterministicStateHashEqual:
        beforeLoss.metrics.deterministicStateHash === afterLossStopped.metrics.deterministicStateHash,
      phaseEqual: beforeLoss.metrics.phase === afterLossStopped.metrics.phase,
      healthEqual: beforeLoss.metrics.health === afterLossStopped.metrics.health,
      checkpointEqual:
        beforeLoss.metrics.checkpointAvailable === afterLossStopped.metrics.checkpointAvailable,
    };

    await page.evaluate(() => window.__DEVLAB_CAPTURE__.renderOnce());
    const capture = await page.evaluate(async () => {
      const frame = await window.__DEVLAB_FRAME__();
      return {
        width: frame.width,
        height: frame.height,
        pngLength: frame.png.length,
        rgbaLength: frame.rgba.length,
      };
    });
    const captureAfterRecovery = capture.width === VIEWPORT.width
      && capture.height === VIEWPORT.height
      && capture.pngLength > 0
      && capture.rgbaLength === capture.width * capture.height * 4;

    await page.evaluate(() => window.__DEVLAB_CAPTURE_TEST__.startLoop());
    await poll(
      () => readRuntime(page),
      (value) => value.metrics.activeLoopCount === 1,
      "post-loss live loop",
    );
    const afterLossControls = await exerciseTrustedInputAndAudio(page, "after loss");
    const afterLive = await readRuntime(page);

    const gates = {
      requestedStateReached: requestedCaptureStateReached(requestedState.snapshot, config.state),
      nativeHardwareWebGPU: nativeWebGPU.ok === true
        && nativeWebGPU.adapter?.isFallbackAdapter !== true,
      lossDetected: afterLossStopped.metrics.lostObserved === true,
      rendererRecreated:
        afterLossStopped.metrics.rendererGeneration === beforeLoss.metrics.rendererGeneration + 1,
      resourcesRebuilt: afterLossStopped.metrics.geometries > 0
        && afterLossStopped.metrics.programs > 0,
      gameStateCoherent: Object.entries(stateCoherence)
        .filter(([key]) => key.endsWith("Equal"))
        .every(([, value]) => value === true),
      singleCanvas: afterLive.metrics.canvasCount === 1,
      singleLiveLoop: afterLive.metrics.activeLoopCount === 1,
      inputRestored: beforeLossControls.movementDistance > 0.15
        && beforeLossControls.shotsDelta > 0
        && beforeLossControls.movementScreen.up > 0.12
        && Math.abs(beforeLossControls.movementScreen.right) < beforeLossControls.movementScreen.up * 0.25
        && beforeLossControls.aimScreen.right > 0.05
        && beforeLossControls.aimScreen.up > 0.05
        && beforeLossControls.shotAlignment > 0.999
        && afterLossControls.movementDistance > 0.15
        && afterLossControls.shotsDelta > 0
        && afterLossControls.movementScreen.up > 0.12
        && Math.abs(afterLossControls.movementScreen.right) < afterLossControls.movementScreen.up * 0.25
        && afterLossControls.aimScreen.right > 0.05
        && afterLossControls.aimScreen.up > 0.05
        && afterLossControls.shotAlignment > 0.999
        && afterLossControls.inputListenerCount === beforeLossControls.inputListenerCount,
      audioRestored: beforeLossControls.audioState === "running"
        && beforeLossControls.audioVoiceObserved
        && afterLossControls.audioState === "running"
        && afterLossControls.audioVoiceObserved,
      captureContractRestored: captureAfterRecovery,
      noRuntimeErrors: diagnostics.blockedRequests.length === 0
        && diagnostics.consoleErrors.length === 0
        && diagnostics.pageErrors.length === 0,
    };
    const allPassed = Object.values(gates).every(Boolean);
    return {
      schema: "devlab-ash-relay-device-loss-postrecovery-v1",
      status: allPassed ? "PASS" : "FAIL",
      sessionId: SESSION_ID,
      requestedState: config.state,
      browser: launched.metadata,
      nativeWebGPU,
      input: {
        beforeLoss: beforeLossControls,
        afterLoss: afterLossControls,
      },
      audio: {
        beforeLossState: beforeLossControls.audioState,
        beforeLossVoiceObserved: beforeLossControls.audioVoiceObserved,
        afterLossState: afterLossControls.audioState,
        afterLossVoiceObserved: afterLossControls.audioVoiceObserved,
      },
      deviceLoss: {
        triggered: deviceLossTriggered,
        generationBefore: beforeLoss.metrics.rendererGeneration,
        generationAfter: afterLossStopped.metrics.rendererGeneration,
        recoveryCount: afterLossStopped.metrics.recoveryCount,
        lastLossReason: afterLossStopped.metrics.lastLossReason,
        loopCountDuringExactComparison: afterLossStopped.metrics.activeLoopCount,
        loopCountAfterRestart: afterLive.metrics.activeLoopCount,
        canvasCountAfter: afterLive.metrics.canvasCount,
        inputListenerCountBefore: beforeLoss.metrics.inputListenerCount,
        inputListenerCountAfter: afterLive.metrics.inputListenerCount,
      },
      stateCoherence,
      captureAfterRecovery: { ...capture, valid: captureAfterRecovery },
      diagnostics,
      gates,
      allPassed,
    };
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await server.close();
  }
}

function requestedCaptureStateReached(snapshot, state) {
  switch (state) {
    case "tutorial-identify-player":
      return snapshot.phase === "tutorial"
        && snapshot.presentation.tutorialStep === "IDENTIFY_PLAYER";
    case "tutorial-move":
      return snapshot.phase === "tutorial"
        && snapshot.presentation.tutorialStep === "LEARN_MOVE";
    case "tutorial-fire":
      return snapshot.phase === "tutorial"
        && snapshot.presentation.tutorialStep === "LEARN_AIM_AND_FIRE";
    case "tutorial-objective":
      return snapshot.phase === "tutorial"
        && snapshot.presentation.tutorialStep === "LOCATE_OBJECTIVE";
    case "tutorial-interact":
    case "mobile-interact":
      return snapshot.phase === "encounter-1"
        && snapshot.presentation.tutorialStep === "LEARN_INTERACT";
    case "objective-combat-counter":
      return snapshot.phase === "encounter-1"
        && snapshot.objective.id === "counterattack-01";
    default:
      return snapshot.phase === state;
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const dist = existingDirectory(args.dist, "--dist");
  const browser = existingFile(args.browser, "--browser");
  outputRoot = prepareOutput(args.output, dist);
  const distTree = hashTree(dist);
  const config = {
    dist,
    browser,
    browserSha256: sha256File(browser),
    state: args.state,
  };
  const report = await run(config);
  report.invocation = {
    dist,
    distTreeSha256: distTree.sha256,
    distFiles: distTree.files,
    browser,
    browserSha256: config.browserSha256,
    viewport: VIEWPORT,
    state: config.state,
  };
  writeFileSync(join(outputRoot, "report.json"), json(report), { encoding: "utf8", flag: "wx" });
  process.stdout.write(json({
    status: report.status,
    output: join(outputRoot, "report.json"),
    gates: report.gates,
  }));
  if (!report.allPassed) process.exitCode = 1;
}

main().catch((error) => {
  const failure = {
    schema: "devlab-ash-relay-device-loss-postrecovery-v1",
    status: "FAIL",
    code: error?.code || "UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : String(error),
    details: error?.details || null,
    stack: error instanceof Error ? error.stack : null,
  };
  try {
    if (outputRoot && !existsSync(join(outputRoot, "failure.json"))) {
      writeFileSync(join(outputRoot, "failure.json"), json(failure), { encoding: "utf8", flag: "wx" });
    }
  } catch {
    // Preserve the primary failure.
  }
  process.stderr.write(json(failure));
  process.exitCode = 1;
});
