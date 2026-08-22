import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";

import {
  Ab04Error,
  benchmarkRoot,
  contractPath,
  contractSha256,
  readContractSnapshot,
  readGuidance,
  readCanonicalText,
  readJson,
  renderAcceptanceGates,
  renderLegPolicy,
  renderPrompt,
  repoRoot,
  validateContractShape,
  verifyContract,
  verifySelectedGuidance,
  verifyScaffold,
} from "../../../scripts/threejs-game-skills-ab04.mjs";
import { createSyntheticGuidanceFixture } from "./fixtures/ab04-synthetic-guidance-fixture.js";

const root = benchmarkRoot;
const json = (name) => readJson(join(root, name));
const hasCode = (code) => (error) => error instanceof Ab04Error && error.code === code;

function syntheticFixture(options = {}) {
  const contract = readJson(contractPath);
  const verification = verifyContract();
  return createSyntheticGuidanceFixture(contract, verification, options);
}

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

test("benchmark-contract.json is the canonical AB-04 v2 source", () => {
  const contract = readJson(contractPath);
  assert.equal(contract.schemaVersion, 2);
  assert.equal(contract.contractVersion, "ab04-v2");
  assert.equal(contract.benchmark, "DEVLAB-THREEJS-GAME-SKILLS-AB-04");
  assert.equal(contract.status, "AUTHORIZED_READY_TO_RESUME");
  assert.equal(contract.sourceOfTruth, true);
  assert.deepEqual(contract.hashPolicy, {
    textEncoding: "UTF-8_NO_BOM",
    textEol: "LF_CANONICAL",
    binaryHash: "ORIGINAL_BYTES",
    algorithm: "SHA-256",
  });
  assert.equal(contract.model.reasoningEffort, "ultra");
  assert.equal(contract.worldSeed, 424242);
  assert.deepEqual(contract.viewports, {
    desktop: { width: 1280, height: 720 },
    mobile: { width: 390, height: 844 },
  });
  assert.deepEqual(contract.budgets, {
    activeAgentMinutesPerLeg: 240,
    builderRunsPerLeg: 1,
    implementationCycles: 1,
    correctionCycles: 2,
    maximumTotalAgentPasses: 3,
  });
  assert.deepEqual(contract.repetitions, {
    frozenCapturesPerState: 2,
    botPlaytestsPerLeg: 10,
    performancePerScenario: 3,
    performanceScenarios: ["idle", "encounter-normal", "stress", "boss", "mobile"],
  });
  assert.equal(contract.runtime.fixedTimestepHz, 60);
  assert.ok(Number.isInteger(contract.runtime.maximumCatchupSteps));
  assert.ok(contract.runtime.maximumCatchupSteps > 0);
  assert.equal(contract.runtime.renderInterpolation, true);
  assert.equal(contract.runtime.frozenCapturePausesSimulation, true);
  assert.equal(contract.runtime.browserCacheRevision, "chromium-1223");
  assert.equal(contract.runtime.browserDistributionFileCount, 308);
  assert.equal(contract.runtime.browserDistributionByteLength, 432272872);
  assert.match(contract.runtime.browserDistributionTreeSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(contract.runtime.captureHarnessFilesSha256).sort(), [
    "browser-runtime.js", "capture.js", "contract.js", "server.js",
  ]);
  for (const [field, value] of Object.entries(contract.runtime.captureHarnessFilesSha256)) {
    assert.match(value, /^[a-f0-9]{64}$/, field);
  }
  assert.deepEqual(Object.keys(contract.runtime.captureRuntimePackages).sort(), [
    "playwright", "playwright-core",
  ]);
  for (const [name, identity] of Object.entries(contract.runtime.captureRuntimePackages)) {
    assert.equal(identity.version, "1.60.0", name);
    assert.match(identity.packageJsonSha256, /^[a-f0-9]{64}$/, `${name}.packageJsonSha256`);
    assert.ok(Number.isInteger(identity.fileCount) && identity.fileCount > 0, `${name}.fileCount`);
    assert.match(identity.treeSha256, /^[a-f0-9]{64}$/, `${name}.treeSha256`);
  }
  for (const [field, value] of Object.entries(contract.runtime.validationToolchain)) {
    if (field.endsWith("Sha256")) assert.match(value, /^[a-f0-9]{64}$/, field);
  }
  assert.equal(contract.scaffold.id, "devlab-internal-threejs-game-benchmark-v1");
  assert.deepEqual(contract.scaffold.exactDependencies, {
    vite: "8.2.0",
    three: "0.185.1",
    typescript: "6.0.3",
    tsx: "4.22.3",
    "@types/node": "24.12.4",
  });
  assert.equal(contract.treatment.externalScaffold, false);
  assert.equal(contract.treatment.externalScripts, false);
  assert.equal(contract.treatment.globalInstall, false);
  assert.equal(contract.treatment.paidApiCalls, false);
  assert.equal(contract.materialization.runRootId, "devlab-runs");
  assert.equal(Object.hasOwn(contract.materialization, "allowedRunRootBase"), false);
  assert.deepEqual(contract.resultValidation, {
    schemaFile: "result-schema.json",
    schemaSha256: "4b0f6ce7fc706765ea103b45d06c30d3b1ed68a3254c2a69bb27836a36d1ca39",
    scoringRubricFile: "scoring-rubric.md",
    scoringRubricSha256: "4e5576615370283d28be87ec1e0d705a3ff1c7bc4bf0efc070dbe77cb49c8a87",
  });
  assert.equal(contract.treatment.sourceId, "threejs-game-skills");
  assert.equal(Object.hasOwn(contract.treatment, "sourceCheckout"), false);
  assert.equal(contract.treatment.sourcePin, "7221c1f4a6d2ae189a4d85d058d24f3228499d46");
  assert.equal(
    contract.treatment.sourcePolicySha256,
    "500cde0e44a40d5a11f920ca08a6b1ca4b22f2e7c6479d961fc794c0540248f7",
  );
  assert.equal(
    contract.treatment.selectedGuidanceManifestSha256,
    "443f510cd4021cc43f0a0d0a53a6f40faad34f45767d6137c6d1ef23c93037ee",
  );
});

