import assert from "node:assert/strict";
import test from "node:test";

import { analyzeRgba, compareRgba, buffersEqual } from "../scripts/capture-harness/metrics.js";

function solidRgba(width, height, r, g, b, a = 255) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

test("analyzeRgba: dimension mismatch fails closed", () => {
  assert.throws(() => analyzeRgba(Buffer.alloc(10), 3, 3), /size mismatch/);
});

test("analyzeRgba: black frame gives zero luminance, 100% black", () => {
  const m = analyzeRgba(solidRgba(4, 4, 0, 0, 0), 4, 4);
  assert.equal(m.meanLuminance, 0);
  assert.equal(m.medianLuminance, 0);
  assert.equal(m.blackPercentage, 100);
  assert.equal(m.highlightPercentage, 0);
  assert.equal(m.transparentPercentage, 0);
  assert.equal(m.contrast, 0);
  assert.equal(m.maxChannel, 0);
});

test("analyzeRgba: white frame gives max luminance and 100% highlight", () => {
  const m = analyzeRgba(solidRgba(4, 4, 255, 255, 255), 4, 4);
  assert.equal(m.meanLuminance, 255);
  assert.equal(m.medianLuminance, 255);
  assert.equal(m.highlightPercentage, 100);
  assert.equal(m.blackPercentage, 0);
  assert.equal(m.maxChannel, 255);
});

test("analyzeRgba: pure red luminance is Rec.709 red contribution", () => {
  const m = analyzeRgba(solidRgba(2, 2, 255, 0, 0), 2, 2);
  assert.ok(Math.abs(m.meanLuminance - 0.2126 * 255) < 0.01);
});

test("analyzeRgba: transparency percentage counts alpha < 255", () => {
  const buf = solidRgba(2, 2, 0, 0, 0);
  buf[3] = 128; // one fully transparent-ish pixel
  const m = analyzeRgba(buf, 2, 2);
  assert.equal(m.transparentPercentage, 25);
});

test("analyzeRgba: percentile ordering is exact on a grey ramp", () => {
  const width = 4;
  const height = 4;
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = Math.round((i / (width * height - 1)) * 255); // 0..255
    buf[i * 4] = v;
    buf[i * 4 + 1] = v;
    buf[i * 4 + 2] = v;
    buf[i * 4 + 3] = 255;
  }
  const m = analyzeRgba(buf, width, height);
  // grey ramp: luminance == channel value; p10 index = 1 -> 17, p90 index = 14 -> 238
  assert.ok(Math.abs(m.p10Luminance - 17) < 1.5);
  assert.ok(Math.abs(m.p90Luminance - 238) < 1.5);
  assert.ok(Math.abs(m.medianLuminance - 136) < 1.5);
});

test("compareRgba: identical buffers are equal", () => {
  const a = solidRgba(8, 8, 10, 20, 30);
  const cmp = compareRgba(a, Buffer.from(a), 8, 8);
  assert.equal(cmp.rgbaEqual, true);
  assert.equal(cmp.changedPixels, 0);
  assert.equal(cmp.maxChannelDelta, 0);
  assert.equal(cmp.meanAbsoluteDelta, 0);
});

test("compareRgba: single pixel change is detected with exact delta", () => {
  const a = solidRgba(4, 4, 100, 100, 100);
  const b = Buffer.from(a);
  b[0] = 150; // one pixel red channel +50
  const cmp = compareRgba(a, b, 4, 4);
  assert.equal(cmp.rgbaEqual, false);
  assert.equal(cmp.changedPixels, 1);
  assert.equal(cmp.maxChannelDelta, 50);
  assert.ok(cmp.meanAbsoluteDelta > 0);
});

test("compareRgba: size mismatch fails closed", () => {
  assert.throws(() => compareRgba(Buffer.alloc(8), Buffer.alloc(4), 2, 2), /size mismatch/);
});

test("buffersEqual: byte-exact comparison", () => {
  const a = solidRgba(2, 2, 1, 2, 3);
  assert.equal(buffersEqual(a, Buffer.from(a)), true);
  const b = Buffer.from(a);
  b[b.length - 1] = 254;
  assert.equal(buffersEqual(a, b), false);
});
