import { inflateSync } from "node:zlib";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export const PNG_LIMITS = Object.freeze({
  MAX_PNG_BYTES: 16 * 1024 * 1024,
  MAX_WIDTH: 4096,
  MAX_HEIGHT: 4096,
  MAX_PIXELS: 4096 * 4096,
  MAX_DECODED_BYTES: 64 * 1024 * 1024,
  MAX_CHUNKS: 1024,
  MAX_CHUNK_BYTES: 8 * 1024 * 1024,
  MAX_METADATA_BYTES: 1024 * 1024,
});

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS: Readonly<Record<number, number>> = Object.freeze({ 0: 1, 2: 3, 4: 2, 6: 4 });

export interface ParsedPng {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: 8;
  readonly colorType: 0 | 2 | 4 | 6;
  readonly channels: number;
  readonly pixels: Uint8Array;
}

export type PngPolicyErrorCode = "PNG_IO" | "PNG_SIZE" | "PNG_SIGNATURE" | "PNG_STRUCTURE" | "PNG_LIMIT" | "PNG_CRC" | "PNG_UNSUPPORTED" | "PNG_INFLATE";
export class PngPolicyError extends Error { constructor(readonly code: PngPolicyErrorCode, message: string, options?: ErrorOptions) { super(message, options); this.name = "PngPolicyError"; } }

function classifyPngError(message: string): PngPolicyErrorCode {
  if (/signature/i.test(message)) return "PNG_SIGNATURE"; if (/CRC/.test(message)) return "PNG_CRC"; if (/inflate/i.test(message)) return "PNG_INFLATE"; if (/unsupported/i.test(message)) return "PNG_UNSUPPORTED"; if (/exceed|outside policy|MAX_/.test(message)) return "PNG_LIMIT"; return "PNG_STRUCTURE";
}

