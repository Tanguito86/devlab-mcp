import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

import {
  Ab04Error,
  assertAuthorizedRunRoot,
  assertSafeRelativePath,
  benchmarkRoot,
  canonicalTextFromBytes,
  canonicalTextHash,
  collectTreeEntries,
  compareBaselines,
  compareResultPair,
  contractPath,
  materialize,
  readCanonicalText,
  readGuidance,
  readJson,
  verifyContract,
  verifyScaffold,
  verifyMaterializedBaseline,
  verifyResult,
} from "../../../scripts/threejs-game-skills-ab04.mjs";
import { createSyntheticGuidanceFixture } from "./fixtures/ab04-synthetic-guidance-fixture.js";

const committedContract = readJson(contractPath);
let committedVerification;
let guidanceFixture;
const brokerKeyHex = "42".repeat(32);
const scaffoldRoot = join(
  benchmarkRoot,
  ...committedContract.scaffold.relativePath.split("/"),
);
const tempRoots = [];
const runtimeBases = new WeakMap();

before(() => {
  const hermeticVerification = verifyContract();
  guidanceFixture = createSyntheticGuidanceFixture(committedContract, hermeticVerification);
  committedVerification = guidanceFixture.buildVerification();
});

after(() => {
  for (const root of tempRoots.reverse()) {
    rmSync(root, { recursive: true, force: true });
  }
  guidanceFixture?.cleanup();
});

function makeTempRoot(prefix = "devlab-ab04-test-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function testContract(allowedBase) {
  const contract = structuredClone(guidanceFixture.contract);
  contract.materialization.productionRunRootName = "production-run";
  contract.materialization.validationRunRootPrefix = "validation-run-";
  runtimeBases.set(contract, allowedBase);
  return contract;
}

function testContext(contract) {
  const contractText = `${JSON.stringify(contract, null, 2)}\n`;
  const verification = {
    ...committedVerification,
    contractSha256: sha256(Buffer.from(contractText, "utf8")),
  };
  Object.defineProperty(verification, "contract", { value: contract, enumerable: false });
  Object.defineProperty(verification, "snapshots", {
    value: {
      ...committedVerification.snapshots,
      contract: { text: contractText, sha256: verification.contractSha256 },
    },
    enumerable: false,
  });
  return {
    contract,
    scaffoldRoot,
    verification,
    runtimeConfig: {
      checkout: guidanceFixture.checkout,
      runRootBase: runtimeBases.get(contract),
    },
    brokerKeyHex,
    mediaViewports: {
      desktop: { width: 2, height: 2 },
      mobile: { width: 2, height: 2 },
    },
  };
}

