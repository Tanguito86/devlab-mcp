import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  isAllowedLocalUrl,
  runCapture,
  validatePngBuffer,
  validateRgbaBuffer,
} from "../scripts/capture-harness/capture.js";
import { runCaptureFlow } from "../scripts/capture-harness/runner.js";
import { CaptureServer } from "../scripts/capture-harness/server.js";
import { ContractError } from "../scripts/capture-harness/contract.js";
import { resolveCliRelativePath } from "../scripts/capture-harness.js";

const tmpDirs = [];
after(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

const MANIFEST = {
  version: 1,
  viewpoints: ["overview", "instancing"],
  defaultSeed: 1729,
  defaultTimeMs: 2500,
};

function makeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "cap-adv-"));
  tmpDirs.push(root);
  writeFileSync(join(root, "capture-manifest.json"), JSON.stringify(MANIFEST));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

const GOOD_HTML = `<!doctype html><html><body><canvas id="c"></canvas>
<script>
const gl = document.getElementById("c").getContext("webgl2") || document.getElementById("c").getContext("webgl");
window.__DEVLAB_CAPTURE__ = {
  version: 1,
  async ready() {},
  async setSeed(s) { window.__seed = s; },
  async setTime(t) { window.__time = t; },
  async setViewpoint(v) { window.__vp = v; },
  async renderOnce() {},
  async getMetrics() { return { drawCalls: 1, triangles: 2, geometries: 1, textures: 0, programs: 1, seedApplied: window.__seed, timeAppliedMs: window.__time, viewpointApplied: window.__vp }; }
};
</script></body></html>`;

const BASE = { seed: 1729, timeMs: 2500, viewpoints: ["overview"], backend: "cpu", readyTimeoutMs: 4000, captureTimeoutMs: 4000 };

test("missing contract fails closed", async () => {
  const root = makeFixture({ "index.html": "<html><body>no contract</body></html>" });
  await assert.rejects(() => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t1", outputRoot: tmpdir() }), (e) => e.code === "MISSING_CONTRACT");
});

test("wrong contract version fails closed", async () => {
  const root = makeFixture({
    "index.html": `<script>window.__DEVLAB_CAPTURE__={version:99}</script>`,
  });
  await assert.rejects(() => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t2", outputRoot: tmpdir() }), (e) => e.code === "UNKNOWN_CONTRACT_VERSION");
});

test("ready timeout fails closed", async () => {
  const root = makeFixture({
    "index.html": `<script>window.__DEVLAB_CAPTURE__={version:1,ready:()=>new Promise(()=>{}),setSeed(){},setTime(){},setViewpoint(){},renderOnce(){},getMetrics(){}}</script>`,
  });
  await assert.rejects(
    () => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t3", outputRoot: tmpdir(), readyTimeoutMs: 800 }),
    (e) => e.code === "TIMEOUT",
  );
});

test("render timeout fails closed", async () => {
  const root = makeFixture({
    "index.html": GOOD_HTML.replace("async renderOnce() {}", "async renderOnce() { await new Promise(() => {}); }"),
  });
  await assert.rejects(
    () => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "render-timeout", captureTimeoutMs: 500 }),
    (e) => e.code === "TIMEOUT",
  );
});

test("unknown viewpoint fails closed", async () => {
  const root = makeFixture({ "index.html": GOOD_HTML });
  await assert.rejects(
    () => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t4", outputRoot: tmpdir(), viewpoints: ["nope"] }),
    (e) => e.code === "UNKNOWN_VIEWPOINT",
  );
});

test("viewpoint rejected by the scene fails closed", async () => {
  const root = makeFixture({
    "index.html": GOOD_HTML.replace(
      "async setViewpoint(v) { window.__vp = v; }",
      "async setViewpoint(v) { throw new Error('no such view'); }",
    ),
  });
  await assert.rejects(
    () => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t5", outputRoot: tmpdir() }),
    (e) => e.code === "VIEWPOINT_REJECTED",
  );
});

