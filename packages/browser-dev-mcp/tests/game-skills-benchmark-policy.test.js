import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const root = join(repoRoot, "benchmarks", "threejs-game-skills-ab");
const json = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const sha256 = (name) => createHash("sha256")
  .update(readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n"))
  .digest("hex");

test("benchmark source policy is fail-closed", () => {
  const policy = json("source-policy.json");
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.globalInstall, false);
  assert.equal(policy.externalScripts, false);
  assert.equal(policy.externalScaffold, false);
  assert.equal(policy.externalDependencies, false);
  assert.equal(policy.paidGenerators, false);
  assert.equal(policy.paidApiCalls, false);
  assert.equal(policy.copyExternalFilesIntoDevLab, false);
  assert.equal(policy.networkPolicy, "loopback-only");
  assert.equal(policy.hashVerificationRequired, true);
});

test("benchmark source and pin are exact", () => {
  const policy = json("source-policy.json");
  const manifest = json("selected-guidance-manifest.json");
  assert.equal(policy.source, "majidmanzarpour/threejs-game-skills");
  assert.equal(policy.pin, "7221c1f4a6d2ae189a4d85d058d24f3228499d46");
  assert.equal(manifest.source, policy.source);
  assert.equal(manifest.pin, policy.pin);
  assert.match(manifest.pin, /^[a-f0-9]{40}$/);
  assert.equal(policy.movingRefAllowed, false);
});

test("selected guidance allowlist is exact, unique and hashed", () => {
  const manifest = json("selected-guidance-manifest.json");
  assert.equal(manifest.allowedFiles.length, 25);
  const paths = manifest.allowedFiles.map((entry) => entry.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const entry of manifest.allowedFiles) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, entry.path);
    assert.equal(typeof entry.purpose, "string");
    assert.ok(entry.purpose.length > 0);
  }
});

test("allowlist rejects wildcard, traversal, absolute and Windows paths", () => {
  const manifest = json("selected-guidance-manifest.json");
  for (const { path } of manifest.allowedFiles) {
    assert.equal(isAbsolute(path), false, path);
    assert.doesNotMatch(path, /[*?\\]/, path);
    assert.equal(path.startsWith("/"), false, path);
    assert.equal(path.split("/").includes(".."), false, path);
    assert.doesNotMatch(path, /^[A-Za-z]:/, path);
  }
});

test("allowlist excludes installers, scripts, scaffold, assets and generators", () => {
  const paths = json("selected-guidance-manifest.json").allowedFiles.map((entry) => entry.path);
  for (const path of paths) {
    assert.notEqual(path, "install.sh");
    assert.equal(path.includes("/scripts/"), false, path);
    assert.equal(path.includes("/assets/"), false, path);
    assert.doesNotMatch(path, /threejs-(3d|image|audio)-generator/, path);
    assert.equal(path.includes("threejs-vite-game"), false, path);
  }
});

test("both legs use the same internal scaffold and WebGPU backend", () => {
  const a = json("leg-a-policy.json");
  const b = json("leg-b-policy.json");
  for (const field of ["scaffold", "renderer", "backend", "modelPolicy", "effort", "seed", "maximumAgentMinutes", "maximumReworkCycles", "network", "crossLegInformation"]) {
    assert.deepEqual(a[field], b[field], field);
  }
  assert.equal(a.scaffold, "devlab-internal-threejs-game-benchmark-v1");
  assert.equal(a.renderer, "Three.js WebGPURenderer");
  assert.equal(a.backend, "native-webgpu");
});

test("LEG_B treatment cannot enable external execution", () => {
  const a = json("leg-a-policy.json");
  const b = json("leg-b-policy.json");
  assert.equal(a.externalGuidanceLoaded, false);
  assert.equal(b.externalGuidanceLoaded, true);
  assert.equal(b.externalScripts, false);
  assert.equal(b.externalScaffold, false);
  assert.equal(b.globalInstall, false);
  assert.equal(b.paidApis, false);
  assert.equal(b.selectedGuidanceManifest, "selected-guidance-manifest.json");
});

test("benchmark distinguishes frozen and live determinism", () => {
  const determinism = json("benchmark-contract.json").determinism;
  assert.equal(determinism.frozenStateA_vs_A, "byte-and-pixel-equality-required");
  assert.equal(determinism.controlledStateChange, "known-change-must-be-detected");
  assert.equal(determinism.liveRunA_vs_A, "statistical-comparison-only");
  assert.equal(determinism.botPlaytest, "progress-robustness-and-softlocks-not-identical-replay");
  assert.equal(determinism.liveReplayByteEqualityRequired, false);
});

test("frozen prompt hash matches the contract", () => {
  const contract = json("benchmark-contract.json");
  assert.equal(contract.promptFile, "benchmark-prompt.md");
  assert.equal(contract.promptSha256, sha256(contract.promptFile));
});

test("result schema requires every scoring and safety domain", () => {
  const schema = json("result-schema.json");
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.properties.benchmark.const, "DEVLAB-THREEJS-GAME-SKILLS-AB-04");
  for (const field of ["correctness", "gameplay", "visual", "performance", "process", "determinism", "security", "artifacts"]) {
    assert.ok(schema.required.includes(field), field);
  }
  assert.equal(schema.additionalProperties, false);
});
