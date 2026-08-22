#!/usr/bin/env node

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parsePng } from "@tanguito/devlab-img2threejs-asset-forge";

const scriptPath = fileURLToPath(import.meta.url);
export const repoRoot = resolve(dirname(scriptPath), "..");
export const benchmarkRoot = join(repoRoot, "benchmarks", "threejs-game-skills-ab");
export const contractPath = join(benchmarkRoot, "benchmark-contract.json");
const BROKER_KEY_ENV = "DEVLAB_AB04_BROKER_HMAC_KEY";

const TEXT_EXTENSIONS = new Set([
  ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".txt", ".yaml", ".yml",
]);
const BINARY_EXTENSIONS = new Set([".gif", ".ico", ".jpg", ".jpeg", ".png", ".wasm", ".webp"]);
const TEXT_BASENAMES = new Set([".gitignore", ".npmrc", "LICENSE"]);
const TREE_IGNORES = new Set(["node_modules", "dist", ".git"]);
const MATERIALIZATION_METADATA = new Set([
  "baseline-manifest.json",
  "baseline-tree-sha256.txt",
  "materialization-report.json",
]);
const decoder = new TextDecoder("utf-8", { fatal: true });
const EXPECTED_SCAFFOLD_TREE_SHA256 = "c085bed4d3b3c52fc6d87eab44e0a9ee54cdf3891d5ba59154a57d16cf363908";
const EXPECTED_PROMPT = {
  generatedFile: "benchmark-prompt.md",
  durationMinutes: { minimum: 3, maximum: 5 },
  camera: "elevated-view 3D arcade action",
  setting: "An abandoned relay station on an ash-covered moon.",
  visualDirection: "Original industrial forms with a charcoal, steel, cyan and orange palette.",
  coreLoop: "Carry an energy core, activate two relay nodes, survive the encounters, defeat the final guardian and evacuate.",
  requiredContent: [
    "title screen", "short tutorial", "movement", "aiming or attack direction",
    "primary action", "two distinct enemy types", "visible progression",
    "functional checkpoint", "pause and resume", "defeat", "clean restart",
    "checkpoint restoration", "mini-boss", "victory", "HUD", "desktop controls",
    "touch controls", "impact feedback", "local procedural audio",
    "deterministic frozen capture states",
  ],
  requiredTechnology: [
    "Three.js", "WebGPURenderer", "native WebGPU hardware",
    "visible TSL material or effect", "TypeScript", "the internal DevLab scaffold",
    "fixed timestep simulation", "render interpolation", "seeded RNG",
    "pooling for projectiles and frequent effects",
  ],
  forbidden: [
    "external services", "paid APIs", "CDNs", "commercial assets",
    "Galaxy Raiders assets or code", "Hellbullet assets or code", "code from other games",
    "WebGL presented as WebGPU", "React Three Fiber", "external scaffolds",
    "upstream scripts or generators",
  ],
  frozenStates: [
    "title", "tutorial", "encounter-1", "checkpoint", "encounter-2",
    "boss", "defeat", "victory", "mobile-active",
  ],
  validation: [
    "frozen dependency install", "build", "typecheck", "browser QA", "bot playtest",
    "exact repeated frozen captures", "desktop and mobile resize",
    "repeated restart and resource lifecycle", "native adapter diagnostics",
    "device-loss recovery", "zero external network requests",
  ],
};

export class Ab04Error extends Error {
  constructor(message, code = "AB04_ERROR") {
    super(message);
    this.name = "Ab04Error";
    this.code = code;
  }
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalTextFromBytes(bytes, label = "text") {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Ab04Error(`${label} must not contain a UTF-8 BOM`, "TEXT_BOM_FORBIDDEN");
  }
  let text;
  try {
    text = decoder.decode(bytes);
  } catch {
    throw new Ab04Error(`${label} is not valid UTF-8`, "INVALID_UTF8");
  }
  return text.replace(/\r\n?/g, "\n");
}

export function canonicalTextHash(bytes, label = "text") {
  return sha256Bytes(Buffer.from(canonicalTextFromBytes(bytes, label), "utf8"));
}

export function readCanonicalText(path) {
  return canonicalTextFromBytes(readFileSync(path), path);
}

export function readJson(path) {
  try {
    return JSON.parse(readCanonicalText(path));
  } catch (error) {
    if (error instanceof Ab04Error) throw error;
    throw new Ab04Error(`invalid JSON at ${path}: ${error.message}`, "INVALID_JSON");
  }
}

export function readCanonicalTextSnapshot(path) {
  const text = canonicalTextFromBytes(readFileSync(path), path);
  return deepFreeze({
    path,
    text,
    sha256: sha256Bytes(Buffer.from(text, "utf8")),
  });
}

export function readCanonicalJsonSnapshot(path) {
  const snapshot = readCanonicalTextSnapshot(path);
  let value;
  try {
    value = JSON.parse(snapshot.text);
  } catch (error) {
    throw new Ab04Error(`invalid JSON at ${path}: ${error.message}`, "INVALID_JSON");
  }
  return deepFreeze({ ...snapshot, value: deepFreeze(value) });
}

export function contractSha256(path = contractPath) {
  return canonicalTextHash(readFileSync(path), path);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function readContractSnapshot(path = contractPath) {
  const snapshot = readCanonicalJsonSnapshot(path);
  return deepFreeze({
    contract: snapshot.value,
    contractText: snapshot.text,
    contractSha256: snapshot.sha256,
  });
}

function writeCanonicalText(path, content) {
  const normalized = String(content).replace(/\r\n?/g, "\n");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, normalized.endsWith("\n") ? normalized : `${normalized}\n`, { encoding: "utf8" });
}

function markdownList(values) {
  return values.map((value) => `- ${value}`).join("\n");
}

export function renderPrompt(contract) {
  const { prompt, viewports, budgets, repetitions, runtime, scaffold, model, worldSeed } = contract;
  return `# ${contract.workingTitle} — generated benchmark prompt

<!-- GENERATED FROM benchmark-contract.json (${contract.contractVersion}). DO NOT EDIT. -->

Build a complete ${prompt.durationMinutes.minimum}–${prompt.durationMinutes.maximum} minute ${prompt.camera}
vertical slice named **${contract.workingTitle}** using the supplied **${scaffold.id}**
scaffold. Use ${scaffold.renderer} on ${scaffold.backend}; WebGL fallback is not an
acceptable benchmark result.

## Setting and loop

${prompt.setting} ${prompt.visualDirection}

${prompt.coreLoop}

## Required content

${markdownList(prompt.requiredContent)}

## Required technology

${markdownList(prompt.requiredTechnology)}

## Frozen capture states

${markdownList(prompt.frozenStates)}

## Shared execution contract

- exact model/build policy: ${model.policy}
- reasoning effort: ${model.reasoningEffort}
- world seed: ${worldSeed}
- desktop viewport: ${viewports.desktop.width}×${viewports.desktop.height}
- mobile viewport: ${viewports.mobile.width}×${viewports.mobile.height}
- active agent time per leg: ${budgets.activeAgentMinutesPerLeg} minutes total
- independent builder runs per leg: ${budgets.builderRunsPerLeg}
- implementation cycles: ${budgets.implementationCycles}
- correction cycles: ${budgets.correctionCycles}
- maximum total agent passes: ${budgets.maximumTotalAgentPasses}
- frozen captures per state: ${repetitions.frozenCapturesPerState}
- bot playtests per leg: ${repetitions.botPlaytestsPerLeg}
- performance repetitions per scenario: ${repetitions.performancePerScenario}
- performance scenarios: ${repetitions.performanceScenarios.join(", ")}
- simulation: ${runtime.fixedTimestepHz} Hz fixed timestep with at most ${runtime.maximumCatchupSteps} catch-up steps

## Forbidden

${markdownList(prompt.forbidden)}

## Required validation

${markdownList(prompt.validation)}
`;
}

export function renderAcceptanceGates(contract) {
  const { budgets, repetitions, runtime, scaffold, viewports, model, worldSeed } = contract;
  return `# Acceptance gates — generated

<!-- GENERATED FROM benchmark-contract.json (${contract.contractVersion}). DO NOT EDIT. -->

- Contract: version \`${contract.contractVersion}\`; canonical UTF-8/LF SHA-256 verified before both legs.
- Pair isolation: one fresh independent context and directory per leg; no cross-leg outcomes or artifacts.
- Model equality: \`${model.policy}\`; reasoning effort \`${model.reasoningEffort}\`.
- Shared seed: \`${worldSeed}\`.
- Shared scaffold: \`${scaffold.id}\` with tree hash from the contract.
- Runtime: \`${scaffold.renderer}\`, \`${scaffold.backend}\`, full verified Chromium and \`${runtime.adapter}\`.
- Viewports: desktop \`${viewports.desktop.width}×${viewports.desktop.height}\`; mobile \`${viewports.mobile.width}×${viewports.mobile.height}\`.
- Budget: \`${budgets.activeAgentMinutesPerLeg}\` active minutes total per leg, \`${budgets.builderRunsPerLeg}\` builder run, \`${budgets.implementationCycles}\` implementation cycle, \`${budgets.correctionCycles}\` correction cycles and \`${budgets.maximumTotalAgentPasses}\` total passes.
- Repetitions: \`${repetitions.frozenCapturesPerState}\` frozen captures per state, \`${repetitions.botPlaytestsPerLeg}\` bot playtests per leg and \`${repetitions.performancePerScenario}\` performance repetitions for each of \`${repetitions.performanceScenarios.join("\`, \`")}\`.
- Security: no global install, external script/scaffold, paid API, non-loopback request, copied upstream file or credential.
- Correctness: frozen install, build and typecheck pass; console/page/network errors zero; start, checkpoint, pause, defeat, restart, restoration, mini-boss and victory complete.
- Determinism: repeated frozen PNG and RGBA bytes exact; controlled change detected; live gameplay compared statistically.
- Runtime lifecycle: bounded resources, resize and desktop/mobile input pass, device-loss recovery pass, software adapter rejected.
- Evaluation: complete anonymized evidence, blinded scoring and documented decision.
`;
}

export function renderLegPolicy(contract, leg, contractHash = contractSha256()) {
  if (leg !== "a" && leg !== "b") {
    throw new Ab04Error(`invalid leg: ${leg}`, "INVALID_LEG");
  }
  const isA = leg === "a";
  return {
    schemaVersion: 2,
    contractVersion: contract.contractVersion,
    contractSha256: contractHash,
    leg: isA ? "LEG_A" : "LEG_B",
    treatment: isA ? "CONTROL" : "SELECTED_READ_ONLY_GUIDANCE",
    externalGuidanceLoaded: !isA,
    selectedGuidanceManifest: isA ? null : contract.treatment.selectedGuidanceManifest,
    selectedGuidanceManifestSha256: isA
      ? null
      : contract.treatment.selectedGuidanceManifestSha256,
    sourcePolicySha256: isA ? null : contract.treatment.sourcePolicySha256,
    sourceHead: isA ? null : contract.treatment.sourcePin,
    guidanceAccessMode: isA ? "FORBIDDEN" : "HASH_AT_OPEN_BROKER",
  };
}

function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function classifyFile(path) {
  const name = basename(path);
  const extension = extname(name).toLowerCase();
  if (TEXT_BASENAMES.has(name) || TEXT_EXTENSIONS.has(extension)) return "text";
  if (BINARY_EXTENSIONS.has(extension)) return "binary";
  throw new Ab04Error(`unclassified scaffold file type: ${path}`, "UNCLASSIFIED_FILE");
}

function toPosix(path) {
  return path.split(sep).join("/");
}

export function assertSafeRelativePath(path) {
  if (typeof path !== "string" || !path || isAbsolute(path) || /^[A-Za-z]:/.test(path)
    || path.includes("\\") || /[*?]/.test(path)
    || path.split("/").some((segment) => segment === ".." || segment === "."
      || segment === "" || segment.includes(":"))) {
    throw new Ab04Error(`unsafe relative path: ${String(path)}`, "PATH_TRAVERSAL");
  }
  return path;
}

function assertRegularTreeEntry(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Ab04Error(`symlink or junction is forbidden: ${path}`, "SYMLINK_FORBIDDEN");
  }
  if (!stat.isFile() && !stat.isDirectory()) {
    throw new Ab04Error(`irregular filesystem entry is forbidden: ${path}`, "IRREGULAR_ENTRY");
  }
  return stat;
}

function assertNoIgnoredTreeEntries(root, { allowGeneratedRoot = false } = {}) {
  const violations = [];
  const walk = (directory, depth) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = assertRegularTreeEntry(path);
      if (TREE_IGNORES.has(name)) {
        if (allowGeneratedRoot && depth === 0 && (name === "node_modules" || name === "dist")) {
          continue;
        }
        violations.push(toPosix(relative(root, path)));
        continue;
      }
      if (stat.isDirectory()) walk(path, depth + 1);
    }
  };
  walk(root, 0);
  if (violations.length) {
    throw new Ab04Error(
      `generated or hidden trees are forbidden in this baseline phase: ${violations.join(", ")}`,
      "BASELINE_GENERATED_TREE_PRESENT",
    );
  }
}

