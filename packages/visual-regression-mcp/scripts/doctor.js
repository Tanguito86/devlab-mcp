#!/usr/bin/env node
// @tanguito/visual-regression-mcp — doctor

import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ok = [];
const warn = [];
const fail = [];

function check(label, pass, detail = "") {
  if (pass) ok.push(label);
  else fail.push(`${label}  ${detail ? "→ " + detail : ""}`);
}

// Minimal PNG writer for doctor test (avoids circular imports)
function writePngRgba(pixels, w, h) {
  const stride = w * 4;
  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(Buffer.concat([Buffer.alloc(1, 0), pixels.subarray(y * stride, (y + 1) * stride)]));
  }
  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw);

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const ihdrChunk = chunk("IHDR", ihdr);
  const idatChunk = chunk("IDAT", compressed);
  const iendChunk = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([t, data]);
  let c = 0xffffffff;
  for (let i = 0; i < crcData.length; i++) {
    c = (crcTable()[(c ^ crcData[i]) & 0xff] ^ (c >>> 8));
  }
  c = (c ^ 0xffffffff) >>> 0;
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(c, 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

let _t;
function crcTable() {
  if (_t) return _t;
  _t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); _t[n] = c; }
  return _t;
}

// 1. Build output present
try {
  readFileSync(join(__dirname, "..", "dist", "index.js"), "utf8");
  check("dist/index.js present", true);
} catch (e) { check("dist/index.js present", false, e.message); }

for (const m of ["tools.js", "compare/ImageComparator.js", "evidence/VisualReport.js"]) {
  try {
    readFileSync(join(__dirname, "..", "dist", m), "utf8");
    check(`dist/${m} present`, true);
  } catch (e) { check(`dist/${m} present`, false, e.message); }
}

// 2. Runtime test: create two PNGs, compare them
try {
  const testDir = join(__dirname, "..", "test-output");
  mkdirSync(testDir, { recursive: true });

  // 4x4 red square
  const red = Buffer.alloc(4 * 4 * 4);
  for (let i = 0; i < red.length; i += 4) { red[i] = 255; red[i + 3] = 255; }
  writeFileSync(join(testDir, "red.png"), writePngRgba(red, 4, 4));

  // 4x4 green square (different from red)
  const green = Buffer.alloc(4 * 4 * 4);
  for (let i = 0; i < green.length; i += 4) { green[i + 1] = 255; green[i + 3] = 255; }
  writeFileSync(join(testDir, "green.png"), writePngRgba(green, 4, 4));

  const { compareImages } = await import("../dist/compare/ImageComparator.js");

  // Identical comparison
  const r1 = await compareImages(join(testDir, "red.png"), join(testDir, "red.png"), 5);
  check("Identical images: 0 changed pixels", r1.changedPixels === 0, `${r1.changedPixels}`);

  // Different comparison
  const r2 = await compareImages(join(testDir, "red.png"), join(testDir, "green.png"), 5);
  check("Different images: all pixels changed", r2.changedPixels === 16, `${r2.changedPixels}/16`);

  // Cleanup
  try { unlinkSync(join(testDir, "red.png")); unlinkSync(join(testDir, "green.png")); } catch {}

  check("Pixel comparison engine works", true);
} catch (e) {
  fail.push(`Runtime test failed → ${e.message}`);
}

// 3. Node version
check("Node >= 20", parseInt(process.version.slice(1)) >= 20, process.version);

// 4. Tool count
try {
  const toolsJs = readFileSync(join(__dirname, "..", "dist", "tools.js"), "utf8");
  const toolCount = (toolsJs.match(/registerTool\(/g) || []).length;
  check(`4 tools registered`, toolCount === 4, `found ${toolCount}`);
} catch {}

console.log("\nvisual-regression-mcp Doctor");
console.log("════════════════════════════════════");
for (const o of ok) console.log(`  ✅ ${o}`);
for (const w of warn) console.log(`  ⚠️ ${w}`);
for (const f of fail) console.log(`  ❌ ${f}`);

if (fail.length > 0) { console.log(`\nResult: 🔴 ${fail.length} failure(s)`); process.exit(1); }
console.log(`\nResult: Ready ✅ (${ok.length} checks passed)`);