function hasCode(code) {
  return (error) => error instanceof Ab04Error && error.code === code;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function rgbaFixture(width, height, state) {
  const color = createHash("sha256").update(state, "utf8").digest();
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = color[0] || 1;
    rgba[offset + 1] = color[1] || 1;
    rgba[offset + 2] = color[2] || 1;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

function pngFixture(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  for (let row = 0; row < height; row += 1) {
    rows.push(Buffer.concat([
      Buffer.from([0]),
      rgba.subarray(row * width * 4, (row + 1) * width * 4),
    ]));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

test("importing the AB-04 module performs no external checkout or runtime configuration access", () => {
  const cwd = makeTempRoot("devlab-ab04-import-");
  const script = resolve(benchmarkRoot, "..", "..", "scripts", "threejs-game-skills-ab04.mjs");
  const output = execFileSync(process.execPath, [
    "--input-type=module",
    "--eval",
    `await import(${JSON.stringify(pathToFileURL(script).href)}); process.stdout.write("IMPORTED\\n");`,
  ], { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  assert.equal(output, "IMPORTED\n");
  assert.deepEqual(readdirSync(cwd), []);
});

function makeResultFixture({ base, contract, leg, repoHead, pairId }) {
  const productionRoot = join(base, contract.materialization.productionRunRootName);
  const isA = leg === "LEG_A";
  const runId = `${pairId}-${leg.toLowerCase()}`;
  const evidenceRoot = join(
    productionRoot,
    isA ? contract.materialization.destinations.a : contract.materialization.destinations.b,
    "evidence",
    runId,
  );
  mkdirSync(evidenceRoot, { recursive: true });
  const artifacts = [];
  let sequence = 0;
  const mediaTypes = {
    contract: "application/json", prompt: "text/markdown", "scoring-rubric": "text/markdown",
    "acceptance-gates": "text/markdown", "leg-policy": "application/json",
    "source-policy": "application/json", "selected-guidance-manifest": "application/json",
    "scaffold-manifest": "application/json", "build-log": "text/plain",
    "typecheck-log": "text/plain", "test-log": "text/plain",
    "frozen-capture-png": "image/png", "frozen-capture-rgba": "application/octet-stream",
    "bot-run": "application/json", "performance-run": "application/json",
    "guidance-broker-log": "application/x-ndjson",
    "final-report": "text/markdown",
  };
  const extensions = {
    contract: "json", prompt: "md", "scoring-rubric": "md",
    "acceptance-gates": "md", "leg-policy": "json", "source-policy": "json",
    "selected-guidance-manifest": "json",
    "scaffold-manifest": "json", "build-log": "log", "typecheck-log": "log",
    "test-log": "log", "frozen-capture-png": "png", "frozen-capture-rgba": "rgba",
    "bot-run": "json", "performance-run": "json", "guidance-broker-log": "jsonl",
    "final-report": "md",
  };
  const artifact = (role, fields = {}, content = null) => {
    sequence += 1;
    const relativePath = `artifacts/${String(sequence).padStart(3, "0")}-${role}.${extensions[role]}`;
    let bytes;
    if (Buffer.isBuffer(content)) bytes = content;
    else if (typeof content === "string") bytes = Buffer.from(content, "utf8");
    else if (role === "frozen-capture-png") {
      const rgba = rgbaFixture(2, 2, fields.state);
      bytes = pngFixture(2, 2, rgba);
    } else if (role === "frozen-capture-rgba") bytes = rgbaFixture(2, 2, fields.state);
    else if (role === "bot-run") bytes = Buffer.from(`${JSON.stringify({
      repetition: fields.repetition,
      status: "PASS",
      softlocks: 0,
      mainPathReachable: true,
      restartSuccess: true,
      completed: true,
      timeToObjectiveMs: 1000,
      damageEvents: 1,
      inputResponseMs: 10,
    })}\n`);
    else if (role === "performance-run") bytes = Buffer.from(`${JSON.stringify({
      scenario: fields.scenario,
      repetition: fields.repetition,
      metrics: {
        frameP50Ms: 8, frameP95Ms: 10, frameP99Ms: 12, drawCalls: 1,
        triangles: 1, textures: 1, heapBytes: 1, isFallbackAdapter: false,
      },
    })}\n`);
    else bytes = Buffer.from(`${leg}:${role}:${sequence}\n`, "utf8");
    const absolutePath = join(evidenceRoot, ...relativePath.split("/"));
    mkdirSync(resolve(absolutePath, ".."), { recursive: true });
    writeFileSync(absolutePath, bytes);
    const entry = {
      path: relativePath, sha256: sha256(bytes), role, mediaType: mediaTypes[role], ...fields,
    };
    artifacts.push(entry);
    return entry;
  };
  artifact("contract", {}, `${JSON.stringify(contract, null, 2)}\n`);
  artifact("prompt", {}, readCanonicalText(join(benchmarkRoot, contract.prompt.generatedFile)));
  artifact("scoring-rubric", {}, committedVerification.snapshots.scoringRubric.text);
  artifact("acceptance-gates", {}, readCanonicalText(join(benchmarkRoot, "acceptance-gates.md")));
  artifact("leg-policy", {}, readCanonicalText(join(benchmarkRoot, leg === "LEG_A" ? "leg-a-policy.json" : "leg-b-policy.json")));
  artifact("scaffold-manifest", {}, `${JSON.stringify({
    contractVersion: contract.contractVersion,
    scaffoldId: contract.scaffold.id,
    scaffoldTreeSha256: contract.scaffold.treeSha256,
  })}\n`);
  artifact("build-log", {}, "build PASS\n");
  artifact("typecheck-log", {}, "typecheck PASS\n");
  artifact("test-log", {}, "tests PASS\n");
  const finalReportArtifact = artifact("final-report", {}, [
    "# Final report",
    "",
    "FINAL_STATUS: PASS",
    `LEG: ${leg}`,
    `PAIR_ID: ${pairId}`,
    `RUN_ID: ${runId}`,
    "FILESYSTEM_CONTAINMENT: PASS",
    "CONTAINMENT_MECHANISM: test-sandbox",
    "CROSS_LEG_READS: 0",
    "TOUCH_CONTROLS: PASS",
    "BLIND_EVALUATION: COMPLETE",
    "CONTROLLED_CHANGE_DETECTED: PASS",
    "RESTORE_HASH_MATCH: PASS",
    "",
  ].join("\n"));
  for (const state of contract.prompt.frozenStates) {
    for (let repetition = 1; repetition <= contract.repetitions.frozenCapturesPerState; repetition += 1) {
      artifact("frozen-capture-png", { state, repetition });
      artifact("frozen-capture-rgba", { state, repetition });
    }
  }
  for (let repetition = 1; repetition <= contract.repetitions.botPlaytestsPerLeg; repetition += 1) {
    artifact("bot-run", { repetition });
  }
  for (const scenario of contract.repetitions.performanceScenarios) {
    for (let repetition = 1; repetition <= contract.repetitions.performancePerScenario; repetition += 1) {
      artifact("performance-run", { scenario, repetition });
    }
  }
  let broker = null;
  if (!isA) {
    artifact("source-policy", {}, committedVerification.snapshots.sourcePolicy.text);
    artifact(
      "selected-guidance-manifest",
      {},
      committedVerification.snapshots.selectedGuidanceManifest.text,
    );
    const manifest = committedVerification.snapshots.selectedGuidanceManifest.value;
    broker = readGuidance(
      { path: manifest.allowedFiles[0].path, pairId, runId },
      { ...testContext(contract), brokerKeyHex },
    );
    const ledgerPath = join(productionRoot, ...broker.brokerLogRelativePath.split("/"));
    artifact("guidance-broker-log", {}, readFileSync(ledgerPath));
  }
  const result = {
    schemaVersion: 2,
    contractVersion: contract.contractVersion,
    contractSha256: sha256(Buffer.from(`${JSON.stringify(contract, null, 2)}\n`, "utf8")),
    benchmark: contract.benchmark,
    leg,
    runId,
    pairId,
    environment: {
      devlabCommit: repoHead,
      model: "test-model",
      modelBuild: "test-build",
      reasoningEffort: "ultra",
      browser: {
        browserType: "chromium",
        browserVersion: contract.runtime.browserVersion,
        executableSha256: contract.runtime.browserExecutableSha256,
        launchMode: "full-chromium-native-webgpu",
        cacheRevision: contract.runtime.browserCacheRevision,
        distributionFileCount: contract.runtime.browserDistributionFileCount,
        distributionByteLength: contract.runtime.browserDistributionByteLength,
        distributionTreeSha256: contract.runtime.browserDistributionTreeSha256,
      },
      adapter: {
        vendor: contract.runtime.adapterVendor,
        architecture: contract.runtime.adapterArchitecture,
        pciDeviceId: contract.runtime.adapterPciDeviceId,
        isFallbackAdapter: contract.runtime.adapterFallbackAllowed,
      },
      backend: "native-webgpu",
      worldSeed: contract.worldSeed,
      fixedTimestepHz: contract.runtime.fixedTimestepHz,
      maximumCatchupSteps: contract.runtime.maximumCatchupSteps,
      frozenCaptureTimeMs: contract.runtime.frozenCaptureTimeMs,
      captureHarnessSha256: contract.runtime.captureHarnessSha256,
      captureHarnessFilesSha256: contract.runtime.captureHarnessFilesSha256,
      captureRuntimePackages: contract.runtime.captureRuntimePackages,
      viewports: contract.viewports,
      scaffoldTreeSha256: contract.scaffold.treeSha256,
    },
    correctness: {
      installFrozen: true, lockfileDiff: 0, build: true, typecheck: true,
      consoleErrors: 0, pageErrors: 0, networkErrors: 0, pause: true,
      restart: true, checkpointRestore: true, victory: true, deviceLossRecovery: true,
      p0OrP1Regressions: 0,
    },
    gameplay: {
      botRuns: 10, botCompletionRate: 1, softlocks: 0,
      timeToObjectiveMs: Array.from({ length: 10 }, () => 1000),
      damageEvents: 10, restartSuccess: true, inputResponseMs: 10, humanScore: 80,
    },
    visual: {
      nonblankShare: 1, entropy: 1, edgeDensity: 0.5, contrast: 1,
      tslVisible: true, humanScore: 80, humanNotes: "fixture",
    },
    performance: {
      repetitionsPerScenario: 3, scenarios: contract.repetitions.performanceScenarios,
      frameP50Ms: 8, frameP95Ms: 10, frameP99Ms: 12,
      drawCalls: 1, triangles: 1, textures: 1, heapBytes: 1,
      boundedResources: true, resize: true, mobileViewport: true,
    },
    process: {
      timeToFirstPlayableMs: 1, totalActiveAgentTimeMs: 1, builderRuns: 1,
      implementationCycles: 1, correctionCycles: 2, totalAgentPasses: 3,
      filesChanged: 1, codeComplexity: 1, testCount: 1, unresolvedRisks: [],
    },
    determinism: {
      capturesPerState: 2, frozenByteEqual: true, frozenPixelEqual: true,
      controlledChangeDetected: true, restoreHashMatch: true,
      liveComparisonMode: "statistical", botComparisonMode: "statistical",
    },
    security: {
      passed: true, globalInstalls: false, externalScripts: false,
      externalScaffold: false, paidApiCalls: false, nonLoopbackRequests: 0,
      productChanges: 0, legAExternalCheckoutAccess: false,
      legBAllowlistViolations: 0,
      filesystemContainment: {
        enforced: true, mechanism: "test-sandbox", crossLegReads: 0,
        evidenceArtifact: finalReportArtifact.path,
      },
    },
    scoring: {
      gameplay: 80, visualQuality: 80, correctnessAndQa: 80,
      performance: 80, mobileAndUi: 80, processEfficiency: 80,
      weightedTotal: 80,
    },
    sourceProvenance: {
      guidanceLoaded: !isA,
      guidanceAccessMode: isA ? "FORBIDDEN" : "HASH_AT_OPEN_BROKER",
      sourceHead: isA ? null : contract.treatment.sourcePin,
      sourcePolicySha256: isA ? null : contract.treatment.sourcePolicySha256,
      selectedGuidanceManifestSha256: isA
        ? null
        : contract.treatment.selectedGuidanceManifestSha256,
      guidanceBrokerLogSha256: isA ? null : broker.guidanceBrokerLogSha256,
      guidanceReadReceipts: isA ? [] : [broker.receipt],
    },
    artifactSummary: {
      frozenStateCount: 9,
      capturesPerState: 2,
      frozenPngArtifacts: 18,
      frozenRgbaArtifacts: 18,
      botRunArtifacts: 10,
      performanceRepetitionsPerScenario: 3,
      performanceScenarioCount: contract.repetitions.performanceScenarios.length,
      allArtifactHashesVerified: true,
    },
    artifacts,
  };
  const resultPath = join(evidenceRoot, "result.json");
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return { resultPath, result, artifacts };
}

test("canonical text hashing makes LF and CRLF byte streams equivalent", () => {
  const lf = Buffer.from("alpha\nbeta\ngamma\n", "utf8");
  const crlf = Buffer.from("alpha\r\nbeta\r\ngamma\r\n", "utf8");
  assert.equal(canonicalTextFromBytes(crlf), "alpha\nbeta\ngamma\n");
  assert.equal(canonicalTextHash(lf), canonicalTextHash(crlf));
});

test("canonical tree hashing makes LF and CRLF text files equivalent", () => {
  const lfRoot = makeTempRoot();
  const crlfRoot = makeTempRoot();
  writeFileSync(join(lfRoot, "sample.txt"), "alpha\nbeta\n");
  writeFileSync(join(crlfRoot, "sample.txt"), "alpha\r\nbeta\r\n");
  assert.deepEqual(collectTreeEntries(lfRoot), collectTreeEntries(crlfRoot));
});

test("canonical text hashing rejects UTF-8 BOM and malformed UTF-8", () => {
  assert.throws(
    () => canonicalTextHash(Buffer.from([0xef, 0xbb, 0xbf, 0x78])),
    hasCode("TEXT_BOM_FORBIDDEN"),
  );
  assert.throws(
    () => canonicalTextHash(Buffer.from([0xc3, 0x28])),
    hasCode("INVALID_UTF8"),
  );
});

test("relative and run-root path traversal fail closed", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  for (const unsafe of [
    "../escape", "nested/../../escape", "nested//file", "nested\\file", "/absolute",
    "C:/absolute",
  ]) {
    assert.throws(() => assertSafeRelativePath(unsafe), hasCode("PATH_TRAVERSAL"), unsafe);
  }
  const escaped = resolve(base, "..", contract.materialization.productionRunRootName);
  assert.throws(
    () => assertAuthorizedRunRoot(escaped, contract, testContext(contract).runtimeConfig),
    hasCode("RUN_ROOT_OUTSIDE_ALLOWLIST"),
  );
});

test("runtime run-root configuration is explicit, existing and disjoint", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const runRoot = join(base, contract.materialization.productionRunRootName);
  assert.equal(
    assertAuthorizedRunRoot(runRoot, contract, testContext(contract).runtimeConfig),
    runRoot,
  );
  const missingBase = join(base, "missing-base");
  assert.throws(
    () => assertAuthorizedRunRoot(runRoot, contract, { runRootBase: missingBase }),
    hasCode("RUN_ROOT_BASE_INVALID"),
  );
  assert.throws(
    () => assertAuthorizedRunRoot(runRoot, contract),
    hasCode("RUN_ROOT_CONFIG_REQUIRED"),
  );
  assert.throws(
    () => assertAuthorizedRunRoot(join(benchmarkRoot, "validation-run-overlap"), contract, {
      runRootBase: benchmarkRoot,
    }),
    hasCode("RUNTIME_PATH_OVERLAP"),
  );
});

test("a Windows drive path is never resolved relative to the package on POSIX", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const candidate = process.platform === "win32"
    ? "relative/windows-like"
    : "H:/host-local/devlab-runs/production-run";
  assert.throws(
    () => assertAuthorizedRunRoot(candidate, contract, testContext(contract).runtimeConfig),
    hasCode("RUN_ROOT_NOT_ABSOLUTE"),
  );
});

test("materializer rejects any leg other than a or b before writing", () => {
  const base = makeTempRoot();
  const runRoot = join(base, "validation-run-invalid-leg");
  assert.throws(() => materialize({ runRoot, leg: "../a" }), hasCode("INVALID_LEG"));
  assert.equal(existsSync(runRoot), false);
});

test("materializer rejects an existing destination even when it is empty", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const runRoot = join(base, "validation-run-existing");
  const destination = join(runRoot, contract.materialization.destinations.a);
  mkdirSync(destination, { recursive: true });
  assert.deepEqual(readdirSync(destination), []);
  assert.throws(
    () => materialize({ runRoot, leg: "a" }, testContext(contract)),
    hasCode("DESTINATION_EXISTS"),
  );
  assert.deepEqual(readdirSync(destination), []);
});

test("scaffold verification rejects an unexpected committed tree hash", () => {
  const contract = structuredClone(committedContract);
  contract.scaffold.treeSha256 = "0".repeat(64);
  assert.throws(() => verifyScaffold(contract), hasCode("SCAFFOLD_HASH_MISMATCH"));
});

test("authorized run root rejects a symlink or junction", () => {
  const base = makeTempRoot();
  const outside = makeTempRoot("devlab-ab04-outside-");
  const contract = testContract(base);
  const linked = join(base, "validation-run-linked");
  symlinkSync(outside, linked, process.platform === "win32" ? "junction" : "dir");
  try {
    assert.throws(
      () => assertAuthorizedRunRoot(linked, contract, testContext(contract).runtimeConfig),
      hasCode("RUN_ROOT_INVALID"),
    );
  } finally {
    if (existsSync(linked)) unlinkSync(linked);
  }
});

test("failed copied-tree hash leaves neither destination nor partial output", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  contract.scaffold.treeSha256 = "f".repeat(64);
  const runRoot = join(base, "validation-run-partial");
  const destination = join(runRoot, contract.materialization.destinations.a);
  assert.throws(
    () => materialize({ runRoot, leg: "a" }, testContext(contract)),
    hasCode("COPIED_BASELINE_HASH_MISMATCH"),
  );
  assert.equal(existsSync(destination), false);
  assert.equal(existsSync(runRoot), true);
  assert.deepEqual(
    readdirSync(runRoot).filter((name) => name.includes(".partial-")),
    [],
  );
});

test("copy verification detects post-copy corruption and removes partial output", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const runRoot = join(base, "validation-run-copy-corruption");
  const destination = join(runRoot, contract.materialization.destinations.a);
  const context = {
    ...testContext(contract),
    afterCopy: (staging) => writeFileSync(join(staging, "README.md"), "corrupted after copy\n"),
  };
  assert.throws(
    () => materialize({ runRoot, leg: "a" }, context),
    hasCode("COPIED_TREE_MISMATCH"),
  );
  assert.equal(existsSync(destination), false);
  assert.deepEqual(
    readdirSync(runRoot).filter((name) => name.includes(".partial-")),
    [],
  );
});