function assertRegularContainedFile(root, relativePath) {
  assertSafeRelativePath(relativePath);
  let current = root;
  const segments = relativePath.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]);
    if (!existsSync(current)) {
      throw new Ab04Error(`allowlisted source file is missing: ${relativePath}`, "GUIDANCE_FILE_MISSING");
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Ab04Error(`allowlisted source path is linked: ${relativePath}`, "GUIDANCE_PATH_LINKED");
    }
    const final = index === segments.length - 1;
    if ((!final && !stat.isDirectory()) || (final && !stat.isFile())) {
      throw new Ab04Error(`allowlisted source path is irregular: ${relativePath}`, "GUIDANCE_PATH_IRREGULAR");
    }
  }
  const realRoot = realpathSync(root);
  const realFile = realpathSync(current);
  if (!realFile.startsWith(`${realRoot}${sep}`)) {
    throw new Ab04Error(`allowlisted source path escapes checkout: ${relativePath}`, "GUIDANCE_PATH_ESCAPE");
  }
  return current;
}

function ensureContainedDirectory(root, relativePath) {
  assertSafeRelativePath(relativePath);
  const realRoot = realpathSync(root);
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    if (!existsSync(current)) mkdirSync(current);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Ab04Error(`contained directory is linked or irregular: ${relativePath}`, "BROKER_LEDGER_PATH_INVALID");
    }
    const realCurrent = realpathSync(current);
    if (!realCurrent.startsWith(`${realRoot}${sep}`)) {
      throw new Ab04Error(`contained directory escapes root: ${relativePath}`, "BROKER_LEDGER_PATH_INVALID");
    }
  }
  return current;
}

export function collectTreeEntries(root, { includeIgnored = false, raw = false } = {}) {
  const absoluteRoot = resolve(root);
  if (!existsSync(absoluteRoot) || !lstatSync(absoluteRoot).isDirectory()) {
    throw new Ab04Error(`tree root is missing or not a directory: ${absoluteRoot}`, "TREE_ROOT_MISSING");
  }
  const entries = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort((a, b) => a.localeCompare(b, "en"))) {
      if (!includeIgnored && TREE_IGNORES.has(name)) continue;
      const full = join(directory, name);
      const stat = assertRegularTreeEntry(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      const relativePath = toPosix(relative(absoluteRoot, full));
      assertSafeRelativePath(relativePath);
      const bytes = readFileSync(full);
      const kind = classifyFile(relativePath);
      const canonicalBytes = raw || kind === "binary"
        ? bytes
        : Buffer.from(canonicalTextFromBytes(bytes, relativePath), "utf8");
      const hash = sha256Bytes(canonicalBytes);
      entries.push({ path: relativePath, size: canonicalBytes.length, sha256: hash, kind });
    }
  };
  walk(absoluteRoot);
  return entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export function treeSha256(entries) {
  return sha256Bytes(Buffer.from(`${JSON.stringify(entries)}\n`, "utf8"));
}

function scaffoldRootFor(contract) {
  assertSafeRelativePath(contract.scaffold.relativePath);
  const root = resolve(benchmarkRoot, ...contract.scaffold.relativePath.split("/"));
  if (root !== benchmarkRoot && !root.startsWith(`${benchmarkRoot}${sep}`)) {
    throw new Ab04Error("scaffold path escapes benchmark root", "SCAFFOLD_PATH_ESCAPE");
  }
  return root;
}

export function validateContractShape(contract) {
  const failures = [];
  const expect = (actual, expected, label) => {
    if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`);
  };
  const expectJson = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${label}: value drifted`);
  };
  expect(contract.schemaVersion, 2, "schemaVersion");
  expect(contract.contractVersion, "ab04-v2", "contractVersion");
  expect(contract.benchmark, "DEVLAB-THREEJS-GAME-SKILLS-AB-04", "benchmark");
  expect(contract.status, "AUTHORIZED_READY_TO_RESUME", "status");
  expect(contract.sourceOfTruth, true, "sourceOfTruth");
  expect(contract.workingTitle, "ASH RELAY", "workingTitle");
  expectJson(contract.prompt, EXPECTED_PROMPT, "prompt");
  expect(contract.model.policy, "same-exact-model-and-build-within-pair", "model.policy");
  expect(contract.model.reasoningEffort, "ultra", "model.reasoningEffort");
  expect(contract.worldSeed, 424242, "worldSeed");
  expect(contract.viewports.desktop.width, 1280, "desktop.width");
  expect(contract.viewports.desktop.height, 720, "desktop.height");
  expect(contract.viewports.mobile.width, 390, "mobile.width");
  expect(contract.viewports.mobile.height, 844, "mobile.height");
  expect(contract.budgets.activeAgentMinutesPerLeg, 240, "activeAgentMinutesPerLeg");
  expect(contract.budgets.builderRunsPerLeg, 1, "builderRunsPerLeg");
  expect(contract.budgets.implementationCycles, 1, "implementationCycles");
  expect(contract.budgets.correctionCycles, 2, "correctionCycles");
  expect(contract.budgets.maximumTotalAgentPasses, 3, "maximumTotalAgentPasses");
  expect(contract.repetitions.frozenCapturesPerState, 2, "frozenCapturesPerState");
  expect(contract.repetitions.botPlaytestsPerLeg, 10, "botPlaytestsPerLeg");
  expect(contract.repetitions.performancePerScenario, 3, "performancePerScenario");
  expectJson(
    contract.repetitions.performanceScenarios,
    ["idle", "encounter-normal", "stress", "boss", "mobile"],
    "performanceScenarios",
  );
  expect(contract.scaffold.id, "devlab-internal-threejs-game-benchmark-v1", "scaffold.id");
  expect(contract.scaffold.relativePath, "scaffolds/devlab-internal-threejs-game-benchmark-v1", "scaffold.relativePath");
  expect(contract.scaffold.treeSha256, EXPECTED_SCAFFOLD_TREE_SHA256, "scaffold.treeSha256");
  expect(contract.scaffold.packageManager, "pnpm@9.15.4", "scaffold.packageManager");
  expect(contract.scaffold.exactDependencies.vite, "8.2.0", "vite");
  expect(contract.scaffold.exactDependencies.three, "0.185.1", "three");
  expect(contract.scaffold.exactDependencies.typescript, "6.0.3", "typescript");
  expect(contract.scaffold.exactDependencies.tsx, "4.22.3", "tsx");
  expect(contract.scaffold.exactDependencies["@types/node"], "24.12.4", "@types/node");
  expect(contract.scaffold.renderer, "Three.js WebGPURenderer", "scaffold.renderer");
  expect(contract.scaffold.backend, "native-webgpu", "scaffold.backend");
  expect(contract.scaffold.captureContract, "window.__DEVLAB_CAPTURE__", "scaffold.captureContract");
  expect(contract.hashPolicy.textEncoding, "UTF-8_NO_BOM", "textEncoding");
  expect(contract.hashPolicy.textEol, "LF_CANONICAL", "textEol");
  expect(contract.hashPolicy.binaryHash, "ORIGINAL_BYTES", "binaryHash");
  expect(contract.hashPolicy.algorithm, "SHA-256", "hashAlgorithm");
  expect(contract.materialization.runRootId, "devlab-runs", "materialization.runRootId");
  expect(contract.materialization.productionRunRootName, "threejs-game-skills-ab-04", "productionRunRootName");
  expect(contract.materialization.validationRunRootPrefix, "ab04a-scaffold-validation-", "validationRunRootPrefix");
  expect(contract.materialization.destinations.a, "leg-a", "destination.a");
  expect(contract.materialization.destinations.b, "leg-b", "destination.b");
  expect(contract.runtime.browser, "verified-full-chromium", "runtime.browser");
  expect(contract.runtime.browserVersion, "148.0.7778.96", "runtime.browserVersion");
  expect(contract.runtime.browserExecutableSha256, "290fa7018fda22c52ada5eddb0113baf3ebc41fd0fde6085eddb19793606c635", "runtime.browserExecutableSha256");
  expect(contract.runtime.browserCacheRevision, "chromium-1223", "runtime.browserCacheRevision");
  expect(contract.runtime.browserDistributionDirectoryName, "chrome-win64", "runtime.browserDistributionDirectoryName");
  expect(contract.runtime.browserDistributionFileCount, 308, "runtime.browserDistributionFileCount");
  expect(contract.runtime.browserDistributionByteLength, 432272872, "runtime.browserDistributionByteLength");
  expect(contract.runtime.browserDistributionTreeSha256, "bfd9c556552c637ceee2cf808aa1b5984da29f874965f0fd99b42326b3110fa0", "runtime.browserDistributionTreeSha256");
  expect(contract.runtime.adapter, "NVIDIA_RTX_2060_TURING_HARDWARE", "runtime.adapter");
  expect(contract.runtime.adapterVendor, "nvidia", "runtime.adapterVendor");
  expect(contract.runtime.adapterArchitecture, "turing", "runtime.adapterArchitecture");
  expect(contract.runtime.adapterPciDeviceId, "10DE:1E89", "runtime.adapterPciDeviceId");
  expect(contract.runtime.adapterFallbackAllowed, false, "runtime.adapterFallbackAllowed");
  expect(contract.runtime.network, "loopback-only", "runtime.network");
  expect(contract.runtime.fixedTimestepHz, 60, "runtime.fixedTimestepHz");
  expect(contract.runtime.maximumCatchupSteps, 8, "runtime.maximumCatchupSteps");
  expect(contract.runtime.frozenCaptureTimeMs, 2500, "runtime.frozenCaptureTimeMs");
  expect(contract.runtime.renderInterpolation, true, "runtime.renderInterpolation");
  expect(contract.runtime.frozenCapturePausesSimulation, true, "runtime.frozenCapturePausesSimulation");
  expect(contract.runtime.captureHarnessSha256, "e723d29feb8f7473784e7acc883c716f9396adfb362b62521f46005889087541", "runtime.captureHarnessSha256");
  expect(contract.runtime.captureHarnessFilesSha256?.["capture.js"], "e723d29feb8f7473784e7acc883c716f9396adfb362b62521f46005889087541", "runtime.captureHarnessFilesSha256.capture.js");
  expect(contract.runtime.captureHarnessFilesSha256?.["browser-runtime.js"], "369120710de97c8195f56b17eb24c249c564daad863b52dd5c9ae4a1c0032941", "runtime.captureHarnessFilesSha256.browser-runtime.js");
  expect(contract.runtime.captureHarnessFilesSha256?.["server.js"], "cf035842ef08f26f19c9487745d2d70f1fd6f3c86c19160610b2e82b8142f202", "runtime.captureHarnessFilesSha256.server.js");
  expect(contract.runtime.captureHarnessFilesSha256?.["contract.js"], "59bcce177356b54883af8378fe57040585a0f640c6abdc715e4d4631c5638304", "runtime.captureHarnessFilesSha256.contract.js");
  expect(
    JSON.stringify(Object.keys(contract.runtime.captureHarnessFilesSha256 ?? {}).sort()),
    JSON.stringify(["capture.js", "browser-runtime.js", "server.js", "contract.js"].sort()),
    "runtime.captureHarnessFilesSha256 keys",
  );
  const captureRuntimePackages = contract.runtime.captureRuntimePackages;
  expect(
    JSON.stringify(Object.keys(captureRuntimePackages ?? {}).sort()),
    JSON.stringify(["playwright", "playwright-core"].sort()),
    "runtime.captureRuntimePackages keys",
  );
  expect(captureRuntimePackages?.playwright?.version, "1.60.0", "captureRuntimePackages.playwright.version");
  expect(captureRuntimePackages?.playwright?.packageJsonSha256, "8be9edc5642a8c761b677e7af8b9937f36c0443a91e14765877716d70034e5bf", "captureRuntimePackages.playwright.packageJsonSha256");
  expect(captureRuntimePackages?.playwright?.fileCount, 65, "captureRuntimePackages.playwright.fileCount");
  expect(captureRuntimePackages?.playwright?.treeSha256, "5c9d3beb07a087bfede0e3aaa63dcf837b4288b42bb74fe2e23b571efa0776ed", "captureRuntimePackages.playwright.treeSha256");
  expect(captureRuntimePackages?.["playwright-core"]?.version, "1.60.0", "captureRuntimePackages.playwright-core.version");
  expect(captureRuntimePackages?.["playwright-core"]?.packageJsonSha256, "6f7b58cc55449321279f11ca97d4e451c391738b77db32cdbcedf02851e3f097", "captureRuntimePackages.playwright-core.packageJsonSha256");
  expect(captureRuntimePackages?.["playwright-core"]?.fileCount, 106, "captureRuntimePackages.playwright-core.fileCount");
  expect(captureRuntimePackages?.["playwright-core"]?.treeSha256, "e6f3793c5970342eeb1d60188f7abb3adcd5f652a44c8ecc8a8c7297b2f99603", "captureRuntimePackages.playwright-core.treeSha256");
  expect(contract.runtime.validationToolchain.nodeVersion, "v24.13.0", "validationToolchain.nodeVersion");
  expect(contract.runtime.validationToolchain.nodeExecutableSha256, "d14ba95cdce1ef7dc9ad3ac74949ca5db38b27378ee30f30a23cf26f9e875a11", "validationToolchain.nodeExecutableSha256");
  expect(contract.runtime.validationToolchain.corepackVersion, "0.34.5", "validationToolchain.corepackVersion");
  expect(contract.runtime.validationToolchain.corepackLauncherSha256, "4bd305443b25ccb4c11b0c3f9eefe65d755af39f3545bfec24af428a1f9451b5", "validationToolchain.corepackLauncherSha256");
  expect(contract.runtime.validationToolchain.corepackLibrarySha256, "c0fa7f24f0de71e85e2b4ac8716ce979a3da9c0ccf5dc2a81b90d41d8b9263fe", "validationToolchain.corepackLibrarySha256");
  expect(contract.runtime.validationToolchain.pnpmPackageJsonSha256, "3b20ec7bebaa078d5ae4ab09651b80434a9f1d6446065ad53779ecafdc7f9936", "validationToolchain.pnpmPackageJsonSha256");
  expect(contract.runtime.validationToolchain.pnpmLauncherSha256, "98e6b99a881d64a1cc982c3e60aa260bf02160386b12e74475e06486dc74b090", "validationToolchain.pnpmLauncherSha256");
  expect(contract.runtime.validationToolchain.pnpmBundleSha256, "4c319da726786d5535aef95fa78ec5e24f1079382da878a35fa5dd044a7bab96", "validationToolchain.pnpmBundleSha256");
  expect(contract.runtime.validationToolchain.pnpmPackageTreeSha256, "e2bffa92dd69d95cd0f5fd79af67e0ae28b21922edecc64586152e3c77eb7bc7", "validationToolchain.pnpmPackageTreeSha256");
  expect(contract.runtime.validationToolchain.vitePackageJsonSha256, "cc205a705dc4cb59ffeb0a16509437b05b31498773a1244747ce786c91f47e8b", "validationToolchain.vitePackageJsonSha256");
  expect(contract.runtime.validationToolchain.viteExecutableSha256, "fa03478846d229651a3c6aa64833ba2c6cbf580a798b92bd8f47c7480bafb5d8", "validationToolchain.viteExecutableSha256");
  expect(contract.runtime.validationToolchain.vitePackageTreeSha256, "7c2c164fb19f47a88a2b6244a39d39a6b302774bfccc8766f5be63fa47c95fc7", "validationToolchain.vitePackageTreeSha256");
  expect(contract.treatment.legA, "no-threejs-game-skills-guidance", "treatment.legA");
  expect(contract.treatment.legB, "read-only-hashed-selected-guidance", "treatment.legB");
  expect(contract.treatment.sourceId, "threejs-game-skills", "treatment.sourceId");
  expect(contract.treatment.sourceRepository, "https://github.com/majidmanzarpour/threejs-game-skills", "treatment.sourceRepository");
  expect(contract.treatment.sourcePin, "7221c1f4a6d2ae189a4d85d058d24f3228499d46", "treatment.sourcePin");
  expect(contract.treatment.sourcePolicy, "source-policy.json", "treatment.sourcePolicy");
  expect(contract.treatment.sourcePolicySha256, "500cde0e44a40d5a11f920ca08a6b1ca4b22f2e7c6479d961fc794c0540248f7", "treatment.sourcePolicySha256");
  expect(contract.treatment.selectedGuidanceManifest, "selected-guidance-manifest.json", "selectedGuidanceManifest");
  expect(contract.treatment.selectedGuidanceManifestSha256, "443f510cd4021cc43f0a0d0a53a6f40faad34f45767d6137c6d1ef23c93037ee", "selectedGuidanceManifestSha256");
  expect(contract.treatment.externalScaffold, false, "treatment.externalScaffold");
  expect(contract.treatment.externalScripts, false, "treatment.externalScripts");
  expect(contract.treatment.globalInstall, false, "treatment.globalInstall");
  expect(contract.treatment.paidApiCalls, false, "treatment.paidApiCalls");
  expect(contract.resultValidation.schemaFile, "result-schema.json", "resultValidation.schemaFile");
  expect(contract.resultValidation.schemaSha256, "4b0f6ce7fc706765ea103b45d06c30d3b1ed68a3254c2a69bb27836a36d1ca39", "resultValidation.schemaSha256");
  expect(contract.resultValidation.scoringRubricFile, "scoring-rubric.md", "resultValidation.scoringRubricFile");
  expect(contract.resultValidation.scoringRubricSha256, "4e5576615370283d28be87ec1e0d705a3ff1c7bc4bf0efc070dbe77cb49c8a87", "resultValidation.scoringRubricSha256");
  expect(contract.decision.legBMinimumPercentagePointGain, 8, "decision.legBMinimumPercentagePointGain");
  expect(contract.decision.inconclusiveLowerBoundInclusive, -3, "decision.inconclusiveLowerBoundInclusive");
  expect(contract.decision.inconclusiveUpperBoundExclusive, 8, "decision.inconclusiveUpperBoundExclusive");
  expect(
    contract.decision.legAMinimumPercentagePointGainExclusive,
    3,
    "decision.legAMinimumPercentagePointGainExclusive",
  );
  expect(contract.decision.p0OrP1RegressionAllowed, false, "decision.p0OrP1RegressionAllowed");
  expect(contract.weights.gameplay, 30, "weights.gameplay");
  expect(contract.weights.visualQuality, 20, "weights.visualQuality");
  expect(contract.weights.correctnessAndQa, 20, "weights.correctnessAndQa");
  expect(contract.weights.performance, 15, "weights.performance");
  expect(contract.weights.mobileAndUi, 10, "weights.mobileAndUi");
  expect(contract.weights.processEfficiency, 5, "weights.processEfficiency");
  if (failures.length) {
    throw new Ab04Error(`contract shape mismatch:\n${failures.join("\n")}`, "CONTRACT_MISMATCH");
  }
}

