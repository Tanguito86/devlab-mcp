const SOFTWARE_RENDERER_PATTERN = /(swiftshader|llvmpipe|software rasterizer|software adapter|microsoft basic render)/i;

export const GALAXY_RENDER_LOADS = Object.freeze([700, 1400, 2000]);
export const FRAME_BUDGETS_MS = Object.freeze({
  hz120: 1000 / 120,
  hz60: 1000 / 60,
});

// Chromium exposes rAF timestamps at 0.1 ms resolution on this path. A nominal
// 8.333 ms interval can therefore be reported as 8.4 ms without a missed frame.
export const TIMER_QUANTIZATION_TOLERANCE_MS = 0.1;

export function percentile(samples, probability) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError("percentile requires at least one sample");
  }
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("probability must be between 0 and 1");
  }
  const sorted = samples.map(Number).sort((a, b) => a - b);
  if (sorted.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError("samples must contain finite non-negative numbers");
  }
  if (probability === 0) return sorted[0];
  return sorted[Math.ceil(probability * sorted.length) - 1];
}

export function summarizeDurations(samples) {
  return {
    count: samples.length,
    min: percentile(samples, 0),
    p50: percentile(samples, 0.50),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    max: percentile(samples, 1),
    mean: samples.reduce((total, value) => total + value, 0) / samples.length,
  };
}

export function classifyFrameBudget(
  p95,
  budgetMs,
  toleranceMs = TIMER_QUANTIZATION_TOLERANCE_MS,
) {
  if (![p95, budgetMs, toleranceMs].every(Number.isFinite) || p95 < 0 || budgetMs <= 0 || toleranceMs < 0) {
    throw new TypeError("frame budget inputs must be finite and non-negative");
  }
  return {
    budgetMs,
    toleranceMs,
    rawDeltaMs: p95 - budgetMs,
    rawExceedsBudget: p95 > budgetMs,
    pass: p95 <= budgetMs + toleranceMs,
  };
}

export function createSyntheticBulletLoad(count, width = 360, height = 640) {
  if (!Number.isInteger(count) || count < 0) throw new TypeError("count must be a non-negative integer");
  if (!Number.isFinite(width) || width < 16 || !Number.isFinite(height) || height < 16) {
    throw new TypeError("canvas dimensions are invalid");
  }
  const spacingX = 8;
  const spacingY = 9;
  const columns = Math.max(1, Math.floor((width - 4) / spacingX));
  const rows = Math.max(1, Math.floor((height - 8) / spacingY));
  return Array.from({ length: count }, (_, index) => ({
    x: 2 + (index % columns) * spacingX,
    y: 2 + (Math.floor(index / columns) % rows) * spacingY,
    w: 4,
    h: 8,
    vx: 0,
    vy: 0,
    kind: "basic",
    color: "#ff5050",
    sourceType: "alien1",
  }));
}

export function attestHardwareCanvasGpu(systemInfo) {
  const gpu = systemInfo?.gpu;
  const featureStatus = gpu?.featureStatus || {};
  const renderer = String(gpu?.auxAttributes?.glRenderer || "");
  const devices = Array.isArray(gpu?.devices) ? gpu.devices : [];

  if (!renderer) throw new Error("GPU attestation failed: CDP did not report glRenderer");
  if (SOFTWARE_RENDERER_PATTERN.test(renderer)) {
    throw new Error(`GPU attestation failed: software renderer selected (${renderer})`);
  }
  if (!String(featureStatus.gpu_compositing || "").startsWith("enabled")) {
    throw new Error(`GPU attestation failed: gpu_compositing=${featureStatus.gpu_compositing || "missing"}`);
  }
  if (!String(featureStatus["2d_canvas"] || "").startsWith("enabled")) {
    throw new Error(`GPU attestation failed: 2d_canvas=${featureStatus["2d_canvas"] || "missing"}`);
  }

  const selectedDevice = devices.find((device) => {
    const identity = `${device.deviceString || ""} ${device.driverVendor || ""}`;
    return identity.trim() && !SOFTWARE_RENDERER_PATTERN.test(identity);
  });
  if (!selectedDevice) throw new Error("GPU attestation failed: no hardware device was reported");

  return {
    renderer,
    displayType: gpu.auxAttributes?.displayType || null,
    skiaBackendType: gpu.auxAttributes?.skiaBackendType || null,
    gpuCompositing: featureStatus.gpu_compositing,
    canvas2d: featureStatus["2d_canvas"],
    selectedDevice: {
      deviceString: selectedDevice.deviceString || null,
      driverVendor: selectedDevice.driverVendor || null,
      driverVersion: selectedDevice.driverVersion || null,
      vendorId: selectedDevice.vendorId ?? null,
      deviceId: selectedDevice.deviceId ?? null,
    },
  };
}

export function firstBudgetCrossing(results, budgetKey) {
  const result = results.find((entry) => entry.budgets?.[budgetKey]?.pass === false);
  return result ? result.bulletCount : null;
}