test("contract validator fixes security-critical AB-04 v2 invariants", () => {
  const mutations = [
    ["binary hash", (contract) => { contract.hashPolicy.binaryHash = "TEXT_NORMALIZED"; }],
    ["run root id", (contract) => { contract.materialization.runRootId = "host-local-path"; }],
    ["leg destination", (contract) => { contract.materialization.destinations.b = "leg-a"; }],
    ["network", (contract) => { contract.runtime.network = "unrestricted"; }],
    ["performance scenarios", (contract) => { contract.repetitions.performanceScenarios = ["idle"]; }],
    ["toolchain anchor", (contract) => { contract.runtime.validationToolchain.pnpmBundleSha256 = "0".repeat(64); }],
    ["capture harness dependency", (contract) => { contract.runtime.captureHarnessFilesSha256["server.js"] = "0".repeat(64); }],
    ["capture runtime package", (contract) => { contract.runtime.captureRuntimePackages.playwright.treeSha256 = "0".repeat(64); }],
    ["browser distribution", (contract) => { contract.runtime.browserDistributionTreeSha256 = "0".repeat(64); }],
    ["renderer backend", (contract) => { contract.scaffold.backend = "webgl"; }],
    ["scaffold tree", (contract) => { contract.scaffold.treeSha256 = "0".repeat(64); }],
    ["prompt output path", (contract) => { contract.prompt.generatedFile = "../../escape.md"; }],
    ["prompt brief", (contract) => { contract.prompt.coreLoop = "different game"; }],
    ["external scaffold", (contract) => { contract.treatment.externalScaffold = true; }],
    ["source pin", (contract) => { contract.treatment.sourcePin = "0".repeat(40); }],
    ["guidance manifest hash", (contract) => {
      contract.treatment.selectedGuidanceManifestSha256 = "0".repeat(64);
    }],
    ["decision regression", (contract) => { contract.decision.p0OrP1RegressionAllowed = true; }],
    ["decision threshold", (contract) => { contract.decision.legBMinimumPercentagePointGain = 7; }],
    ["decision lower boundary", (contract) => { contract.decision.inconclusiveLowerBoundInclusive = -4; }],
    ["score weight", (contract) => { contract.weights.gameplay = 29; }],
    ["result schema hash", (contract) => { contract.resultValidation.schemaSha256 = "0".repeat(64); }],
  ];
  for (const [label, mutate] of mutations) {
    const contract = structuredClone(readJson(contractPath));
    mutate(contract);
    assert.throws(
      () => validateContractShape(contract),
      (error) => error.code === "CONTRACT_MISMATCH",
      label,
    );
  }
});

