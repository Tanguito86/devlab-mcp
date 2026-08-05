import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { AssetForgeError } from "@tanguito/devlab-img2threejs-asset-forge";

/**
 * Original deterministic sprite factory for the synthetic pilot asset
 * `bridge-test-beacon`. Two visually distinct versions:
 *  - v1 (palette "v1-cyan"): cyan diamond beacon with white core and base bar.
 *  - v2 (palette "v2-magenta"): magenta ring beacon with orange core and base bar.
 * Each version renders two frames: frame 0 = dim (OFF), frame 1 = bright (ON).
 * Rendering is pure integer math over the pixel grid — no randomness, no
 * floats, no external inputs. The PNG encoder uses zlib STORED blocks
 * (level 0), making output bytes deterministic across zlib versions.
 */

export const BRIDGE_TEST_BEACON_ASSET_ID = "bridge-test-beacon" as const;
export const BRIDGE_TEST_BEACON_RESOURCE_NAME = "spr_bridge_test_beacon" as const;

export interface BridgeTestBeaconSpec {
  readonly schemaVersion: 1;
  readonly assetId: typeof BRIDGE_TEST_BEACON_ASSET_ID;
  readonly version: string;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly palette: "v1-cyan" | "v2-magenta";
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly collisionPolicy: "bbox-auto";
  readonly compressionPolicy: "stored-deflate";
  readonly budgetProfile: "bridge-sprite-v1";
}

export interface BeaconFrame {
  readonly rgba: Uint8Array;
  readonly sha256: string;
  readonly bytes: number;
}

export interface BridgeTestBeaconAsset {
  readonly spec: BridgeTestBeaconSpec;
  readonly frames: readonly BeaconFrame[];
  readonly pngBytes: readonly Buffer[];
  readonly boundingBox: Readonly<{ left: number; top: number; right: number; bottom: number }>;
  readonly estimatedDecodedBytes: number;
  readonly pixelSignature: Readonly<{ sha256: string; samples: readonly Readonly<{ x: number; y: number; rgba: readonly number[] }>[] }>;
}

export function validateBridgeTestBeaconSpec(value: unknown): BridgeTestBeaconSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AssetForgeError("SPEC_INVALID", "beacon spec must be a plain object");
  const record = value as Record<string, unknown>;
  const required = ["schemaVersion", "assetId", "version", "width", "height", "frameCount", "palette", "origin", "collisionPolicy", "compressionPolicy", "budgetProfile"];
  const actual = Object.keys(record).sort().join("|"); const expected = [...required].sort().join("|");
  if (actual !== expected) throw new AssetForgeError("SPEC_INVALID", "beacon spec has missing or unknown fields", { actual, expected });
  if (record.schemaVersion !== 1 || record.assetId !== BRIDGE_TEST_BEACON_ASSET_ID) throw new AssetForgeError("SPEC_INVALID", "beacon spec identity is invalid");
  if (typeof record.version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(record.version)) throw new AssetForgeError("SPEC_INVALID", "beacon version is invalid");
  for (const field of ["width", "height", "frameCount"]) { if (typeof record[field] !== "number" || !Number.isSafeInteger(record[field]) || (record[field] as number) <= 0) throw new AssetForgeError("SPEC_INVALID", `${field} is invalid`); }
  if (record.palette !== "v1-cyan" && record.palette !== "v2-magenta") throw new AssetForgeError("SPEC_INVALID", "beacon palette is invalid");
  const origin = record.origin as Record<string, unknown> | undefined;
  if (!origin || typeof origin !== "object" || typeof origin.x !== "number" || typeof origin.y !== "number") throw new AssetForgeError("SPEC_INVALID", "beacon origin is invalid");
  if (record.collisionPolicy !== "bbox-auto" || record.compressionPolicy !== "stored-deflate" || record.budgetProfile !== "bridge-sprite-v1") throw new AssetForgeError("SPEC_INVALID", "beacon policies are invalid");
  return Object.freeze({
    schemaVersion: 1,
    assetId: BRIDGE_TEST_BEACON_ASSET_ID,
    version: record.version as string,
    width: record.width as number,
    height: record.height as number,
    frameCount: record.frameCount as number,
    palette: record.palette as BridgeTestBeaconSpec["palette"],
    origin: Object.freeze({ x: origin.x as number, y: origin.y as number }),
    collisionPolicy: "bbox-auto",
    compressionPolicy: "stored-deflate",
    budgetProfile: "bridge-sprite-v1",
  });
}

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
  return table;
}
const CRC_TABLE = crcTable();
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.byteLength !== width * height * 4) throw new AssetForgeError("EXPORT_FAILED", "RGBA buffer does not match dimensions");
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) { raw[y * (stride + 1)] = 0; raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1); }
  const idat = deflateSync(raw, { level: 0 });
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