function assertCanonicalFile(path, expected, code) {
  if (!existsSync(path)) throw new Ab04Error(`missing derived file: ${path}`, code);
  const actual = readCanonicalText(path);
  const normalizedExpected = expected.replace(/\r\n?/g, "\n");
  if (actual !== normalizedExpected) {
    throw new Ab04Error(`derived file does not match contract: ${path}`, code);
  }
}

function verifyLegPolicy(contract, leg, contractHash, policySnapshot = null) {
  const path = join(benchmarkRoot, `leg-${leg}-policy.json`);
  const snapshot = policySnapshot ?? readCanonicalJsonSnapshot(path);
  const actual = snapshot.value;
  const expected = renderLegPolicy(contract, leg, contractHash);
  const allowedKeys = Object.keys(expected).sort();
  if (JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(allowedKeys)
    || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Ab04Error(`leg-${leg} policy is not the contract-derived minimal policy`, "POLICY_MISMATCH");
  }
  return snapshot;
}

function verifyOperationalLegacyValues() {
  const operational = [
    "benchmark-contract.json", "benchmark-prompt.md", "leg-a-policy.json", "leg-b-policy.json",
    "acceptance-gates.md", "runbook.md", "README.md",
  ];
  const patterns = [
    /\b1729\b/, /960\s*[x×]\s*540/i, /"high"/i,
    /120\s+(minutes|minutos)/i, /two\s+runs\s+per\s+leg/i,
  ];
  for (const name of operational) {
    const text = readCanonicalText(join(benchmarkRoot, name));
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        throw new Ab04Error(`legacy operational value in ${name}: ${pattern}`, "LEGACY_VALUE");
      }
    }
  }
}

export function verifyScaffold(contract = readJson(contractPath), { checkExpectedHash = true } = {}) {
  const root = scaffoldRootFor(contract);
  assertNoIgnoredTreeEntries(root);
  const required = [
    "README.md", "index.html", "package.json", "pnpm-lock.yaml", "tsconfig.json",
    "vite.config.ts", "public/capture-manifest.json", "src/main.ts", "src/engine.ts",
    "src/capture-contract.ts", "src/core/fixed-step.ts", "src/core/random.ts",
    "src/core/resource-owner.ts", "src/core/viewport.ts", "src/style.css",
    "src/types/three-shim.d.ts", "tests/fixed-step.test.ts", "tests/random.test.ts",
    "tests/resource-owner.test.ts", "tests/scaffold-contract.test.ts", "tests/viewport.test.ts",
  ];
  for (const relativePath of required) {
    assertSafeRelativePath(relativePath);
    const full = join(root, ...relativePath.split("/"));
    if (!existsSync(full) || !lstatSync(full).isFile()) {
      throw new Ab04Error(`required scaffold file missing: ${relativePath}`, "SCAFFOLD_FILE_MISSING");
    }
  }
  if (existsSync(join(root, "node_modules")) || existsSync(join(root, "dist"))) {
    throw new Ab04Error("scaffold template must not contain node_modules or dist", "SCAFFOLD_BUILD_OUTPUT");
  }
  const packageJson = readJson(join(root, "package.json"));
  if (packageJson.packageManager !== contract.scaffold.packageManager) {
    throw new Ab04Error("scaffold packageManager does not match contract", "SCAFFOLD_PACKAGE_MANAGER");
  }
  const expected = contract.scaffold.exactDependencies;
  const pins = {
    vite: packageJson.devDependencies?.vite,
    three: packageJson.dependencies?.three,
    typescript: packageJson.devDependencies?.typescript,
    tsx: packageJson.devDependencies?.tsx,
    "@types/node": packageJson.devDependencies?.["@types/node"],
  };
  for (const [name, version] of Object.entries(expected)) {
    if (pins[name] !== version || /[~^*xX]|latest/.test(String(pins[name]))) {
      throw new Ab04Error(`scaffold dependency ${name} is not pinned to ${version}`, "SCAFFOLD_DEPENDENCY_MISMATCH");
    }
  }
  for (const forbidden of ["@react-three/fiber", "react", "react-dom"]) {
    if (packageJson.dependencies?.[forbidden] || packageJson.devDependencies?.[forbidden]) {
      throw new Ab04Error(`forbidden scaffold dependency: ${forbidden}`, "FORBIDDEN_DEPENDENCY");
    }
  }
  const entries = collectTreeEntries(root);
  const treeHash = treeSha256(entries);
  if (checkExpectedHash && treeHash !== contract.scaffold.treeSha256) {
    throw new Ab04Error(
      `scaffold tree hash mismatch: expected ${contract.scaffold.treeSha256}, got ${treeHash}`,
      "SCAFFOLD_HASH_MISMATCH",
    );
  }
  const sourceText = entries
    .filter((entry) => entry.kind === "text")
    .map((entry) => readCanonicalText(join(root, ...entry.path.split("/"))))
    .join("\n");
  if (/https?:\/\//i.test(sourceText) || /@react-three\/fiber|create-r3f-app/i.test(sourceText)) {
    throw new Ab04Error("scaffold contains a remote URL or R3F reference", "SCAFFOLD_EXTERNAL_REFERENCE");
  }
  return { root, entries, treeSha256: treeHash };
}

function gitOutput(checkout, args) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.toUpperCase() === BROKER_KEY_ENV) delete environment[key];
  }
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  environment.GIT_OPTIONAL_LOCKS = "0";
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.GIT_CONFIG_COUNT = "2";
  environment.GIT_CONFIG_KEY_0 = "core.fsmonitor";
  environment.GIT_CONFIG_VALUE_0 = "false";
  environment.GIT_CONFIG_KEY_1 = "core.hooksPath";
  environment.GIT_CONFIG_VALUE_1 = process.platform === "win32" ? "NUL" : "/dev/null";
  return execFileSync("git", ["-C", checkout, ...args], {
    env: environment,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function configuredDirectory(value, label, requiredCode, invalidCode) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Ab04Error(`${label} must be configured explicitly`, requiredCode);
  }
  if (!isAbsolute(value)) {
    throw new Ab04Error(`${label} must be an absolute path for this host: ${value}`, invalidCode);
  }
  const absolute = resolve(value);
  assertExistingDirectoryNoLink(absolute, invalidCode);
  return realpathSync(absolute);
}

function sameOrNested(left, right) {
  const normalizedLeft = normalizeForComparison(left);
  const normalizedRight = normalizeForComparison(right);
  return normalizedLeft === normalizedRight || normalizedLeft.startsWith(`${normalizedRight}${sep}`);
}

function assertDisjointPaths(leftLabel, left, rightLabel, right) {
  if (sameOrNested(left, right) || sameOrNested(right, left)) {
    throw new Ab04Error(
      `${leftLabel} overlaps ${rightLabel}: ${left} <> ${right}`,
      "RUNTIME_PATH_OVERLAP",
    );
  }
}

export function validateRuntimeConfig(
  runtimeConfig,
  { requireCheckout = false, requireRunRootBase = false } = {},
) {
  const checkout = requireCheckout || runtimeConfig?.checkout !== undefined
    ? configuredDirectory(
      runtimeConfig?.checkout,
      "external guidance checkout",
      "GUIDANCE_CHECKOUT_REQUIRED",
      "GUIDANCE_CHECKOUT_INVALID",
    )
    : null;
  const runRootBase = requireRunRootBase || runtimeConfig?.runRootBase !== undefined
    ? configuredDirectory(
      runtimeConfig?.runRootBase,
      "run root base",
      "RUN_ROOT_CONFIG_REQUIRED",
      "RUN_ROOT_BASE_INVALID",
    )
    : null;
  const repository = realpathSync(repoRoot);
  if (checkout) assertDisjointPaths("external guidance checkout", checkout, "DevLab repository", repository);
  if (runRootBase) assertDisjointPaths("run root base", runRootBase, "DevLab repository", repository);
  if (checkout && runRootBase) {
    assertDisjointPaths("external guidance checkout", checkout, "run root base", runRootBase);
  }
  return deepFreeze({ checkout, runRootBase });
}

