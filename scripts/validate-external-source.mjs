import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SOURCE_ID = "awesome-llm-apps";
export const SOURCE_URL = "https://github.com/Shubhamsaboo/awesome-llm-apps";
export const PINNED_COMMIT = "779e9f9bcf87fa8cd95870a438b70b84e47d3173";
export const ALLOWLIST = new Map([
  ["agent_skills/scope-creep-detector", "candidate_for_audit"],
  ["agent_skills/commit-archaeologist", "candidate_for_audit"],
  ["agent_skills/dependency-doctor", "candidate_for_audit"],
  ["agent_skills/evals", "reference_architecture_only"],
]);

const VALID_STATUSES = new Set([
  "candidate_for_audit",
  "reference_architecture_only",
]);

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
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function validateManifest(manifest) {
  const checks = [];
  const components = Array.isArray(manifest.components) ? manifest.components : [];
  const paths = components.map((component) => component?.path);

  checks.push(check("schema_version", manifest.schema_version === 1));
  checks.push(check("source_id", manifest.id === SOURCE_ID));
  checks.push(check("normalized_repository_url", manifest.repository === SOURCE_URL));
  checks.push(check("default_branch", manifest.default_branch === "main"));
  checks.push(check("full_pinned_commit", /^[0-9a-f]{40}$/.test(manifest.pinned_commit || "")
    && manifest.pinned_commit === PINNED_COMMIT));
  checks.push(check("license_declared", manifest.license?.spdx === "Apache-2.0"
    && manifest.license?.path === "LICENSE"
    && /^[0-9a-f]{64}$/.test(manifest.license?.sha256 || "")));
  checks.push(check("integration_mode", manifest.integration_mode === "external-curated-reference"));
  checks.push(check("automatic_updates_disabled", manifest.automatic_updates === false));
  checks.push(check("manual_upstream_check_recorded",
    manifest.manual_upstream_check?.reference === "refs/heads/main"
    && /^[0-9a-f]{40}$/.test(manifest.manual_upstream_check?.observed_commit || "")
    && typeof manifest.manual_upstream_check?.drift_from_pin === "boolean"));
  checks.push(check("safe_component_paths", paths.every(isSafeRegistryPath)));
  checks.push(check("component_paths_unique", new Set(paths).size === paths.length));
  checks.push(check("allowlist_exact", sameMembers(paths, [...ALLOWLIST.keys()])));
  checks.push(check("component_statuses", components.every((component) =>
    VALID_STATUSES.has(component.status) && ALLOWLIST.get(component.path) === component.status)));
  checks.push(check("component_file_counts_declared", components.every((component) =>
    Number.isInteger(component.expected_file_count) && component.expected_file_count > 0)));
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
    && manifest.verified_files.length >= 5
    && manifest.verified_files.every((entry) => isSafeRegistryPath(entry.path)
      && /^[0-9a-f]{64}$/.test(entry.sha256 || ""))));

  return checks;
}

