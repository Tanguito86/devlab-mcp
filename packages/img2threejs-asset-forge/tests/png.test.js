import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parsePng, parsePngFile, PngPolicyError, PNG_LIMITS } from "../dist/index.js";

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let table;
function crc32(bytes) {
  table ??= Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, payload = Buffer.alloc(0)) {
  const name = Buffer.from(type); const out = Buffer.alloc(12 + payload.length);
  out.writeUInt32BE(payload.length, 0); name.copy(out, 4); payload.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([name, payload])), 8 + payload.length); return out;
}
function ihdr(width = 1, height = 1, colorType = 2, interlace = 0) { const data = Buffer.alloc(13); data.writeUInt32BE(width, 0); data.writeUInt32BE(height, 4); data[8] = 8; data[9] = colorType; data[12] = interlace; return chunk("IHDR", data); }
function png({ width = 1, height = 1, colorType = 2, interlace = 0, raw = Buffer.from([0, 12, 34, 56]), before = [], after = [], iend = true } = {}) {
  return Buffer.concat([signature, ihdr(width, height, colorType, interlace), ...before, chunk("IDAT", deflateSync(raw)), ...after, ...(iend ? [chunk("IEND")] : [])]);
}

test("canonical parser decodes a bounded RGB PNG", () => {
  const result = parsePng(png()); assert.deepEqual([result.width, result.height, result.channels], [1, 1, 3]); assert.deepEqual([...result.pixels], [12, 34, 56]);
});

test("signature, truncation, missing IEND, and trailing data fail closed", () => {
  const valid = png(); const badSignature = Buffer.from(valid); badSignature[0] = 0;
  for (const bytes of [badSignature, valid.subarray(0, 15), png({ iend: false }), Buffer.concat([valid, Buffer.from([0])])]) assert.throws(() => parsePng(bytes));
});

test("PNG failures are typed and oversized files are rejected before bounded read", () => {
  try { parsePng(Buffer.from([0])); assert.fail("expected typed failure"); } catch (error) { assert.ok(error instanceof PngPolicyError); assert.equal(error.code, "PNG_SIGNATURE"); }
  const directory = mkdtempSync(join(tmpdir(), "devlab-png-limit-")); const file = join(directory, "oversized.png");
  try { writeFileSync(file, Buffer.alloc(0)); truncateSync(file, PNG_LIMITS.MAX_PNG_BYTES + 1); assert.throws(() => parsePngFile(file), (error) => error instanceof PngPolicyError && error.code === "PNG_SIZE"); } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("zero, gigantic, and pixel-budget dimensions are rejected before inflate", () => {
  for (const dimensions of [[0, 1], [PNG_LIMITS.MAX_WIDTH + 1, 1], [4096, 4097]]) assert.throws(() => parsePng(png({ width: dimensions[0], height: dimensions[1] })), /dimension|pixel/i);
});

test("declared huge and truncated chunks are rejected before allocation", () => {
  const hugeHeader = Buffer.alloc(12); hugeHeader.writeUInt32BE(PNG_LIMITS.MAX_CHUNK_BYTES + 1, 0); hugeHeader.write("IDAT", 4);
  assert.throws(() => parsePng(Buffer.concat([signature, ihdr(), hugeHeader])), /MAX_CHUNK_BYTES/);
  const truncated = chunk("tEXt", Buffer.from("abc")).subarray(0, 10);
  assert.throws(() => parsePng(Buffer.concat([signature, ihdr(), truncated])), /truncated/);
});

test("chunk ordering, duplicated IHDR, and noncontiguous IDAT are rejected", () => {
  assert.throws(() => parsePng(Buffer.concat([signature, chunk("IDAT", deflateSync(Buffer.from([0, 1, 2, 3]))), ihdr(), chunk("IEND")])), /IHDR/);
  assert.throws(() => parsePng(Buffer.concat([signature, ihdr(), ihdr(), chunk("IDAT", deflateSync(Buffer.from([0, 1, 2, 3]))), chunk("IEND")])), /IHDR/);
  assert.throws(() => parsePng(png({ after: [chunk("tEXt"), chunk("IDAT", deflateSync(Buffer.alloc(0)))] })), /contiguous/);
});

test("inflate bombs and dimension-length mismatches are bounded", () => {
  assert.throws(() => parsePng(png({ raw: Buffer.alloc(1024 * 1024) })), /inflate/);
  assert.throws(() => parsePng(png({ raw: Buffer.from([0, 1]) })), /length/);
});

test("unsupported color/interlace/filter and CRC corruption are rejected", () => {
  assert.throws(() => parsePng(png({ colorType: 3 })), /unsupported/);
  assert.throws(() => parsePng(png({ interlace: 1 })), /unsupported/);
  assert.throws(() => parsePng(png({ raw: Buffer.from([5, 1, 2, 3]) })), /filter/);
  const badCrc = png(); badCrc[29] ^= 1; assert.throws(() => parsePng(badCrc), /CRC/);
});

test("unknown critical chunks and excess metadata are rejected", () => {
  assert.throws(() => parsePng(png({ before: [chunk("ABCD")] })), /critical/);
  const metadata = chunk("tEXt", Buffer.alloc(PNG_LIMITS.MAX_METADATA_BYTES + 1));
  assert.throws(() => parsePng(png({ before: [metadata] })), /metadata/);
});

test("chunk count is bounded independently of file size", () => {
  const extras = Array.from({ length: PNG_LIMITS.MAX_CHUNKS }, () => chunk("tEXt"));
  assert.throws(() => parsePng(png({ before: extras })), /MAX_CHUNKS/);
});
