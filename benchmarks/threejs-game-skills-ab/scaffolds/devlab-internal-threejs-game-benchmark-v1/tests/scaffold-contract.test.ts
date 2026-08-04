import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CAPTURE_CONTRACT_VERSION,
  REQUIRED_CAPTURE_METHODS,
} from "../src/capture-contract.js";

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as Record<string, unknown>;
}

test("capture contract has the six DevLab version-1 methods", () => {
  assert.equal(CAPTURE_CONTRACT_VERSION, 1);
  assert.deepEqual(REQUIRED_CAPTURE_METHODS, [
    "ready",
    "setSeed",
    "setTime",
    "setViewpoint",
    "renderOnce",
    "getMetrics",
  ]);
});

test("fixture manifest selects native WebGPU and the title viewpoint", () => {
  const manifest = readJson("../public/capture-manifest.json");
  assert.equal(manifest.version, 1);
  assert.equal(manifest.requiresNativeWebGPU, true);
  assert.deepEqual(manifest.viewpoints, ["title"]);
  assert.deepEqual(manifest.seedAffectedViewpoints, ["title"]);
  assert.deepEqual(manifest.timeAffectedViewpoints, ["title"]);
});

test("toolchain dependencies are exact and contain no R3F dependency", () => {
  const packageJson = readJson("../package.json");
  const dependencies = packageJson.dependencies as Record<string, string>;
  const devDependencies = packageJson.devDependencies as Record<string, string>;
  assert.equal(dependencies.three, "0.185.1");
  assert.equal(devDependencies.vite, "8.2.0");
  assert.equal(devDependencies.typescript, "6.0.3");
  assert.equal(devDependencies.tsx, "4.22.3");
  assert.equal(Object.keys({ ...dependencies, ...devDependencies }).some((name) => name.includes("fiber")), false);
});

test("entry document has no remote script, stylesheet, or asset URL", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /unpkg|jsdelivr|esm\.sh/i);
  assert.match(html, /<link rel="icon" href="data:,"/);
});