export function validateRepositoryIsolation(repoRoot) {
  const checks = [];
  const ignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
  const runtimeFiles = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];
  const forbidden = [SOURCE_ID.toLowerCase(), "shubhamsaboo"];
  const runtimeClean = runtimeFiles.every((name) => {
    const path = join(repoRoot, name);
    if (!existsSync(path)) return true;
    const text = readFileSync(path, "utf8").toLowerCase();
    return forbidden.every((token) => !text.includes(token));
  });
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

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runGit(checkout, args) {
  return execFileSync("git", ["-C", checkout, ...args], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function inventoryRegularFiles(root) {
  const files = [];
  const unsafe = [];
  function visit(current) {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        unsafe.push(relative(root, path).split(sep).join("/"));
      } else if (stat.isDirectory()) {
        visit(path);
      } else if (stat.isFile()) {
        files.push(relative(root, path).split(sep).join("/"));
      } else {
        unsafe.push(relative(root, path).split(sep).join("/"));
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

  let head = "";
  let status = "";
  let remote = "";
  try {
    head = runGit(root, ["rev-parse", "HEAD"]);
    status = runGit(root, ["status", "--porcelain"]);
    remote = runGit(root, ["remote", "get-url", "origin"]);
  } catch (error) {
    checks.push(check("checkout_is_git", false, error.message));
    return { checks, components: componentResults };
  }

  checks.push(check("checkout_is_git", true));
  checks.push(check("checkout_pin_exact", head === manifest.pinned_commit, head));
  checks.push(check("checkout_clean", status === "", status));
  checks.push(check("checkout_origin", remote === manifest.repository
    || remote === `${manifest.repository}.git`, remote));

  for (const component of manifest.components) {
    const componentRoot = join(root, ...component.path.split("/"));
    const exists = existsSync(componentRoot) && lstatSync(componentRoot).isDirectory();
    const inventory = exists ? inventoryRegularFiles(componentRoot) : { files: [], unsafe: [] };
    const result = {
      path: component.path,
      status: component.status,
      exists,
      regular_files: inventory.files.length,
      expected_files: component.expected_file_count,
      unsafe_entries: inventory.unsafe,
      passed: exists
        && inventory.files.length === component.expected_file_count
        && inventory.unsafe.length === 0,
    };
    componentResults.push(result);
  }
  checks.push(check("allowlisted_paths_exist", componentResults.every((entry) => entry.exists)));
  checks.push(check("allowlisted_entries_regular", componentResults.every((entry) =>
    entry.unsafe_entries.length === 0)));
  checks.push(check("allowlisted_file_counts", componentResults.every((entry) => entry.passed)));

  const hashResults = manifest.verified_files.map((entry) => {
    const file = join(root, ...entry.path.split("/"));
    const actual = existsSync(file) && lstatSync(file).isFile() ? sha256File(file) : null;
    return { path: entry.path, expected: entry.sha256, actual, passed: actual === entry.sha256 };
  });
  checks.push(check("verified_file_hashes", hashResults.every((entry) => entry.passed)));
  checks.push(check("license_matches_declaration", /Apache License\r?\n\s+Version 2\.0/
    .test(readFileSync(join(root, "LICENSE"), "utf8"))));

  return { checks, components: componentResults, hashes: hashResults, head, remote };
}

function allPassed(checks) {
  return checks.every((entry) => entry.passed);
}

function parseArgs(argv) {
  const options = { checkout: null, configuredCheckout: false, writeReports: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--checkout") options.checkout = argv[++index];
    else if (argv[index] === "--configured-checkout") options.configuredCheckout = true;
    else if (argv[index] === "--write-reports") options.writeReports = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (options.checkout && options.configuredCheckout) {
    throw new Error("Use either --checkout or --configured-checkout, not both");
  }
  return options;
}

function configuredCheckout(repoRoot) {
  const configPath = join(repoRoot, ".external-sources.local.json");
  if (!existsSync(configPath)) {
    throw new Error("Missing ignored local config: .external-sources.local.json");
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (typeof config.cache_root !== "string" || config.cache_root.length === 0) {
    throw new Error("Local config must define a non-empty cache_root");
  }
  return join(resolve(config.cache_root), SOURCE_ID);
}

export function runValidation({ repoRoot, manifestPath, checkout = null }) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const structural = [
    ...validateManifest(manifest),
    ...validateRepositoryIsolation(repoRoot),
  ];
  const checkoutResult = checkout ? validateCheckout(checkout, manifest) : null;
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

async function main() {
  const scriptPath = fileURLToPath(import.meta.url);
  const repoRoot = resolve(dirname(scriptPath), "..");
  const manifestPath = join(repoRoot, "external-sources", SOURCE_ID,
    "external-source-manifest.json");
  const options = parseArgs(process.argv.slice(2));
  const checkout = options.configuredCheckout ? configuredCheckout(repoRoot) : options.checkout;
  const result = runValidation({ repoRoot, manifestPath, checkout });
  if (options.writeReports) writeReports(result, manifestPath);
  for (const entry of [...result.structural, ...(result.checkout?.checks || [])]) {
    console.log(`${entry.passed ? "PASS" : "FAIL"} ${entry.name}${entry.detail ? ` -- ${entry.detail}` : ""}`);
  }
  console.log(`RESULT ${result.passed ? "PASS" : "FAIL"}`);
  process.exitCode = result.passed ? 0 : 1;
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
