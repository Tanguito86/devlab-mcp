import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadRegistry,
  validateRegistry,
  validateManifest,
  validateRepositoryIsolation,
  validateCheckout,
  runValidation,
  sha256File,
} from "../scripts/validate-external-source.mjs";

/*
 * Adversarial fixtures: every case must fail CLOSED. Fixtures are synthetic
 * git repositories created in a temporary directory — the real external
 * checkouts are never touched.
 */

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testsDir, "..");
const registry = loadRegistry(repoRoot);
const source = registry.sources.find((entry) => entry.id === "threejs-skills");
const THREEJS_REPO = source.repository;

const tmpDirs = [];
after(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

function cloneManifest(sourceId) {
  return structuredClone(JSON.parse(readFileSync(
    join(repoRoot, "external-sources", sourceId, "external-source-manifest.json"),
    "utf8",
  )));
}

function failed(checks) {
  return checks.filter((entry) => !entry.passed).map((entry) => entry.name);
}

function git(dir, args) {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", windowsHide: true }).trim();
}

/**
 * Build a synthetic checkout that satisfies the manifest (right pin, clean,
 * detached, all allowlisted files present, hashes aligned), then optionally
 * corrupt one dimension.
 */
function buildFixture(manifest, {
  omit = [],             // allowlisted paths to omit
  dirty = false,         // modify a tracked file after commit
  branch = false,        // leave HEAD on a branch instead of detached
  junctionReplace = null, // allowlisted path replaced by a junction (escape)
  licenseText = null,    // content override for the LICENSE file
  wrongPin = false,      // manifest pinned_commit forced to a different sha
  notGit = false,        // create a plain directory instead of a git repo
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "devlab-adv-"));
  tmpDirs.push(dir);
  if (notGit) {
    for (const component of manifest.components) {
      const p = join(dir, ...component.path.split("/"));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, "x");
    }
    return { dir, manifest };
  }

  git(dir, ["init", "-q"]);
  git(dir, ["remote", "add", "origin", manifest.repository]);
  const content = (rel) => rel === "LICENSE" && licenseText
    ? licenseText
    : `content of ${rel}\n`;
  for (const component of manifest.components) {
    if (omit.includes(component.path)) continue;
    const p = join(dir, ...component.path.split("/"));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content(component.path));
  }
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.name=fixture", "-c", "user.email=fixture@test.local",
    "commit", "-q", "-m", "fixture"]);
  const head = git(dir, ["rev-parse", "HEAD"]);

  // Align manifest hashes with the fixture so only the attacked dimension fails.
  const hashes = {};
  for (const component of manifest.components) {
    const p = join(dir, ...component.path.split("/"));
    try { hashes[component.path] = sha256File(p); } catch { /* omitted */ }
  }
  manifest.verified_files = manifest.components
    .filter((component) => hashes[component.path])
    .map((component) => ({ path: component.path, sha256: hashes[component.path] }));
  if (manifest.license?.path && hashes[manifest.license.path]) {
    manifest.license.sha256 = hashes[manifest.license.path];
  }
  if (wrongPin) manifest.pinned_commit = "0".repeat(40);
  else manifest.pinned_commit = head;

  if (junctionReplace) {
    const target = join(dir, "__escape_target__");
    mkdirSync(target, { recursive: true });
    rmSync(join(dir, ...junctionReplace.split("/")), { force: true });
    symlinkSync(target, join(dir, ...junctionReplace.split("/")), "junction");
  }
  if (dirty) writeFileSync(join(dir, ...manifest.components[0].path.split("/")), "dirty\n");
  if (!branch) git(dir, ["checkout", "-q", "--detach", "HEAD"]);
  return { dir, manifest };
}