function verifyGuidancePolicy(contract, providedSnapshots = null) {
  assertSafeRelativePath(contract.treatment.sourcePolicy);
  assertSafeRelativePath(contract.treatment.selectedGuidanceManifest);
  const sourcePolicyPath = join(benchmarkRoot, contract.treatment.sourcePolicy);
  const manifestPath = join(benchmarkRoot, contract.treatment.selectedGuidanceManifest);
  const sourcePolicySnapshot = providedSnapshots?.sourcePolicy
    ?? readCanonicalJsonSnapshot(sourcePolicyPath);
  const manifestSnapshot = providedSnapshots?.selectedGuidanceManifest
    ?? readCanonicalJsonSnapshot(manifestPath);
  if (sourcePolicySnapshot.sha256 !== contract.treatment.sourcePolicySha256) {
    throw new Ab04Error("source policy hash does not match the contract", "SOURCE_POLICY_HASH_MISMATCH");
  }
  if (manifestSnapshot.sha256 !== contract.treatment.selectedGuidanceManifestSha256) {
    throw new Ab04Error("selected guidance manifest hash does not match the contract", "GUIDANCE_MANIFEST_HASH_MISMATCH");
  }

  const policy = sourcePolicySnapshot.value;
  const manifest = manifestSnapshot.value;
  if (typeof policy.source !== "string" || !policy.source
    || policy.source !== manifest.source
    || policy.repository !== contract.treatment.sourceRepository
    || manifest.repository !== contract.treatment.sourceRepository
    || policy.pin !== contract.treatment.sourcePin || manifest.pin !== contract.treatment.sourcePin
    || policy.globalInstall !== false || policy.externalScripts !== false
    || policy.externalScaffold !== false || policy.externalDependencies !== false
    || policy.paidGenerators !== false || policy.paidApiCalls !== false
    || policy.copyExternalFilesIntoDevLab !== false
    || policy.networkPolicy !== "loopback-only" || policy.hashVerificationRequired !== true
    || policy.movingRefAllowed !== false || policy.checkoutMustBeDetached !== true
    || policy.checkoutMustBeClean !== true || policy.wildcardsAllowed !== false
    || manifest.mode !== "read-only-guidance" || manifest.globalInstall !== false
    || manifest.externalScripts !== false || manifest.externalScaffold !== false
    || manifest.paidGenerators !== false) {
    throw new Ab04Error("source policy or selected guidance identity drifted", "GUIDANCE_POLICY_MISMATCH");
  }

  const allowedFiles = Array.isArray(manifest.allowedFiles) ? manifest.allowedFiles : [];
  const paths = allowedFiles.map((entry) => entry?.path);
  if (allowedFiles.length !== 25 || new Set(paths).size !== 25
    || allowedFiles.some((entry) => typeof entry?.purpose !== "string" || !entry.purpose
      || !/^[a-f0-9]{64}$/.test(entry?.sha256 || ""))) {
    throw new Ab04Error("selected guidance allowlist is not exactly 25 unique hashed files", "ALLOWLIST_MISMATCH");
  }

  return { allowedFiles, sourcePolicySnapshot, manifestSnapshot };
}

export function verifySelectedGuidance(
  contract = readJson(contractPath),
  providedSnapshots = null,
  runtimeConfig = null,
) {
  const { allowedFiles, sourcePolicySnapshot, manifestSnapshot } = verifyGuidancePolicy(
    contract,
    providedSnapshots,
  );

  const { checkout } = validateRuntimeConfig(runtimeConfig, { requireCheckout: true });
  let head;
  let status;
  let remote;
  let attached = true;
  try {
    head = gitOutput(checkout, ["rev-parse", "HEAD"]);
    status = gitOutput(checkout, ["status", "--porcelain"]);
    remote = gitOutput(checkout, ["remote", "get-url", "origin"]).replace(/\.git$/, "");
    try {
      gitOutput(checkout, ["symbolic-ref", "-q", "HEAD"]);
    } catch {
      attached = false;
    }
  } catch (error) {
    throw new Ab04Error(`selected guidance checkout Git validation failed: ${error.message}`, "GUIDANCE_GIT_INVALID");
  }
  if (head !== contract.treatment.sourcePin || status !== "" || attached
    || remote !== contract.treatment.sourceRepository) {
    throw new Ab04Error("selected guidance checkout is not pinned, detached and clean", "GUIDANCE_CHECKOUT_DRIFT");
  }

  for (const entry of allowedFiles) {
    const file = assertRegularContainedFile(checkout, entry.path);
    const actual = canonicalTextHash(readFileSync(file), entry.path);
    if (actual !== entry.sha256) {
      throw new Ab04Error(`selected guidance hash mismatch: ${entry.path}`, "GUIDANCE_FILE_HASH_MISMATCH");
    }
  }
  return {
    manifestSha256: contract.treatment.selectedGuidanceManifestSha256,
    sourceHead: head,
    allowlistCount: allowedFiles.length,
    sourcePolicySnapshot,
    manifestSnapshot,
  };
}

const BROKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function assertBrokerId(value, label) {
  if (typeof value !== "string" || !BROKER_ID_PATTERN.test(value)) {
    throw new Ab04Error(`${label} is not a safe broker identity`, "BROKER_ID_INVALID");
  }
}

function brokerKeyBytes(testContext = null) {
  const encoded = testContext?.brokerKeyHex ?? process.env[BROKER_KEY_ENV];
  if (typeof encoded !== "string" || !/^[a-f0-9]{64}$/i.test(encoded)) {
    throw new Ab04Error(
      `${BROKER_KEY_ENV} must be an executor-owned 32-byte hexadecimal key`,
      "BROKER_KEY_MISSING",
    );
  }
  return Buffer.from(encoded, "hex");
}

function guidanceBrokerLedgerRelativePath(pairId, runId) {
  assertBrokerId(pairId, "pairId");
  assertBrokerId(runId, "runId");
  return `coordinator/guidance-broker/${pairId}/${runId}.jsonl`;
}

function brokerReceiptPayload({
  sequence, pairId, runId, contractSha256: verifiedContractSha256,
  sourceHead, selectedGuidanceManifestSha256, path, sha256,
}) {
  return {
    schemaVersion: 1,
    event: "GUIDANCE_READ",
    sequence,
    pairId,
    runId,
    leg: "LEG_B",
    contractSha256: verifiedContractSha256,
    sourceHead,
    selectedGuidanceManifestSha256,
    path,
    sha256,
  };
}

function brokerReceiptHmac(payload, key) {
  return createHmac("sha256", key).update(JSON.stringify(payload), "utf8").digest("hex");
}

function validateBrokerReceipt(record, expected, key) {
  expectResult(record && typeof record === "object", "broker receipt is malformed", "BROKER_LEDGER_INVALID");
  const { brokerReceiptHmacSha256, ...payload } = record;
  const canonicalPayload = brokerReceiptPayload(payload);
  expectResult(
    JSON.stringify(payload) === JSON.stringify(canonicalPayload),
    "broker receipt contains unexpected or reordered fields",
    "BROKER_LEDGER_INVALID",
  );
  for (const [field, value] of Object.entries(expected)) {
    expectResult(payload[field] === value, `broker receipt ${field} mismatch`, "BROKER_LEDGER_INVALID");
  }
  const expectedHmac = brokerReceiptHmac(canonicalPayload, key);
  const actualBytes = Buffer.from(brokerReceiptHmacSha256 || "", "hex");
  const expectedBytes = Buffer.from(expectedHmac, "hex");
  expectResult(
    actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes),
    "broker receipt HMAC mismatch",
    "BROKER_LEDGER_INVALID",
  );
  return record;
}

function parseBrokerLedger(bytes, expected, key) {
  expectResult(!bytes.includes(0x0d), "guidance broker ledger must use canonical LF", "BROKER_LEDGER_INVALID");
  const text = canonicalTextFromBytes(bytes, "guidance broker ledger");
  const lines = text.split("\n").filter((line) => line.length > 0);
  expectResult(lines.length > 0, "guidance broker ledger is empty", "BROKER_LEDGER_INVALID");
  return lines.map((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Ab04Error("guidance broker ledger contains invalid JSONL", "BROKER_LEDGER_INVALID");
    }
    return validateBrokerReceipt(record, { ...expected, sequence: index + 1 }, key);
  });
}