test("A and B materialization produces byte-identical complete baselines", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const context = testContext(contract);
  const runRoot = join(base, "validation-run-pair");
  const a = materialize({ runRoot, leg: "a" }, context);
  const b = materialize({ runRoot, leg: "b" }, context);

  assert.equal(a.scaffoldTreeSha256, committedContract.scaffold.treeSha256);
  assert.equal(b.scaffoldTreeSha256, a.scaffoldTreeSha256);
  assert.equal(a.fileCount, b.fileCount);
  for (const destination of [a.destination, b.destination]) {
    for (const artifact of [
      "baseline-manifest.json", "baseline-tree-sha256.txt", "materialization-report.json",
    ]) assert.equal(existsSync(join(destination, artifact)), true, `${destination}: ${artifact}`);
  }

  const canonicalA = collectTreeEntries(a.destination);
  const canonicalB = collectTreeEntries(b.destination);
  const rawA = collectTreeEntries(a.destination, { raw: true });
  const rawB = collectTreeEntries(b.destination, { raw: true });
  assert.deepEqual(canonicalA, canonicalB);
  assert.deepEqual(rawA, rawB);

  const comparison = compareBaselines({ runRoot }, context);
  assert.equal(comparison.status, "PASS");
  assert.equal(comparison.identical, true);
  assert.equal(comparison.fileCount, canonicalA.length);
  assert.match(comparison.treeSha256, /^[a-f0-9]{64}$/);
  assert.match(comparison.rawTreeSha256, /^[a-f0-9]{64}$/);
});