test("seed not applied fails closed", async () => {
  const root = makeFixture({
    "index.html": GOOD_HTML.replace("seedApplied: window.__seed", "seedApplied: 999"),
  });
  await assert.rejects(() => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t6", outputRoot: tmpdir() }), (e) => e.code === "SEED_NOT_APPLIED");
});

test("time not applied fails closed", async () => {
  const root = makeFixture({
    "index.html": GOOD_HTML.replace("timeAppliedMs: window.__time", "timeAppliedMs: 1"),
  });
  await assert.rejects(() => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t7", outputRoot: tmpdir() }), (e) => e.code === "TIME_NOT_APPLIED");
});

test("non-local network requests are aborted and fail the capture closed", async () => {
  const root = makeFixture({
    "index.html": `<canvas id="c"></canvas><script>
const __c = document.getElementById("c");
__c.getContext("webgl2") || __c.getContext("webgl");
window.__DEVLAB_CAPTURE__ = { version:1, async ready(){}, async setSeed(){}, async setTime(){}, async setViewpoint(){}, async renderOnce(){ try { await fetch("https://example.com/x"); } catch {} }, async getMetrics(){ return { drawCalls:1,triangles:1,geometries:1,textures:0,programs:1,seedApplied:1729,timeAppliedMs:2500,viewpointApplied:"overview" }; } };
</script>`,
  });
  const blocked = [];
  await assert.rejects(() => runCapture({
      ...BASE,
      fixtureRoot: root,
      vendor: [],
      tag: "t8",
      outputRoot: tmpdir(),
      onBlockedRequest: (url) => blocked.push(url),
    }),
    (e) => e.code === "EXTERNAL_REQUEST_BLOCKED",
  );
  assert.ok(blocked.some((u) => u.startsWith("https://example.com")), `blocked=${JSON.stringify(blocked)}`);
});

test("local-only fixture captures normally", async () => {
  const root = makeFixture({ "index.html": GOOD_HTML });
  const result = await runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t9", outputRoot: tmpdir() });
  assert.equal(result.captures.length, 1);
  assert.ok(result.captures[0].png.length > 0);
});

test("network allow rule compares exact origin, not string prefix", () => {
  const base = "http://127.0.0.1:43210";
  assert.equal(isAllowedLocalUrl(`${base}/ok.js`, base), true);
  assert.equal(isAllowedLocalUrl("http://127.0.0.1:43210@evil.example/x", base), false);
  assert.equal(isAllowedLocalUrl("http://127.0.0.1:432100/x", base), false);
  assert.equal(isAllowedLocalUrl("https://127.0.0.1:43210/x", base), false);
});

test("stale output directory fails closed", async () => {
  const root = makeFixture({ "index.html": GOOD_HTML });
  const outRoot = mkdtempSync(join(tmpdir(), "cap-out-"));
  tmpDirs.push(outRoot);
  mkdirSync(join(outRoot, "stale-tag"), { recursive: true });
  writeFileSync(join(outRoot, "stale-tag", "old.txt"), "old");
  await assert.rejects(
    () => runCaptureFlow({ ...BASE, fixtureRoot: root, vendor: [], tag: "stale-tag", outputRoot: outRoot }),
    (e) => e.code === "STALE_OUTPUT",
  );
});

test("path traversal in output tag fails closed", async () => {
  const root = makeFixture({ "index.html": GOOD_HTML });
  await assert.rejects(
    () => runCaptureFlow({ ...BASE, fixtureRoot: root, vendor: [], tag: "../../escape", outputRoot: tmpdir() }),
    (e) => e.code === "BAD_OUTPUT_TAG",
  );
  await assert.rejects(
    () => runCaptureFlow({ ...BASE, fixtureRoot: root, vendor: [], tag: "C:/abs", outputRoot: tmpdir() }),
    (e) => e.code === "BAD_OUTPUT_TAG",
  );
});

test("CLI fixture and output paths reject absolute and traversal forms", () => {
  const packageRoot = mkdtempSync(join(tmpdir(), "browser-package-root-"));
  tmpDirs.push(packageRoot);
  for (const bad of ["../escape", "a/../../escape", "/absolute", "C:/absolute", "C:\\absolute"]) {
    assert.throws(() => resolveCliRelativePath(packageRoot, bad, "--out"), /inside|escapes/);
  }
  assert.equal(resolveCliRelativePath(packageRoot, "evidence/run", "--out"), join(packageRoot, "evidence", "run"));

  const outside = mkdtempSync(join(tmpdir(), "browser-package-outside-"));
  tmpDirs.push(outside);
  let linked = false;
  try {
    symlinkSync(outside, join(packageRoot, "linked"), "junction");
    linked = true;
  } catch {
    // Junction creation may be unavailable on restricted hosts.
  }
  if (linked) {
    assert.throws(
      () => resolveCliRelativePath(packageRoot, "linked/output", "--out"),
      /symlink|junction|ancestor/,
    );
  }
});

test("malformed metrics (NaN) fails closed", async () => {
  const root = makeFixture({
    "index.html": GOOD_HTML.replace("drawCalls: 1", "drawCalls: NaN"),
  });
  await assert.rejects(() => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t10", outputRoot: tmpdir() }), (e) => e.code === "NON_FINITE_METRIC");
});

test("renderer failure during capture fails closed and cleans up", async () => {
  const root = makeFixture({
    "index.html": GOOD_HTML.replace(
      "async renderOnce() {}",
      "async renderOnce() { throw new Error('render exploded'); }",
    ),
  });
  await assert.rejects(() => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t11", outputRoot: tmpdir() }));
  // port must be released: server was closed in finally
  const probe = new CaptureServer(root);
  const port = await probe.start();
  await probe.close();
  assert.ok(port > 0);
});

test("dimension mismatch is detected by metrics layer", async () => {
  const { analyzeRgba } = await import("../scripts/capture-harness/metrics.js");
  assert.throws(() => analyzeRgba(Buffer.alloc(100), 10, 10), /size mismatch/);
});

test("missing, malformed, and dimension-mismatched PNGs fail closed", () => {
  assert.throws(() => validatePngBuffer(Buffer.alloc(0), 1, 1), (e) => e.code === "INVALID_PNG");
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(2, 16);
  png.writeUInt32BE(3, 20);
  assert.throws(() => validatePngBuffer(png, 3, 2), (e) => e.code === "PNG_DIMENSION_MISMATCH");
});

test("missing or dimension-mismatched RGBA fails closed", () => {
  assert.throws(() => validateRgbaBuffer(Buffer.alloc(0), 1, 1), (e) => e.code === "RGBA_MISMATCH");
  assert.equal(validateRgbaBuffer(Buffer.alloc(16), 2, 2).length, 16);
});

test("duplicate requested viewpoints fail before capture", async () => {
  const root = makeFixture({ "index.html": GOOD_HTML });
  await assert.rejects(
    () => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "dup-request", viewpoints: ["overview", "overview"] }),
    (e) => e.code === "DUPLICATE_REQUESTED_VIEWPOINT",
  );
});

test("duplicate output filename (duplicate viewpoint ids) fails closed in manifest", async () => {
  const root = makeFixture({ "index.html": GOOD_HTML });
  writeFileSync(join(root, "capture-manifest.json"), JSON.stringify({ ...MANIFEST, viewpoints: ["overview", "overview"] }));
  await assert.rejects(() => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t12", outputRoot: tmpdir() }), (e) => e.code === "DUPLICATE_VIEWPOINT");
});

test("missing capture-manifest fails closed", async () => {
  const root = makeFixture({ "index.html": GOOD_HTML });
  rmSync(join(root, "capture-manifest.json"));
  await assert.rejects(() => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t13", outputRoot: tmpdir() }), (e) => e.code === "MISSING_MANIFEST");
});

test("context loss during capture fails closed (renderer cannot produce a frame)", async () => {
  const root = makeFixture({
    "index.html": `<script>
window.__DEVLAB_CAPTURE__ = { version:1, async ready(){}, async setSeed(){}, async setTime(){}, async setViewpoint(){}, async renderOnce(){ const c=document.getElementById("c"); const gl=c.getContext("webgl2")||c.getContext("webgl"); gl.getExtension("WEBGL_lose_context").loseContext(); }, async getMetrics(){ return { drawCalls:1,triangles:1,geometries:1,textures:0,programs:1,seedApplied:1729,timeAppliedMs:2500,viewpointApplied:"overview" }; } };
</script>`,
  });
  // readPixels after losing the context produces a canvas error -> capture must fail
  await assert.rejects(() => runCapture({ ...BASE, fixtureRoot: root, vendor: [], tag: "t14", outputRoot: tmpdir() }));
});
