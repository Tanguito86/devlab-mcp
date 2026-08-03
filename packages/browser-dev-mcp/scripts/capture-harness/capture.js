// DevLab capture harness — deterministic capture orchestration.
//
// Frozen-simulation flow per viewpoint:
//   ready() -> setSeed() -> setTime() -> setViewpoint() -> renderOnce()
//   -> GPU sync (1px readPixels) -> capture (PNG + full RGBA in the SAME
//   evaluate, because the drawing buffer is not preserved) -> getMetrics().
//
// Never relies on requestAnimationFrame timing, waitForTimeout, or gl.finish
// for correctness. No eval / new Function / arbitrary JS from the CLI.

import { join } from "node:path";

import { CaptureServer, isRegularContainedFile } from "./server.js";
import { launchCaptureBrowser, probeNativeWebGpu } from "./browser-runtime.js";
import {
  validateContractValue,
  validateManifest,
  validateOutputTag,
  validateRequestedViewpoints,
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

export function isAllowedLocalUrl(requestUrl, baseUrl) {
  try {
    return new URL(requestUrl).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

export function validatePngBuffer(buffer, expectedWidth, expectedHeight) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    throw new CaptureError("capture did not produce a valid PNG", "INVALID_PNG");
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new CaptureError("PNG has no IHDR header", "INVALID_PNG");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new CaptureError(
      `PNG dimensions ${width}x${height} do not match canvas ${expectedWidth}x${expectedHeight}`,
      "PNG_DIMENSION_MISMATCH",
    );
  }
  return buffer;
}

export function validateRgbaBuffer(buffer, width, height) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== width * height * 4) {
    throw new CaptureError("capture returned incomplete RGBA data", "RGBA_MISMATCH");
  }
  return buffer;
}

