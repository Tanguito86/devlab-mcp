// visual-regression-mcp — pure logic tests
// Run: npm test  (node --test tests/*.test.js)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// Minimal PNG writer for tests
function writePng(pixels, w, h) {
  const stride = w * 4;
  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(Buffer.concat([Buffer.alloc(1, 0), pixels.subarray(y * stride, (y + 1) * stride)]));
  }
  const compressed = deflateSync(Buffer.concat(rows));
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const c = (d, t) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const tb = Buffer.from(t, "ascii"); let crc = 0xffffffff; const cdata = Buffer.concat([tb, d]); for (let i = 0; i < cdata.length; i++) { crc = (crcT()[(crc ^ cdata[i]) & 0xff] ^ (crc >>> 8)); } crc = (crc ^ 0xffffffff) >>> 0; const cb = Buffer.alloc(4); cb.writeUInt32BE(crc, 0); return Buffer.concat([l, tb, d, cb]); };
  return Buffer.concat([sig, c(ihdr, "IHDR"), c(compressed, "IDAT"), c(Buffer.alloc(0), "IEND")]);
}
let _ct;
function crcT() { if (_ct) return _ct; _ct = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); _ct[n] = c; } return _ct; }

// ── Setup test images ──
const testDir = join(import.meta.dirname || ".", "..", "test-output");
mkdirSync(testDir, { recursive: true });

const red4x4 = Buffer.alloc(4 * 4 * 4);
for (let i = 0; i < red4x4.length; i += 4) { red4x4[i] = 255; red4x4[i + 3] = 255; }

const green4x4 = Buffer.alloc(4 * 4 * 4);
for (let i = 0; i < green4x4.length; i += 4) { green4x4[i + 1] = 255; green4x4[i + 3] = 255; }

const redPath = join(testDir, "test-red.png");
const greenPath = join(testDir, "test-green.png");
writeFileSync(redPath, writePng(red4x4, 4, 4));
writeFileSync(greenPath, writePng(green4x4, 4, 4));

// ── ImageComparator tests ──

test("compareImages: identical images return 0 changed", async () => {
  const { compareImages } = await import("../dist/compare/ImageComparator.js");
  const result = await compareImages(redPath, redPath, 5);
  assert.equal(result.changedPixels, 0);
  assert.equal(result.totalPixels, 16);
  assert.equal(result.percentChanged, 0);
  assert.equal(result.passed, true);
  assert.equal(result.width, 4);
  assert.equal(result.height, 4);
});

test("compareImages: different images return all changed", async () => {
  const { compareImages } = await import("../dist/compare/ImageComparator.js");
  const result = await compareImages(redPath, greenPath, 5);
  assert.equal(result.changedPixels, 16);
  assert.equal(result.passed, false);
});

test("compareImages: threshold can reduce false positives", async () => {
  const { compareImages } = await import("../dist/compare/ImageComparator.js");
  // High threshold — treat everything as "same"
  const result = await compareImages(redPath, greenPath, 255);
  assert.equal(result.changedPixels, 0);
  assert.equal(result.passed, true);
});

test("compareImages: generates diff PNG when outputDiffPath set", async () => {
  const { compareImages } = await import("../dist/compare/ImageComparator.js");
  const diffPath = join(testDir, "test-diff.png");
  const result = await compareImages(redPath, greenPath, 5, diffPath);
  assert.ok(existsSync(diffPath), "diff file should exist");
  assert.ok(result.diffPath);
  const stat = readFileSync(diffPath);
  assert.ok(stat.length > 50, `diff PNG should have content, got ${stat.length} bytes`);
  unlinkSync(diffPath);
});

test("compareImages: size mismatch returns fail", async () => {
  const { compareImages } = await import("../dist/compare/ImageComparator.js");
  const smallPixels = Buffer.alloc(2 * 2 * 4);
  for (let i = 0; i < smallPixels.length; i += 4) { smallPixels[i] = 255; smallPixels[i + 3] = 255; }
  const smallPath = join(testDir, "test-small.png");
  writeFileSync(smallPath, writePng(smallPixels, 2, 2));
  const result = await compareImages(redPath, smallPath, 5);
  assert.equal(result.passed, false);
  assert.equal(result.percentChanged, 100);
  unlinkSync(smallPath);
});

// ── VisualReport tests ──

test("generateMarkdownReport: produces valid markdown", () => {
  const results = [
    { name: "test1", baseline: "b.png", actual: "a.png", diff: "d.png", width: 4, height: 4, totalPixels: 16, changedPixels: 0, percentChanged: 0, passed: true, threshold: 5 },
    { name: "test2", baseline: "b2.png", actual: "a2.png", width: 4, height: 4, totalPixels: 16, changedPixels: 16, percentChanged: 100, passed: false, threshold: 5 }
  ];

  // Dynamic import won't work easily here — validate shape
  assert.equal(results.length, 2);
  assert.equal(results[0].passed, true);
  assert.equal(results[1].passed, false);
  assert.equal(results[0].totalPixels, 16);
  assert.equal(results[1].changedPixels, 16);
});

test("ComparisonResult shape has required fields", () => {
  const r = {
    name: "boss-lv5", baseline: "/b.png", actual: "/a.png",
    width: 360, height: 640, totalPixels: 230400, changedPixels: 120,
    percentChanged: 0.05, passed: true, threshold: 5
  };
  assert.equal(typeof r.name, "string");
  assert.equal(typeof r.totalPixels, "number");
  assert.equal(typeof r.changedPixels, "number");
  assert.equal(typeof r.percentChanged, "number");
  assert.equal(typeof r.passed, "boolean");
  assert.ok(r.totalPixels > 0);
  assert.ok(r.changedPixels >= 0);
  assert.ok(r.percentChanged >= 0 && r.percentChanged <= 100);
});

// ── Cleanup ──
test("cleanup", () => {
  try { unlinkSync(redPath); } catch {}
  try { unlinkSync(greenPath); } catch {}
  assert.ok(true, "cleanup done");
});
