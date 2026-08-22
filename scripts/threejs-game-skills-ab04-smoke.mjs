#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertAuthorizedRunRoot,
  collectTreeEntries,
  repoRoot,
  treeSha256,
  verifyContract,
  verifyMaterializedBaseline,
} from "./threejs-game-skills-ab04.mjs";

const smokeScriptPath = fileURLToPath(import.meta.url);
const captureHarnessRoot = resolve(
  dirname(smokeScriptPath),
  "../packages/browser-dev-mcp/scripts/capture-harness",
);
const captureHarnessPath = join(captureHarnessRoot, "capture.js");
const captureHarnessFiles = ["capture.js", "browser-runtime.js", "server.js", "contract.js"];
const nodeExecutablePath = process.execPath;
const corepackLauncherPath = join(
  dirname(nodeExecutablePath),
  "node_modules", "corepack", "dist", "corepack.js",
);
const corepackLibraryPath = join(
  dirname(nodeExecutablePath),
  "node_modules", "corepack", "dist", "lib", "corepack.cjs",
);

function fail(message, code = "AB04_SMOKE_ERROR") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const options = {};
  while (args.length) {
    const flag = args.shift();
    if (!["--fixture-root", "--output-root", "--label"].includes(flag)) {
      fail(`unknown argument: ${flag}`, "UNKNOWN_ARGUMENT");
    }
    if (Object.hasOwn(options, flag)) fail(`duplicate argument: ${flag}`, "DUPLICATE_ARGUMENT");
    const value = args.shift();
    if (!value || value.startsWith("--")) fail(`missing value for ${flag}`, "MISSING_VALUE");
    options[flag] = value;
  }
  for (const required of ["--fixture-root", "--output-root", "--label"]) {
    if (!options[required]) fail(`missing ${required}`, "MISSING_ARGUMENT");
  }
  if (!/^[a-z0-9-]+$/.test(options["--label"])) fail("label is invalid", "INVALID_LABEL");
  return {
    fixtureRoot: options["--fixture-root"],
    outputRoot: options["--output-root"],
    label: options["--label"],
  };
}

function normalizeForComparison(path) {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function samePath(left, right) {
  return normalizeForComparison(left) === normalizeForComparison(right);
}

function assertExistingDirectoryNoLink(path, code, label) {
  if (!existsSync(path)) fail(`${label} does not exist`, code);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail(`${label} is linked or irregular`, code);
  }
  realpathSync(path);
}