test("prompt and acceptance gates are exact contract-derived artifacts", () => {
  const contract = readJson(contractPath);
  const promptPath = join(root, contract.prompt.generatedFile);
  const gatesPath = join(root, "acceptance-gates.md");
  assert.equal(readCanonicalText(promptPath), renderPrompt(contract));
  assert.equal(readCanonicalText(gatesPath), renderAcceptanceGates(contract));
  assert.match(readCanonicalText(promptPath), /world seed: 424242/);
  assert.match(readCanonicalText(promptPath), /desktop viewport: 1280(?:x|\u00d7)720/u);
  assert.match(readCanonicalText(gatesPath), /`240` active minutes total per leg/);
});

test("leg policies are minimal and reference the same canonical contract SHA", () => {
  const contract = readJson(contractPath);
  const a = json("leg-a-policy.json");
  const b = json("leg-b-policy.json");
  assert.deepEqual(a, renderLegPolicy(contract, "a"));
  assert.deepEqual(b, renderLegPolicy(contract, "b"));
  const allowedKeys = [
    "schemaVersion", "contractVersion", "contractSha256", "leg", "treatment",
    "externalGuidanceLoaded", "selectedGuidanceManifest",
    "selectedGuidanceManifestSha256", "sourcePolicySha256", "sourceHead",
    "guidanceAccessMode",
  ].sort();
  assert.deepEqual(Object.keys(a).sort(), allowedKeys);
  assert.deepEqual(Object.keys(b).sort(), allowedKeys);
  assert.equal(a.contractSha256, contractSha256());
  assert.equal(b.contractSha256, a.contractSha256);
  assert.equal(a.externalGuidanceLoaded, false);
  assert.equal(a.selectedGuidanceManifest, null);
  assert.equal(a.selectedGuidanceManifestSha256, null);
  assert.equal(a.sourcePolicySha256, null);
  assert.equal(a.sourceHead, null);
  assert.equal(a.guidanceAccessMode, "FORBIDDEN");
  assert.equal(b.externalGuidanceLoaded, true);
  assert.equal(b.selectedGuidanceManifest, contract.treatment.selectedGuidanceManifest);
  assert.equal(b.selectedGuidanceManifestSha256, contract.treatment.selectedGuidanceManifestSha256);
  assert.equal(b.sourcePolicySha256, contract.treatment.sourcePolicySha256);
  assert.equal(b.sourceHead, contract.treatment.sourcePin);
  assert.equal(b.guidanceAccessMode, "HASH_AT_OPEN_BROKER");
});

