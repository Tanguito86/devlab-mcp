// DevLab capture harness — deterministic capture orchestration.
//
// Frozen-simulation flow per viewpoint:
//   ready() -> setSeed() -> setTime() -> setViewpoint() -> renderOnce()
//   -> GPU sync (1px readPixels) -> capture (PNG + full RGBA in the SAME
//   evaluate, because the drawing buffer is not preserved) -> getMetrics().
//
// Never relies on requestAnimationFrame timing, waitForTimeout, or gl.finish
// for correctness. No eval / new Function / arbitrary JS from the CLI.

import { chromium } from "playwright";
import { CaptureServer } from "./server.js";
import {
  validateContractValue,
  validateManifest,
  validateOutputTag,
  validateSceneMetrics,
  ContractError,
} from "./contract.js";

const BLOCKED_REQUESTS = [];

export class CaptureError extends Error {
  constructor(message, code = "CAPTURE_ERROR") {
    super(message);
    this.code = code;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.fixtureRoot absolute fixture directory
 * @param {string[]} opts.vendor absolute vendor file paths (three.module.js etc.)
 * @param {number} opts.seed
 * @param {number} opts.timeMs
 * @param {string[]} opts.viewpoints
 * @param {string} opts.tag output tag (validated)
 * @param {string} [opts.variant] fixture variant id from manifest
 * @param {"cpu"|"gpu"} [opts.backend]
 * @param {number} [opts.viewportWidth]
 * @param {number} [opts.viewportHeight]
 * @param {number} [opts.readyTimeoutMs]
 * @param {number} [opts.captureTimeoutMs]
 * @param {function} [opts.onConsole] (type, text) => void
 * @param {function} [opts.onBlockedRequest] (url) => void
 */
export async function runCapture({
  fixtureRoot,
  vendor = [],
  seed,
  timeMs,
  viewpoints,
  tag,
  variant = null,
  backend = "cpu",
  viewportWidth = 960,
  viewportHeight = 540,
  readyTimeoutMs = 15000,
  captureTimeoutMs = 20000,
  onConsole = () => {},
  onBlockedRequest = () => {},
}) {
  validateOutputTag(tag);
  const server = new CaptureServer(fixtureRoot, { vendor });
  const port = await server.start();
  const baseUrl = server.baseUrl;

  const consoleErrors = [];
  const blocked = [];
  const pageErrors = [];
  let browser = null;
  let page = null;

  try {
    const args =
      backend === "gpu"
        ? ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"]
        : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

    browser = await chromium.launch({ headless: true, args });
    page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 1 });

    // Abort everything that is not the local origin.
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(baseUrl)) {
        route.continue();
      } else {
        blocked.push(url);
        onBlockedRequest(url);
        route.abort("blockedbyclient");
      }
    });
    page.on("console", (msg) => {
      onConsole(msg.type(), msg.text());
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    const variantParam = variant ? `?devlab-variant=${encodeURIComponent(variant)}` : "";
    const response = await page.goto(`${baseUrl}/${variantParam}`, {
      waitUntil: "domcontentloaded",
      timeout: readyTimeoutMs,
    });
    if (!response || !response.ok()) {
      throw new CaptureError(`page failed to load: ${response ? response.status() : "no response"}`, "PAGE_LOAD_FAILED");
    }

    let contractPresent = false;
    try {
      await page.waitForFunction(() => Boolean(window.__DEVLAB_CAPTURE__), null, {
        timeout: readyTimeoutMs,
      });
      contractPresent = true;
    } catch {
      // fallthrough: reported as MISSING_CONTRACT below
    }
    if (!contractPresent) {
      throw new ContractError(
        "missing capture contract: window.__DEVLAB_CAPTURE__ never appeared",
        "MISSING_CONTRACT",
      );
    }

    // The contract carries functions and cannot be serialized out of the page;
    // validate it in-page and receive a boolean verdict.
    const contractCheck = await page.evaluate(() => {
      const c = window.__DEVLAB_CAPTURE__;
      if (!c || typeof c !== "object") return { ok: false, code: "MISSING_CONTRACT" };
      if (c.version !== 1) return { ok: false, code: "UNKNOWN_CONTRACT_VERSION", detail: String(c.version) };
      const required = ["ready", "setSeed", "setTime", "setViewpoint", "renderOnce", "getMetrics"];
      const missing = required.filter((m) => typeof c[m] !== "function");
      if (missing.length > 0) return { ok: false, code: "MISSING_METHOD", detail: missing.join(",") };
      return { ok: true };
    });
    if (!contractCheck.ok) {
      throw new ContractError(
        `capture contract rejected in page: ${contractCheck.code}${contractCheck.detail ? ` (${contractCheck.detail})` : ""}`,
        contractCheck.code,
      );
    }

    await withTimeout(
      page.evaluate(() => window.__DEVLAB_CAPTURE__.ready()),
      readyTimeoutMs,
      "scene never became ready (ready() timeout)",
    );

    // Load the fixture manifest from the server (authoritative, not from the page).
    const manifestResponse = await fetch(`${baseUrl}/capture-manifest.json`);
    if (!manifestResponse.ok) {
      throw new CaptureError("fixture has no capture-manifest.json", "MISSING_MANIFEST");
    }
    const manifest = validateManifest(await manifestResponse.json());

    for (const viewpoint of viewpoints) {
      if (!manifest.viewpoints.includes(viewpoint)) {
        throw new ContractError(`unknown viewpoint: ${viewpoint}`, "UNKNOWN_VIEWPOINT");
      }
    }

    await page.evaluate((s) => window.__DEVLAB_CAPTURE__.setSeed(s), seed);
    await page.evaluate((t) => window.__DEVLAB_CAPTURE__.setTime(t), timeMs);

    const captures = [];
    for (const viewpoint of viewpoints) {
      let viewpointError = null;
      try {
        await withTimeout(
          page.evaluate((id) => window.__DEVLAB_CAPTURE__.setViewpoint(id), viewpoint),
          captureTimeoutMs,
          `setViewpoint(${viewpoint}) timeout`,
        );
      } catch (err) {
        viewpointError = err;
      }
      if (viewpointError) {
        throw new CaptureError(`setViewpoint(${viewpoint}) failed: ${viewpointError.message}`, "VIEWPOINT_REJECTED");
      }

      // One logical operation: render once, sync GPU with a 1px readPixels,
      // then read PNG + full RGBA before the drawing buffer is cleared.
      const frame = await withTimeout(
        page.evaluate(async () => {
          const target = window.__DEVLAB_CAPTURE__;
          await target.renderOnce();
          const canvas = document.querySelector("canvas");
          if (!canvas) throw new Error("no canvas element on page");
          const gl =
            canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
          if (!gl) throw new Error("no webgl context on canvas");
          // GPU sync: a 1px readPixels cannot return before the frame exists.
          const sync = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sync);
          const pngDataUrl = canvas.toDataURL("image/png");
          const w = canvas.width;
          const h = canvas.height;
          const full = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, full);
          return { png: pngDataUrl, rgba: Array.from(full), width: w, height: h };
        }),
        captureTimeoutMs,
        `capture(${viewpoint}) timeout`,
      );

      const pngBuffer = Buffer.from(frame.png.split(",")[1], "base64");
      const rgbaBuffer = Buffer.from(frame.rgba);
      const metrics = validateSceneMetrics(await page.evaluate(() => window.__DEVLAB_CAPTURE__.getMetrics()));
      // The fixture must prove it applied the requested state (fail-closed).
      if (metrics.seedApplied !== seed) {
        throw new CaptureError(
          `seed not applied: requested ${seed}, fixture reports ${metrics.seedApplied}`,
          "SEED_NOT_APPLIED",
        );
      }
      if (metrics.timeAppliedMs !== timeMs) {
        throw new CaptureError(
          `time not applied: requested ${timeMs}, fixture reports ${metrics.timeAppliedMs}`,
          "TIME_NOT_APPLIED",
        );
      }
      if (metrics.viewpointApplied !== viewpoint) {
        throw new CaptureError(
          `viewpoint not applied: requested ${viewpoint}, fixture reports ${metrics.viewpointApplied}`,
          "VIEWPOINT_NOT_APPLIED",
        );
      }
      captures.push({
        viewpoint,
        png: pngBuffer,
        rgba: rgbaBuffer,
        width: frame.width,
        height: frame.height,
        metrics,
      });
    }

    const environment = await collectEnvironment(page);

    return {
      tag,
      captures,
      environment,
      consoleErrors,
      pageErrors,
      blockedRequests: blocked,
      serverPort: port,
    };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await server.close();
  }
}

async function collectEnvironment(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      webglVersion: gl ? (gl instanceof WebGL2RenderingContext ? "WebGL2" : "WebGL1") : null,
      gpuVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : "unknown",
      gpuRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown",
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      language: navigator.language,
    };
  });
}

async function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new CaptureError(message, "TIMEOUT")), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export { ContractError, BLOCKED_REQUESTS };