export function readGuidance({ path, pairId, runId }, testContext = null) {
  assertSafeRelativePath(path);
  assertBrokerId(pairId, "pairId");
  assertBrokerId(runId, "runId");
  const verification = testContext?.verification ?? verifyContract();
  const contract = testContext?.contract ?? verification.contract;
  const runtimeConfig = validateRuntimeConfig(
    testContext?.runtimeConfig ?? verification.runtimeConfig,
    { requireCheckout: true, requireRunRootBase: true },
  );
  const manifest = verification.snapshots?.selectedGuidanceManifest?.value;
  if (!manifest) {
    throw new Ab04Error("verified guidance manifest snapshot is unavailable", "VERIFICATION_SNAPSHOT_MISSING");
  }
  const entry = manifest.allowedFiles.find((candidate) => candidate.path === path);
  if (!entry) {
    throw new Ab04Error(`guidance path is not allowlisted: ${path}`, "GUIDANCE_PATH_NOT_ALLOWED");
  }
  const { checkout, runRootBase } = runtimeConfig;
  const file = assertRegularContainedFile(checkout, path);
  const bytes = readFileSync(file);
  const content = canonicalTextFromBytes(bytes, path);
  const actualHash = sha256Bytes(Buffer.from(content, "utf8"));
  if (actualHash !== entry.sha256) {
    throw new Ab04Error(`guidance changed at read time: ${path}`, "GUIDANCE_READ_HASH_MISMATCH");
  }
  const key = brokerKeyBytes(testContext);
  const productionRoot = resolve(
    runRootBase,
    contract.materialization.productionRunRootName,
  );
  assertAuthorizedRunRoot(productionRoot, contract, runtimeConfig);
  if (!existsSync(productionRoot)) {
    throw new Ab04Error("production run root must exist before guidance reads", "BROKER_RUN_ROOT_MISSING");
  }
  const ledgerRelativePath = guidanceBrokerLedgerRelativePath(pairId, runId);
  ensureContainedDirectory(productionRoot, dirname(ledgerRelativePath).replaceAll("\\", "/"));
  const ledgerPath = join(productionRoot, ...ledgerRelativePath.split("/"));
  let existingRecords = [];
  if (existsSync(ledgerPath)) {
    const existingFile = assertRegularContainedFile(productionRoot, ledgerRelativePath);
    existingRecords = parseBrokerLedger(readFileSync(existingFile), {
      pairId,
      runId,
      contractSha256: verification.contractSha256,
      sourceHead: contract.treatment.sourcePin,
      selectedGuidanceManifestSha256: contract.treatment.selectedGuidanceManifestSha256,
    }, key);
  }
  const payload = brokerReceiptPayload({
    sequence: existingRecords.length + 1,
    pairId,
    runId,
    contractSha256: verification.contractSha256,
    sourceHead: contract.treatment.sourcePin,
    selectedGuidanceManifestSha256: contract.treatment.selectedGuidanceManifestSha256,
    path,
    sha256: actualHash,
  });
  const receipt = {
    ...payload,
    brokerReceiptHmacSha256: brokerReceiptHmac(payload, key),
  };
  appendFileSync(ledgerPath, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", flag: "a" });
  const ledgerSnapshot = readCanonicalTextSnapshot(
    assertRegularContainedFile(productionRoot, ledgerRelativePath),
  );
  const records = parseBrokerLedger(Buffer.from(ledgerSnapshot.text, "utf8"), {
    pairId,
    runId,
    contractSha256: verification.contractSha256,
    sourceHead: contract.treatment.sourcePin,
    selectedGuidanceManifestSha256: contract.treatment.selectedGuidanceManifestSha256,
  }, key);
  expectResult(records.length === existingRecords.length + 1, "broker ledger append was not atomic", "BROKER_LEDGER_INVALID");
  const summaryResult = {
    status: "PASS",
    accessMode: "HASH_AT_OPEN_BROKER",
    contractSha256: verification.contractSha256,
    sourceHead: contract.treatment.sourcePin,
    selectedGuidanceManifestSha256: contract.treatment.selectedGuidanceManifestSha256,
    path,
    sha256: actualHash,
    brokerLogRelativePath: ledgerRelativePath,
    guidanceBrokerLogSha256: ledgerSnapshot.sha256,
    receipt: {
      sequence: receipt.sequence,
      path: receipt.path,
      sha256: receipt.sha256,
      brokerReceiptHmacSha256: receipt.brokerReceiptHmacSha256,
    },
    content,
  };
  return summaryResult;
}

export function syncDerived() {
  const snapshot = readContractSnapshot();
  const { contract } = snapshot;
  validateContractShape(contract);
  writeCanonicalText(join(benchmarkRoot, contract.prompt.generatedFile), renderPrompt(contract));
  writeCanonicalText(join(benchmarkRoot, "acceptance-gates.md"), renderAcceptanceGates(contract));
  writeCanonicalText(join(benchmarkRoot, "leg-a-policy.json"), renderJson(renderLegPolicy(contract, "a", snapshot.contractSha256)));
  writeCanonicalText(join(benchmarkRoot, "leg-b-policy.json"), renderJson(renderLegPolicy(contract, "b", snapshot.contractSha256)));
  return { contractSha256: snapshot.contractSha256 };
}

export function verifyContract() {
  const snapshot = readContractSnapshot();
  const { contract } = snapshot;
  validateContractShape(contract);
  const promptSnapshot = readCanonicalTextSnapshot(join(benchmarkRoot, contract.prompt.generatedFile));
  if (promptSnapshot.text !== renderPrompt(contract)) {
    throw new Ab04Error("derived prompt does not match the contract", "PROMPT_MISMATCH");
  }
  const gatesSnapshot = readCanonicalTextSnapshot(join(benchmarkRoot, "acceptance-gates.md"));
  if (gatesSnapshot.text !== renderAcceptanceGates(contract)) {
    throw new Ab04Error("derived acceptance gates do not match the contract", "GATES_MISMATCH");
  }
  const legAPolicySnapshot = verifyLegPolicy(
    contract,
    "a",
    snapshot.contractSha256,
    readCanonicalJsonSnapshot(join(benchmarkRoot, "leg-a-policy.json")),
  );
  const legBPolicySnapshot = verifyLegPolicy(
    contract,
    "b",
    snapshot.contractSha256,
    readCanonicalJsonSnapshot(join(benchmarkRoot, "leg-b-policy.json")),
  );
  verifyOperationalLegacyValues();
  const runbookSnapshot = readCanonicalTextSnapshot(join(benchmarkRoot, "runbook.md"));
  const runbook = runbookSnapshot.text;
  if (!runbook.includes("EXECUTION_AUTHORIZED: YES")
    || !runbook.includes(`CONTRACT_VERSION: ${contract.contractVersion}`)
    || !runbook.includes("FILESYSTEM_CONTAINMENT_REQUIRED: YES")
    || !runbook.includes("SIBLING_DIRECTORIES_ARE_NOT_A_SANDBOX: YES")) {
    throw new Ab04Error("runbook lacks execution authorization/version markers", "RUNBOOK_NOT_AUTHORIZED");
  }
  const attributes = readCanonicalText(join(repoRoot, ".gitattributes"));
  if (!attributes.includes("benchmarks/threejs-game-skills-ab/")) {
    throw new Ab04Error("benchmark LF policy is missing from .gitattributes", "GITATTRIBUTES_MISSING");
  }
  assertSafeRelativePath(contract.resultValidation.schemaFile);
  assertSafeRelativePath(contract.resultValidation.scoringRubricFile);
  const resultSchemaSnapshot = readCanonicalJsonSnapshot(
    join(benchmarkRoot, contract.resultValidation.schemaFile),
  );
  const scoringRubricSnapshot = readCanonicalTextSnapshot(
    join(benchmarkRoot, contract.resultValidation.scoringRubricFile),
  );
  if (resultSchemaSnapshot.sha256 !== contract.resultValidation.schemaSha256
    || scoringRubricSnapshot.sha256 !== contract.resultValidation.scoringRubricSha256) {
    throw new Ab04Error(
      "result schema or scoring rubric hash does not match the contract",
      "RESULT_VALIDATION_HASH_MISMATCH",
    );
  }
  const guidance = verifyGuidancePolicy(contract, {
    sourcePolicy: readCanonicalJsonSnapshot(join(benchmarkRoot, contract.treatment.sourcePolicy)),
    selectedGuidanceManifest: readCanonicalJsonSnapshot(
      join(benchmarkRoot, contract.treatment.selectedGuidanceManifest),
    ),
  });
  const scaffold = verifyScaffold(contract);
  const result = {
    status: "PASS",
    benchmark: contract.benchmark,
    contractVersion: contract.contractVersion,
    contractSha256: snapshot.contractSha256,
    scaffoldId: contract.scaffold.id,
    scaffoldTreeSha256: scaffold.treeSha256,
    selectedGuidanceManifestSha256: contract.treatment.selectedGuidanceManifestSha256,
    sourceHead: contract.treatment.sourcePin,
    allowlistCount: guidance.allowedFiles.length,
  };
  Object.defineProperty(result, "contract", { value: contract, enumerable: false });
  Object.defineProperty(result, "snapshots", {
    value: deepFreeze({
      contract: deepFreeze({ text: snapshot.contractText, sha256: snapshot.contractSha256 }),
      prompt: promptSnapshot,
      acceptanceGates: gatesSnapshot,
      legPolicies: deepFreeze({ LEG_A: legAPolicySnapshot, LEG_B: legBPolicySnapshot }),
      resultSchema: resultSchemaSnapshot,
      scoringRubric: scoringRubricSnapshot,
      runbook: runbookSnapshot,
      sourcePolicy: guidance.sourcePolicySnapshot,
      selectedGuidanceManifest: guidance.manifestSnapshot,
    }),
    enumerable: false,
  });
  return result;
}

export function verifyExternal(runtimeConfig) {
  const verification = verifyContract();
  const normalizedRuntimeConfig = validateRuntimeConfig(runtimeConfig, {
    requireCheckout: true,
    requireRunRootBase: true,
  });
  const guidance = verifySelectedGuidance(
    verification.contract,
    {
      sourcePolicy: verification.snapshots.sourcePolicy,
      selectedGuidanceManifest: verification.snapshots.selectedGuidanceManifest,
    },
    normalizedRuntimeConfig,
  );
  const result = {
    ...verification,
    selectedGuidanceManifestSha256: guidance.manifestSha256,
    sourceHead: guidance.sourceHead,
    allowlistCount: guidance.allowlistCount,
  };
  Object.defineProperty(result, "contract", { value: verification.contract, enumerable: false });
  Object.defineProperty(result, "snapshots", { value: verification.snapshots, enumerable: false });
  Object.defineProperty(result, "runtimeConfig", { value: normalizedRuntimeConfig, enumerable: false });
  return result;
}

function normalizeForComparison(path) {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function assertExistingDirectoryNoLink(path, code) {
  if (!existsSync(path)) {
    throw new Ab04Error(`directory is missing: ${path}`, code);
  }
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw new Ab04Error(`directory cannot be inspected: ${path}: ${error.message}`, code);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Ab04Error(`directory is missing, linked or irregular: ${path}`, code);
  }
  realpathSync(path);
}

export function assertAuthorizedRunRoot(runRoot, contract = readJson(contractPath), runtimeConfig = null) {
  if (typeof runRoot !== "string" || !isAbsolute(runRoot)) {
    throw new Ab04Error("run root must be an absolute path", "RUN_ROOT_NOT_ABSOLUTE");
  }
  const normalizedRuntimeConfig = validateRuntimeConfig(runtimeConfig, { requireRunRootBase: true });
  const allowedBase = normalizedRuntimeConfig.runRootBase;
  const candidate = resolve(runRoot);
  assertDisjointPaths("run root", candidate, "DevLab repository", realpathSync(repoRoot));
  if (normalizedRuntimeConfig.checkout) {
    assertDisjointPaths("run root", candidate, "external guidance checkout", normalizedRuntimeConfig.checkout);
  }
  if (normalizeForComparison(dirname(candidate)) !== normalizeForComparison(allowedBase)) {
    throw new Ab04Error("run root is outside the authorized base or not a direct child", "RUN_ROOT_OUTSIDE_ALLOWLIST");
  }
  const name = basename(candidate);
  if (name !== contract.materialization.productionRunRootName
    && !name.startsWith(contract.materialization.validationRunRootPrefix)) {
    throw new Ab04Error(`run root name is not authorized: ${name}`, "RUN_ROOT_NAME_FORBIDDEN");
  }
  if (existsSync(candidate)) assertExistingDirectoryNoLink(candidate, "RUN_ROOT_INVALID");
  return candidate;
}

function copyRegularTree(sourceRoot, destinationRoot, afterCopy = null) {
  const sourceEntries = collectTreeEntries(sourceRoot);
  const sourceRawEntries = collectTreeEntries(sourceRoot, { raw: true });
  for (const entry of sourceEntries) {
    const source = join(sourceRoot, ...entry.path.split("/"));
    const destination = join(destinationRoot, ...entry.path.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  if (afterCopy) afterCopy(destinationRoot);
  const copiedEntries = collectTreeEntries(destinationRoot);
  const copiedRawEntries = collectTreeEntries(destinationRoot, { raw: true });
  if (JSON.stringify(copiedEntries) !== JSON.stringify(sourceEntries)
    || JSON.stringify(copiedRawEntries) !== JSON.stringify(sourceRawEntries)) {
    throw new Ab04Error("copied scaffold bytes differ from the verified source", "COPIED_TREE_MISMATCH");
  }
  return copiedEntries;
}

function baselineEntries(root, { raw = false } = {}) {
  return collectTreeEntries(root, { raw })
    .filter((entry) => !MATERIALIZATION_METADATA.has(entry.path));
}

export function verifyMaterializedBaseline(
  destination,
  contract = readJson(contractPath),
  verification = null,
  { allowGeneratedRoot = false } = {},
) {
  const contractVerification = verification ?? verifyContract();
  assertExistingDirectoryNoLink(destination, "BASELINE_DIRECTORY_INVALID");
  assertNoIgnoredTreeEntries(destination, { allowGeneratedRoot });
  for (const name of MATERIALIZATION_METADATA) {
    const path = join(destination, name);
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
      throw new Ab04Error(`baseline metadata is missing or irregular: ${name}`, "BASELINE_METADATA_INVALID");
    }
  }
  const entries = baselineEntries(destination);
  const rawEntries = baselineEntries(destination, { raw: true });
  const baselineHash = treeSha256(entries);
  const manifest = readJson(join(destination, "baseline-manifest.json"));
  const expectedManifest = {
    schemaVersion: 1,
    contractVersion: contract.contractVersion,
    scaffoldId: contract.scaffold.id,
    files: entries,
  };
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
    throw new Ab04Error("baseline contents do not match the signed manifest", "BASELINE_MANIFEST_MISMATCH");
  }
  if (readCanonicalText(join(destination, "baseline-tree-sha256.txt")) !== `${baselineHash}\n`
    || baselineHash !== contract.scaffold.treeSha256) {
    throw new Ab04Error("baseline tree hash does not match the contract", "BASELINE_HASH_MISMATCH");
  }
  const report = readJson(join(destination, "materialization-report.json"));
  const expectedReport = {
    schemaVersion: 1,
    status: "MATERIALIZED",
    contractVersion: contract.contractVersion,
    contractSha256: contractVerification.contractSha256,
    scaffoldId: contract.scaffold.id,
    scaffoldTreeSha256: baselineHash,
    fileCount: entries.length,
  };
  if (JSON.stringify(report) !== JSON.stringify(expectedReport)) {
    throw new Ab04Error("materialization report does not match the current contract", "BASELINE_REPORT_MISMATCH");
  }
  return { entries, rawEntries, treeSha256: baselineHash, report };
}

export function materialize({ runRoot, leg }, testContext = null) {
  if (leg !== "a" && leg !== "b") throw new Ab04Error(`invalid leg: ${leg}`, "INVALID_LEG");
  // Programmatic tests may inject an already verified contract and scaffold so
  // filesystem adversarial cases can stay inside a portable temporary root.
  // The CLI never supplies this context and always executes the full verifier.
  const verification = testContext?.verification ?? verifyContract();
  const contract = testContext?.contract ?? verification.contract;
  const runtimeConfig = testContext?.runtimeConfig ?? verification.runtimeConfig;
  const authorizedRoot = assertAuthorizedRunRoot(runRoot, contract, runtimeConfig);
  if (!existsSync(authorizedRoot)) mkdirSync(authorizedRoot);
  assertExistingDirectoryNoLink(authorizedRoot, "RUN_ROOT_INVALID");
  const destinationName = contract.materialization.destinations[leg];
  assertSafeRelativePath(destinationName);
  const destination = join(authorizedRoot, destinationName);
  if (existsSync(destination)) {
    throw new Ab04Error(`leg destination already exists: ${destination}`, "DESTINATION_EXISTS");
  }
  const staging = join(authorizedRoot, `.${destinationName}.partial-${process.pid}-${Date.now()}`);
  if (existsSync(staging)) throw new Ab04Error("staging output already exists", "PARTIAL_OUTPUT_EXISTS");
  mkdirSync(staging);
  try {
    const scaffoldRoot = testContext?.scaffoldRoot ?? scaffoldRootFor(contract);
    const entries = copyRegularTree(scaffoldRoot, staging, testContext?.afterCopy);
    const baselineHash = treeSha256(entries);
    if (baselineHash !== contract.scaffold.treeSha256) {
      throw new Ab04Error("copied baseline hash differs from contract", "COPIED_BASELINE_HASH_MISMATCH");
    }
    const manifest = {
      schemaVersion: 1,
      contractVersion: contract.contractVersion,
      scaffoldId: contract.scaffold.id,
      files: entries,
    };
    const report = {
      schemaVersion: 1,
      status: "MATERIALIZED",
      contractVersion: contract.contractVersion,
      contractSha256: verification.contractSha256,
      scaffoldId: contract.scaffold.id,
      scaffoldTreeSha256: baselineHash,
      fileCount: entries.length,
    };
    writeCanonicalText(join(staging, "baseline-manifest.json"), renderJson(manifest));
    writeCanonicalText(join(staging, "baseline-tree-sha256.txt"), baselineHash);
    writeCanonicalText(join(staging, "materialization-report.json"), renderJson(report));
    verifyMaterializedBaseline(staging, contract, verification);
    renameSync(staging, destination);
    return { ...report, destination };
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

export function compareBaselines({ runRoot }, testContext = null) {
  // See materialize(): this override is for isolated programmatic tests only;
  // the CLI always resolves the committed contract itself.
  const verification = testContext?.verification ?? verifyContract();
  const contract = testContext?.contract ?? verification.contract;
  const runtimeConfig = testContext?.runtimeConfig ?? verification.runtimeConfig;
  const authorizedRoot = assertAuthorizedRunRoot(runRoot, contract, runtimeConfig);
  const a = join(authorizedRoot, contract.materialization.destinations.a);
  const b = join(authorizedRoot, contract.materialization.destinations.b);
  if (!existsSync(a) || !existsSync(b)) {
    throw new Ab04Error("both materialized leg directories are required", "BASELINE_MISSING");
  }
  verifyMaterializedBaseline(a, contract, verification);
  verifyMaterializedBaseline(b, contract, verification);
  const canonicalA = collectTreeEntries(a);
  const canonicalB = collectTreeEntries(b);
  const rawA = collectTreeEntries(a, { raw: true });
  const rawB = collectTreeEntries(b, { raw: true });
  if (JSON.stringify(canonicalA) !== JSON.stringify(canonicalB)
    || JSON.stringify(rawA) !== JSON.stringify(rawB)) {
    throw new Ab04Error("materialized baseline trees are not byte-identical", "BASELINES_DIFFER");
  }
  const summaryResult = {
    status: "PASS",
    identical: true,
    fileCount: canonicalA.length,
    treeSha256: treeSha256(canonicalA),
    rawTreeSha256: treeSha256(rawA),
  };
  return summaryResult;
}

function expectResult(condition, message, code = "RESULT_MISMATCH") {
  if (!condition) throw new Ab04Error(message, code);
}

function jsonTypeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

export function validateJsonSchema(value, schema, path = "$") {
  if (!schema || typeof schema !== "object") return;
  if (Object.hasOwn(schema, "const") && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    throw new Ab04Error(`${path} does not match const`, "RESULT_SCHEMA_MISMATCH");
  }
  if (schema.enum && !schema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) {
    throw new Ab04Error(`${path} is outside enum`, "RESULT_SCHEMA_MISMATCH");
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => jsonTypeMatches(value, type))) {
      throw new Ab04Error(`${path} has the wrong type`, "RESULT_SCHEMA_MISMATCH");
    }
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      throw new Ab04Error(`${path} is too short`, "RESULT_SCHEMA_MISMATCH");
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      throw new Ab04Error(`${path} does not match its pattern`, "RESULT_SCHEMA_MISMATCH");
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      throw new Ab04Error(`${path} is below minimum`, "RESULT_SCHEMA_MISMATCH");
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      throw new Ab04Error(`${path} is above maximum`, "RESULT_SCHEMA_MISMATCH");
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      throw new Ab04Error(`${path} has too few items`, "RESULT_SCHEMA_MISMATCH");
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      throw new Ab04Error(`${path} has too many items`, "RESULT_SCHEMA_MISMATCH");
    }
    if (schema.items) value.forEach((item, index) => validateJsonSchema(item, schema.items, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        throw new Ab04Error(`${path}.${required} is required`, "RESULT_SCHEMA_MISMATCH");
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) validateJsonSchema(child, schema.properties[key], `${path}.${key}`);
      else if (schema.additionalProperties === false) {
        throw new Ab04Error(`${path}.${key} is not allowed`, "RESULT_SCHEMA_MISMATCH");
      }
    }
  }
  for (const child of schema.allOf ?? []) validateJsonSchema(value, child, path);
  if (schema.if) {
    let matched = true;
    try {
      validateJsonSchema(value, schema.if, path);
    } catch (error) {
      if (error instanceof Ab04Error && error.code === "RESULT_SCHEMA_MISMATCH") matched = false;
      else throw error;
    }
    if (matched && schema.then) validateJsonSchema(value, schema.then, path);
    if (!matched && schema.else) validateJsonSchema(value, schema.else, path);
  }
}