test("runbook authorizes only contract-driven AB-04 v2 execution", () => {
  const runbook = readCanonicalText(join(root, "runbook.md"));
  assert.match(runbook, /EXECUTION_AUTHORIZED: YES/);
  assert.match(runbook, /CONTRACT_VERSION: ab04-v2/);
  assert.match(runbook, /benchmark:ab04:verify/);
  assert.match(runbook, /benchmark:ab04:materialize/);
  assert.match(runbook, /benchmark:ab04:compare-baselines/);
  assert.match(runbook, /read `benchmark-contract\.json`/);
  assert.match(runbook, /FILESYSTEM_CONTAINMENT_REQUIRED: YES/);
  assert.match(runbook, /SIBLING_DIRECTORIES_ARE_NOT_A_SANDBOX: YES/);
  assert.match(runbook, /benchmark:ab04:read-guidance/);
});

test("scaffold smoke runner disables Corepack network and authenticates executable package trees", () => {
  const smoke = readCanonicalText(join(root, "..", "..", "scripts", "threejs-game-skills-ab04-smoke.mjs"));
  assert.match(smoke, /COREPACK_ENABLE_NETWORK = "0"/);
  assert.match(smoke, /PNPM_CONFIG_OFFLINE = "true"/);
  assert.match(smoke, /authenticatePnpmDistribution/);
  assert.match(smoke, /authenticateViteDistribution/);
  assert.match(smoke, /authenticateCaptureRuntimePackages/);
  assert.match(smoke, /authenticateBrowserDistribution/);
  assert.match(smoke, /allContractAnchorsMatched: true/);
  assert.match(smoke, /captureHarnessFiles/);
  assert.match(smoke, /await import\(pathToFileURL\(captureHarnessPath\)\.href\)/);
  assert.doesNotMatch(smoke, /import \{ runCapture \} from/);
  assert.match(smoke, /browser identity does not match the contract/);
});

test("broker secrets stay out of Git subprocesses and pair comparison reuses one snapshot", () => {
  const materializer = readCanonicalText(join(root, "..", "..", "scripts", "threejs-game-skills-ab04.mjs"));
  assert.match(materializer, /key\.toUpperCase\(\) === BROKER_KEY_ENV\) delete environment\[key\]/);
  assert.match(materializer, /GIT_CONFIG_KEY_0 = "core\.fsmonitor"/);
  assert.match(materializer, /GIT_CONFIG_VALUE_0 = "false"/);
  const comparator = materializer.slice(
    materializer.indexOf("export function compareResultPair"),
    materializer.indexOf("function parseCli"),
  );
  assert.equal((comparator.match(/verifyContract\(/g) ?? []).length, 1);
  assert.match(comparator, /sharedContext = \{ .*verification, contract \}/);
  assert.match(comparator, /result pair must use distinct runIds/);
});

test("internal scaffold ID resolves to a verified material path", () => {
  const contract = readJson(contractPath);
  const scaffold = verifyScaffold(contract);
  assert.equal(scaffold.treeSha256, contract.scaffold.treeSha256);
  assert.match(scaffold.root.replace(/\\/g, "/"), new RegExp(`${contract.scaffold.relativePath}$`));
  for (const name of ["package.json", "pnpm-lock.yaml", "index.html", "public/capture-manifest.json"]) {
    assert.equal(existsSync(join(scaffold.root, ...name.split("/"))), true, name);
  }
  const captureManifest = readJson(join(scaffold.root, "public", "capture-manifest.json"));
  assert.equal(captureManifest.version, 1);
  assert.equal(captureManifest.requiresNativeWebGPU, true);
  assert.ok(captureManifest.viewpoints.length > 0);
  const captureSource = readCanonicalText(join(scaffold.root, "src", "capture-contract.ts"));
  assert.match(captureSource, /__DEVLAB_CAPTURE__/);
  assert.match(captureSource, /__DEVLAB_FRAME__/);
});

test("legacy operational values are absent from the complete executable package", () => {
  const operational = [
    "benchmark-contract.json", "benchmark-prompt.md", "leg-a-policy.json",
    "leg-b-policy.json", "acceptance-gates.md", "runbook.md", "README.md",
    "result-schema.json",
  ];
  const patterns = [
    /\b1729\b/u,
    /960\s*(?:x|\u00d7)\s*540/iu,
    /"high"/iu,
    /120\s+(?:minutes|minutos)/iu,
    /two\s+runs\s+per\s+leg/iu,
  ];
  for (const name of operational) {
    const source = readCanonicalText(join(root, name));
    for (const pattern of patterns) assert.doesNotMatch(source, pattern, `${name}: ${pattern}`);
  }
});

