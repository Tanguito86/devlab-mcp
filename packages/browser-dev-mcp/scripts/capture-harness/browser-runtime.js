// Browser launch and native WebGPU preflight for the DevLab capture harness.
// Native WebGPU runs must use a full installed Chromium browser and a real
// loopback HTTP origin. about:blank/data: probes are rejected fail-closed.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

import { chromium } from "playwright";

export class BrowserRuntimeError extends Error {
  constructor(message, code = "BROWSER_RUNTIME_ERROR") {
    super(message);
    this.code = code;
  }
}

function existingFile(path) {
  return typeof path === "string" && path.length > 0
    && existsSync(path) && statSync(path).isFile();
}

export function resolveFullChromiumExecutable(env = process.env, platform = process.platform) {
  const configured = env.DEVLAB_WEBGPU_BROWSER_PATH;
  if (configured) {
    if (!existingFile(configured)) {
      throw new BrowserRuntimeError(
        "configured native WebGPU browser does not exist or is not a file",
        "CONFIGURED_BROWSER_INVALID",
      );
    }
    if (/headless[_-]?shell/i.test(configured) || /headless[_-]?shell/i.test(basename(configured))) {
      throw new BrowserRuntimeError(
        "chromium-headless-shell is not permitted for native WebGPU validation",
        "HEADLESS_SHELL_REJECTED",
      );
    }
    return configured;
  }
  const candidates = [];
  // Prefer Playwright's version-pinned full Chromium executable when it is a
  // real browser binary. This avoids inheriting extensions/injection from a
  // locally installed user browser while remaining reproducible.
  const playwrightExecutable = chromium.executablePath();
  if (!/headless[_-]?shell/i.test(playwrightExecutable)) candidates.push(playwrightExecutable);
  if (platform === "win32") {
    candidates.push(
      env.ProgramFiles && `${env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      env["ProgramFiles(x86)"] && `${env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
      env.LOCALAPPDATA && `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    );
  } else if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/microsoft-edge", "/usr/bin/chromium");
  }

  const executablePath = candidates.find(existingFile);
  if (!executablePath) {
    throw new BrowserRuntimeError(
      "native WebGPU requires a configured full Chrome/Edge executable",
      "FULL_CHROMIUM_NOT_FOUND",
    );
  }
  return executablePath;
}

export function validateNativeWebGpuOrigin(pageUrl, expectedBaseUrl) {
  let page;
  let expected;
  try {
    page = new URL(pageUrl);
    expected = new URL(expectedBaseUrl);
  } catch {
    throw new BrowserRuntimeError("WebGPU probe URL is invalid", "INVALID_WEBGPU_ORIGIN");
  }
  if (!/^https?:$/.test(page.protocol) || page.origin === "null"
    || page.protocol === "data:" || page.href === "about:blank") {
    throw new BrowserRuntimeError(
      "native WebGPU probe requires a navigated non-opaque HTTP origin",
      "OPAQUE_WEBGPU_ORIGIN",
    );
  }
  if (page.origin !== expected.origin || !["127.0.0.1", "localhost", "[::1]"].includes(page.hostname)) {
    throw new BrowserRuntimeError(
      "native WebGPU probe must run on the harness loopback origin",
      "NON_LOCAL_WEBGPU_ORIGIN",
    );
  }
  return page.origin;
}

export async function launchCaptureBrowser({
  requireNativeWebGPU = false,
  backend = "cpu",
  headless = true,
} = {}) {
  if (requireNativeWebGPU) {
    const executablePath = resolveFullChromiumExecutable();
    const executableSha256 = createHash("sha256")
      .update(readFileSync(executablePath))
      .digest("hex");
    const browser = await chromium.launch({
      headless,
      executablePath,
      // Extension isolation is required for deterministic localhost capture;
      // it does not alter GPU selection or enable an unsafe WebGPU feature.
      args: ["--disable-extensions"],
    });
    return {
      browser,
      metadata: {
        browserType: chromium.name(),
        browserVersion: browser.version(),
        executablePath,
        executableSha256,
        launchMode: "full-chromium-native-webgpu",
        launchArgs: ["--disable-extensions"],
        requestedBackend: "native-webgpu",
        headless,
      },
    };
  }

  const args = backend === "gpu"
    ? ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  const browser = await chromium.launch({ headless, args });
  return {
    browser,
    metadata: {
      browserType: chromium.name(),
      browserVersion: browser.version(),
      executablePath: chromium.executablePath(),
      executableSha256: null,
      launchMode: "playwright-default",
      requestedBackend: backend,
      headless,
    },
  };
}

export async function probeNativeWebGpu(page, expectedBaseUrl) {
  const origin = validateNativeWebGpuOrigin(page.url(), expectedBaseUrl);
  const result = await page.evaluate(async ({ expectedOrigin }) => {
    if (location.origin !== expectedOrigin || !/^https?:$/.test(location.protocol)
      || location.origin === "null" || location.href === "about:blank") {
      return { ok: false, code: "OPAQUE_WEBGPU_ORIGIN", href: location.href };
    }
    if (!navigator.gpu) {
      return { ok: false, code: "NAVIGATOR_GPU_UNAVAILABLE", href: location.href };
    }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return { ok: false, code: "WEBGPU_ADAPTER_UNAVAILABLE", href: location.href };
    const info = adapter.info || {};
    const device = await adapter.requestDevice();
    const output = {
      ok: true,
      href: location.href,
      origin: location.origin,
      preferredCanvasFormat: navigator.gpu.getPreferredCanvasFormat(),
      adapter: {
        vendor: info.vendor || "unknown",
        architecture: info.architecture || "unknown",
        device: info.device || "unknown",
        description: info.description || "unknown",
        isFallbackAdapter: adapter.isFallbackAdapter === true,
      },
      device: {
        created: true,
        maxBufferSize: Number(device.limits.maxBufferSize),
        maxStorageBufferBindingSize: Number(device.limits.maxStorageBufferBindingSize),
        maxComputeWorkgroupSizeX: Number(device.limits.maxComputeWorkgroupSizeX),
      },
    };
    device.destroy();
    return output;
  }, { expectedOrigin: origin });

  if (!result.ok) {
    throw new BrowserRuntimeError(`native WebGPU probe failed: ${result.code}`, result.code);
  }
  const identity = [
    result.adapter.vendor,
    result.adapter.architecture,
    result.adapter.device,
    result.adapter.description,
  ].join(" ").toLowerCase();
  if (result.adapter.isFallbackAdapter
    || /(swiftshader|llvmpipe|software rasterizer|software adapter)/.test(identity)) {
    throw new BrowserRuntimeError(
      `native WebGPU probe selected a software adapter: ${identity}`,
      "SOFTWARE_WEBGPU_ADAPTER_REJECTED",
    );
  }
  return result;
}