test("comparison rejects identical tampering in both leg trees", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const context = testContext(contract);
  const runRoot = join(base, "validation-run-symmetric-tamper");
  const a = materialize({ runRoot, leg: "a" }, context);
  const b = materialize({ runRoot, leg: "b" }, context);
  for (const destination of [a.destination, b.destination]) {
    writeFileSync(join(destination, "README.md"), "same corruption\n");
  }
  assert.throws(
    () => compareBaselines({ runRoot }, context),
    hasCode("BASELINE_MANIFEST_MISMATCH"),
  );
});

test("comparison rejects generated or hidden trees instead of silently ignoring them", () => {
  for (const [index, ignoredName] of ["dist", "node_modules", ".git"].entries()) {
    const base = makeTempRoot();
    const contract = testContract(base);
    const context = testContext(contract);
    const runRoot = join(base, `validation-run-ignored-${index}`);
    const a = materialize({ runRoot, leg: "a" }, context);
    materialize({ runRoot, leg: "b" }, context);
    const ignoredRoot = join(a.destination, ignoredName);
    mkdirSync(ignoredRoot);
    writeFileSync(join(ignoredRoot, "only-in-a.js"), "export const hidden = true;\n");
    assert.throws(
      () => compareBaselines({ runRoot }, context),
      hasCode("BASELINE_GENERATED_TREE_PRESENT"),
      ignoredName,
    );
  }
});

