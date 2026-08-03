import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SOURCE_ID,
  validateManifest,
  validateRepositoryIsolation,
} from "../scripts/validate-external-source.mjs";

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testsDir, "..");
const manifestPath = join(repoRoot, "external-sources", SOURCE_ID,
  "external-source-manifest.json");
const validManifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function cloneManifest() {
  return structuredClone(validManifest);
}

function failedChecks(manifest) {
  return validateManifest(manifest).filter((entry) => !entry.passed).map((entry) => entry.name);
}

test("canonical manifest passes offline validation", () => {
  assert.deepEqual(failedChecks(validManifest), []);
});

test("repository has no runtime dependency or submodule", () => {
  const failures = validateRepositoryIsolation(repoRoot).filter((entry) => !entry.passed);
  assert.deepEqual(failures, []);
});

test("repository URL is exact and normalized", () => {
  const manifest = cloneManifest();
  manifest.repository = "git@github.com:Shubhamsaboo/awesome-llm-apps.git";
  assert.ok(failedChecks(manifest).includes("normalized_repository_url"));
});

test("short or changed commit pins fail", () => {
  const manifest = cloneManifest();
  manifest.pinned_commit = "779e9f9";
  assert.ok(failedChecks(manifest).includes("full_pinned_commit"));
});

test("automatic updates cannot be enabled", () => {
  const manifest = cloneManifest();
  manifest.automatic_updates = true;
  assert.ok(failedChecks(manifest).includes("automatic_updates_disabled"));
});

for (const unsafePath of [
  "../scope-creep-detector",
  "/agent_skills/scope-creep-detector",
  "C:/agent_skills/scope-creep-detector",
  "agent_skills\\scope-creep-detector",
]) {
  test(`unsafe allowlist path is rejected: ${unsafePath}`, () => {
    const manifest = cloneManifest();
    manifest.components[0].path = unsafePath;
    assert.ok(failedChecks(manifest).includes("safe_component_paths"));
  });
}

test("an additional component is rejected", () => {
  const manifest = cloneManifest();
  manifest.components.push({
    path: "advanced_ai_agents/single_agent_apps/ai_agent_governance",
    status: "candidate_for_audit",
    expected_file_count: 1,
  });
  assert.ok(failedChecks(manifest).includes("allowlist_exact"));
});

test("a missing allowlisted component is rejected", () => {
  const manifest = cloneManifest();
  manifest.components.pop();
  assert.ok(failedChecks(manifest).includes("allowlist_exact"));
});

test("duplicate component paths are rejected", () => {
  const manifest = cloneManifest();
  manifest.components[1].path = manifest.components[0].path;
  assert.ok(failedChecks(manifest).includes("component_paths_unique"));
});

test("unapproved component status is rejected", () => {
  const manifest = cloneManifest();
  manifest.components[0].status = "approved";
  assert.ok(failedChecks(manifest).includes("component_statuses"));
});

test("installation, enablement, execution, and dependency flags are fail-closed", () => {
  for (const key of [
    "installed",
    "enabled",
    "external_code_executed",
    "external_dependencies_installed",
  ]) {
    const manifest = cloneManifest();
    manifest.execution_policy[key] = true;
    assert.ok(failedChecks(manifest).includes("external_execution_disabled"), key);
  }
});

test("components cannot become approved through the intake manifest", () => {
  const manifest = cloneManifest();
  manifest.approval.components_approved = 1;
  assert.ok(failedChecks(manifest).includes("nothing_approved"));
});
