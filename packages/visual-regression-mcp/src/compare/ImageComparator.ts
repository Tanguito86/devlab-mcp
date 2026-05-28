// Visual regression — pure Node.js PNG comparison (zero native deps)

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

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
  const buf = readFileSync(filePath);

  // Verify PNG signature
  if (buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71) {
    throw new Error(`Not a PNG file: ${filePath}`);
  }

  let offset = 8; // skip signature
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);

    if (type === "IHDR") {
      width = buf.readUInt32BE(offset + 8);
      height = buf.readUInt32BE(offset + 12);
      bitDepth = buf[offset + 16];
      colorType = buf[offset + 17];
    }

    if (type === "IDAT") {
      idatChunks.push(buf.subarray(offset + 8, offset + 8 + length));
    }

    if (type === "IEND") break;
    offset += 12 + length;
  }

  if (width === 0 || height === 0) throw new Error(`Invalid PNG: no IHDR in ${filePath}`);

  // Decompress IDAT
  const compressed = Buffer.concat(idatChunks);
  const decompressed = inflateSync(compressed);

  // Unfilter scanlines (filter byte per row)
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bytesPerPixel;
  const rawPixels = Buffer.alloc(height * stride);
  const rowSize = stride + 1; // +1 for filter byte

  for (let y = 0; y < height; y++) {
    const filter = decompressed[y * rowSize];
    const src = decompressed.subarray(y * rowSize + 1, (y + 1) * rowSize);
    const dst = rawPixels.subarray(y * stride, (y + 1) * stride);

    if (filter === 0) {
      src.copy(dst);
    } else if (filter === 1) {
      // Sub filter
      for (let x = 0; x < stride; x++) {
        const left = x >= bytesPerPixel ? dst[x - bytesPerPixel] : 0;
        dst[x] = (src[x] + left) & 0xff;
      }
    } else if (filter === 2) {
      // Up filter
      const prev = y > 0 ? rawPixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
      for (let x = 0; x < stride; x++) {
        dst[x] = (src[x] + prev[x]) & 0xff;
      }
    } else {
      // Filters 3 (Average) and 4 (Paeth) — fallback: copy raw
      src.copy(dst);
    }
  }

  return { width, height, bitDepth, colorType, rawPixels };
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