test("baseline verification rejects a report relabeled for another contract", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const context = testContext(contract);
  const runRoot = join(base, "validation-run-report-tamper");
  const result = materialize({ runRoot, leg: "a" }, context);
  const reportPath = join(result.destination, "materialization-report.json");
  const report = readJson(reportPath);
  report.contractSha256 = "0".repeat(64);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  assert.throws(
    () => verifyMaterializedBaseline(result.destination, contract, context.verification),
    hasCode("BASELINE_REPORT_MISMATCH"),
  );
});

test("CLI rejects options that are irrelevant to a subcommand", () => {
  const script = resolve(benchmarkRoot, "..", "..", "scripts", "threejs-game-skills-ab04.mjs");
  assert.throws(
    () => execFileSync(process.execPath, [script, "verify-contract", "--leg", "a"], {
      encoding: "utf8",
      stdio: "pipe",
    }),
    (error) => error.status !== 0 && error.stderr.includes("INVALID_ARGUMENTS"),
  );
});

test("smoke CLI rejects relative evidence paths before browser work", () => {
  const script = resolve(benchmarkRoot, "..", "..", "scripts", "threejs-game-skills-ab04-smoke.mjs");
  assert.throws(
    () => execFileSync(process.execPath, [
      script,
      "--fixture-root", "leg-a",
      "--output-root", "smoke-leg-a",
      "--label", "relative-path-test",
    ], { encoding: "utf8", stdio: "pipe" }),
    (error) => error.status !== 0 && error.stderr.includes("FIXTURE_NOT_ABSOLUTE"),
  );
});