function resultPngRgba(bytes, label, expectedViewport) {
  let parsed;
  try { parsed = parsePng(bytes); } catch (error) { expectResult(false, `${label} failed canonical PNG admission: ${error.message}`); }
  expectResult(parsed.colorType === 6 && parsed.channels === 4, `${label} must be an 8-bit RGBA PNG`);
  expectResult(
    parsed.width === expectedViewport.width && parsed.height === expectedViewport.height,
    `${label} dimensions do not match the expected viewport`,
  );
  return { width: parsed.width, height: parsed.height, rgba: Buffer.from(parsed.pixels) };
}

function verifyResultArtifactSet(
  result,
  resultPath,
  contract,
  verification,
  { mediaViewports = contract.viewports } = {},
) {
  const summary = result.artifactSummary;
  expectResult(summary && typeof summary === "object", "result artifact summary is missing");
  const expectedSummary = {
    frozenStateCount: contract.prompt.frozenStates.length,
    capturesPerState: contract.repetitions.frozenCapturesPerState,
    frozenPngArtifacts: contract.prompt.frozenStates.length * contract.repetitions.frozenCapturesPerState,
    frozenRgbaArtifacts: contract.prompt.frozenStates.length * contract.repetitions.frozenCapturesPerState,
    botRunArtifacts: contract.repetitions.botPlaytestsPerLeg,
    performanceRepetitionsPerScenario: contract.repetitions.performancePerScenario,
    performanceScenarioCount: contract.repetitions.performanceScenarios.length,
    allArtifactHashesVerified: true,
  };
  expectResult(
    JSON.stringify(summary) === JSON.stringify(expectedSummary),
    "result artifact summary does not match the contract",
  );
  expectResult(Array.isArray(result.artifacts) && result.artifacts.length > 0, "result artifact manifest is empty");
  const evidenceRoot = dirname(resultPath);
  const paths = new Set();
  const byRole = new Map();
  const filesByPath = new Map();
  for (const artifact of result.artifacts) {
    expectResult(artifact && typeof artifact === "object", "artifact entry is malformed");
    assertSafeRelativePath(artifact.path);
    expectResult(!paths.has(artifact.path), `duplicate artifact path: ${artifact.path}`);
    paths.add(artifact.path);
    expectResult(/^[a-f0-9]{64}$/.test(artifact.sha256 || ""), `artifact hash is invalid: ${artifact.path}`);
    const file = assertRegularContainedFile(evidenceRoot, artifact.path);
    const bytes = readFileSync(file);
    expectResult(
      sha256Bytes(bytes) === artifact.sha256,
      `artifact hash mismatch: ${artifact.path}`,
      "RESULT_ARTIFACT_HASH_MISMATCH",
    );
    const entries = byRole.get(artifact.role) ?? [];
    entries.push(artifact);
    byRole.set(artifact.role, entries);
    filesByPath.set(artifact.path, { file, bytes });
  }

  for (const role of [
    "contract", "prompt", "scoring-rubric", "acceptance-gates", "leg-policy", "scaffold-manifest",
    "build-log", "typecheck-log", "test-log", "final-report",
  ]) {
    expectResult((byRole.get(role) ?? []).length === 1, `result requires exactly one ${role} artifact`);
  }
  expectResult(
    (byRole.get("guidance-broker-log") ?? []).length === (result.leg === "LEG_B" ? 1 : 0),
    `result has the wrong guidance-broker-log artifact count for ${result.leg}`,
  );
  for (const role of ["source-policy", "selected-guidance-manifest"]) {
    expectResult(
      (byRole.get(role) ?? []).length === (result.leg === "LEG_B" ? 1 : 0),
      `result has the wrong ${role} artifact count for ${result.leg}`,
    );
  }
  const expectedMediaTypes = {
    contract: "application/json",
    prompt: "text/markdown",
    "scoring-rubric": "text/markdown",
    "acceptance-gates": "text/markdown",
    "leg-policy": "application/json",
    "source-policy": "application/json",
    "selected-guidance-manifest": "application/json",
    "scaffold-manifest": "application/json",
    "build-log": "text/plain",
    "typecheck-log": "text/plain",
    "test-log": "text/plain",
    "frozen-capture-png": "image/png",
    "frozen-capture-rgba": "application/octet-stream",
    "bot-run": "application/json",
    "performance-run": "application/json",
    "guidance-broker-log": "application/x-ndjson",
    "final-report": "text/markdown",
  };
  for (const artifact of result.artifacts) {
    expectResult(artifact.mediaType === expectedMediaTypes[artifact.role], `artifact media type mismatch: ${artifact.path}`);
  }
  const snapshots = verification.snapshots;
  if (!snapshots) {
    throw new Ab04Error("verified artifact snapshots are unavailable", "VERIFICATION_SNAPSHOT_MISSING");
  }
  for (const [role, expectedText] of [
    ["contract", snapshots.contract.text],
    ["prompt", snapshots.prompt.text],
    ["scoring-rubric", snapshots.scoringRubric.text],
    ["acceptance-gates", snapshots.acceptanceGates.text],
    ["leg-policy", snapshots.legPolicies[result.leg].text],
    ...(result.leg === "LEG_B" ? [
      ["source-policy", snapshots.sourcePolicy.text],
      ["selected-guidance-manifest", snapshots.selectedGuidanceManifest.text],
    ] : []),
  ]) {
    const artifact = byRole.get(role)[0];
    const { bytes } = filesByPath.get(artifact.path);
    expectResult(
      canonicalTextFromBytes(bytes, artifact.path) === expectedText,
      `fixed artifact content mismatch: ${role}`,
    );
  }
  const scaffoldArtifact = byRole.get("scaffold-manifest")[0];
  const scaffoldManifest = JSON.parse(
    canonicalTextFromBytes(filesByPath.get(scaffoldArtifact.path).bytes, scaffoldArtifact.path),
  );
  const scaffoldHash = scaffoldManifest.scaffoldTreeSha256
    ?? (Array.isArray(scaffoldManifest.files) ? treeSha256(scaffoldManifest.files) : null);
  expectResult(
    scaffoldManifest.contractVersion === contract.contractVersion
    && scaffoldManifest.scaffoldId === contract.scaffold.id
    && scaffoldHash === contract.scaffold.treeSha256,
    "scaffold manifest does not match the contract",
  );
  for (const role of ["build-log", "typecheck-log", "test-log", "final-report"]) {
    const artifact = byRole.get(role)[0];
    const text = canonicalTextFromBytes(filesByPath.get(artifact.path).bytes, artifact.path);
    expectResult(text.trim().length > 0, `${role} artifact is empty`);
    if (role !== "final-report") {
      expectResult(/\bPASS\b/u.test(text) && !/\b(?:FAIL|FAILED)\b/u.test(text), `${role} does not record PASS`);
    }
  }
  const finalReportArtifact = byRole.get("final-report")[0];
  const finalReportText = canonicalTextFromBytes(
    filesByPath.get(finalReportArtifact.path).bytes,
    finalReportArtifact.path,
  );
  const finalReportLines = new Set(finalReportText.split("\n").map((line) => line.trim()));
  const containment = result.security?.filesystemContainment;
  expectResult(
    containment?.evidenceArtifact === finalReportArtifact.path,
    "filesystem containment must reference the final-report artifact",
  );
  for (const requiredLine of [
    "FINAL_STATUS: PASS",
    `LEG: ${result.leg}`,
    `PAIR_ID: ${result.pairId}`,
    `RUN_ID: ${result.runId}`,
    "FILESYSTEM_CONTAINMENT: PASS",
    `CONTAINMENT_MECHANISM: ${containment.mechanism}`,
    "CROSS_LEG_READS: 0",
    "TOUCH_CONTROLS: PASS",
    "BLIND_EVALUATION: COMPLETE",
    "CONTROLLED_CHANGE_DETECTED: PASS",
    "RESTORE_HASH_MATCH: PASS",
  ]) {
    expectResult(finalReportLines.has(requiredLine), `final report lacks attestation: ${requiredLine}`);
  }
  const expectedRepetitions = Array.from(
    { length: contract.repetitions.frozenCapturesPerState },
    (_, index) => index + 1,
  );
  for (const [role, expectedCount] of [
    ["frozen-capture-png", expectedSummary.frozenPngArtifacts],
    ["frozen-capture-rgba", expectedSummary.frozenRgbaArtifacts],
  ]) {
    const entries = byRole.get(role) ?? [];
    expectResult(entries.length === expectedCount, `${role} artifact count mismatch`);
    for (const state of contract.prompt.frozenStates) {
      const repetitions = entries
        .filter((entry) => entry.state === state)
        .map((entry) => entry.repetition)
        .sort((a, b) => a - b);
      expectResult(
        JSON.stringify(repetitions) === JSON.stringify(expectedRepetitions),
        `${role} repetitions mismatch for ${state}`,
      );
      const stateHashes = new Set(
        entries.filter((entry) => entry.state === state).map((entry) => entry.sha256),
      );
      expectResult(stateHashes.size === 1, `${role} frozen bytes differ for ${state}`);
    }
    const stateHashes = contract.prompt.frozenStates.map((state) => (
      entries.find((entry) => entry.state === state)?.sha256
    ));
    expectResult(
      new Set(stateHashes).size === contract.prompt.frozenStates.length,
      `${role} reuses frozen bytes across distinct states`,
    );
  }
  const pngArtifacts = byRole.get("frozen-capture-png") ?? [];
  const rgbaArtifacts = byRole.get("frozen-capture-rgba") ?? [];
  const nonblankShares = [];
  for (const pngArtifact of pngArtifacts) {
    const rgbaArtifact = rgbaArtifacts.find((candidate) => candidate.state === pngArtifact.state
      && candidate.repetition === pngArtifact.repetition);
    expectResult(Boolean(rgbaArtifact), `RGBA pair is missing for ${pngArtifact.state}/${pngArtifact.repetition}`);
    const viewport = pngArtifact.state === "mobile-active" ? mediaViewports.mobile : mediaViewports.desktop;
    const decoded = resultPngRgba(filesByPath.get(pngArtifact.path).bytes, pngArtifact.path, viewport);
    const rgbaBytes = filesByPath.get(rgbaArtifact.path).bytes;
    expectResult(
      rgbaBytes.length === viewport.width * viewport.height * 4,
      `RGBA byte length mismatch for ${rgbaArtifact.path}`,
    );
    expectResult(decoded.rgba.equals(rgbaBytes), `PNG and RGBA pixels differ for ${pngArtifact.state}`);
    let nonblankPixels = 0;
    for (let offset = 0; offset < rgbaBytes.length; offset += 4) {
      if (rgbaBytes[offset + 3] > 0
        && (rgbaBytes[offset] > 0 || rgbaBytes[offset + 1] > 0 || rgbaBytes[offset + 2] > 0)) {
        nonblankPixels += 1;
      }
    }
    const nonblankShare = nonblankPixels / (viewport.width * viewport.height);
    expectResult(nonblankShare > 0, `capture is blank for ${pngArtifact.state}`);
    nonblankShares.push(nonblankShare);
  }
  expectResult(
    Math.abs(Math.min(...nonblankShares) - result.visual.nonblankShare) <= 1e-9,
    "visual nonblank share does not match frozen RGBA evidence",
  );
  const botRepetitions = (byRole.get("bot-run") ?? [])
    .map((entry) => entry.repetition)
    .sort((a, b) => a - b);
  expectResult(
    JSON.stringify(botRepetitions)
      === JSON.stringify(Array.from({ length: contract.repetitions.botPlaytestsPerLeg }, (_, index) => index + 1)),
    "bot-run artifact repetitions mismatch",
  );
  const botRecords = [];
  for (const artifact of byRole.get("bot-run") ?? []) {
    let record;
    try {
      record = JSON.parse(canonicalTextFromBytes(filesByPath.get(artifact.path).bytes, artifact.path));
    } catch {
      expectResult(false, `bot-run artifact is not JSON: ${artifact.path}`);
    }
    expectResult(
      record.repetition === artifact.repetition
      && record.status === "PASS"
      && record.softlocks === 0
      && record.mainPathReachable === true
      && record.restartSuccess === true,
      `bot-run record mismatch: ${artifact.path}`,
    );
    expectResult(
      typeof record.completed === "boolean"
      && Number.isFinite(record.timeToObjectiveMs) && record.timeToObjectiveMs >= 0
      && Number.isInteger(record.damageEvents) && record.damageEvents >= 0
      && Number.isFinite(record.inputResponseMs) && record.inputResponseMs >= 0,
      `bot-run metrics are invalid: ${artifact.path}`,
    );
    botRecords.push(record);
  }
  botRecords.sort((a, b) => a.repetition - b.repetition);
  const completionRate = botRecords.filter((record) => record.completed).length / botRecords.length;
  const totalDamageEvents = botRecords.reduce((total, record) => total + record.damageEvents, 0);
  const meanInputResponseMs = botRecords.reduce((total, record) => total + record.inputResponseMs, 0)
    / botRecords.length;
  expectResult(
    result.gameplay.botRuns === botRecords.length
    && result.gameplay.botCompletionRate === completionRate
    && result.gameplay.softlocks === botRecords.reduce((total, record) => total + record.softlocks, 0)
    && JSON.stringify(result.gameplay.timeToObjectiveMs)
      === JSON.stringify(botRecords.map((record) => record.timeToObjectiveMs))
    && result.gameplay.damageEvents === totalDamageEvents
    && result.gameplay.restartSuccess === botRecords.every((record) => record.restartSuccess)
    && Math.abs(result.gameplay.inputResponseMs - meanInputResponseMs) <= 1e-9,
    "gameplay aggregates do not match bot-run evidence",
  );
  const performance = byRole.get("performance-run") ?? [];
  expectResult(
    performance.length === contract.repetitions.performancePerScenario
      * contract.repetitions.performanceScenarios.length,
    "performance artifacts are incomplete",
  );
  const scenarios = new Map();
  const performanceRecords = [];
  for (const artifact of performance) {
    expectResult(typeof artifact.scenario === "string" && artifact.scenario.length > 0, "performance artifact lacks scenario");
    const repetitions = scenarios.get(artifact.scenario) ?? [];
    repetitions.push(artifact.repetition);
    scenarios.set(artifact.scenario, repetitions);
    let record;
    try {
      record = JSON.parse(canonicalTextFromBytes(filesByPath.get(artifact.path).bytes, artifact.path));
    } catch {
      expectResult(false, `performance artifact is not JSON: ${artifact.path}`);
    }
    expectResult(
      record.scenario === artifact.scenario
      && record.repetition === artifact.repetition
      && record.metrics && typeof record.metrics === "object"
      && ["frameP50Ms", "frameP95Ms", "frameP99Ms", "drawCalls", "triangles", "textures", "heapBytes"]
        .every((field) => Number.isFinite(record.metrics[field]) && record.metrics[field] >= 0)
      && record.metrics.isFallbackAdapter === false,
      `performance record mismatch: ${artifact.path}`,
    );
    performanceRecords.push(record);
  }
  for (const [scenario, repetitions] of scenarios) {
    repetitions.sort((a, b) => a - b);
    expectResult(
      JSON.stringify(repetitions)
        === JSON.stringify(Array.from({ length: contract.repetitions.performancePerScenario }, (_, index) => index + 1)),
      `performance repetitions mismatch for ${scenario}`,
    );
  }
  expectResult(
    JSON.stringify([...scenarios.keys()].sort())
      === JSON.stringify([...contract.repetitions.performanceScenarios].sort()),
    "performance scenario set does not match the contract",
  );
  for (const field of [
    "frameP50Ms", "frameP95Ms", "frameP99Ms", "drawCalls",
    "triangles", "textures", "heapBytes",
  ]) {
    const worstObserved = Math.max(...performanceRecords.map((record) => record.metrics[field]));
    expectResult(
      result.performance[field] === worstObserved,
      `performance aggregate ${field} does not match run evidence`,
    );
  }
  const artifactResult = { artifactCount: result.artifacts.length, scenarioCount: scenarios.size };
  Object.defineProperty(artifactResult, "byRole", { value: byRole, enumerable: false });
  Object.defineProperty(artifactResult, "filesByPath", { value: filesByPath, enumerable: false });
  return artifactResult;
}