function manifestFails(manifest, ...names) {
  const failures = failed(validateManifest(manifest, manifest.id, source));
  for (const name of names) assert.ok(failures.includes(name), `expected "${name}" to fail, got ${failures.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Manifest-level adversarial cases (offline)
// ---------------------------------------------------------------------------

test("wrong pin fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  manifest.pinned_commit = "a".repeat(40);
  manifestFails(manifest, "full_pinned_commit");
});

test("short SHA pin fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  manifest.pinned_commit = "b1c6230";
  manifestFails(manifest, "full_pinned_commit");
});

test("path traversal in allowlist fails closed", () => {
  for (const bad of ["../escape", "skills/../../etc/passwd", "a/../b"]) {
    const manifest = cloneManifest("threejs-skills");
    manifest.components[0].path = bad;
    manifestFails(manifest, "safe_component_paths");
  }
});

test("absolute allowlist path fails closed", () => {
  for (const bad of ["/etc/passwd", "C:/Windows/system32", "skills/C:/x"]) {
    const manifest = cloneManifest("threejs-skills");
    manifest.components[0].path = bad;
    manifestFails(manifest, "safe_component_paths");
  }
});

test("backslash allowlist path fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  manifest.components[0].path = "skills\\threejs-fundamentals\\SKILL.md";
  manifestFails(manifest, "safe_component_paths");
});

test("duplicate source IDs in the registry fail closed", () => {
  const broken = structuredClone(registry);
  broken.sources.push(structuredClone(broken.sources[0]));
  const failures = failed(validateRegistry(broken));
  assert.ok(failures.includes("registry_source_ids_unique"), failures.join(", "));
});

test("URL and owner incoherence fails closed", () => {
  for (const bad of [
    "git@github.com:CloudAI-X/threejs-skills.git",
    "https://github.com/OtherOwner/threejs-skills",
    "https://evil.example.com/CloudAI-X/threejs-skills",
  ]) {
    const manifest = cloneManifest("threejs-skills");
    manifest.repository = bad;
    manifestFails(manifest, "normalized_repository_url");
  }
});

test("declared MIT without license file must be UNRESOLVED and non-reusable", () => {
  const manifest = cloneManifest("threejs-skills");
  manifest.license.status = "VERIFIED";
  manifestFails(manifest, "license_declared", "license_unresolved_required");
  const manifest2 = cloneManifest("threejs-skills");
  manifest2.license.reuse_authorized = true;
  manifestFails(manifest2, "license_unresolved_required");
});

test("automatic updates enabled fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  manifest.automatic_updates = true;
  manifestFails(manifest, "automatic_updates_disabled");
});

test("execution accidentally enabled fails closed", () => {
  for (const key of ["installed", "enabled", "external_code_executed", "external_dependencies_installed"]) {
    const manifest = cloneManifest("threejs-skills");
    manifest.execution_policy[key] = true;
    manifestFails(manifest, "external_execution_disabled");
  }
});

test("unknown component status fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  manifest.components[0].status = "approved";
  manifestFails(manifest, "component_statuses");
});

test("wildcard allowlist fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  manifest.components[0].path = "skills/*";
  manifestFails(manifest, "safe_component_paths", "wildcard_allowlist_rejected");
});

test("invalid integration mode fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  manifest.integration_mode = "installed";
  manifestFails(manifest, "integration_mode");
});

test("unknown registry status fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  manifest.registry_status = "APPROVED / PRODUCTION";
  manifestFails(manifest, "registry_status_known");
});

test("malformed manifest JSON throws (fail closed)", () => {
  const dir = mkdtempSync(join(tmpdir(), "devlab-badjson-"));
  tmpDirs.push(dir);
  writeFileSync(join(dir, "bad.json"), "{ not json !!!");
  assert.throws(() => runValidation({
    repoRoot,
    manifestPath: join(dir, "bad.json"),
  }), SyntaxError);
});

// ---------------------------------------------------------------------------
// Checkout-level adversarial cases (synthetic git fixtures)
// ---------------------------------------------------------------------------

test("missing checkout fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  const result = validateCheckout(join(tmpdir(), "does-not-exist-xyz"), manifest);
  assert.ok(failed(result.checks).includes("checkout_exists"));
});

test("checkout that is not a git repository fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  const { dir } = buildFixture(manifest, { notGit: true });
  const result = validateCheckout(dir, manifest);
  assert.ok(failed(result.checks).includes("checkout_is_git"));
});

test("wrong pinned checkout fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  const { dir } = buildFixture(manifest, { wrongPin: true });
  const result = validateCheckout(dir, manifest);
  assert.ok(failed(result.checks).includes("checkout_pin_exact"));
});

test("dirty checkout fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  const { dir } = buildFixture(manifest, { dirty: true });
  const result = validateCheckout(dir, manifest);
  assert.ok(failed(result.checks).includes("checkout_clean"));
});

test("branch checkout instead of detached HEAD fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  const { dir } = buildFixture(manifest, { branch: true });
  const result = validateCheckout(dir, manifest);
  assert.ok(failed(result.checks).includes("checkout_detached"));
});

test("missing allowlisted file fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  const { dir } = buildFixture(manifest, { omit: ["skills/threejs-shaders/SKILL.md"] });
  const result = validateCheckout(dir, manifest);
  assert.ok(failed(result.checks).includes("allowlisted_paths_exist"));
});

test("junction/symlink escape inside allowlist fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  const { dir } = buildFixture(manifest, { junctionReplace: "README.md" });
  const result = validateCheckout(dir, manifest);
  assert.ok(failed(result.checks).includes("allowlisted_entries_regular"));
});

test("stale verified hash fails closed", () => {
  const manifest = cloneManifest("threejs-skills");
  const { dir } = buildFixture(manifest);
  manifest.verified_files[0].sha256 = "0".repeat(64);
  const result = validateCheckout(dir, manifest);
  assert.ok(failed(result.checks).includes("verified_file_hashes"));
});

test("license text contradicting declared SPDX fails closed", () => {
  const manifest = cloneManifest("jungle-trail");
  const { dir } = buildFixture(manifest, {
    licenseText: "Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/\n",
  });
  const result = validateCheckout(dir, manifest);
  assert.ok(failed(result.checks).includes("license_text_consistent"));
});

test("declared license without material file in checkout is reported", () => {
  const manifest = cloneManifest("threejs-skills");
  const { dir } = buildFixture(manifest);
  const result = validateCheckout(dir, manifest);
  assert.ok(failed(result.checks).every((name) => name !== "license_material_present"),
    "UNRESOLVED manifest without license file must not fail material check");
});

test("clean detached aligned fixture passes all checkout checks (control)", () => {
  const manifest = cloneManifest("threejs-skills");
  const { dir } = buildFixture(manifest);
  const result = validateCheckout(dir, manifest);
  assert.deepEqual(failed(result.checks), [], result.checks.map((c) => `${c.name}:${c.passed}`).join(", "));
});

// ---------------------------------------------------------------------------
// Product coupling adversarial cases
// ---------------------------------------------------------------------------

function fakeRepoRoot({ dependencyInPackage }) {
  const root = mkdtempSync(join(tmpdir(), "devlab-isolation-"));
  tmpDirs.push(root);
  writeFileSync(join(root, ".gitignore"), "/.external-cache/\n/.external-sources.local.json\n");
  mkdirSync(join(root, "external-sources"), { recursive: true });
  writeFileSync(join(root, "external-sources", "registry.json"),
    JSON.stringify(registry, null, 2));
  mkdirSync(join(root, "packages", "pkg"), { recursive: true });
  writeFileSync(join(root, "packages", "pkg", "package.json"), JSON.stringify({
    name: "pkg",
    dependencies: dependencyInPackage ? { "threejs-skills": "^1.0.0" } : {},
  }));
  return root;
}

test("product runtime dependency on an external source fails closed", () => {
  const root = fakeRepoRoot({ dependencyInPackage: true });
  const failures = failed(validateRepositoryIsolation(root));
  assert.ok(failures.includes("no_external_runtime_dependency"), failures.join(", "));
});

test("clean product tree passes isolation (control)", () => {
  const root = fakeRepoRoot({ dependencyInPackage: false });
  assert.deepEqual(failed(validateRepositoryIsolation(root)), []);
});