test("smoke CLI independently rejects a relative output path", () => {
  const script = resolve(benchmarkRoot, "..", "..", "scripts", "threejs-game-skills-ab04-smoke.mjs");
  assert.throws(
    () => execFileSync(process.execPath, [
      script,
      "--fixture-root", resolve("leg-a"),
      "--output-root", "smoke-leg-a",
      "--label", "relative-output-test",
    ], { encoding: "utf8", stdio: "pipe" }),
    (error) => error.status !== 0 && error.stderr.includes("OUTPUT_NOT_ABSOLUTE"),
  );
});

test("smoke CLI rejects duplicate arguments before browser work", () => {
  const script = resolve(benchmarkRoot, "..", "..", "scripts", "threejs-game-skills-ab04-smoke.mjs");
  assert.throws(
    () => execFileSync(process.execPath, [
      script,
      "--fixture-root", resolve("leg-a"),
      "--fixture-root", resolve("leg-b"),
      "--output-root", resolve("smoke-leg-a"),
      "--label", "duplicate-argument-test",
    ], { encoding: "utf8", stdio: "pipe" }),
    (error) => error.status !== 0 && error.stderr.includes("DUPLICATE_ARGUMENT"),
  );
});

test("result verifier authenticates complete evidence and compares the controlled pair", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const repoHead = "a".repeat(40);
  const pairId = "controlled-pair-1";
  const context = {
    ...testContext(contract),
    repoHead,
  };
  const a = makeResultFixture({ base, contract, leg: "LEG_A", repoHead, pairId });
  const b = makeResultFixture({ base, contract, leg: "LEG_B", repoHead, pairId });
  const verifiedA = verifyResult({ resultPath: a.resultPath }, context);
  const verifiedB = verifyResult({ resultPath: b.resultPath }, context);
  assert.equal(verifiedA.status, "PASS");
  assert.equal(verifiedA.guidanceReadCount, 0);
  assert.equal(verifiedB.guidanceReadCount, 1);
  assert.equal(verifiedA.artifactCount, 71);
  assert.equal(verifiedB.artifactCount, 74);
  const pair = compareResultPair({ resultAPath: a.resultPath, resultBPath: b.resultPath }, context);
  assert.deepEqual(pair, {
    status: "PASS",
    pairId,
    contractSha256: context.verification.contractSha256,
    scaffoldTreeSha256: contract.scaffold.treeSha256,
    sharedEnvironmentEqual: true,
    legAWeightedTotal: 80,
    legBWeightedTotal: 80,
    delta: 0,
    decision: "INCONCLUSIVE / SECOND_PAIR_REQUIRED",
  });
});