function blend(color: readonly [number, number, number], factor: number): readonly [number, number, number] {
  return [Math.round(color[0] * factor), Math.round(color[1] * factor), Math.round(color[2] * factor)];
}

function renderFrame(spec: BridgeTestBeaconSpec, frameIndex: number): Uint8Array {
  const { width, height } = spec;
  const cx = Math.floor(width / 2); const cy = Math.floor(height / 2);
  const bright = frameIndex === 1;
  const dim = (color: readonly [number, number, number]): readonly [number, number, number] => bright ? color : blend(color, 0.42);
  const v1 = spec.palette === "v1-cyan";
  const body = dim(v1 ? [0, 200, 240] : [230, 60, 200]);
  const core = dim(v1 ? [255, 255, 255] : [255, 150, 40]);
  const base = dim(v1 ? [40, 60, 80] : [70, 40, 60]);
  const outline = dim(v1 ? [10, 90, 120] : [120, 20, 100]);
  const rgba = new Uint8Array(width * height * 4);
  const half = Math.floor(spec.height * 0.12); // base bar height
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const dx = x - cx; const dy = y - cy;
      const manhattan = Math.abs(dx) + Math.abs(dy);
      const distance = Math.sqrt(dx * dx + dy * dy);
      let color: readonly [number, number, number] | null = null;
      if (v1) {
        if (manhattan <= 20) color = manhattan <= 6 ? core : body;
        if (manhattan <= 21 && manhattan > 19) color = outline;
      } else {
        if (distance >= 8 && distance <= 16) color = distance >= 14.5 && distance <= 16 ? outline : body;
        if (distance < 5) color = core;
      }
      if (color === null && y >= height - half && x >= cx - 18 && x <= cx + 18) color = base;
      if (color !== null) { rgba[index] = color[0]; rgba[index + 1] = color[1]; rgba[index + 2] = color[2]; rgba[index + 3] = 255; }
    }
  }
  return rgba;
}

function computeBoundingBox(rgba: Uint8Array, width: number, height: number): Readonly<{ left: number; top: number; right: number; bottom: number }> {
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] !== 0) {
        if (x < left) left = x; if (x > right) right = x;
        if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
  }
  return Object.freeze({ left, top, right, bottom });
}

export function createBridgeTestBeacon(specValue: unknown): BridgeTestBeaconAsset {
  const spec = validateBridgeTestBeaconSpec(specValue);
  const frames: BeaconFrame[] = []; const pngBytes: Buffer[] = [];
  for (let frame = 0; frame < spec.frameCount; frame += 1) {
    const rgba = renderFrame(spec, frame);
    const png = encodePng(spec.width, spec.height, rgba);
    pngBytes.push(png);
    frames.push(Object.freeze({ rgba, sha256: createHash("sha256").update(png).digest("hex"), bytes: png.byteLength }));
  }
  const combined = Buffer.concat(pngBytes);
  const boundingBox = computeBoundingBox(frames[0]!.rgba, spec.width, spec.height);
  const samples = Object.freeze([0, 8, 16, 24, 32, 40, 48, 56, 63].flatMap((y) => [0, 8, 16, 24, 32, 40, 48, 56, 63].map((x) => {
    const offset = (y * spec.width + x) * 4; const rgba = frames[1]!.rgba;
    return Object.freeze({ x, y, rgba: Object.freeze([rgba[offset], rgba[offset + 1], rgba[offset + 2], rgba[offset + 3]]) });
  })));
  return Object.freeze({
    spec,
    frames: Object.freeze(frames),
    pngBytes: Object.freeze(pngBytes),
    boundingBox,
    estimatedDecodedBytes: spec.width * spec.height * 4 * spec.frameCount,
    pixelSignature: Object.freeze({ sha256: createHash("sha256").update(combined).digest("hex"), samples }),
  });
}

export type BeaconFactory = (spec: unknown) => BridgeTestBeaconAsset;
export const BRIDGE_TEST_BEACON_FACTORY: Readonly<Record<string, BeaconFactory>> = Object.freeze({ [BRIDGE_TEST_BEACON_ASSET_ID]: createBridgeTestBeacon });