let crcTable: Uint32Array | undefined;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function parsePngInternal(input: Uint8Array): ParsedPng {
  const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (data.length > PNG_LIMITS.MAX_PNG_BYTES) throw new Error("PNG exceeds MAX_PNG_BYTES");
  if (data.length < SIGNATURE.length || !data.subarray(0, 8).equals(SIGNATURE)) throw new Error("invalid PNG signature");

  let cursor = 8; let chunks = 0; let metadataBytes = 0;
  let width = 0; let height = 0; let colorType = -1; let channels = 0;
  let sawIhdr = false; let sawIdat = false; let idatEnded = false; let sawIend = false; let sawPlte = false;
  const idat: Buffer[] = []; let idatBytes = 0;

  while (cursor < data.length) {
    chunks += 1;
    if (chunks > PNG_LIMITS.MAX_CHUNKS) throw new Error("PNG exceeds MAX_CHUNKS");
    if (data.length - cursor < 12) throw new Error("truncated PNG chunk header");
    const length = data.readUInt32BE(cursor);
    if (length > PNG_LIMITS.MAX_CHUNK_BYTES) throw new Error("PNG chunk exceeds MAX_CHUNK_BYTES");
    const end = cursor + 12 + length;
    if (!Number.isSafeInteger(end) || end > data.length) throw new Error("truncated PNG chunk");
    const typeBytes = data.subarray(cursor + 4, cursor + 8);
    const type = typeBytes.toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error("invalid PNG chunk type");
    const payload = data.subarray(cursor + 8, cursor + 8 + length);
    const actualCrc = data.readUInt32BE(cursor + 8 + length);
    const crcInput = data.subarray(cursor + 4, cursor + 8 + length);
    if (crc32(crcInput) !== actualCrc) throw new Error(`CRC mismatch in ${type}`);

    if (!sawIhdr && type !== "IHDR") throw new Error("IHDR must be first");
    if (type === "IHDR") {
      if (sawIhdr || chunks !== 1 || length !== 13) throw new Error("IHDR must be unique, first, and 13 bytes");
      sawIhdr = true;
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
      const bitDepth = payload[8]!; colorType = payload[9]!;
      if (width === 0 || height === 0 || width > PNG_LIMITS.MAX_WIDTH || height > PNG_LIMITS.MAX_HEIGHT) throw new Error("PNG dimensions outside policy");
      const pixels = width * height;
      if (!Number.isSafeInteger(pixels) || pixels > PNG_LIMITS.MAX_PIXELS) throw new Error("PNG pixel count outside policy");
      if (bitDepth !== 8 || CHANNELS[colorType] === undefined) throw new Error("unsupported PNG bit depth or color type");
      if (payload[10] !== 0 || payload[11] !== 0 || payload[12] !== 0) throw new Error("unsupported PNG compression, filter, or interlace");
      channels = CHANNELS[colorType]!;
    } else if (type === "IDAT") {
      if (idatEnded || sawIend) throw new Error("IDAT chunks must be contiguous and before IEND");
      sawIdat = true; idatBytes += length;
      if (idatBytes > PNG_LIMITS.MAX_PNG_BYTES) throw new Error("combined IDAT exceeds policy");
      idat.push(payload);
    } else if (type === "IEND") {
      if (!sawIdat || sawIend || length !== 0) throw new Error("invalid IEND");
      sawIend = true; cursor = end;
      if (cursor !== data.length) throw new Error("trailing data after IEND");
      break;
    } else {
      if (sawIdat) idatEnded = true;
      if (type === "PLTE") {
        if (sawPlte || sawIdat || length === 0 || length % 3 !== 0 || length > 768) throw new Error("invalid PLTE");
        sawPlte = true;
      } else {
        if (type[0] === type[0]!.toUpperCase()) throw new Error(`unsupported critical chunk: ${type}`);
        metadataBytes += length;
        if (metadataBytes > PNG_LIMITS.MAX_METADATA_BYTES) throw new Error("PNG metadata exceeds policy");
      }
    }
    cursor = end;
  }
  if (!sawIhdr || !sawIdat || !sawIend) throw new Error("PNG is missing required chunks");

  const rowBytes = width * channels;
  const expectedInflated = height * (rowBytes + 1);
  const decodedBytes = width * height * channels;
  if (!Number.isSafeInteger(expectedInflated) || !Number.isSafeInteger(decodedBytes) || expectedInflated > PNG_LIMITS.MAX_DECODED_BYTES || decodedBytes > PNG_LIMITS.MAX_DECODED_BYTES) throw new Error("decoded PNG exceeds policy");
  let filtered: Buffer;
  try {
    filtered = inflateSync(Buffer.concat(idat, idatBytes), { maxOutputLength: expectedInflated + 1 });
  } catch (error) {
    throw new Error(`PNG inflate failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (filtered.length !== expectedInflated) throw new Error("inflated PNG length does not match dimensions");

  const pixels = new Uint8Array(decodedBytes);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * (rowBytes + 1); const filter = filtered[sourceOffset]!;
    if (filter > 4) throw new Error("unsupported PNG row filter");
    const targetOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = filtered[sourceOffset + 1 + x]!;
      const left = x >= channels ? pixels[targetOffset + x - channels]! : 0;
      const up = y > 0 ? pixels[targetOffset - rowBytes + x]! : 0;
      const upLeft = y > 0 && x >= channels ? pixels[targetOffset - rowBytes + x - channels]! : 0;
      const prediction = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upLeft) : 0;
      pixels[targetOffset + x] = (raw + prediction) & 0xff;
    }
  }
  return Object.freeze({ width, height, bitDepth: 8, colorType: colorType as 0 | 2 | 4 | 6, channels, pixels });
}

export function parsePng(input: Uint8Array): ParsedPng {
  try { return parsePngInternal(input); } catch (error) { if (error instanceof PngPolicyError) throw error; const message = error instanceof Error ? error.message : String(error); throw new PngPolicyError(classifyPngError(message), message, { cause: error }); }
}

export function parsePngFile(filePath: string): ParsedPng {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(filePath, "r"); const stat = fstatSync(descriptor);
    if (!stat.isFile()) throw new PngPolicyError("PNG_IO", "PNG input must be a regular file");
    if (stat.size > PNG_LIMITS.MAX_PNG_BYTES) throw new PngPolicyError("PNG_SIZE", "PNG file exceeds MAX_PNG_BYTES before read");
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) { const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset); if (count === 0) throw new PngPolicyError("PNG_IO", "PNG file was truncated during bounded read"); offset += count; }
    return parsePng(bytes);
  } catch (error) { if (error instanceof PngPolicyError) throw error; throw new PngPolicyError("PNG_IO", error instanceof Error ? error.message : String(error), { cause: error }); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