function verifyResultSourceProvenance(
  result,
  contract,
  verification,
  productionRoot,
  artifacts,
  testContext = null,
) {
  const provenance = result.sourceProvenance;
  expectResult(provenance && typeof provenance === "object", "source provenance is missing");
  if (result.leg === "LEG_A") {
    expectResult(
      provenance.guidanceLoaded === false
      && provenance.guidanceAccessMode === "FORBIDDEN"
      && provenance.sourceHead === null
      && provenance.sourcePolicySha256 === null
      && provenance.selectedGuidanceManifestSha256 === null
      && provenance.guidanceBrokerLogSha256 === null
      && Array.isArray(provenance.guidanceReadReceipts)
      && provenance.guidanceReadReceipts.length === 0,
      "LEG_A source provenance is not an isolated control",
    );
    return { guidanceReadCount: 0 };
  }
  expectResult(result.leg === "LEG_B", "result leg is invalid");
  expectResult(
    provenance.guidanceLoaded === true
    && provenance.guidanceAccessMode === "HASH_AT_OPEN_BROKER"
    && provenance.sourceHead === contract.treatment.sourcePin
    && provenance.sourcePolicySha256 === contract.treatment.sourcePolicySha256
    && provenance.selectedGuidanceManifestSha256 === contract.treatment.selectedGuidanceManifestSha256
    && /^[a-f0-9]{64}$/.test(provenance.guidanceBrokerLogSha256 || "")
    && Array.isArray(provenance.guidanceReadReceipts)
    && provenance.guidanceReadReceipts.length > 0,
    "LEG_B source provenance does not match the contract",
  );
  const manifest = verification.snapshots?.selectedGuidanceManifest?.value;
  if (!manifest) {
    throw new Ab04Error("verified guidance manifest snapshot is unavailable", "VERIFICATION_SNAPSHOT_MISSING");
  }
  const allowed = new Map(manifest.allowedFiles.map((entry) => [entry.path, entry.sha256]));
  const ledgerRelativePath = guidanceBrokerLedgerRelativePath(result.pairId, result.runId);
  const ledgerFile = assertRegularContainedFile(productionRoot, ledgerRelativePath);
  const ledgerBytes = readFileSync(ledgerFile);
  expectResult(
    sha256Bytes(ledgerBytes) === provenance.guidanceBrokerLogSha256,
    "trusted guidance broker ledger hash mismatch",
    "BROKER_LEDGER_INVALID",
  );
  const brokerArtifact = (artifacts.byRole.get("guidance-broker-log") ?? [])[0];
  const brokerArtifactBytes = brokerArtifact
    ? artifacts.filesByPath.get(brokerArtifact.path)?.bytes
    : null;
  expectResult(
    brokerArtifact
    && brokerArtifact.sha256 === provenance.guidanceBrokerLogSha256
    && Buffer.isBuffer(brokerArtifactBytes)
    && brokerArtifactBytes.equals(ledgerBytes),
    "result broker artifact is not an exact copy of the trusted coordinator ledger",
    "BROKER_LEDGER_INVALID",
  );
  const records = parseBrokerLedger(ledgerBytes, {
    pairId: result.pairId,
    runId: result.runId,
    contractSha256: verification.contractSha256,
    sourceHead: contract.treatment.sourcePin,
    selectedGuidanceManifestSha256: contract.treatment.selectedGuidanceManifestSha256,
  }, brokerKeyBytes(testContext));
  const projectedReceipts = records.map((record) => ({
    sequence: record.sequence,
    path: record.path,
    sha256: record.sha256,
    brokerReceiptHmacSha256: record.brokerReceiptHmacSha256,
  }));
  expectResult(
    JSON.stringify(provenance.guidanceReadReceipts) === JSON.stringify(projectedReceipts),
    "declared guidance receipts do not match the trusted broker ledger",
    "BROKER_LEDGER_INVALID",
  );
  for (const receipt of projectedReceipts) {
    assertSafeRelativePath(receipt.path);
    expectResult(allowed.get(receipt.path) === receipt.sha256, `invalid guidance receipt: ${receipt.path}`);
  }
  return { guidanceReadCount: records.length, guidanceBrokerLogSha256: provenance.guidanceBrokerLogSha256 };
}