test("result verifier rejects stale provenance and tampered artifact bytes", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const repoHead = "b".repeat(40);
  const context = {
    ...testContext(contract),
    repoHead,
  };
  const fixture = makeResultFixture({
    base, contract, leg: "LEG_A", repoHead, pairId: "controlled-pair-2",
  });
  fixture.result.contractSha256 = "0".repeat(64);
  writeFileSync(fixture.resultPath, `${JSON.stringify(fixture.result, null, 2)}\n`);
  assert.throws(
    () => verifyResult({ resultPath: fixture.resultPath }, context),
    hasCode("RESULT_MISMATCH"),
  );
  fixture.result.contractSha256 = context.verification.contractSha256;
  writeFileSync(fixture.resultPath, `${JSON.stringify(fixture.result, null, 2)}\n`);
  const artifactPath = join(resolve(fixture.resultPath, ".."), ...fixture.artifacts[0].path.split("/"));
  writeFileSync(artifactPath, "tampered\n");
  assert.throws(
    () => verifyResult({ resultPath: fixture.resultPath }, context),
    hasCode("RESULT_ARTIFACT_HASH_MISMATCH"),
  );
});

test("result verifier rejects an otherwise schema-valid but disqualified leg", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const repoHead = "c".repeat(40);
  const context = { ...testContext(contract), repoHead };
  const fixture = makeResultFixture({
    base, contract, leg: "LEG_A", repoHead, pairId: "controlled-pair-gate",
  });
  fixture.result.correctness.build = false;
  writeFileSync(fixture.resultPath, `${JSON.stringify(fixture.result, null, 2)}\n`);
  assert.throws(
    () => verifyResult({ resultPath: fixture.resultPath }, context),
    hasCode("RESULT_MISMATCH"),
  );
  fixture.result.correctness.build = true;
  fixture.result.visual.tslVisible = false;
  writeFileSync(fixture.resultPath, `${JSON.stringify(fixture.result, null, 2)}\n`);
  assert.throws(
    () => verifyResult({ resultPath: fixture.resultPath }, context),
    hasCode("RESULT_MISMATCH"),
  );
});