test("result schema v2 requires every scoring, evidence and safety domain", () => {
  const schema = json("result-schema.json");
  assert.equal(schema.properties.schemaVersion.const, 2);
  assert.equal(schema.properties.contractVersion.const, "ab04-v2");
  assert.equal(schema.properties.benchmark.const, "DEVLAB-THREEJS-GAME-SKILLS-AB-04");
  assert.match(schema.properties.contractSha256.pattern, /64/);
  for (const field of [
    "contractSha256", "pairId", "correctness", "gameplay", "visual", "performance",
    "process", "determinism", "security", "scoring", "sourceProvenance", "artifactSummary",
    "artifacts",
  ]) assert.ok(schema.required.includes(field), field);
  for (const field of [
    "modelBuild", "reasoningEffort", "scaffoldTreeSha256", "captureHarnessFilesSha256",
    "captureRuntimePackages",
  ]) {
    assert.ok(schema.properties.environment.required.includes(field), field);
  }
  assert.ok(schema.properties.correctness.required.includes("deviceLossRecovery"));
  assert.ok(schema.properties.gameplay.required.includes("botRuns"));
  assert.ok(schema.properties.performance.required.includes("repetitionsPerScenario"));
  assert.ok(schema.properties.process.required.includes("totalAgentPasses"));
  assert.ok(schema.properties.determinism.required.includes("capturesPerState"));
  assert.ok(schema.properties.security.required.includes("externalScaffold"));
  for (const domain of [
    "environment", "correctness", "gameplay", "visual", "performance",
    "process", "determinism", "security", "scoring", "sourceProvenance", "artifactSummary",
  ]) {
    const definition = schema.properties[domain];
    for (const field of definition.required) {
      const fieldSchema = definition.properties[field];
      assert.ok(fieldSchema, `${domain}.${field} has a schema`);
      assert.ok(
        Object.hasOwn(fieldSchema, "type")
          || Object.hasOwn(fieldSchema, "const")
          || Object.hasOwn(fieldSchema, "enum")
          || Object.hasOwn(fieldSchema, "oneOf"),
        `${domain}.${field} is machine-typed`,
      );
    }
  }
  assert.equal(schema.properties.security.properties.passed.type, "boolean");
  assert.equal(schema.properties.security.properties.nonLoopbackRequests.minimum, 0);
  assert.equal(
    schema.properties.security.properties.filesystemContainment.properties.crossLegReads.const,
    0,
  );
  assert.equal(
    schema.properties.security.allOf[0].then.properties.filesystemContainment
      .properties.enforced.const,
    true,
  );
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.artifacts.items.additionalProperties, false);
  assert.equal(schema.properties.artifacts.minItems, 1);
  assert.ok(schema.properties.artifacts.items.required.includes("role"));
  assert.ok(schema.properties.artifacts.items.required.includes("mediaType"));
  assert.ok(schema.properties.sourceProvenance.required.includes("guidanceBrokerLogSha256"));
  assert.deepEqual(
    schema.properties.performance.properties.scenarios.items.enum,
    ["idle", "encounter-normal", "stress", "boss", "mobile"],
  );
});

test("contract snapshot is canonical, immutable and hash-consistent", () => {
  const snapshot = readContractSnapshot();
  assert.equal(snapshot.contractSha256, contractSha256());
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.contract), true);
  assert.equal(Object.isFrozen(snapshot.contract.prompt), true);
  assert.throws(() => { snapshot.contract.worldSeed = 1; }, TypeError);
});

