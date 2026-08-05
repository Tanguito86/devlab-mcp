// Visual regression — pure Node.js PNG comparison (zero native deps)

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parsePngFile } from "@tanguito/devlab-img2threejs-asset-forge";

// ── Minimal PNG parser (IHDR only) ──

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  rawPixels: Buffer; // RGBA raw pixels (unfiltered)
}

/** Read PNG dimensions and raw pixel data. Only supports RGBA 8-bit. */
export function readPng(filePath: string): PngInfo {
  const parsed = parsePngFile(filePath);
  const rawPixels = Buffer.alloc(parsed.width * parsed.height * 4);
  for (let pixel = 0; pixel < parsed.width * parsed.height; pixel += 1) {
    const source = pixel * parsed.channels; const target = pixel * 4;
    if (parsed.colorType === 0) rawPixels.set([parsed.pixels[source]!, parsed.pixels[source]!, parsed.pixels[source]!, 255], target);
    else if (parsed.colorType === 2) rawPixels.set([parsed.pixels[source]!, parsed.pixels[source + 1]!, parsed.pixels[source + 2]!, 255], target);
    else if (parsed.colorType === 4) rawPixels.set([parsed.pixels[source]!, parsed.pixels[source]!, parsed.pixels[source]!, parsed.pixels[source + 1]!], target);
    else rawPixels.set(parsed.pixels.subarray(source, source + 4), target);
  }
  return { width: parsed.width, height: parsed.height, bitDepth: parsed.bitDepth, colorType: parsed.colorType, rawPixels };
}

// ── Pixel comparison ──

export interface CompareResult {
  width: number;
  height: number;
  totalPixels: number;
  changedPixels: number;
  percentChanged: number;
  passed: boolean;
  threshold: number;
  baselinePath: string;
  actualPath: string;
  diffPath?: string;
}

/** Compare two RGBA pixel buffers pixel-by-pixel. threshold = max per-channel delta (0-255). */
export function comparePixels(
  baseline: Buffer,
  actual: Buffer,
  width: number,
  height: number,
  threshold: number = 5
): { changedPixels: number; diffBuffer: Buffer } {
  const total = width * height;
  let changed = 0;
  const diff = Buffer.alloc(total * 4);

  for (let i = 0; i < total * 4; i += 4) {
    const dr = Math.abs(baseline[i] - actual[i]);
    const dg = Math.abs(baseline[i + 1] - actual[i + 1]);
    const db = Math.abs(baseline[i + 2] - actual[i + 2]);
    const da = Math.abs(baseline[i + 3] - actual[i + 3]);

    if (dr > threshold || dg > threshold || db > threshold || da > threshold) {
      changed++;
      // Red highlight for changed pixels
      diff[i] = 255;
      diff[i + 1] = 0;
      diff[i + 2] = 0;
      diff[i + 3] = 255;
    } else {
      // Grayscale actual for unchanged pixels
      const gray = Math.round((actual[i] + actual[i + 1] + actual[i + 2]) / 3);
      diff[i] = gray;
      diff[i + 1] = gray;
      diff[i + 2] = gray;
      diff[i + 3] = 255;
    }
  }

  return { changedPixels: changed, diffBuffer: diff };
}

// ── PNG writer (minimal RGBA) ──

function writePngRgba(pixels: Buffer, width: number, height: number): Buffer {
  // Build filtered scanlines (filter type 0 = None)
  const stride = width * 4;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const filter = Buffer.alloc(1); // 0 = None
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    rows.push(Buffer.concat([filter, row]));
  }
  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw);

  // Build PNG chunks
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk("IHDR", ihdr);

  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeB, data]);
  const crc = crc32(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([length, typeB, data, crcBuf]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  const table = crc32Table();
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

let _crcTable: Uint32Array | null = null;
function crc32Table(): Uint32Array {
  if (_crcTable) return _crcTable;
  _crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    _crcTable[n] = c;
  }
  return _crcTable;
}

// ── High-level image comparison ──

export async function compareImages(
  baselinePath: string,
  actualPath: string,
  threshold: number = 5,
  outputDiffPath?: string
): Promise<CompareResult> {
  const baseline = readPng(baselinePath);
  const actual = readPng(actualPath);

  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    return {
      width: Math.max(baseline.width, actual.width),
      height: Math.max(baseline.height, actual.height),
      totalPixels: 0,
      changedPixels: 0,
      percentChanged: 100,
      passed: false,
      threshold,
      baselinePath,
      actualPath,
      diffPath: undefined
    };
  }

  const { changedPixels, diffBuffer } = comparePixels(
    baseline.rawPixels, actual.rawPixels,
    baseline.width, baseline.height, threshold
  );

  const totalPixels = baseline.width * baseline.height;
  const percentChanged = totalPixels > 0 ? (changedPixels / totalPixels) * 100 : 0;
  const passed = percentChanged <= 1.0; // default: ≤1% change is OK

  let diffPath: string | undefined;
  if (outputDiffPath && changedPixels > 0) {
    const diffPng = writePngRgba(diffBuffer, baseline.width, baseline.height);
    writeFileSync(outputDiffPath, diffPng);
    diffPath = outputDiffPath;
  }

  return {
    width: baseline.width,
    height: baseline.height,
    totalPixels,
    changedPixels,
    percentChanged: Math.round(percentChanged * 100) / 100,
    passed,
    threshold,
    baselinePath,
    actualPath,
    diffPath
  };
}

export function computeHash(filePath: string): string {
  const buf = readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}
