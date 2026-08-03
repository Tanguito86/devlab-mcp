// DevLab capture harness — visual metrics over raw RGBA buffers.
// Zero dependencies. These are technical evidence, not aesthetic judgment.

// Rec.709 luminance weights.
const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 };

/**
 * @param {Buffer} rgba raw RGBA8, row-major, length = width*height*4
 * @param {number} width
 * @param {number} height
 */
export function analyzeRgba(rgba, width, height) {
  const pixelCount = width * height;
  if (rgba.length !== pixelCount * 4) {
    throw new Error(`RGBA size mismatch: got ${rgba.length} bytes, expected ${pixelCount * 4}`);
  }
  const luma = new Float32Array(pixelCount);
  let sum = 0;
  let black = 0;
  let highlight = 0;
  let transparent = 0;
  let maxChannel = 0;
  for (let i = 0; i < pixelCount; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    const l = LUMA.r * r + LUMA.g * g + LUMA.b * b;
    luma[i] = l;
    sum += l;
    if (l < 16) black++;
    if (l > 230) highlight++;
    if (a < 255) transparent++;
    if (r > maxChannel) maxChannel = r;
    if (g > maxChannel) maxChannel = g;
    if (b > maxChannel) maxChannel = b;
  }
  const sorted = Array.from(luma).sort((x, y) => x - y);
  const pct = (p) => sorted[Math.min(pixelCount - 1, Math.floor((p / 100) * pixelCount))];
  const median = pct(50);
  const p10 = pct(10);
  const p90 = pct(90);
  const mean = sum / pixelCount;
  const contrast = p90 + p10 > 0 ? (p90 - p10) / (p90 + p10) : 0;
  return {
    meanLuminance: round(mean),
    medianLuminance: round(median),
    p10Luminance: round(p10),
    p90Luminance: round(p90),
    contrast: round(contrast),
    blackPercentage: round((black / pixelCount) * 100),
    highlightPercentage: round((highlight / pixelCount) * 100),
    transparentPercentage: round((transparent / pixelCount) * 100),
    maxChannel: maxChannel,
  };
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Deterministic comparison of two RGBA buffers.
 */
export function compareRgba(a, b, width, height) {
  if (a.length !== b.length) {
    throw new Error(`comparison size mismatch: ${a.length} vs ${b.length}`);
  }
  let changed = 0;
  let maxDelta = 0;
  let sumAbs = 0;
  const n = a.length;
  const pixelCount = n / 4;
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    const d0 = Math.abs(a[i] - b[i]);
    const d1 = Math.abs(a[i + 1] - b[i + 1]);
    const d2 = Math.abs(a[i + 2] - b[i + 2]);
    const d3 = Math.abs(a[i + 3] - b[i + 3]);
    if (d0 + d1 + d2 + d3 > 0) changed++;
    if (d0 > maxDelta) maxDelta = d0;
    if (d1 > maxDelta) maxDelta = d1;
    if (d2 > maxDelta) maxDelta = d2;
    if (d3 > maxDelta) maxDelta = d3;
    sumAbs += d0 + d1 + d2 + d3;
  }
  const px = width * height;
  return {
    changedPixels: changed,
    changedPixelPercentage: round((changed / px) * 100),
    maxChannelDelta: maxDelta,
    meanAbsoluteDelta: round(sumAbs / n),
    rgbaEqual: changed === 0,
  };
}

export function buffersEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export { round };
