import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadRegistry,
  validateRegistry,
  validateManifest,
  validateRepositoryIsolation,
  runValidation,
} from "../scripts/validate-external-source.mjs";

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testsDir, "..");

function failed(checks) {
  return checks.filter((entry) => !entry.passed).map((entry) => entry.name);
}

function readManifest(sourceId) {
  return JSON.parse(readFileSync(
    join(repoRoot, "external-sources", sourceId, "external-source-manifest.json"),
    "utf8",
  ));
}

test("central registry is well-formed, unique, and fully valid", () => {
  const registry = loadRegistry(repoRoot);
  assert.deepEqual(failed(validateRegistry(registry)), []);
  const ids = registry.sources.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, "source ids must be unique");
  assert.ok(ids.includes("awesome-llm-apps"), "awesome-llm-apps stays registered");
  assert.ok(ids.includes("threejs-skills"), "threejs-skills is registered");
  assert.ok(ids.includes("jungle-trail"), "jungle-trail is registered");
});

test("awesome-llm-apps manifest still passes legacy validation", () => {
  const manifest = readManifest("awesome-llm-apps");
  assert.deepEqual(failed(validateManifest(manifest)), []);
});

test("all registered manifests pass multi-source validation against the registry", () => {
  const registry = loadRegistry(repoRoot);
  for (const source of registry.sources) {
    const manifest = readManifest(source.id);
    assert.deepEqual(failed(validateManifest(manifest, source.id, source)), [], source.id);
  }
});

test("every registry entry matches its on-disk manifest exactly", () => {
  const registry = loadRegistry(repoRoot);
  for (const source of registry.sources) {
    const manifest = readManifest(source.id);
    assert.equal(manifest.id, source.id);
    assert.equal(manifest.repository, source.repository);
    assert.equal(manifest.default_branch, source.default_branch);
    assert.equal(manifest.pinned_commit, source.pinned_commit);
    assert.deepEqual(
      manifest.components.map((component) => component.path),
      source.components.map((component) => component.path),
      `${source.id} allowlist paths`,
    );
    assert.deepEqual(
      manifest.components.map((component) => component.status),
      source.components.map((component) => component.status),
      `${source.id} allowlist statuses`,
    );
  }
});

test("repository isolation holds for all registered sources", () => {
  assert.deepEqual(failed(validateRepositoryIsolation(repoRoot)), []);
});

test("runValidation passes offline for every source", () => {
  const registry = loadRegistry(repoRoot);
  for (const source of registry.sources) {
    const result = runValidation({
      repoRoot,
      manifestPath: join(repoRoot, "external-sources", source.id,
        "external-source-manifest.json"),
    });
    assert.equal(result.passed, true, source.id);
  }
});

test("threejs-skills license is recorded as UNRESOLVED, not as verified MIT", () => {
  const manifest = readManifest("threejs-skills");
  assert.equal(manifest.license.spdx, "MIT");
  assert.equal(manifest.license.path, null);
  assert.equal(manifest.license.status, "UNRESOLVED");
  assert.equal(manifest.license.reuse_authorized, false);
});

test("jungle-trail license is MIT with material file and sha256", () => {
  const manifest = readManifest("jungle-trail");
  assert.equal(manifest.license.spdx, "MIT");
  assert.equal(manifest.license.path, "LICENSE");
  assert.equal(manifest.license.status, "VERIFIED");
  assert.match(manifest.license.sha256, /^[0-9a-f]{64}$/);
});

test("jungle-trail is registered as reference-architecture with execution disabled", () => {
  const manifest = readManifest("jungle-trail");
  assert.equal(manifest.integration_mode, "reference-architecture");
  assert.equal(manifest.registry_status, "REFERENCE_ARCHITECTURE / EXECUTION_NOT_AUTHORIZED");
  assert.equal(manifest.execution_policy.installed, false);
  assert.equal(manifest.execution_policy.enabled, false);
  assert.equal(manifest.execution_policy.external_code_executed, false);
  assert.equal(manifest.execution_policy.external_dependencies_installed, false);
});
