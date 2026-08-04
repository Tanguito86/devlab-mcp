import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  realpathSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/*
 * GENERIC-LLM-REF-01 structural validator — multi-source (DEVLAB-DEEPSEEK-01).
 *
 * Legacy constants below remain exported for backward compatibility with the
 * original awesome-llm-apps tests. New sources are validated against the
 * central registry (external-sources/registry.json), which is the source of
 * truth for identity, pins, and allowlists. The registry is the only place
 * where an allowlist may be extended; manifests must match it exactly.
 *
 * The validator never fetches, never executes external code, and never
 * advances an upstream checkout.
 */

// ---------------------------------------------------------------------------
// Legacy single-source data (awesome-llm-apps) — kept for backward compatibility
// ---------------------------------------------------------------------------

export const SOURCE_ID = "awesome-llm-apps";
export const SOURCE_URL = "https://github.com/Shubhamsaboo/awesome-llm-apps";
export const PINNED_COMMIT = "779e9f9bcf87fa8cd95870a438b70b84e47d3173";
export const ALLOWLIST = new Map([
  ["agent_skills/scope-creep-detector", "candidate_for_audit"],
  ["agent_skills/commit-archaeologist", "candidate_for_audit"],
  ["agent_skills/dependency-doctor", "candidate_for_audit"],
  ["agent_skills/evals", "reference_architecture_only"],
]);

export const VALID_STATUSES = new Set([
  "candidate_for_audit",
  "reference_architecture_only",
]);

export const VALID_INTEGRATION_MODES = new Set([
  "external-curated-reference",
  "reference-architecture",
]);

export const VALID_REGISTRY_STATUSES = new Set([
  "CURATED_REFERENCE / AUDIT_PENDING",
  "REFERENCE_ARCHITECTURE / EXECUTION_NOT_AUTHORIZED",
]);

const FULL_SHA = /^[0-9a-f]{40}$/;
const FULL_HASH = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function check(name, passed, detail = "") {
  return { name, passed: Boolean(passed), detail };
}

function sameMembers(actual, expected) {
  return actual.length === expected.length
    && actual.every((item) => expected.includes(item));
}

function isSafeRegistryPath(value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) {
    return false;
  }
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    return false;
  }
  if (/[*?]/.test(value)) {
    return false;
  }
  const segments = value.split("/");
  // A colon in any segment is rejected: it permits drive-relative paths
  // ("C:foo") and NTFS Alternate Data Streams ("file:stream") on Windows.
  return segments.every((segment) =>
    segment !== "" && segment !== "." && segment !== ".." && !segment.includes(":"));
}

function pathSegmentsAreRegular(root, registryPath, { finalType = "file" } = {}) {
  if (!isSafeRegistryPath(registryPath)) return false;
  let current = root;
  const segments = registryPath.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]);
    if (!existsSync(current)) return false;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) return false;
    const final = index === segments.length - 1;
    if (!final && !stat.isDirectory()) return false;
    if (final && finalType === "file" && !stat.isFile()) return false;
    if (final && finalType === "directory" && !stat.isDirectory()) return false;
  }
  const realRoot = realpathSync(root);
  const realTarget = realpathSync(current);
  return realTarget === realRoot || realTarget.startsWith(realRoot + sep);
}

function isNormalizedGitHubUrl(value) {
  return typeof value === "string"
    && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function ownerOf(repository) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\//.exec(repository || "");
  return match ? match[1].toLowerCase() : "";
}