export async function capturePageFrame(page, timeoutMs, label) {
  return withTimeout(
    page.evaluate(async () => {
      const target = window.__DEVLAB_CAPTURE__;
      await target.renderOnce();
      // WebGPU fixtures provide their own synchronized frame reader
      // (no readPixels/toDataURL guarantees on a webgpu canvas). The
      // provider runs in the same evaluate, after renderOnce() awaited.
      if (typeof window.__DEVLAB_FRAME__ === "function") {
        const frame = await window.__DEVLAB_FRAME__();
        if (!frame || !frame.png || !frame.rgba || !frame.width || !frame.height) {
          throw new Error("DEVLAB_FRAME provider returned incomplete data");
        }
        return { png: frame.png, rgba: Array.from(frame.rgba), width: frame.width, height: frame.height };
      }
      const canvas = document.querySelector("canvas");
      if (!canvas) throw new Error("no canvas element on page");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl")
        || canvas.getContext("experimental-webgl");
      if (!gl || gl.isContextLost()) throw new Error("no usable webgl context on canvas");
      const sync = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sync);
      const pngDataUrl = canvas.toDataURL("image/png");
      const w = canvas.width;
      const h = canvas.height;
      const full = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, full);
      if (gl.isContextLost()) throw new Error("webgl context lost during capture");
      return { png: pngDataUrl, rgba: Array.from(full), width: w, height: h };
    }),
    timeoutMs,
    `${label} timeout`,
  );
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
 * @param {(string|null)[]} [opts.variantSequence] variants captured in one page/session
 * @param {"cpu"|"gpu"} [opts.backend]
 * @param {number} [opts.viewportWidth]
 * @param {number} [opts.viewportHeight]
 * @param {number} [opts.readyTimeoutMs]
 * @param {number} [opts.captureTimeoutMs]
 * @param {boolean} [opts.requireNativeWebGPU]
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
  variantSequence = null,
  backend = "cpu",
  viewportWidth = 960,
  viewportHeight = 540,
  readyTimeoutMs = 15000,
  captureTimeoutMs = 20000,
  requireNativeWebGPU = false,
  onConsole = () => {},
  onBlockedRequest = () => {},
}) {
  validateOutputTag(tag);
  validateRequestedViewpoints(viewpoints);
  const variantsToCapture = variantSequence || [variant];
  if (!Array.isArray(variantsToCapture) || variantsToCapture.length === 0
    || new Set(variantsToCapture.map((item) => item === null ? "<default>" : item)).size
      !== variantsToCapture.length) {
    throw new CaptureError("variant sequence must be non-empty and unique", "BAD_VARIANT_SEQUENCE");
  }
  const server = new CaptureServer(fixtureRoot, { vendor });
  const port = await server.start();
  const baseUrl = server.baseUrl;

  const consoleErrors = [];
  const blocked = [];
  const pageErrors = [];
  let browser = null;
  let page = null;

  try {
    const launched = await launchCaptureBrowser({ requireNativeWebGPU, backend });
    browser = launched.browser;
    page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 1 });

    // Abort everything that is not the local origin.
    await installLocalOnlyRouting(page, {
      baseUrl,
      fixtureRoot,
      blocked,
      onBlockedRequest,
    });
    page.on("console", (msg) => {
      onConsole(msg.type(), msg.text());
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    const response = await page.goto(`${baseUrl}/`, {
      waitUntil: "domcontentloaded",
      timeout: readyTimeoutMs,
    });
    if (!response || !response.ok()) {
      throw new CaptureError(`page failed to load: ${response ? response.status() : "no response"}`, "PAGE_LOAD_FAILED");
    }
    const nativeWebGPU = requireNativeWebGPU
      ? await probeNativeWebGpu(page, baseUrl)
      : null;

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

    for (const variantId of variantsToCapture) {
      if (variantId !== null && !Object.hasOwn(manifest.variants, variantId)) {
        throw new ContractError(`unknown variant: ${variantId}`, "UNKNOWN_VARIANT");
      }
    }
    if (variantsToCapture.some((item) => item !== null) || variantsToCapture.length > 1) {
      const canSetVariant = await page.evaluate(() =>
        typeof window.__DEVLAB_CAPTURE__.setVariant === "function");
      if (!canSetVariant) {
        throw new ContractError("fixture does not implement setVariant()", "MISSING_VARIANT_METHOD");
      }
    }

    if (blocked.length > 0) {
      throw new CaptureError(`blocked external request: ${blocked[0]}`, "EXTERNAL_REQUEST_BLOCKED");
    }

    await page.evaluate((s) => window.__DEVLAB_CAPTURE__.setSeed(s), seed);
    await page.evaluate((t) => window.__DEVLAB_CAPTURE__.setTime(t), timeMs);

    const captures = [];
    for (const variantId of variantsToCapture) {
      if (typeof variantId === "string" || variantsToCapture.length > 1) {
        await page.evaluate((id) => window.__DEVLAB_CAPTURE__.setVariant(id), variantId);
      }
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
      const frame = await capturePageFrame(page, captureTimeoutMs, `capture(${viewpoint})`);

      if (typeof frame.png !== "string" || !frame.png.startsWith("data:image/png;base64,")) {
        throw new CaptureError("capture returned no PNG data URL", "MISSING_PNG");
      }
      const pngBuffer = validatePngBuffer(
        Buffer.from(frame.png.slice("data:image/png;base64,".length), "base64"),
        frame.width,
        frame.height,
      );
      const rgbaBuffer = validateRgbaBuffer(Buffer.from(frame.rgba), frame.width, frame.height);
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
      if (metrics.variantApplied !== undefined && metrics.variantApplied !== variantId) {
        throw new CaptureError(
          `variant not applied: requested ${variantId}, fixture reports ${metrics.variantApplied}`,
          "VARIANT_NOT_APPLIED",
        );
      }
      if (blocked.length > 0) {
        throw new CaptureError(`blocked external request: ${blocked[0]}`, "EXTERNAL_REQUEST_BLOCKED");
      }
      captures.push({
        viewpoint,
        variant: variantId,
        png: pngBuffer,
        rgba: rgbaBuffer,
        width: frame.width,
        height: frame.height,
        metrics,
      });
      }
    }

    if (consoleErrors.length > 0) {
      throw new CaptureError(`page console error: ${consoleErrors[0]}`, "CONSOLE_ERROR");
    }
    if (pageErrors.length > 0) {
      throw new CaptureError(`uncaught page error: ${pageErrors[0]}`, "PAGE_ERROR");
    }

    const environment = await collectEnvironment(page, launched.metadata, nativeWebGPU);

    return {
      tag,
      captures,
      environment,
      consoleErrors,
      pageErrors,
      blockedRequests: blocked,
      manifest,
      serverPort: port,
    };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await server.close();
  }
}

async function collectEnvironment(page, browserRuntime, nativeWebGPU) {
  const pageEnvironment = await page.evaluate(() => {
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
  return { ...pageEnvironment, browser: browserRuntime, nativeWebGPU };
}

export async function installLocalOnlyRouting(page, {
  baseUrl,
  fixtureRoot,
  blocked,
  onBlockedRequest = () => {},
}) {
  const documentUrl = `${baseUrl}/`;
  const documentPath = join(fixtureRoot, "index.html");
  if (!isRegularContainedFile(fixtureRoot, documentPath)) {
    throw new CaptureError("top-level fixture document is not a contained regular file", "UNSAFE_DOCUMENT");
  }
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = request.url();
    if (url === documentUrl && request.resourceType() === "document") {
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        path: documentPath,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } else if (isAllowedLocalUrl(url, baseUrl)) {
      route.continue();
    } else {
      blocked.push(url);
      onBlockedRequest(url);
      route.abort("blockedbyclient");
    }
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