function assertExistingFileNoLink(path, code, label) {
  if (!existsSync(path)) fail(`${label} does not exist`, code);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label} is linked or irregular`, code);
  realpathSync(path);
}

function sanitizedToolchainEnvironment() {
  const allowed = [
    "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA",
    "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "PATHEXT",
  ];
  const environment = {};
  for (const key of allowed) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  if (!environment.LOCALAPPDATA) fail("LOCALAPPDATA is required for pinned Corepack home", "TOOLCHAIN_INVALID");
  environment.PATH = process.platform === "win32"
    ? `${dirname(nodeExecutablePath)};${join(systemRoot, "System32")}`
    : dirname(nodeExecutablePath);
  environment.COREPACK_HOME = join(environment.LOCALAPPDATA, "node", "corepack");
  environment.COREPACK_ENABLE_NETWORK = "0";
  environment.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
  environment.npm_config_offline = "true";
  environment.PNPM_CONFIG_OFFLINE = "true";
  environment.npm_config_audit = "false";
  environment.npm_config_fund = "false";
  environment.CI = "1";
  environment.NO_COLOR = "1";
  return environment;
}

function rawPackageTree(root, label, { ignoreTopLevelNodeModules = false } = {}) {
  const realRoot = realpathSync(root);
  const entries = [];
  let byteLength = 0;
  const walk = (directory, depth) => {
    for (const name of readdirSync(directory).sort()) {
      if (ignoreTopLevelNodeModules && depth === 0 && name === "node_modules") continue;
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail(`${label} contains a linked entry: ${path}`, "TOOLCHAIN_INVALID");
      if (stat.isDirectory()) {
        walk(path, depth + 1);
      } else if (stat.isFile()) {
        const bytes = readFileSync(path);
        entries.push({
          path: relative(realRoot, path).replaceAll("\\", "/"),
          size: bytes.length,
          sha256: pngSha256(bytes),
        });
        byteLength += bytes.length;
      } else {
        fail(`${label} contains an irregular entry: ${path}`, "TOOLCHAIN_INVALID");
      }
    }
  };
  walk(realRoot, 0);
  return {
    root: realRoot,
    fileCount: entries.length,
    byteLength,
    treeSha256: pngSha256(Buffer.from(`${JSON.stringify(entries)}\n`, "utf8")),
  };
}

function expectToolHash(path, expected, label) {
  assertExistingFileNoLink(path, "TOOLCHAIN_INVALID", label);
  const observed = pngSha256(readFileSync(path));
  if (observed !== expected) fail(`${label} hash does not match the contract`, "TOOLCHAIN_INVALID");
  return { path: realpathSync(path), expectedSha256: expected, observedSha256: observed, match: true };
}

function authenticatePnpmDistribution(contract, environment) {
  const version = contract.scaffold.packageManager.split("@")[1];
  const packageRoot = join(environment.COREPACK_HOME, "v1", "pnpm", version);
  assertExistingDirectoryNoLink(environment.COREPACK_HOME, "TOOLCHAIN_INVALID", "Corepack home");
  assertExistingDirectoryNoLink(packageRoot, "TOOLCHAIN_INVALID", "pnpm package root");
  const anchors = contract.runtime.validationToolchain;
  const packageJson = expectToolHash(
    join(packageRoot, "package.json"),
    anchors.pnpmPackageJsonSha256,
    "pnpm package.json",
  );
  const parsed = JSON.parse(readFileSync(packageJson.path, "utf8"));
  if (parsed.name !== "pnpm" || parsed.version !== version || parsed.bin?.pnpm !== "bin/pnpm.cjs") {
    fail("pnpm package identity does not match the contract", "TOOLCHAIN_INVALID");
  }
  const launcher = expectToolHash(
    join(packageRoot, "bin", "pnpm.cjs"),
    anchors.pnpmLauncherSha256,
    "pnpm launcher",
  );
  const bundle = expectToolHash(
    join(packageRoot, "dist", "pnpm.cjs"),
    anchors.pnpmBundleSha256,
    "pnpm executable bundle",
  );
  const tree = rawPackageTree(packageRoot, "pnpm package");
  if (tree.treeSha256 !== anchors.pnpmPackageTreeSha256) {
    fail("pnpm package tree hash does not match the contract", "TOOLCHAIN_INVALID");
  }
  return { version, packageJson, launcher, bundle, tree, match: true };
}

function authenticateViteDistribution(nodeModulesRoot, contract) {
  const packagePath = join(nodeModulesRoot, "vite", "package.json");
  const packageRealPath = realpathSync(packagePath);
  const nodeModulesRealPath = realpathSync(nodeModulesRoot);
  if (!packageRealPath.startsWith(`${nodeModulesRealPath}${process.platform === "win32" ? "\\" : "/"}`)) {
    fail("Vite package resolved outside node_modules", "TOOLCHAIN_INVALID");
  }
  const anchors = contract.runtime.validationToolchain;
  const packageJson = expectToolHash(packageRealPath, anchors.vitePackageJsonSha256, "Vite package.json");
  const parsed = JSON.parse(readFileSync(packageRealPath, "utf8"));
  if (parsed.name !== "vite" || parsed.version !== contract.scaffold.exactDependencies.vite
    || parsed.bin?.vite !== "bin/vite.js") {
    fail("Vite package identity does not match the contract", "TOOLCHAIN_INVALID");
  }
  const packageRoot = dirname(packageRealPath);
  const executable = expectToolHash(
    join(packageRoot, "bin", "vite.js"),
    anchors.viteExecutableSha256,
    "Vite executable",
  );
  const tree = rawPackageTree(
    packageRoot,
    "Vite package",
    { ignoreTopLevelNodeModules: true },
  );
  if (tree.treeSha256 !== anchors.vitePackageTreeSha256) {
    fail("Vite package tree hash does not match the contract", "TOOLCHAIN_INVALID");
  }
  return { version: parsed.version, packageJson, executable, tree, match: true };
}

function isStrictlyContained(root, path) {
  const child = relative(realpathSync(root), realpathSync(path));
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function authenticateCaptureRuntimePackages(contract) {
  const anchors = contract.runtime.captureRuntimePackages;
  const pnpmStoreRoot = join(repoRoot, "node_modules", ".pnpm");
  assertExistingDirectoryNoLink(pnpmStoreRoot, "TOOLCHAIN_INVALID", "pnpm virtual store");
  const playwrightAlias = join(repoRoot, "packages", "browser-dev-mcp", "node_modules", "playwright");
  if (!existsSync(playwrightAlias) || !lstatSync(playwrightAlias).isSymbolicLink()) {
    fail("Playwright package alias is missing or not a pnpm link", "TOOLCHAIN_INVALID");
  }
  const playwrightRoot = realpathSync(playwrightAlias);
  if (!isStrictlyContained(pnpmStoreRoot, playwrightRoot)) {
    fail("Playwright package resolved outside the pnpm virtual store", "TOOLCHAIN_INVALID");
  }
  const playwrightRequire = createRequire(join(captureHarnessRoot, "browser-runtime.js"));
  const playwrightEntry = realpathSync(playwrightRequire.resolve("playwright"));
  if (!isStrictlyContained(playwrightRoot, playwrightEntry)) {
    fail("capture harness resolves an unauthenticated Playwright entrypoint", "TOOLCHAIN_INVALID");
  }
  const playwrightCoreAlias = join(dirname(playwrightRoot), "playwright-core");
  if (!existsSync(playwrightCoreAlias) || !lstatSync(playwrightCoreAlias).isSymbolicLink()) {
    fail("playwright-core dependency alias is missing or not a pnpm link", "TOOLCHAIN_INVALID");
  }
  const playwrightCoreRoot = realpathSync(playwrightCoreAlias);
  if (!isStrictlyContained(pnpmStoreRoot, playwrightCoreRoot)) {
    fail("playwright-core resolved outside the pnpm virtual store", "TOOLCHAIN_INVALID");
  }
  const playwrightCoreRequire = createRequire(join(playwrightRoot, "index.js"));
  const playwrightCoreEntry = realpathSync(playwrightCoreRequire.resolve("playwright-core"));
  if (!isStrictlyContained(playwrightCoreRoot, playwrightCoreEntry)) {
    fail("Playwright resolves an unauthenticated playwright-core entrypoint", "TOOLCHAIN_INVALID");
  }
  const authenticate = (name, packageRoot, entrypoint) => {
    const anchor = anchors[name];
    const packageJson = expectToolHash(
      join(packageRoot, "package.json"),
      anchor.packageJsonSha256,
      `${name} package.json`,
    );
    const parsed = JSON.parse(readFileSync(packageJson.path, "utf8"));
    if (parsed.name !== name || parsed.version !== anchor.version) {
      fail(`${name} package identity does not match the contract`, "TOOLCHAIN_INVALID");
    }
    const tree = rawPackageTree(packageRoot, `${name} package`);
    if (tree.fileCount !== anchor.fileCount || tree.treeSha256 !== anchor.treeSha256) {
      fail(`${name} package tree does not match the contract`, "TOOLCHAIN_INVALID");
    }
    return { version: parsed.version, packageJson, entrypoint, tree, match: true };
  };
  const playwright = authenticate("playwright", playwrightRoot, playwrightEntry);
  const playwrightCore = authenticate("playwright-core", playwrightCoreRoot, playwrightCoreEntry);
  if (JSON.parse(readFileSync(playwright.packageJson.path, "utf8")).dependencies?.["playwright-core"]
    !== anchors["playwright-core"].version) {
    fail("Playwright dependency pin does not match playwright-core", "TOOLCHAIN_INVALID");
  }
  return { playwright, "playwright-core": playwrightCore };
}

function authenticateBrowserDistribution(contract) {
  if (!process.env.LOCALAPPDATA) fail("LOCALAPPDATA is required for Chromium authentication", "TOOLCHAIN_INVALID");
  const distributionAlias = join(
    process.env.LOCALAPPDATA,
    "ms-playwright",
    contract.runtime.browserCacheRevision,
    contract.runtime.browserDistributionDirectoryName,
  );
  assertExistingDirectoryNoLink(distributionAlias, "TOOLCHAIN_INVALID", "Chromium distribution");
  const distributionRoot = realpathSync(distributionAlias);
  const executable = expectToolHash(
    join(distributionRoot, "chrome.exe"),
    contract.runtime.browserExecutableSha256,
    "Chromium executable",
  );
  const tree = rawPackageTree(distributionRoot, "Chromium distribution");
  if (tree.fileCount !== contract.runtime.browserDistributionFileCount
    || tree.byteLength !== contract.runtime.browserDistributionByteLength
    || tree.treeSha256 !== contract.runtime.browserDistributionTreeSha256) {
    fail("Chromium distribution tree does not match the contract", "TOOLCHAIN_INVALID");
  }
  return {
    cacheRevision: contract.runtime.browserCacheRevision,
    directoryName: contract.runtime.browserDistributionDirectoryName,
    executable,
    tree,
    match: true,
  };
}

function runCorepack(args, cwd, environment) {
  return spawnSync(nodeExecutablePath, [corepackLauncherPath, ...args], {
    cwd,
    env: environment,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function commandOutput(command, label, code) {
  const output = `${command.stdout || ""}${command.stderr || ""}`;
  if (command.status !== 0 || command.error) {
    fail(`${label} failed: ${command.error?.message || output}`, code);
  }
  return output;
}

function queryAuthorizedGpuInventory(environment) {
  if (process.platform !== "win32") fail("GPU inventory requires Windows", "GPU_INVENTORY_UNAVAILABLE");
  const powershellPath = join(
    process.env.SystemRoot || "C:\\Windows",
    "System32", "WindowsPowerShell", "v1.0", "powershell.exe",
  );
  assertExistingFileNoLink(powershellPath, "GPU_INVENTORY_UNAVAILABLE", "PowerShell executable");
  const query = "Get-CimInstance Win32_VideoController | Select-Object Name,PNPDeviceID,AdapterCompatibility,Status | ConvertTo-Json -Compress";
  const probe = spawnSync(powershellPath, ["-NoProfile", "-NonInteractive", "-Command", query], {
    env: environment,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = commandOutput(probe, "GPU inventory probe", "GPU_INVENTORY_UNAVAILABLE").trim();
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    fail("GPU inventory probe returned malformed JSON", "GPU_INVENTORY_UNAVAILABLE");
  }
  const adapters = Array.isArray(parsed) ? parsed : [parsed];
  const nvidia = adapters.filter((adapter) => /nvidia/i.test(`${adapter.Name} ${adapter.AdapterCompatibility}`));
  if (nvidia.length !== 1
    || nvidia[0].Name !== "NVIDIA GeForce RTX 2060"
    || !/VEN_10DE&DEV_1E89/i.test(nvidia[0].PNPDeviceID || "")
    || nvidia[0].Status !== "OK") {
    fail("the host does not expose exactly one healthy NVIDIA RTX 2060 (DEV_1E89)", "GPU_INVENTORY_MISMATCH");
  }
  return {
    adapters,
    authorizedNvidiaAdapter: nvidia[0],
    powershellPath,
    powershellSha256: pngSha256(readFileSync(powershellPath)),
    querySha256: pngSha256(Buffer.from(query, "utf8")),
  };
}

function assertEmptyOutput(path) {
  if (!existsSync(path)) return;
  assertExistingDirectoryNoLink(path, "OUTPUT_ROOT_INVALID", "output root");
  if (readdirSync(path).length > 0) fail("output root is not empty", "OUTPUT_NOT_EMPTY");
}

function prepareEmptyOutput(path) {
  assertEmptyOutput(path);
  if (!existsSync(path)) mkdirSync(path);
  assertExistingDirectoryNoLink(path, "OUTPUT_ROOT_INVALID", "output root");
}

function pngSha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function summarizeCapture(
  result,
  expectedWidth,
  expectedHeight,
  outputRoot,
  label,
  contract,
  browserDistribution,
) {
  if (result.consoleErrors.length || result.pageErrors.length || result.blockedRequests.length) {
    fail("runtime emitted console, page or blocked-network errors", "RUNTIME_ERRORS");
  }
  if (result.captures.length !== 1) fail("smoke expected one capture", "CAPTURE_COUNT");
  const capture = result.captures[0];
  if (capture.width !== expectedWidth || capture.height !== expectedHeight) {
    fail("captured viewport dimensions do not match the contract", "VIEWPORT_MISMATCH");
  }
  const resize = capture.metrics.resize;
  if (!resize || resize.canvasWidth !== expectedWidth || resize.canvasHeight !== expectedHeight
    || Math.abs(resize.cameraAspect - (expectedWidth / expectedHeight)) > 1e-9) {
    fail("runtime resize metrics do not match the viewport", "RESIZE_MISMATCH");
  }
  // The scaffold's ready() rejects a non-WebGPU renderer before capture. The
  // harness then independently probes the actual browser adapter below. Extra
  // scaffold metrics are intentionally stripped by validateSceneMetrics().
  const browser = result.environment.browser;
  if (browser?.browserType !== "chromium"
    || browser.browserVersion !== contract.runtime.browserVersion
    || browser.executableSha256 !== contract.runtime.browserExecutableSha256
    || browser.launchMode !== "full-chromium-native-webgpu"
    || browser.requestedBackend !== contract.scaffold.backend
    || realpathSync(browser.executablePath) !== browserDistribution.executable.path) {
    fail("browser identity does not match the contract", "BROWSER_IDENTITY_MISMATCH");
  }
  const adapter = result.environment.nativeWebGPU?.adapter;
  const identity = [adapter?.vendor, adapter?.architecture, adapter?.device, adapter?.description]
    .filter(Boolean).join(" ").toLowerCase();
  const gpuRenderer = String(result.environment.gpuRenderer || "").toLowerCase();
  if (!identity.includes("nvidia") || !identity.includes("turing")
    || !gpuRenderer.includes("nvidia geforce rtx 2060")
    || adapter?.isFallbackAdapter === true) {
    fail(`unexpected hardware adapter: ${identity || "unknown"}`, "HARDWARE_ADAPTER_MISMATCH");
  }
  let nonblank = 0;
  for (let index = 0; index < capture.rgba.length; index += 4) {
    if (capture.rgba[index + 3] > 0
      && (capture.rgba[index] + capture.rgba[index + 1] + capture.rgba[index + 2]) > 12) nonblank += 1;
  }
  const nonblankShare = nonblank / (capture.width * capture.height);
  if (!(nonblankShare > 0.01)) fail("title capture is blank", "BLANK_CAPTURE");
  const pngName = `${label}.png`;
  const pngPath = join(outputRoot, pngName);
  const rgbaName = `${label}.rgba`;
  const rgbaPath = join(outputRoot, rgbaName);
  writeFileSync(pngPath, capture.png);
  writeFileSync(rgbaPath, capture.rgba);
  if (!readFileSync(pngPath).equals(capture.png)) {
    fail("persisted PNG bytes differ from the captured frame", "PERSISTED_PNG_MISMATCH");
  }
  if (!readFileSync(rgbaPath).equals(capture.rgba)) {
    fail("persisted RGBA bytes differ from the measured frame", "PERSISTED_RGBA_MISMATCH");
  }
  return {
    label,
    width: capture.width,
    height: capture.height,
    png: pngName,
    pngSha256: pngSha256(capture.png),
    rgba: rgbaName,
    rgbaSha256: pngSha256(capture.rgba),
    rgbaByteLength: capture.rgba.length,
    nonblankShare,
    metrics: capture.metrics,
    environment: result.environment,
    consoleErrors: result.consoleErrors,
    pageErrors: result.pageErrors,
    blockedRequests: result.blockedRequests,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isAbsolute(args.fixtureRoot)) fail("fixture root must be absolute", "FIXTURE_NOT_ABSOLUTE");
  if (!isAbsolute(args.outputRoot)) fail("output root must be absolute", "OUTPUT_NOT_ABSOLUTE");
  const fixtureRoot = resolve(args.fixtureRoot);
  const outputRoot = resolve(args.outputRoot);

  const verification = verifyContract();
  const contract = verification.contract;
  const legName = basename(fixtureRoot);
  if (legName !== "leg-a" && legName !== "leg-b") {
    fail("fixture root must be leg-a or leg-b", "FIXTURE_LEG_INVALID");
  }
  const requestedRunRoot = dirname(fixtureRoot);
  const runRoot = assertAuthorizedRunRoot(requestedRunRoot, contract, {
    runRootBase: dirname(requestedRunRoot),
  });
  if (!samePath(fixtureRoot, join(runRoot, legName))) {
    fail("fixture root must be a direct child of the authorized run root", "FIXTURE_OUTSIDE_RUN_ROOT");
  }
  assertExistingDirectoryNoLink(fixtureRoot, "FIXTURE_ROOT_INVALID", "fixture root");

  const expectedOutputName = `smoke-${legName}`;
  if (basename(outputRoot) !== expectedOutputName
    || !samePath(dirname(outputRoot), runRoot)
    || !samePath(outputRoot, join(runRoot, expectedOutputName))) {
    fail(`output root must be the exact ${expectedOutputName} sibling`, "OUTPUT_ROOT_INVALID");
  }
  assertEmptyOutput(outputRoot);

  const baseline = verifyMaterializedBaseline(
    fixtureRoot,
    contract,
    verification,
    { allowGeneratedRoot: true },
  );
  const distRoot = join(fixtureRoot, "dist");
  const nodeModulesRoot = join(fixtureRoot, "node_modules");
  prepareEmptyOutput(outputRoot);
  assertExistingFileNoLink(nodeExecutablePath, "TOOLCHAIN_INVALID", "Node executable");
  assertExistingFileNoLink(corepackLauncherPath, "TOOLCHAIN_INVALID", "Corepack launcher");
  assertExistingFileNoLink(corepackLibraryPath, "TOOLCHAIN_INVALID", "Corepack library");
  const toolchainEnvironment = sanitizedToolchainEnvironment();
  const toolchainAnchors = contract.runtime.validationToolchain;
  if (process.version !== toolchainAnchors.nodeVersion) {
    fail(`unexpected Node version: ${process.version}`, "TOOLCHAIN_INVALID");
  }
  const nodeAuthentication = expectToolHash(
    nodeExecutablePath,
    toolchainAnchors.nodeExecutableSha256,
    "Node executable",
  );
  const corepackLauncherAuthentication = expectToolHash(
    corepackLauncherPath,
    toolchainAnchors.corepackLauncherSha256,
    "Corepack launcher",
  );
  const corepackLibraryAuthentication = expectToolHash(
    corepackLibraryPath,
    toolchainAnchors.corepackLibrarySha256,
    "Corepack library",
  );
  const captureHarnessAuthentication = {};
  for (const fileName of captureHarnessFiles) {
    captureHarnessAuthentication[fileName] = expectToolHash(
      join(captureHarnessRoot, fileName),
      contract.runtime.captureHarnessFilesSha256[fileName],
      `DevLab capture harness ${fileName}`,
    );
  }
  const captureRuntimePackagesBefore = authenticateCaptureRuntimePackages(contract);
  const browserDistributionBefore = authenticateBrowserDistribution(contract);
  const captureModule = await import(pathToFileURL(captureHarnessPath).href);
  if (typeof captureModule.runCapture !== "function") {
    fail("authenticated capture harness has no runCapture export", "TOOLCHAIN_INVALID");
  }
  const { runCapture } = captureModule;
  const pnpmAuthenticationBefore = authenticatePnpmDistribution(contract, toolchainEnvironment);
  const corepackVersion = commandOutput(
    runCorepack(["--version"], fixtureRoot, toolchainEnvironment),
    "Corepack version probe",
    "TOOLCHAIN_INVALID",
  ).trim();
  if (corepackVersion !== toolchainAnchors.corepackVersion) {
    fail(`unexpected Corepack version: ${corepackVersion}`, "TOOLCHAIN_INVALID");
  }
  const pnpmVersion = commandOutput(
    runCorepack(["pnpm", "--version"], fixtureRoot, toolchainEnvironment),
    "pnpm version probe",
    "TOOLCHAIN_INVALID",
  ).trim();
  if (pnpmVersion !== contract.scaffold.packageManager.split("@")[1]) {
    fail(`unexpected pnpm version: ${pnpmVersion}`, "TOOLCHAIN_INVALID");
  }
  if (existsSync(nodeModulesRoot)) {
    assertExistingDirectoryNoLink(nodeModulesRoot, "NODE_MODULES_INVALID", "node_modules root");
    if (!samePath(nodeModulesRoot, join(fixtureRoot, "node_modules"))) {
      fail("node_modules path escaped fixture", "NODE_MODULES_INVALID");
    }
    rmSync(nodeModulesRoot, { recursive: true, force: true });
  }
  if (existsSync(distRoot)) {
    assertExistingDirectoryNoLink(distRoot, "DIST_INVALID", "dist root");
    if (!samePath(distRoot, join(fixtureRoot, "dist"))) fail("dist path escaped fixture", "DIST_INVALID");
    rmSync(distRoot, { recursive: true, force: true });
  }
  const installCommand = "corepack pnpm install --frozen-lockfile --offline";
  const install = runCorepack(
    ["pnpm", "install", "--frozen-lockfile", "--offline"],
    fixtureRoot,
    toolchainEnvironment,
  );
  const installLog = commandOutput(install, "authenticated frozen install", "INSTALL_FAILED");
  assertExistingDirectoryNoLink(nodeModulesRoot, "NODE_MODULES_INVALID", "node_modules root");
  const installLogName = "install.log";
  const installLogPath = join(outputRoot, installLogName);
  writeFileSync(installLogPath, installLog, "utf8");
  if (readFileSync(installLogPath, "utf8") !== installLog) {
    fail("persisted install log differs from command output", "PERSISTED_LOG_MISMATCH");
  }
  const viteAuthenticationBefore = authenticateViteDistribution(nodeModulesRoot, contract);
  const buildCommand = `node ${viteAuthenticationBefore.executable.path} build`;
  const build = spawnSync(
    nodeExecutablePath,
    [viteAuthenticationBefore.executable.path, "build"],
    {
      cwd: fixtureRoot,
      env: toolchainEnvironment,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const buildLog = commandOutput(build, "authenticated fixture build", "BUILD_FAILED");
  const buildLogName = "build.log";
  const buildLogPath = join(outputRoot, buildLogName);
  writeFileSync(buildLogPath, buildLog, "utf8");
  if (readFileSync(buildLogPath, "utf8") !== buildLog) {
    fail("persisted build log differs from command output", "PERSISTED_LOG_MISMATCH");
  }
  assertExistingDirectoryNoLink(distRoot, "DIST_INVALID", "dist root");
  const buildEntries = collectTreeEntries(distRoot, { includeIgnored: true, raw: false });
  const buildRawEntries = collectTreeEntries(distRoot, { includeIgnored: true, raw: true });
  if (buildEntries.length === 0) fail("dist root is empty", "DIST_EMPTY");
  if (buildEntries.length !== buildRawEntries.length
    || buildEntries.some((entry, index) => entry.path !== buildRawEntries[index]?.path)) {
    fail("canonical and raw build inventories differ", "BUILD_INVENTORY_MISMATCH");
  }
  const buildTreeSha256 = treeSha256(buildEntries);
  const buildRawTreeSha256 = treeSha256(buildRawEntries);
  const lockEntry = baseline.entries.find((entry) => entry.path === "pnpm-lock.yaml");
  const packageEntry = baseline.entries.find((entry) => entry.path === "package.json");
  if (!lockEntry) fail("authenticated baseline has no lockfile", "BASELINE_LOCK_MISSING");
  if (!packageEntry) fail("authenticated baseline has no package manifest", "BASELINE_PACKAGE_MISSING");

  const gpuInventory = queryAuthorizedGpuInventory(toolchainEnvironment);
  const cases = [
    ["desktop", contract.viewports.desktop.width, contract.viewports.desktop.height],
    ["mobile", contract.viewports.mobile.width, contract.viewports.mobile.height],
  ];
  const captures = [];
  for (const [name, width, height] of cases) {
    const tag = `${args.label}-${name}`;
    const result = await runCapture({
      fixtureRoot: distRoot,
      seed: contract.worldSeed,
      timeMs: contract.runtime.frozenCaptureTimeMs,
      viewpoints: ["title"],
      tag,
      backend: "native-webgpu",
      viewportWidth: width,
      viewportHeight: height,
      requireNativeWebGPU: true,
      readyTimeoutMs: 30000,
      captureTimeoutMs: 30000,
    });
    captures.push(summarizeCapture(
      result,
      width,
      height,
      outputRoot,
      tag,
      contract,
      browserDistributionBefore,
    ));
  }
  const postCaptureBuildTreeSha256 = treeSha256(collectTreeEntries(distRoot, { includeIgnored: true }));
  const postCaptureBuildRawTreeSha256 = treeSha256(collectTreeEntries(distRoot, { includeIgnored: true, raw: true }));
  if (postCaptureBuildTreeSha256 !== buildTreeSha256
    || postCaptureBuildRawTreeSha256 !== buildRawTreeSha256) {
    fail("build tree changed during capture", "BUILD_CHANGED_DURING_CAPTURE");
  }
  const postCaptureBaseline = verifyMaterializedBaseline(
    fixtureRoot,
    contract,
    verification,
    { allowGeneratedRoot: true },
  );
  if (postCaptureBaseline.treeSha256 !== baseline.treeSha256) {
    fail("authenticated source tree changed during build or capture", "BASELINE_CHANGED_DURING_CAPTURE");
  }
  const pnpmAuthenticationAfter = authenticatePnpmDistribution(contract, toolchainEnvironment);
  const viteAuthenticationAfter = authenticateViteDistribution(nodeModulesRoot, contract);
  const captureRuntimePackagesAfter = authenticateCaptureRuntimePackages(contract);
  const browserDistributionAfter = authenticateBrowserDistribution(contract);
  if (JSON.stringify(pnpmAuthenticationAfter) !== JSON.stringify(pnpmAuthenticationBefore)
    || JSON.stringify(viteAuthenticationAfter) !== JSON.stringify(viteAuthenticationBefore)
    || JSON.stringify(captureRuntimePackagesAfter) !== JSON.stringify(captureRuntimePackagesBefore)
    || JSON.stringify(browserDistributionAfter) !== JSON.stringify(browserDistributionBefore)) {
    fail("authenticated package bytes changed during smoke validation", "TOOLCHAIN_CHANGED");
  }
  const runRootName = basename(runRoot);
  const evidenceClass = runRootName === contract.materialization.productionRunRootName
    ? "PRODUCTION"
    : "VALIDATION";
  const summary = {
    schemaVersion: 1,
    status: "PASS",
    contractVersion: contract.contractVersion,
    contractSha256: verification.contractSha256,
    scaffoldId: contract.scaffold.id,
    scaffoldTreeSha256: baseline.treeSha256,
    baselineFileCount: baseline.entries.length,
    baselineLockfileSha256: lockEntry.sha256,
    baselinePackageSha256: packageEntry.sha256,
    smokeScriptSha256: pngSha256(readFileSync(smokeScriptPath)),
    captureHarness: captureHarnessAuthentication,
    captureRuntimePackages: captureRuntimePackagesAfter,
    browserDistribution: browserDistributionAfter,
    toolchain: {
      nodeVersion: process.version,
      node: nodeAuthentication,
      corepackVersion,
      corepackLauncher: corepackLauncherAuthentication,
      corepackLibrary: corepackLibraryAuthentication,
      corepackHome: toolchainEnvironment.COREPACK_HOME,
      pnpmVersion,
      pnpmDistribution: pnpmAuthenticationAfter,
      viteVersion: viteAuthenticationAfter.version,
      viteDistribution: viteAuthenticationAfter,
      environmentPolicy: "SANITIZED_ALLOWLIST_COREPACK_AND_PNPM_OFFLINE",
      corepackNetworkEnabled: false,
      pnpmOffline: true,
      allContractAnchorsMatched: true,
    },
    gpuInventory,
    installCommand,
    installLog: installLogName,
    installLogSha256: pngSha256(Buffer.from(installLog, "utf8")),
    buildCommand,
    packageManager: contract.scaffold.packageManager,
    buildLogSha256: pngSha256(Buffer.from(buildLog, "utf8")),
    buildLog: buildLogName,
    buildTreeSha256,
    buildRawTreeSha256,
    postCaptureBuildTreeSha256,
    postCaptureBuildRawTreeSha256,
    buildFileCount: buildEntries.length,
    leg: legName,
    label: args.label,
    runIdentity: {
      evidenceClass,
      runRootName,
      fixtureDirectory: legName,
      outputDirectory: expectedOutputName,
    },
    captures,
  };
  writeFileSync(join(outputRoot, "smoke.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "FAIL",
    code: error.code || "UNEXPECTED_ERROR",
    message: error.message,
  }, null, 2)}\n`);
  process.exitCode = 1;
});
