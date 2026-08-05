import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runAtomicBuild, runBuildBatch } from "../dist/index.js";

const manifest = (id, marker = "stable") => ({ schemaVersion: 1, assetId: id, marker });
const adapter = (id, behavior = "success") => ({ id, async build(request, stagingDirectory) {
  void stagingDirectory;
  if (behavior === "throw") throw new Error(id);
  const state = behavior === "required" ? { status: "CHANGES_REQUIRED", openBlockers: [], openRequired: [id] } : behavior === "blocked" ? { status: "BLOCKED", openBlockers: [id], openRequired: [] } : { status: "SUCCESS", openBlockers: [], openRequired: [] };
  return { ...state, artifactManifest: manifest(request.assetId), outputBytes: 42 };
} });

test("ATOMIC STAGING: success promotes by rename and reuse is byte-safe", async () => {
  const root = await mkdtemp(join(tmpdir(), "asset-forge-atomic-"));
  try {
    const request = { assetId: "valid-asset", version: "1.0.0", buildId: "build-a", resume: false };
    const first = await runAtomicBuild(root, request, adapter("valid")); assert.equal(first.status, "SUCCESS"); assert.equal(first.promoted, true); assert.ok(first.canonicalDirectory); await stat(first.canonicalDirectory);
    const second = await runAtomicBuild(root, { ...request, buildId: "build-b" }, adapter("valid")); assert.equal(second.reused, true); assert.equal(second.promoted, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ATOMIC STAGING: failure is marked and never appears under canonical artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "asset-forge-failed-"));
  try {
    const result = await runAtomicBuild(root, { assetId: "capture-failed", version: "1.0.0", buildId: "failed", resume: false }, adapter("CAPTURE_FAILED", "throw"));
    assert.equal(result.status, "BLOCKED"); assert.equal(result.promoted, false); assert.equal(result.failureCode, "INTERNAL_FAILURE");
    const state = JSON.parse(await readFile(join(result.stagingDirectory, "staging-state.json"), "utf8")); assert.equal(state.state, "FAILED"); await assert.rejects(stat(join(root, "artifacts", "capture-failed", "1.0.0")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ATOMIC STAGING: immutable version rejects different regenerated manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "asset-forge-immutable-"));
  try {
    const request = { assetId: "immutable", version: "1.0.0", buildId: "one", resume: false }; await runAtomicBuild(root, request, adapter("one"));
    const different = { id: "different", async build(req) { return { status: "SUCCESS", openBlockers: [], openRequired: [], artifactManifest: manifest(req.assetId, "changed"), outputBytes: 43 }; } };
    const result = await runAtomicBuild(root, { ...request, buildId: "two" }, different); assert.equal(result.status, "BLOCKED"); assert.equal(result.failureCode, "VERSION_IMMUTABLE");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BATCH BUILD: deterministic mixed fixtures are isolated and summarized", async () => {
  const root = await mkdtemp(join(tmpdir(), "asset-forge-batch-"));
  try {
    const fixtures = [
      { assetId: "valid-asset", version: "1.0.0", adapter: adapter("valid") },
      { assetId: "invalid-spec", version: "1.0.0", adapter: adapter("SPEC_INVALID", "throw") },
      { assetId: "budget-exceeded", version: "1.0.0", adapter: adapter("BUDGET_MAX", "required") },
      { assetId: "factory-missing", version: "1.0.0", adapter: adapter("FACTORY_MISSING", "throw") },
      { assetId: "capture-failed", version: "1.0.0", adapter: adapter("CAPTURE_FAILED", "throw") },
      { assetId: "critic-required", version: "1.0.0", adapter: adapter("CRITIC_REQUIRED", "required") },
      { assetId: "dispose-failed", version: "1.0.0", adapter: adapter("DISPOSE_FAILED", "blocked") },
    ];
    const result = await runBuildBatch(root, { batchId: "mixed-fixtures", concurrency: 2, resume: false, assets: fixtures });
    assert.equal(result.status, "MIXED"); assert.deepEqual(result.results.map(({ assetId }) => assetId), [...fixtures].map(({ assetId }) => assetId).sort());
    assert.deepEqual(result.summary, { total: 7, succeeded: 1, changed: 2, blocked: 4 });
    const valid = result.results.find(({ assetId }) => assetId === "valid-asset"); assert.equal(valid.promoted, true);
    for (const failure of result.results.filter(({ status }) => status !== "SUCCESS")) assert.equal(failure.promoted, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BATCH BUILD: concurrency and asset limits fail closed", async () => {
  await assert.rejects(runBuildBatch(".", { batchId: "bad", concurrency: 0, resume: false, assets: [{ assetId: "a", version: "1.0.0", adapter: adapter("a") }] }), /between 1 and 4/);
  await assert.rejects(runBuildBatch(".", { batchId: "empty", concurrency: 1, resume: false, assets: [] }), /outside policy/);
});