test("guidance broker returns allowlisted text and appends a pair-bound HMAC receipt", () => {
  const base = mkdtempSync(join(tmpdir(), "devlab-ab04-broker-"));
  let fixture;
  try {
    const baseContract = structuredClone(readJson(contractPath));
    const hermeticVerification = verifyContract();
    fixture = createSyntheticGuidanceFixture(baseContract, hermeticVerification);
    const contract = fixture.contract;
    contract.materialization.productionRunRootName = "production-run";
    mkdirSync(join(base, "production-run"));
    const verification = fixture.buildVerification();
    const manifest = verification.snapshots.selectedGuidanceManifest.value;
    const entry = manifest.allowedFiles[0];
    const context = {
      contract,
      verification,
      brokerKeyHex: "24".repeat(32),
      runtimeConfig: { checkout: fixture.checkout, runRootBase: base },
    };
    const receipt = readGuidance(
      { path: entry.path, pairId: "pair-policy-test", runId: "run-leg-b" },
      context,
    );
    assert.equal(receipt.status, "PASS");
    assert.equal(receipt.accessMode, "HASH_AT_OPEN_BROKER");
    assert.equal(receipt.path, entry.path);
    assert.equal(receipt.sha256, entry.sha256);
    assert.match(receipt.guidanceBrokerLogSha256, /^[a-f0-9]{64}$/);
    assert.match(receipt.receipt.brokerReceiptHmacSha256, /^[a-f0-9]{64}$/);
    assert.equal(typeof receipt.content, "string");
    assert.ok(receipt.content.length > 0);
    assert.throws(
      () => readGuidance(
        { path: "README.md", pairId: "pair-policy-test", runId: "run-leg-b" },
        context,
      ),
      (error) => error.code === "GUIDANCE_PATH_NOT_ALLOWED",
    );
  } finally {
    fixture?.cleanup();
    rmSync(base, { recursive: true, force: true });
  }
});

test("machine-verifiable hermetic AB-04 preflight passes end to end", () => {
  const result = verifyContract();
  assert.equal(result.status, "PASS");
  assert.equal(result.contractVersion, "ab04-v2");
  assert.equal(result.contractSha256, contractSha256());
  assert.equal(result.scaffoldId, "devlab-internal-threejs-game-benchmark-v1");
  assert.match(result.scaffoldTreeSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    result.selectedGuidanceManifestSha256,
    "443f510cd4021cc43f0a0d0a53a6f40faad34f45767d6137c6d1ef23c93037ee",
  );
  assert.equal(result.sourceHead, "7221c1f4a6d2ae189a4d85d058d24f3228499d46");
  assert.equal(result.allowlistCount, 25);
});

test("synthetic detached clean checkout with exact origin, pin and 25 hashes passes", () => {
  const fixture = syntheticFixture();
  try {
    const verification = fixture.buildVerification();
    assert.equal(verification.status, "PASS");
    assert.equal(verification.sourceHead, fixture.contract.treatment.sourcePin);
    assert.equal(verification.allowlistCount, 25);
  } finally {
    fixture.cleanup();
  }
});

test("external guidance checkout must exist and must not be a link", () => {
  const fixture = syntheticFixture();
  const linked = join(fixture.root, "linked-checkout");
  try {
    assert.throws(
      () => verifySelectedGuidance(fixture.contract, fixture.snapshots, {
        checkout: join(fixture.root, "missing-checkout"),
      }),
      hasCode("GUIDANCE_CHECKOUT_INVALID"),
    );
    symlinkSync(fixture.checkout, linked, process.platform === "win32" ? "junction" : "dir");
    assert.throws(
      () => verifySelectedGuidance(fixture.contract, fixture.snapshots, { checkout: linked }),
      hasCode("GUIDANCE_CHECKOUT_INVALID"),
    );
    assert.throws(
      () => verifySelectedGuidance(fixture.contract, fixture.snapshots, { checkout: repoRoot }),
      hasCode("RUNTIME_PATH_OVERLAP"),
    );
  } finally {
    if (existsSync(linked)) unlinkSync(linked);
    fixture.cleanup();
  }
});