test("result verifier binds containment and run aggregates to dedicated evidence", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const repoHead = "f".repeat(40);
  const context = { ...testContext(contract), repoHead };
  const fixture = makeResultFixture({
    base, contract, leg: "LEG_A", repoHead, pairId: "controlled-pair-attestation",
  });
  fixture.result.security.filesystemContainment.evidenceArtifact = fixture.artifacts
    .find((artifact) => artifact.role === "contract").path;
  writeFileSync(fixture.resultPath, `${JSON.stringify(fixture.result, null, 2)}\n`);
  assert.throws(
    () => verifyResult({ resultPath: fixture.resultPath }, context),
    hasCode("RESULT_MISMATCH"),
  );
  fixture.result.security.filesystemContainment.evidenceArtifact = fixture.artifacts
    .find((artifact) => artifact.role === "final-report").path;
  fixture.result.performance.frameP95Ms = 11;
  writeFileSync(fixture.resultPath, `${JSON.stringify(fixture.result, null, 2)}\n`);
  assert.throws(
    () => verifyResult({ resultPath: fixture.resultPath }, context),
    hasCode("RESULT_MISMATCH"),
  );
});

test("result verifier decodes PNG and rejects self-hashed RGBA substitution", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const repoHead = "1".repeat(40);
  const context = { ...testContext(contract), repoHead };
  const fixture = makeResultFixture({
    base, contract, leg: "LEG_A", repoHead, pairId: "controlled-pair-pixels",
  });
  const targetState = contract.prompt.frozenStates[0];
  const replacement = Buffer.alloc(16, 7);
  for (const artifact of fixture.artifacts.filter((candidate) => (
    candidate.role === "frozen-capture-rgba" && candidate.state === targetState
  ))) {
    const artifactPath = join(resolve(fixture.resultPath, ".."), ...artifact.path.split("/"));
    writeFileSync(artifactPath, replacement);
    artifact.sha256 = sha256(replacement);
  }
  writeFileSync(fixture.resultPath, `${JSON.stringify(fixture.result, null, 2)}\n`);
  assert.throws(
    () => verifyResult({ resultPath: fixture.resultPath }, context),
    hasCode("RESULT_MISMATCH"),
  );
});

test("result verifier rejects a forged LEG_B broker receipt", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const repoHead = "d".repeat(40);
  const context = { ...testContext(contract), repoHead };
  const fixture = makeResultFixture({
    base, contract, leg: "LEG_B", repoHead, pairId: "controlled-pair-broker",
  });
  fixture.result.sourceProvenance.guidanceReadReceipts[0].brokerReceiptHmacSha256 = "0".repeat(64);
  writeFileSync(fixture.resultPath, `${JSON.stringify(fixture.result, null, 2)}\n`);
  assert.throws(
    () => verifyResult({ resultPath: fixture.resultPath }, context),
    hasCode("BROKER_LEDGER_INVALID"),
  );
});

test("pair comparator keeps an exact three-point LEG_A lead inconclusive", () => {
  const base = makeTempRoot();
  const contract = testContract(base);
  const repoHead = "e".repeat(40);
  const pairId = "controlled-pair-boundary";
  const context = { ...testContext(contract), repoHead };
  const a = makeResultFixture({ base, contract, leg: "LEG_A", repoHead, pairId });
  const b = makeResultFixture({ base, contract, leg: "LEG_B", repoHead, pairId });
  for (const field of Object.keys(contract.weights)) b.result.scoring[field] = 77;
  b.result.scoring.weightedTotal = 77;
  writeFileSync(b.resultPath, `${JSON.stringify(b.result, null, 2)}\n`);
  assert.equal(
    compareResultPair({ resultAPath: a.resultPath, resultBPath: b.resultPath }, context).decision,
    "INCONCLUSIVE / SECOND_PAIR_REQUIRED",
  );
  for (const field of Object.keys(contract.weights)) b.result.scoring[field] = 76.9;
  b.result.scoring.weightedTotal = 76.9;
  writeFileSync(b.resultPath, `${JSON.stringify(b.result, null, 2)}\n`);
  assert.equal(
    compareResultPair({ resultAPath: a.resultPath, resultBPath: b.resultPath }, context).decision,
    "LEG_A_WIN",
  );
});
