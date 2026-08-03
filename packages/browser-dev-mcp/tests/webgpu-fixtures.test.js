import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "capture-fixtures");
const FIXTURES = [
  "threejs-webgpu-basic",
  "threejs-webgpu-compute",
  "threejs-webgpu-post",
  "threejs-webgpu-device-loss",
];

function source(fixture, file) {
  return readFileSync(join(ROOT, fixture, file), "utf8");
}

test("all WebGPU fixtures require native WebGPU explicitly", () => {
  for (const fixture of FIXTURES) {
    const manifest = JSON.parse(source(fixture, "capture-manifest.json"));
    assert.equal(manifest.requiresNativeWebGPU, true, fixture);
  }
});

test("all WebGPU fixtures suppress favicon network requests with a data URI", () => {
  for (const fixture of FIXTURES) {
    assert.match(source(fixture, "index.html"), /<link rel="icon" href="data:,">/, fixture);
  }
});

test("all WebGPU frame providers serialize and decode instead of drawing the WebGPU canvas", () => {
  for (const fixture of FIXTURES) {
    const main = source(fixture, "main.js");
    assert.match(main, /canvas\.toDataURL\("image\/png"\)/, fixture);
    assert.match(main, /await decoded\.decode\(\)/, fixture);
    assert.doesNotMatch(main, /drawImage\(canvas\s*,/, fixture);
  }
});

test("basic fixture imports the TSL texture node and initializes its renderer", () => {
  const main = source("threejs-webgpu-basic", "main.js");
  assert.match(main, /uniform, texture, oscSine/);
  assert.match(main, /monitorMat\.colorNode = texture\(rt\.texture\)/);
  assert.match(main, /await renderer\.init\(\)/);
  assert.doesNotMatch(main, /THREE\.texture/);
});

test("frozen WebGPU fixtures do not use the global TSL time node", () => {
  for (const fixture of ["threejs-webgpu-basic", "threejs-webgpu-post", "threejs-webgpu-device-loss"]) {
    const main = source(fixture, "main.js");
    assert.doesNotMatch(main, /\btime\s*,\s*oscSine|\btime\.mul\(/, fixture);
    assert.match(main, /timeSeconds/, fixture);
  }
});

test("device-loss fixture exposes bounded recovery metrics without animation loops", () => {
  const main = source("threejs-webgpu-device-loss", "main.js");
  assert.match(main, /recoveryInProgress/);
  assert.match(main, /rendererGeneration/);
  assert.match(main, /activeLoopCount: 0/);
  assert.doesNotMatch(main, /\.setAnimationLoop\s*\(|requestAnimationFrame\s*\(/);
});