test("external guidance checkout rejects attached HEAD", () => {
  const fixture = syntheticFixture({ attached: true });
  try {
    assert.throws(() => fixture.buildVerification(), hasCode("GUIDANCE_CHECKOUT_DRIFT"));
  } finally {
    fixture.cleanup();
  }
});

test("external guidance checkout rejects a dirty worktree", () => {
  const fixture = syntheticFixture();
  try {
    const path = fixture.manifest.allowedFiles[0].path;
    writeFileSync(join(fixture.checkout, ...path.split("/")), "dirty synthetic fixture\n");
    assert.throws(() => fixture.buildVerification(), hasCode("GUIDANCE_CHECKOUT_DRIFT"));
  } finally {
    fixture.cleanup();
  }
});

test("external guidance checkout rejects an incorrect origin", () => {
  const fixture = syntheticFixture();
  try {
    fixture.git(["remote", "set-url", "origin", "https://example.invalid/wrong-origin.git"]);
    assert.throws(() => fixture.buildVerification(), hasCode("GUIDANCE_CHECKOUT_DRIFT"));
  } finally {
    fixture.cleanup();
  }
});

test("external guidance checkout rejects an incorrect pin", () => {
  const fixture = syntheticFixture();
  try {
    fixture.setPin("0".repeat(40));
    assert.throws(() => fixture.buildVerification(), hasCode("GUIDANCE_CHECKOUT_DRIFT"));
  } finally {
    fixture.cleanup();
  }
});

test("external guidance checkout rejects a clean committed hash mismatch", () => {
  const fixture = syntheticFixture();
  try {
    const path = fixture.manifest.allowedFiles[0].path;
    writeFileSync(join(fixture.checkout, ...path.split("/")), "committed but hash-mismatched synthetic fixture\n");
    fixture.git(["add", "--all"]);
    fixture.git([
      "-c", "user.name=DevLab AB04 Fixture",
      "-c", "user.email=ab04-fixture@example.invalid",
      "commit", "--no-gpg-sign", "-m", "synthetic hash mismatch",
    ]);
    const head = fixture.git(["rev-parse", "HEAD"]);
    fixture.git(["checkout", "--detach", head]);
    fixture.setPin(head);
    assert.throws(() => fixture.buildVerification(), hasCode("GUIDANCE_FILE_HASH_MISMATCH"));
  } finally {
    fixture.cleanup();
  }
});

test("hermetic verification needs neither external config nor host-local paths", () => {
  const cwd = mkdtempSync(join(tmpdir(), "devlab-ab04-hermetic-cli-"));
  try {
    const script = join(repoRoot, "scripts", "threejs-game-skills-ab04.mjs");
    const run = spawnSync(process.execPath, [script, "verify-contract"], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).status, "PASS");
    assert.deepEqual(existsSync(join(cwd, ".external-sources.local.json")), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("external verification command fails explicitly without physical configuration", () => {
  const script = join(repoRoot, "scripts", "threejs-game-skills-ab04.mjs");
  const run = spawnSync(process.execPath, [script, "verify-external"], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(run.status, 1);
  const failure = JSON.parse(run.stderr);
  assert.equal(failure.status, "FAIL");
  assert.equal(failure.code, "EXTERNAL_CONFIG_REQUIRED");
});

test("published browser package excludes AB-04 tests, fixture and external corpus", () => {
  const packageJson = readJson(join(repoRoot, "packages", "browser-dev-mcp", "package.json"));
  assert.equal(packageJson.files.includes("tests"), false);
  assert.equal(packageJson.files.some((entry) => entry.startsWith("tests/")), false);
  assert.equal(packageJson.files.some((entry) => entry.includes("threejs-game-skills")), false);
  assert.equal(packageJson.files.some((entry) => isAbsolute(entry)), false);
});