function detectSpdx(text) {
  if (/apache license[\s,]+version 2\.0/i.test(text)) return "Apache-2.0";
  if (/mit license/i.test(text)
    || /permission is hereby granted, free of charge, to any person/i.test(text)) return "MIT";
  if (/redistribution and use in source and binary forms/i.test(text)) return "BSD-3-Clause";
  if (/isc license/i.test(text)) return "ISC";
  if (/gnu (affero )?general public license/i.test(text) && /version 3/i.test(text)) {
    return "GPL-3.0";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Central registry (external-sources/registry.json)
// ---------------------------------------------------------------------------

export function loadRegistry(repoRoot) {
  const path = join(repoRoot, "external-sources", "registry.json");
  if (!existsSync(path)) {
    throw new Error("Missing central registry: external-sources/registry.json");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function registryEntryFor(registry, sourceId) {
  const sources = Array.isArray(registry?.sources) ? registry.sources : [];
  return sources.find((entry) => entry.id === sourceId) || null;
}

export function validateRegistry(registry) {
  const checks = [];
  const sources = Array.isArray(registry?.sources) ? registry.sources : [];
  checks.push(check("registry_well_formed", registry?.schema_version === 1
    && Array.isArray(registry.sources) && sources.length > 0));
  const ids = sources.map((entry) => entry.id);
  checks.push(check("registry_source_ids_unique", new Set(ids).size === ids.length));
  checks.push(check("registry_source_ids_valid", ids.every((id) =>
    typeof id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(id))));
  checks.push(check("registry_pins_full_sha", sources.every((entry) =>
    FULL_SHA.test(entry.pinned_commit || ""))));
  checks.push(check("registry_urls_normalized", sources.every((entry) =>
    isNormalizedGitHubUrl(entry.repository))));
  checks.push(check("registry_default_branches", sources.every((entry) =>
    typeof entry.default_branch === "string" && entry.default_branch.length > 0)));
  checks.push(check("registry_allowlist_paths_safe", sources.every((entry) =>
    (entry.components || []).every((component) => isSafeRegistryPath(component.path)))));
  checks.push(check("registry_allowlist_paths_unique", sources.every((entry) => {
    const paths = (entry.components || []).map((component) => component.path);
    return new Set(paths).size === paths.length;
  })));
  checks.push(check("registry_allowlist_no_wildcards", sources.every((entry) =>
    (entry.components || []).every((component) => !/[*?]/.test(component.path)))));
  checks.push(check("registry_component_statuses_valid", sources.every((entry) =>
    (entry.components || []).every((component) => VALID_STATUSES.has(component.status)))));
  return checks;
}

// ---------------------------------------------------------------------------
// Manifest validation (multi-source)
// ---------------------------------------------------------------------------

export function validateManifest(manifest, sourceId = SOURCE_ID, registryEntry = null) {
  const checks = [];
  const components = Array.isArray(manifest.components) ? manifest.components : [];
  const paths = components.map((component) => component?.path);
  const expectedUrl = registryEntry?.repository || SOURCE_URL;
  const expectedPin = registryEntry?.pinned_commit || PINNED_COMMIT;
  const expectedAllowlist = registryEntry
    ? (registryEntry.components || []).map((component) => component.path)
    : [...ALLOWLIST.keys()];
  const license = manifest.license || {};
  const verifiedFiles = Array.isArray(manifest.verified_files) ? manifest.verified_files : [];
  const verifiedPaths = verifiedFiles.map((entry) => entry?.path);
  const fileComponentPaths = components
    .filter((component) => component?.type === "file")
    .map((component) => component.path);

  checks.push(check("schema_version", manifest.schema_version === 1));
  checks.push(check("source_id", manifest.id === sourceId));
  checks.push(check("normalized_repository_url", manifest.repository === expectedUrl
    && isNormalizedGitHubUrl(manifest.repository)));
  checks.push(check("default_branch", manifest.default_branch
    === (registryEntry?.default_branch || "main")));
  checks.push(check("full_pinned_commit", FULL_SHA.test(manifest.pinned_commit || "")
    && manifest.pinned_commit === expectedPin));
  checks.push(check("license_declared",
    typeof license.spdx === "string" && license.spdx.length > 0
    && (license.path == null
      ? license.status === "UNRESOLVED" && license.reuse_authorized === false
      : isSafeRegistryPath(license.path) && FULL_HASH.test(license.sha256 || "")
        && (license.status === undefined || license.status === "VERIFIED")
        && license.reuse_authorized !== true)));
  checks.push(check("integration_mode", VALID_INTEGRATION_MODES.has(manifest.integration_mode)));
  checks.push(check("automatic_updates_disabled", manifest.automatic_updates === false));
  checks.push(check("manual_upstream_check_recorded",
    manifest.manual_upstream_check?.reference === "refs/heads/main"
    && FULL_SHA.test(manifest.manual_upstream_check?.observed_commit || "")
    && typeof manifest.manual_upstream_check?.drift_from_pin === "boolean"));
  checks.push(check("safe_component_paths", paths.every(isSafeRegistryPath)));
  checks.push(check("component_paths_unique", new Set(paths).size === paths.length));
  checks.push(check("allowlist_exact", sameMembers(paths, expectedAllowlist)));
  checks.push(check("component_statuses", components.every((component) =>
    VALID_STATUSES.has(component.status)
    && (registryEntry
      ? (registryEntry.components || []).some((expected) =>
        expected.path === component.path && expected.status === component.status)
      : ALLOWLIST.get(component.path) === component.status))));
  checks.push(check("component_file_counts_declared", components.every((component) =>
    Number.isInteger(component.expected_file_count) && component.expected_file_count > 0
    && (component.type === "file" ? component.expected_file_count === 1 : true))));
  checks.push(check("checkout_not_versioned", manifest.local_checkout?.versioned === false
    && manifest.local_checkout?.config_file === ".external-sources.local.json"
    && manifest.local_checkout?.environment_variable === "DEVLAB_EXTERNAL_CACHE"));
  checks.push(check("external_execution_disabled", manifest.execution_policy?.installed === false
    && manifest.execution_policy?.enabled === false
    && manifest.execution_policy?.external_code_executed === false
    && manifest.execution_policy?.external_dependencies_installed === false));
  checks.push(check("nothing_approved", manifest.approval?.components_installed === 0
    && manifest.approval?.components_approved === 0));
  checks.push(check("verified_hashes_declared", Array.isArray(manifest.verified_files)
    && verifiedFiles.length >= 5
    && verifiedFiles.every((entry) => isSafeRegistryPath(entry.path)
      && FULL_HASH.test(entry.sha256 || ""))));
  checks.push(check("verified_file_paths_unique",
    new Set(verifiedPaths).size === verifiedPaths.length));
  checks.push(check("file_components_fully_hashed",
    fileComponentPaths.every((path) => verifiedPaths.includes(path))));
  checks.push(check("registry_status_known", manifest.registry_status === undefined
    || VALID_REGISTRY_STATUSES.has(manifest.registry_status)));
  checks.push(check("license_unresolved_required", license.path != null
    || (license.status === "UNRESOLVED" && license.reuse_authorized === false)));
  checks.push(check("wildcard_allowlist_rejected", paths.every((path) => !/[*?]/.test(path))));

  return checks;
}

// ---------------------------------------------------------------------------
// Repository isolation (no runtime coupling from this repo to external sources)
// ---------------------------------------------------------------------------

function collectForbiddenTokens(repoRoot) {
  const tokens = new Set([SOURCE_ID.toLowerCase(), ownerOf(SOURCE_URL)]);
  try {
    const registry = loadRegistry(repoRoot);
    for (const entry of registry.sources || []) {
      tokens.add(entry.id.toLowerCase());
      tokens.add(ownerOf(entry.repository));
    }
  } catch {
    // no registry -> legacy tokens only
  }
  return [...tokens].filter(Boolean);
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundledDependencies",
  "bundleDependencies",
  "overrides",
  "resolutions",
  "workspaces",
  "imports",
];

const PNPM_DEPENDENCY_FIELDS = [
  "overrides",
  "packageExtensions",
  "patchedDependencies",
];

function valueContainsForbiddenToken(value, forbidden) {
  const text = JSON.stringify(value).toLowerCase();
  return forbidden.some((token) => text.includes(token));
}

function isContainedLocalNodeScript(manifestPath, command) {
  if (typeof command !== "string") return false;
  const match = /^node\s+(scripts\/[A-Za-z0-9][A-Za-z0-9._/-]*\.mjs)(?:\s+[A-Za-z0-9][A-Za-z0-9:_-]*)?$/.exec(command);
  return Boolean(match)
    && pathSegmentsAreRegular(dirname(manifestPath), match[1], { finalType: "file" });
}

function packageManifestHasExternalRuntimeCoupling(path, forbidden) {
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    const dependencyValues = DEPENDENCY_FIELDS
      .filter((field) => Object.hasOwn(manifest, field))
      .map((field) => manifest[field]);
    if (manifest.pnpm && typeof manifest.pnpm === "object") {
      for (const field of PNPM_DEPENDENCY_FIELDS) {
        if (Object.hasOwn(manifest.pnpm, field)) dependencyValues.push(manifest.pnpm[field]);
      }
    }
    if (dependencyValues.some((value) => valueContainsForbiddenToken(value, forbidden))) {
      return true;
    }
    const scripts = manifest.scripts && typeof manifest.scripts === "object"
      ? Object.values(manifest.scripts)
      : [];
    return scripts.some((command) => valueContainsForbiddenToken(command, forbidden)
      && !isContainedLocalNodeScript(path, command));
  } catch {
    // A malformed runtime manifest cannot prove isolation.
    return true;
  }
}

export function validateRepositoryIsolation(repoRoot) {
  const checks = [];
  const ignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
  const packageManifests = [join(repoRoot, "package.json")];
  const runtimeMetadata = [
    join(repoRoot, "pnpm-lock.yaml"),
    join(repoRoot, "pnpm-workspace.yaml"),
  ];
  const packageFiles = readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(repoRoot, "packages", entry.name, "package.json"));
  const forbidden = collectForbiddenTokens(repoRoot);

  packageManifests.push(...packageFiles);
  const manifestsClean = packageManifests.every((path) => !existsSync(path)
    || !packageManifestHasExternalRuntimeCoupling(path, forbidden));
  const metadataClean = runtimeMetadata.every((path) => {
    if (!existsSync(path)) return true;
    const text = readFileSync(path, "utf8").toLowerCase();
    return forbidden.every((token) => !text.includes(token));
  });
  const runtimeClean = manifestsClean && metadataClean;
  const modulesPath = join(repoRoot, ".gitmodules");
  const noSubmodule = !existsSync(modulesPath)
    || forbidden.every((token) => !readFileSync(modulesPath, "utf8").toLowerCase().includes(token));

  checks.push(check("external_cache_ignored", ignore.includes("/.external-cache/")));
  checks.push(check("local_config_ignored", ignore.includes("/.external-sources.local.json")));
  checks.push(check("no_external_runtime_dependency", runtimeClean));
  checks.push(check("no_external_submodule", noSubmodule));
  checks.push(check("no_copied_agent_skills_root", !existsSync(join(repoRoot, "agent_skills"))));
  return checks;
}

// ---------------------------------------------------------------------------
// Checkout validation
// ---------------------------------------------------------------------------

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runGit(checkout, args) {
  return execFileSync("git", ["-C", checkout, ...args], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function runGitQuiet(checkout, args) {
  try {
    return runGit(checkout, args);
  } catch {
    return null;
  }
}

function inventoryRegularFiles(root) {
  const files = [];
  const unsafe = [];
  function visit(current) {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stat = lstatSync(path);
      // lstatSync reports symlinks, junctions, and other reparse points on
      // Windows as symbolic links; anything that is not a regular file or
      // directory is flagged as irregular.
      if (stat.isSymbolicLink()) {
        unsafe.push(`${relative(root, path).split(sep).join("/")} (symlink/junction)`);
      } else if (stat.isDirectory()) {
        visit(path);
      } else if (stat.isFile()) {
        files.push(relative(root, path).split(sep).join("/"));
      } else {
        unsafe.push(`${relative(root, path).split(sep).join("/")} (irregular)`);
      }
    }
  }
  visit(root);
  return { files, unsafe };
}

export function validateCheckout(checkout, manifest) {
  const root = resolve(checkout);
  const checks = [];
  const componentResults = [];
  checks.push(check("checkout_exists", existsSync(root)));
  if (!existsSync(root)) return { checks, components: componentResults };

  const components = Array.isArray(manifest?.components) ? manifest.components : [];
  const verifiedFiles = Array.isArray(manifest?.verified_files) ? manifest.verified_files : [];
  const manifestPaths = [
    ...components.map((component) => component?.path),
    ...verifiedFiles.map((entry) => entry?.path),
    ...(manifest?.license?.path ? [manifest.license.path] : []),
  ];
  const manifestPathsSafe = manifestPaths.every(isSafeRegistryPath);
  checks.push(check("checkout_manifest_paths_safe", manifestPathsSafe));
  if (!manifestPathsSafe) return { checks, components: componentResults };

  let head = "";
  let status = "";
  let remote = "";
  let detached = false;
  try {
    head = runGit(root, ["rev-parse", "HEAD"]);
    status = runGit(root, ["status", "--porcelain"]);
    remote = runGit(root, ["remote", "get-url", "origin"]);
    detached = runGitQuiet(root, ["symbolic-ref", "-q", "HEAD"]) === null;
  } catch (error) {
    checks.push(check("checkout_is_git", false, error.message));
    return { checks, components: componentResults };
  }

  checks.push(check("checkout_is_git", true));
  checks.push(check("checkout_pin_exact", head === manifest.pinned_commit, head));
  checks.push(check("checkout_detached", detached));
  checks.push(check("checkout_clean", status === "", status));
  checks.push(check("checkout_origin", remote === manifest.repository
    || remote === `${manifest.repository}.git`, remote));

  for (const component of components) {
    const componentPath = join(root, ...component.path.split("/"));
    const isFileComponent = component.type === "file";
    const exists = existsSync(componentPath);
    let regularFiles = 0;
    let unsafeEntries = [];
    if (exists) {
      const stat = lstatSync(componentPath);
      if (isFileComponent) {
        if (!pathSegmentsAreRegular(root, component.path, { finalType: "file" })) {
          unsafeEntries.push(`${component.path} (symlink/junction)`);
        } else if (stat.isFile()) {
          regularFiles = 1;
        } else {
          unsafeEntries.push(`${component.path} (irregular)`);
        }
      } else if (stat.isDirectory()
        && pathSegmentsAreRegular(root, component.path, { finalType: "directory" })) {
        const inventory = inventoryRegularFiles(componentPath);
        regularFiles = inventory.files.length;
        unsafeEntries = inventory.unsafe;
      } else {
        unsafeEntries.push(`${component.path} (irregular)`);
      }
    }
    const result = {
      path: component.path,
      status: component.status,
      type: isFileComponent ? "file" : "directory",
      exists,
      regular_files: regularFiles,
      expected_files: component.expected_file_count,
      unsafe_entries: unsafeEntries,
      passed: exists
        && regularFiles === component.expected_file_count
        && unsafeEntries.length === 0,
    };
    componentResults.push(result);
  }
  checks.push(check("allowlisted_paths_exist", componentResults.every((entry) => entry.exists)));
  checks.push(check("allowlisted_entries_regular", componentResults.every((entry) =>
    entry.unsafe_entries.length === 0)));
  checks.push(check("allowlisted_file_counts", componentResults.every((entry) => entry.passed)));

  const hashResults = verifiedFiles.map((entry) => {
    const file = join(root, ...entry.path.split("/"));
    const actual = existsSync(file)
      && pathSegmentsAreRegular(root, entry.path, { finalType: "file" })
      ? sha256File(file)
      : null;
    return { path: entry.path, expected: entry.sha256, actual, passed: actual === entry.sha256 };
  });
  checks.push(check("verified_file_hashes", hashResults.every((entry) => entry.passed)));

  // License material + text consistency (generalized from the original
  // Apache-only check). A manifest without a license file must declare
  // UNRESOLVED; a manifest with a license file must have material that
  // matches the declared SPDX identifier.
  const license = manifest.license || {};
  const licensePath = license.path ? join(root, ...license.path.split("/")) : null;
  const licenseMaterial = licensePath
    && existsSync(licensePath)
    && pathSegmentsAreRegular(root, license.path, { finalType: "file" });
  checks.push(check("license_material_present", licensePath ? Boolean(licenseMaterial)
    : true, licensePath ? "" : "no license file declared (UNRESOLVED)"));
  if (licenseMaterial) {
    const detected = detectSpdx(readFileSync(licensePath, "utf8"));
    checks.push(check("license_text_consistent", detected === license.spdx,
      `declared=${license.spdx} detected=${detected}`));
  } else {
    checks.push(check("license_text_consistent", true, "no license file to verify"));
  }

  return { checks, components: componentResults, hashes: hashResults, head, remote };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function allPassed(checks) {
  return checks.every((entry) => entry.passed);
}

export function runValidation({ repoRoot, manifestPath, checkout = null }) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const registry = loadRegistry(repoRoot);
  const entry = registryEntryFor(registry, manifest.id);
  const structural = [
    ...validateRegistry(registry),
    ...validateManifest(manifest, manifest.id, entry),
    ...validateRepositoryIsolation(repoRoot),
  ];
  const checkoutResult = checkout && allPassed(structural)
    ? validateCheckout(checkout, manifest)
    : null;
  const passed = allPassed(structural)
    && (!checkoutResult || allPassed(checkoutResult.checks));
  return { manifest, structural, checkout: checkoutResult, passed };
}

function writeReports(result, manifestPath) {
  const reportDir = dirname(manifestPath);
  const validation = {
    source: result.manifest.id,
    reviewed_on: result.manifest.reviewed_on,
    pinned_commit: result.manifest.pinned_commit,
    passed: result.passed,
    structural_checks: result.structural,
    checkout_checks: result.checkout?.checks || [],
    components: result.checkout?.components || [],
    verified_files: result.checkout?.hashes || [],
  };
  writeFileSync(join(reportDir, "allowlist-validation.json"),
    `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  const allChecks = [...result.structural, ...(result.checkout?.checks || [])];
  const passedCount = allChecks.filter((entry) => entry.passed).length;
  const lines = [
    "GENERIC-LLM-REF-01 structural validation",
    `SOURCE: ${result.manifest.id}`,
    `PIN: ${result.manifest.pinned_commit}`,
    `MODE: ${result.checkout ? "OFFLINE_PLUS_EXTERNAL_CHECKOUT" : "OFFLINE"}`,
    `CHECKS: ${passedCount}/${allChecks.length} PASS`,
    `RESULT: ${result.passed ? "PASS" : "FAIL"}`,
    "EXTERNAL_CODE_EXECUTED: 0",
    "EXTERNAL_DEPENDENCIES_INSTALLED: 0",
    "",
    ...allChecks.map((entry) => `${entry.passed ? "PASS" : "FAIL"} ${entry.name}${entry.detail ? ` -- ${entry.detail}` : ""}`),
  ];
  writeFileSync(join(reportDir, "structural-test-report.txt"), `${lines.join("\n")}\n`, "utf8");
}

function parseArgs(argv) {
  const options = { checkout: null, configuredCheckout: false, writeReports: false, source: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--checkout") options.checkout = argv[++index];
    else if (argv[index] === "--configured-checkout") options.configuredCheckout = true;
    else if (argv[index] === "--write-reports") options.writeReports = true;
    else if (argv[index] === "--source") options.source = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (options.checkout && options.configuredCheckout) {
    throw new Error("Use either --checkout or --configured-checkout, not both");
  }
  return options;
}

function configuredCheckout(repoRoot, sourceId) {
  const configPath = join(repoRoot, ".external-sources.local.json");
  if (!existsSync(configPath)) {
    throw new Error("Missing ignored local config: .external-sources.local.json");
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (typeof config.cache_root !== "string" || config.cache_root.length === 0) {
    throw new Error("Local config must define a non-empty cache_root");
  }
  return join(resolve(config.cache_root), sourceId);
}

function requireRegisteredSource(registry, sourceId) {
  if (typeof sourceId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(sourceId)
    || !registryEntryFor(registry, sourceId)) {
    throw new Error(`Unknown or unsafe source id: ${JSON.stringify(sourceId)}`);
  }
  return sourceId;
}

function manifestPathFor(repoRoot, sourceId) {
  return join(repoRoot, "external-sources", sourceId, "external-source-manifest.json");
}

async function main() {
  const scriptPath = fileURLToPath(import.meta.url);
  const repoRoot = resolve(dirname(scriptPath), "..");
  const options = parseArgs(process.argv.slice(2));
  const registry = loadRegistry(repoRoot);
  const sourceIds = options.source
    ? [requireRegisteredSource(registry, options.source)]
    : (registry.sources || []).map((entry) => entry.id);

  let anyFailed = false;
  for (const sourceId of sourceIds) {
    const manifestPath = manifestPathFor(repoRoot, sourceId);
    if (!existsSync(manifestPath)) {
      console.error(`FAIL missing manifest for ${sourceId}: ${manifestPath}`);
      anyFailed = true;
      continue;
    }
    const checkout = options.configuredCheckout
      ? configuredCheckout(repoRoot, sourceId)
      : options.checkout;
    const result = runValidation({ repoRoot, manifestPath, checkout });
    if (options.writeReports) writeReports(result, manifestPath);
    for (const entry of [...result.structural, ...(result.checkout?.checks || [])]) {
      console.log(`${entry.passed ? "PASS" : "FAIL"} ${entry.name}${entry.detail ? ` -- ${entry.detail}` : ""}`);
    }
    console.log(`SOURCE ${sourceId} RESULT ${result.passed ? "PASS" : "FAIL"}`);
    anyFailed = anyFailed || !result.passed;
  }
  process.exitCode = anyFailed ? 1 : 0;
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