export function verifyResult({ resultPath }, testContext = null) {
  expectResult(typeof resultPath === "string" && isAbsolute(resultPath), "result path must be absolute", "RESULT_PATH_INVALID");
  const absoluteResult = resolve(resultPath);
  expectResult(existsSync(absoluteResult), "result file is missing", "RESULT_PATH_INVALID");
  const resultStat = lstatSync(absoluteResult);
  expectResult(resultStat.isFile() && !resultStat.isSymbolicLink(), "result file is linked or irregular", "RESULT_PATH_INVALID");
  const verification = testContext?.verification ?? verifyContract();
  const contract = testContext?.contract ?? verification.contract;
  const runtimeConfig = validateRuntimeConfig(
    testContext?.runtimeConfig ?? verification.runtimeConfig,
    { requireRunRootBase: true },
  );
  const productionRoot = resolve(
    runtimeConfig.runRootBase,
    contract.materialization.productionRunRootName,
  );
  assertAuthorizedRunRoot(productionRoot, contract, runtimeConfig);
  expectResult(
    absoluteResult.startsWith(`${productionRoot}${sep}`),
    "result file is outside the production evidence root",
    "RESULT_PATH_INVALID",
  );
  const containedResult = assertRegularContainedFile(
    productionRoot,
    toPosix(relative(productionRoot, absoluteResult)),
  );
  const productionRealPath = realpathSync(productionRoot);
  const resultRealPath = realpathSync(containedResult);
  expectResult(
    resultRealPath.startsWith(`${productionRealPath}${sep}`),
    "result file escapes through a linked ancestor",
    "RESULT_PATH_INVALID",
  );
  const result = readJson(absoluteResult);
  const resultSchema = verification.snapshots?.resultSchema?.value;
  if (!resultSchema) {
    throw new Ab04Error("verified result schema snapshot is unavailable", "VERIFICATION_SNAPSHOT_MISSING");
  }
  validateJsonSchema(result, resultSchema);
  expectResult(result.schemaVersion === 2, "result schema version mismatch");
  expectResult(result.contractVersion === contract.contractVersion, "result contract version mismatch");
  expectResult(result.contractSha256 === verification.contractSha256, "result contract hash is stale");
  expectResult(result.benchmark === contract.benchmark, "result benchmark identity mismatch");
  expectResult(result.leg === "LEG_A" || result.leg === "LEG_B", "result leg is invalid");
  expectResult(typeof result.runId === "string" && result.runId.length > 0, "result runId is missing");
  expectResult(typeof result.pairId === "string" && result.pairId.length > 0, "result pairId is missing");
  const expectedLegRoot = join(
    productionRoot,
    result.leg === "LEG_A"
      ? contract.materialization.destinations.a
      : contract.materialization.destinations.b,
  );
  expectResult(
    absoluteResult.startsWith(`${expectedLegRoot}${sep}`),
    "result file is outside its declared leg root",
    "RESULT_PATH_INVALID",
  );
  const environment = result.environment;
  expectResult(environment && typeof environment === "object", "result environment is missing");
  const repoHead = testContext?.repoHead ?? gitOutput(repoRoot, ["rev-parse", "HEAD"]);
  expectResult(environment.devlabCommit === repoHead, "result DevLab commit does not match the verifier checkout");
  expectResult(environment.reasoningEffort === contract.model.reasoningEffort, "result reasoning effort mismatch");
  expectResult(environment.backend === contract.scaffold.backend, "result backend mismatch");
  expectResult(environment.scaffoldTreeSha256 === contract.scaffold.treeSha256, "result scaffold hash mismatch");
  expectResult(JSON.stringify(environment.viewports) === JSON.stringify(contract.viewports), "result viewport mismatch");
  expectResult(environment.worldSeed === contract.worldSeed, "result world seed mismatch");
  expectResult(environment.fixedTimestepHz === contract.runtime.fixedTimestepHz, "result fixed timestep mismatch");
  expectResult(environment.maximumCatchupSteps === contract.runtime.maximumCatchupSteps, "result catch-up bound mismatch");
  expectResult(environment.frozenCaptureTimeMs === contract.runtime.frozenCaptureTimeMs, "result frozen time mismatch");
  expectResult(environment.captureHarnessSha256 === contract.runtime.captureHarnessSha256, "result capture harness hash mismatch");
  expectResult(
    JSON.stringify(environment.captureHarnessFilesSha256)
      === JSON.stringify(contract.runtime.captureHarnessFilesSha256),
    "result capture harness dependency hashes mismatch",
  );
  expectResult(
    JSON.stringify(environment.captureRuntimePackages)
      === JSON.stringify(contract.runtime.captureRuntimePackages),
    "result capture runtime package hashes mismatch",
  );
  expectResult(JSON.stringify(environment.browser) === JSON.stringify({
    browserType: "chromium",
    browserVersion: contract.runtime.browserVersion,
    executableSha256: contract.runtime.browserExecutableSha256,
    launchMode: "full-chromium-native-webgpu",
    cacheRevision: contract.runtime.browserCacheRevision,
    distributionFileCount: contract.runtime.browserDistributionFileCount,
    distributionByteLength: contract.runtime.browserDistributionByteLength,
    distributionTreeSha256: contract.runtime.browserDistributionTreeSha256,
  }), "result browser attestation mismatch");
  expectResult(JSON.stringify(environment.adapter) === JSON.stringify({
    vendor: contract.runtime.adapterVendor,
    architecture: contract.runtime.adapterArchitecture,
    pciDeviceId: contract.runtime.adapterPciDeviceId,
    isFallbackAdapter: contract.runtime.adapterFallbackAllowed,
  }), "result adapter attestation mismatch");
  expectResult(typeof environment.model === "string" && environment.model.length > 0, "result model is missing");
  expectResult(typeof environment.modelBuild === "string" && environment.modelBuild.length > 0, "result model build is missing");
  expectResult(
    result.security?.passed === true
    && result.security.filesystemContainment?.enforced === true
    && result.security.filesystemContainment?.crossLegReads === 0,
    "result security gates did not pass",
  );
  const correctness = result.correctness;
  expectResult(
    correctness.installFrozen === true
    && correctness.lockfileDiff === 0
    && correctness.build === true
    && correctness.typecheck === true
    && correctness.consoleErrors === 0
    && correctness.pageErrors === 0
    && correctness.networkErrors === 0
    && correctness.pause === true
    && correctness.restart === true
    && correctness.checkpointRestore === true
    && correctness.victory === true
    && correctness.deviceLossRecovery === true
    && correctness.p0OrP1Regressions === 0,
    "result correctness gates did not pass",
  );
  expectResult(
    result.determinism.capturesPerState === contract.repetitions.frozenCapturesPerState
    && result.determinism.frozenByteEqual === true
    && result.determinism.frozenPixelEqual === true
    && result.determinism.controlledChangeDetected === true
    && result.determinism.restoreHashMatch === true,
    "result determinism gates did not pass",
  );
  expectResult(
    result.performance.repetitionsPerScenario === contract.repetitions.performancePerScenario
    && JSON.stringify(result.performance.scenarios) === JSON.stringify(contract.repetitions.performanceScenarios)
    && result.performance.boundedResources === true
    && result.performance.resize === true
    && result.performance.mobileViewport === true,
    "result performance or mobile gates did not pass",
  );
  expectResult(
    result.gameplay.botRuns === contract.repetitions.botPlaytestsPerLeg
    && result.gameplay.softlocks === 0
    && result.gameplay.restartSuccess === true,
    "result gameplay gates did not pass",
  );
  expectResult(
    result.visual.tslVisible === true
    && result.visual.nonblankShare > 0
    && typeof result.visual.humanNotes === "string"
    && result.visual.humanNotes.trim().length > 0,
    "result visual or TSL gates did not pass",
  );
  const weightedTotal = Object.entries(contract.weights)
    .reduce((total, [field, weight]) => total + result.scoring[field] * weight, 0) / 100;
  expectResult(
    Math.abs(weightedTotal - result.scoring.weightedTotal) <= 1e-9,
    "result weighted score does not match the contract formula",
  );
  const artifacts = verifyResultArtifactSet(
    result,
    absoluteResult,
    contract,
    verification,
    { mediaViewports: testContext?.mediaViewports ?? contract.viewports },
  );
  const source = verifyResultSourceProvenance(
    result,
    contract,
    verification,
    productionRoot,
    artifacts,
    testContext,
  );
  const summaryResult = {
    status: "PASS",
    contractSha256: verification.contractSha256,
    scaffoldTreeSha256: contract.scaffold.treeSha256,
    leg: result.leg,
    runId: result.runId,
    pairId: result.pairId,
    weightedTotal,
    ...source,
    ...artifacts,
  };
  Object.defineProperty(summaryResult, "result", { value: result, enumerable: false });
  Object.defineProperty(summaryResult, "evidenceRoot", { value: dirname(absoluteResult), enumerable: false });
  return summaryResult;
}

export function compareResultPair({ resultAPath, resultBPath }, testContext = null) {
  const verification = testContext?.verification ?? verifyContract();
  const contract = testContext?.contract ?? verification.contract;
  const sharedContext = { ...(testContext ?? {}), verification, contract };
  const a = verifyResult({ resultPath: resultAPath }, sharedContext);
  const b = verifyResult({ resultPath: resultBPath }, sharedContext);
  expectResult(a.leg === "LEG_A" && b.leg === "LEG_B", "result pair must be ordered LEG_A then LEG_B");
  expectResult(a.pairId === b.pairId, "result pairId mismatch");
  expectResult(a.runId !== b.runId, "result pair must use distinct runIds");
  const evidenceRootA = realpathSync(a.evidenceRoot);
  const evidenceRootB = realpathSync(b.evidenceRoot);
  expectResult(
    evidenceRootA !== evidenceRootB
    && !evidenceRootA.startsWith(`${evidenceRootB}${sep}`)
    && !evidenceRootB.startsWith(`${evidenceRootA}${sep}`),
    "result pair must use distinct non-nested evidence roots",
  );
  const sharedEnvironment = [
    "devlabCommit", "model", "modelBuild", "reasoningEffort", "browser",
    "adapter", "backend", "worldSeed", "fixedTimestepHz", "maximumCatchupSteps",
    "frozenCaptureTimeMs", "captureHarnessSha256", "captureHarnessFilesSha256",
    "captureRuntimePackages",
    "viewports", "scaffoldTreeSha256",
  ];
  for (const field of sharedEnvironment) {
    expectResult(
      JSON.stringify(a.result.environment[field]) === JSON.stringify(b.result.environment[field]),
      `result pair environment mismatch: ${field}`,
    );
  }
  expectResult(
    JSON.stringify(a.result.performance.scenarios) === JSON.stringify(b.result.performance.scenarios),
    "result pair performance scenario mismatch",
  );
  const delta = b.weightedTotal - a.weightedTotal;
  let decision = "INCONCLUSIVE / SECOND_PAIR_REQUIRED";
  if (delta >= contract.decision.legBMinimumPercentagePointGain) decision = "LEG_B_WIN";
  if (delta < -contract.decision.legAMinimumPercentagePointGainExclusive) decision = "LEG_A_WIN";
  return {
    status: "PASS",
    pairId: a.pairId,
    contractSha256: a.contractSha256,
    scaffoldTreeSha256: a.scaffoldTreeSha256,
    sharedEnvironmentEqual: true,
    legAWeightedTotal: a.weightedTotal,
    legBWeightedTotal: b.weightedTotal,
    delta,
    decision,
  };
}

function parseCli(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const command = args.shift();
  const options = {};
  while (args.length) {
    const flag = args.shift();
    if (![
      "--run-root", "--leg", "--path", "--pair-id", "--run-id",
      "--result", "--result-a", "--result-b", "--checkout", "--run-root-base",
    ].includes(flag)) {
      throw new Ab04Error(`unknown argument: ${flag}`, "UNKNOWN_ARGUMENT");
    }
    if (Object.hasOwn(options, flag)) throw new Ab04Error(`duplicate argument: ${flag}`, "DUPLICATE_ARGUMENT");
    const value = args.shift();
    if (!value || value.startsWith("--")) throw new Ab04Error(`missing value for ${flag}`, "MISSING_ARGUMENT_VALUE");
    options[flag] = value;
  }
  return {
    command,
    runRoot: options["--run-root"],
    leg: options["--leg"],
    path: options["--path"],
    pairId: options["--pair-id"],
    runId: options["--run-id"],
    resultPath: options["--result"],
    resultAPath: options["--result-a"],
    resultBPath: options["--result-b"],
    checkout: options["--checkout"],
    runRootBase: options["--run-root-base"],
  };
}

async function main() {
  const {
    command, runRoot, leg, path, pairId, runId, resultPath, resultAPath, resultBPath,
    checkout, runRootBase,
  } = parseCli(process.argv.slice(2));
  const anyResultPath = resultPath || resultAPath || resultBPath;
  const anyBrokerIdentity = pairId || runId;
  const anyRuntimeConfig = checkout || runRootBase;
  const externalContext = () => {
    if (!checkout || !runRootBase) {
      throw new Ab04Error(
        "external AB-04 operations require --checkout and --run-root-base",
        "EXTERNAL_CONFIG_REQUIRED",
      );
    }
    const verification = verifyExternal({ checkout, runRootBase });
    return {
      verification,
      contract: verification.contract,
      runtimeConfig: verification.runtimeConfig,
    };
  };
  let result;
  if (command === "verify-contract") {
    if (runRoot || leg || path || anyBrokerIdentity || anyResultPath || anyRuntimeConfig) throw new Ab04Error("verify-contract accepts no options", "INVALID_ARGUMENTS");
    result = verifyContract();
  } else if (command === "verify-external") {
    if (runRoot || leg || path || anyBrokerIdentity || anyResultPath) throw new Ab04Error("verify-external accepts only --checkout and --run-root-base", "INVALID_ARGUMENTS");
    result = externalContext().verification;
  } else if (command === "sync-derived") {
    if (runRoot || leg || path || anyBrokerIdentity || anyResultPath || anyRuntimeConfig) throw new Ab04Error("sync-derived accepts no options", "INVALID_ARGUMENTS");
    result = syncDerived();
  } else if (command === "verify-scaffold") {
    if (runRoot || leg || path || anyBrokerIdentity || anyResultPath || anyRuntimeConfig) throw new Ab04Error("verify-scaffold accepts no options", "INVALID_ARGUMENTS");
    result = verifyScaffold();
  } else if (command === "materialize") {
    if (!runRoot || !leg || path || anyBrokerIdentity || anyResultPath) throw new Ab04Error("materialize requires --run-root, --leg, --checkout and --run-root-base", "MISSING_ARGUMENT");
    result = materialize({ runRoot, leg }, externalContext());
  } else if (command === "compare-baselines") {
    if (!runRoot || leg || path || anyBrokerIdentity || anyResultPath) throw new Ab04Error("compare-baselines requires only --run-root", "INVALID_ARGUMENTS");
    result = compareBaselines({ runRoot }, externalContext());
  } else if (command === "read-guidance") {
    if (!path || !pairId || !runId || runRoot || leg || anyResultPath) {
      throw new Ab04Error(
        "read-guidance requires --path, --pair-id, --run-id, --checkout and --run-root-base",
        "INVALID_ARGUMENTS",
      );
    }
    result = readGuidance({ path, pairId, runId }, externalContext());
  } else if (command === "verify-result") {
    if (!resultPath || runRoot || leg || path || anyBrokerIdentity || resultAPath || resultBPath) {
      throw new Ab04Error("verify-result requires only --result", "INVALID_ARGUMENTS");
    }
    result = verifyResult({ resultPath }, externalContext());
  } else if (command === "compare-results") {
    if (!resultAPath || !resultBPath || runRoot || leg || path || anyBrokerIdentity || resultPath) {
      throw new Ab04Error("compare-results requires only --result-a and --result-b", "INVALID_ARGUMENTS");
    }
    result = compareResultPair({ resultAPath, resultBPath }, externalContext());
  } else {
    throw new Ab04Error(
      "usage: threejs-game-skills-ab04.mjs <verify-contract|verify-external|sync-derived|verify-scaffold|materialize|compare-baselines|read-guidance|verify-result|compare-results>",
      "UNKNOWN_COMMAND",
    );
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    const payload = {
      status: "FAIL",
      code: error.code || "UNEXPECTED_ERROR",
      message: error.message,
    };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
  });
}
