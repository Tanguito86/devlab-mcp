#!/usr/bin/env node
/**
 * DEVLAB-ASSET-BRIDGE-01 — composed bridge pilot (real Igor/runtime).
 *
 * Composes ONLY the public surface: GovernedAssetGmBridge (status,
 * inspectAsset, inspectTarget, planImport, applyImport, verifyImport,
 * rollbackImport) over the public Asset Forge catalog produced by
 * scripts/asset-bridge-forge-pilot.mjs, plus the raw GM_VERIFY_V1 public
 * adapter operation for the two states that have no binding chain (pristine
 * initial and post-full-rollback). No raw filesystem/GameMaker/Asset Forge
 * tool is used; no text validation substitutes for Igor/runtime — every
 * positive and negative compile runs the real Igor.exe with the explicit
 * toolchain, and every runtime level runs a real owned Runner and captures
 * the GML screen_save marker.
 *
 * Required flags (all explicit, no implicit defaults):
 *   --work-root       external work root (projects + evidence + runtime shots)
 *   --assets-root     forge work root (assets/catalog/asset-catalog.json)
 *   --igor            absolute Igor.exe
 *   --runtime-root    absolute runtime directory
 *   --project-tool    absolute ProjectTool.exe
 *   --user-dir        absolute user directory
 *
 * Evidence produced under --work-root:
 *   pilot-a/                  v1/v2 import target project
 *   negative-a/               intentional negative-compile project
 *   .evidence/                adapter + bridge transaction evidence
 *   runtime-evidence/         real Runner screenshots (screen_save markers)
 *   pilot-summary.json        machine-readable summary
 */
import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GovernedGameMakerIdeAdapter } from "../packages/gm-ide-adapter/dist/index.js";
import { windowsProcessInventory } from "../packages/gm-ide-adapter/dist/internal.js";
import { GovernedAssetGmBridge, parseGmJson } from "../packages/asset-gm-bridge/dist/index.js";
import { AssetGmBridgeError } from "../packages/asset-gm-bridge/dist/errors.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flag = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const required = (name) => { const result = flag(name); if (!result) throw new Error(`${name} is required`); return resolve(result); };
const workRoot = required("--work-root");
const assetsRoot = required("--assets-root");
const igor = { executable: required("--igor"), runtimePath: required("--runtime-root"), projectTool: required("--project-tool"), userDirectory: required("--user-dir") };
const runtimeVersion = basename(igor.runtimePath).replace(/^runtime-/, "");
const igorDirectories = new Set(["runtimePath", "userDirectory"]);
for (const [name, path] of Object.entries(igor)) { const info = await stat(path).catch(() => null); if (!info || (igorDirectories.has(name) ? !info.isDirectory() : !info.isFile())) throw new Error(`missing toolchain ${name}: ${path}`); }
const catalogPath = join(assetsRoot, "assets/catalog/asset-catalog.json");
if (!(await stat(catalogPath).catch(() => null))) throw new Error(`catalog not found: ${catalogPath}`);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const projectsDir = join(workRoot, "projects");
const evidenceRoot = ".evidence";
const runtimeEvidenceDir = join(workRoot, "runtime-evidence");
const fixture = join(repoRoot, "fixtures/gamemaker/asset-bridge-pilot");
const verificationPolicy = Object.freeze({ projectLoad: true, compile: true, runtime: "optional" });
const toolchain = Object.freeze({ executable: igor.executable, runtimePath: igor.runtimePath, projectTool: igor.projectTool, userDirectory: igor.userDirectory });

/** Recursive canonical tree hash of a project directory (path -> sha256). */
async function treeHash(root) {
  const out = {};
  const walk = async (dir, prefix) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(full, rel);
      else out[rel] = sha256(await readFile(full));
    }
  };
  await walk(root, "");
  return out;
}

async function inventory() { return windowsProcessInventory(); }
const isGmProcess = ({ name }) => /^(?:Igor|Runner|GameMaker)(?:\.exe)?$/i.test(name);

/** Fresh copy of the synthetic fixture under a project root. */
async function prepareProject(name) {
  const target = join(projectsDir, name);
  await mkdir(projectsDir, { recursive: true });
  await cp(fixture, target, { recursive: true, force: true, errorOnExist: false });
  return target;
}

const caseResult = (name, value) => Object.freeze({ case: name, ...value });

async function main() {
  await mkdir(projectsDir, { recursive: true });
  await mkdir(runtimeEvidenceDir, { recursive: true });
  // Runtime marker target: the Runner's screen_save lands here.
  process.env.DEVLAB_ASSET_BRIDGE_EVIDENCE_DIR = runtimeEvidenceDir;

  const initialInventory = await inventory();
  const initialForeign = initialInventory.filter(isGmProcess);
  if (initialForeign.length) throw new Error(`foreign GameMaker process exists before pilot: ${initialForeign.map(({ pid }) => pid).join(",")}`);

  const bridge = new GovernedAssetGmBridge(projectsDir, { catalogPath, repoRoot: assetsRoot });
  const adapter = new GovernedGameMakerIdeAdapter(projectsDir);
  const cases = [];

  // ── initial: pristine fixture compiles and runs with real Igor ────────────
  await prepareProject("pilot-a");
  const snapshot0 = await bridge.inspectTarget({ capability: "ASSET_GM_BRIDGE_V1", projectRoot: "pilot-a", evidenceRoot, transactionId: "bridge-initial", assetId: "bridge-test-beacon", assetVersion: "1.0.0", resourceName: "spr_bridge_test_beacon", expectedProjectFingerprint: null, expectedHead: null, timeoutMs: 180_000, verificationPolicy });
  const baselineFingerprint = snapshot0.fingerprint;
  const statusInitial = await bridge.status({ capability: "ASSET_GM_BRIDGE_V1", projectRoot: "pilot-a", evidenceRoot, transactionId: "bridge-initial", assetId: "bridge-test-beacon", assetVersion: "1.0.0", resourceName: "spr_bridge_test_beacon", expectedProjectFingerprint: null, expectedHead: null, timeoutMs: 180_000, verificationPolicy });
  const initialVerify = await adapter.verify({
    capability: "GM_VERIFY_V1", projectRoot: "pilot-a", expectedProjectFingerprint: snapshot0.fingerprint, expectedHead: null, allowlist: [], transactionId: "bridge-initial", timeoutMs: 180_000, verificationPolicy, evidenceRoot,
    levels: ["TEXT_VALID", "PROJECT_LOAD_VALID", "COMPILE_VALID", "RUNTIME_VALID"], igor: toolchain, expectedRuntimeSignal: "GM_ASSET_BRIDGE_BEACON_VERSION=0",
  });
  if (!initialVerify.levels.COMPILE_VALID?.passed || !initialVerify.levels.RUNTIME_VALID?.passed) throw new Error("initial compile/runtime gate failed");
  const shotBefore = join(runtimeEvidenceDir, "runtime-before.png");
  if (!(await stat(shotBefore).catch(() => null))) throw new Error("initial runtime screenshot missing: runtime-before.png");
  await copyFile(shotBefore, join(runtimeEvidenceDir, "before.png"));
  cases.push(caseResult("initial", { fingerprint: baselineFingerprint, status: statusInitial.state, verify: initialVerify.levels, ownedPids: initialVerify.ownedPids, screenshot: "before.png" }));

  // ── v1: plan -> apply -> verify (real compile + runtime, marker version=1) ─
  const requestBase = { capability: "ASSET_GM_BRIDGE_V1", projectRoot: "pilot-a", evidenceRoot, assetId: "bridge-test-beacon", resourceName: "spr_bridge_test_beacon", expectedHead: null, timeoutMs: 180_000, verificationPolicy };
  const planV1 = await bridge.planImport({ ...requestBase, transactionId: "bridge-v1", assetVersion: "1.0.0", expectedProjectFingerprint: snapshot0.fingerprint });
  const applyV1 = await bridge.applyImport({ ...requestBase, transactionId: "bridge-v1", assetVersion: "1.0.0", plan: planV1.plan, planHash: planV1.planHash, bindingHash: planV1.bindingHash, confirm: true, dryRun: false, expectedProjectFingerprint: planV1.plan.projectFingerprint });
  if (applyV1.state !== "APPLIED") throw new Error(`v1 apply expected APPLIED, got ${applyV1.state}`);
  const verifyV1 = await bridge.verifyImport({ ...requestBase, transactionId: "bridge-v1", assetVersion: "1.0.0", plan: planV1.plan, planHash: planV1.planHash, bindingHash: planV1.bindingHash, expectedProjectFingerprint: applyV1.projectFingerprint, levels: ["TEXT_VALID", "PROJECT_LOAD_VALID", "COMPILE_VALID", "RUNTIME_VALID"], igor: toolchain });
  if (!verifyV1.levels.COMPILE_VALID?.passed || !verifyV1.levels.RUNTIME_VALID?.passed) throw new Error("v1 compile/runtime gate failed");
  const shotV1 = join(runtimeEvidenceDir, "runtime-v1.png");
  if (!(await stat(shotV1).catch(() => null))) throw new Error("v1 runtime screenshot missing: runtime-v1.png");
  await copyFile(shotV1, join(runtimeEvidenceDir, "after-v1.png"));
  cases.push(caseResult("v1", { state: applyV1.state, fingerprint: applyV1.projectFingerprint, verify: verifyV1.levels, ownedPids: verifyV1.ownedPids, screenshot: "after-v1.png" }));

  // ── idempotent: same plan again -> NO_CHANGE, zero file changes ───────────
  const applyV1Again = await bridge.applyImport({ ...requestBase, transactionId: "bridge-v1", assetVersion: "1.0.0", plan: planV1.plan, planHash: planV1.planHash, bindingHash: planV1.bindingHash, confirm: true, dryRun: false, expectedProjectFingerprint: applyV1.projectFingerprint });
  if (applyV1Again.state !== "NO_CHANGE") throw new Error(`idempotent apply expected NO_CHANGE, got ${applyV1Again.state}`);
  if (applyV1Again.changedFiles.length !== 0) throw new Error(`idempotent apply changed ${applyV1Again.changedFiles.length} files`);
  cases.push(caseResult("idempotent-NO_CHANGE", { state: applyV1Again.state, changedFiles: applyV1Again.changedFiles.length, fingerprint: applyV1Again.projectFingerprint }));

  // ── v2 update: new manifest/plan, identity preserved, marker version=2 ────
  const snapshot1 = await bridge.inspectTarget({ ...requestBase, transactionId: "bridge-v2-inspect" });
  const planV2 = await bridge.planImport({ ...requestBase, transactionId: "bridge-v2", assetVersion: "2.0.0", expectedProjectFingerprint: snapshot1.fingerprint });
  if (planV2.bindingHash === planV1.bindingHash) throw new Error("v2 binding hash must differ from v1");
  const applyV2 = await bridge.applyImport({ ...requestBase, transactionId: "bridge-v2", assetVersion: "2.0.0", plan: planV2.plan, planHash: planV2.planHash, bindingHash: planV2.bindingHash, confirm: true, dryRun: false, expectedProjectFingerprint: planV2.plan.projectFingerprint });
  if (applyV2.state !== "APPLIED") throw new Error(`v2 apply expected APPLIED, got ${applyV2.state}`);
  const verifyV2 = await bridge.verifyImport({ ...requestBase, transactionId: "bridge-v2", assetVersion: "2.0.0", plan: planV2.plan, planHash: planV2.planHash, bindingHash: planV2.bindingHash, expectedProjectFingerprint: applyV2.projectFingerprint, levels: ["TEXT_VALID", "PROJECT_LOAD_VALID", "COMPILE_VALID", "RUNTIME_VALID"], igor: toolchain });
  if (!verifyV2.levels.COMPILE_VALID?.passed || !verifyV2.levels.RUNTIME_VALID?.passed) throw new Error("v2 compile/runtime gate failed");
  const shotV2 = join(runtimeEvidenceDir, "runtime-v2.png");
  if (!(await stat(shotV2).catch(() => null))) throw new Error("v2 runtime screenshot missing: runtime-v2.png");
  await copyFile(shotV2, join(runtimeEvidenceDir, "after-v2.png"));
  const gmlV2 = await readFile(join(projectsDir, "pilot-a/objects/obj_asset_bridge_pilot/Create_0.gml"), "utf8");
  if (!gmlV2.includes("GM_ASSET_BRIDGE_BEACON_VERSION 2")) throw new Error("v2 GML marker missing");
  cases.push(caseResult("v2-update", { state: applyV2.state, fingerprint: applyV2.projectFingerprint, verify: verifyV2.levels, ownedPids: verifyV2.ownedPids, screenshot: "after-v2.png", bindingHashChanged: true }));

  // ── post-rollback: v2 rollback -> v1 state byte-exact; v1 rollback -> baseline ──
  const currentV2 = await bridge.inspectTarget({ ...requestBase, transactionId: "bridge-rollback-v2" });
  const rollbackV2 = await bridge.rollbackImport({ ...requestBase, transactionId: "bridge-v2", assetVersion: "2.0.0", planHash: planV2.planHash, bindingHash: planV2.bindingHash, confirm: true, expectedProjectFingerprint: currentV2.fingerprint });
  if (!rollbackV2.byteExact) throw new Error("v2 rollback not byte-exact");
  const gmlAfterRollbackV2 = await readFile(join(projectsDir, "pilot-a/objects/obj_asset_bridge_pilot/Create_0.gml"), "utf8");
  if (!gmlAfterRollbackV2.includes("GM_ASSET_BRIDGE_BEACON_VERSION 1")) throw new Error("v2 rollback did not restore the v1 GML");
  cases.push(caseResult("post-rollback-v2", { byteExact: rollbackV2.byteExact, fingerprint: rollbackV2.projectFingerprint, restoredToV1: true }));

  const currentV1 = await bridge.inspectTarget({ ...requestBase, transactionId: "bridge-rollback-v1" });
  const rollbackV1 = await bridge.rollbackImport({ ...requestBase, transactionId: "bridge-v1", assetVersion: "1.0.0", planHash: planV1.planHash, bindingHash: planV1.bindingHash, confirm: true, expectedProjectFingerprint: currentV1.fingerprint });
  if (!rollbackV1.byteExact) throw new Error("v1 rollback not byte-exact");
  if (rollbackV1.projectFingerprint !== baselineFingerprint) throw new Error("v1 rollback did not restore the baseline fingerprint");
  const postRollbackTree = await treeHash(join(projectsDir, "pilot-a"));
  const pristineTree = await treeHash(fixture);
  const treeEqualsBaseline = Object.keys(postRollbackTree).sort().join("|") === Object.keys(pristineTree).sort().join("|")
    && Object.entries(postRollbackTree).every(([path, hash]) => pristineTree[path] === hash);
  cases.push(caseResult("post-rollback-v1", { byteExact: rollbackV1.byteExact, fingerprint: rollbackV1.projectFingerprint, baselineRestored: rollbackV1.projectFingerprint === baselineFingerprint, treeEqualsBaseline }));

  // Post-rollback compile+runtime of the pristine state (real Igor again).
  const snapshotRestored = await bridge.inspectTarget({ ...requestBase, transactionId: "bridge-postrollback-inspect" });
  const verifyRestored = await adapter.verify({
    capability: "GM_VERIFY_V1", projectRoot: "pilot-a", expectedProjectFingerprint: snapshotRestored.fingerprint, expectedHead: null, allowlist: [], transactionId: "bridge-postrollback", timeoutMs: 180_000, verificationPolicy, evidenceRoot,
    levels: ["TEXT_VALID", "PROJECT_LOAD_VALID", "COMPILE_VALID", "RUNTIME_VALID"], igor: toolchain, expectedRuntimeSignal: "GM_ASSET_BRIDGE_BEACON_VERSION=0",
  });
  if (!verifyRestored.levels.COMPILE_VALID?.passed || !verifyRestored.levels.RUNTIME_VALID?.passed) throw new Error("post-rollback compile/runtime gate failed");
  if (!(await stat(shotBefore).catch(() => null))) throw new Error("post-rollback runtime screenshot missing: runtime-before.png");
  await copyFile(shotBefore, join(runtimeEvidenceDir, "after-rollback.png"));
  cases.push(caseResult("post-rollback-runtime", { verify: verifyRestored.levels, ownedPids: verifyRestored.ownedPids, screenshot: "after-rollback.png" }));

  // ── intentional negative compile through the bridge (real Igor) ────────────
  const negativeRoot = await prepareProject("negative-a");
  // A foreign object the bridge plan never touches: valid .yy, GML syntax error
  // that passes the text validator but fails the real Igor compile.
  await mkdir(join(negativeRoot, "objects/obj_asset_bridge_broken"), { recursive: true });
  await writeFile(join(negativeRoot, "objects/obj_asset_bridge_broken/Create_0.gml"), "#macro BROKEN\nx = ;\n", "utf8");
  const brokenYy = parseGmJson(await readFile(join(negativeRoot, "objects/obj_asset_bridge_pilot/obj_asset_bridge_pilot.yy"), "utf8"));
  brokenYy["%Name"] = "obj_asset_bridge_broken";
  brokenYy.name = "obj_asset_bridge_broken";
  await writeFile(join(negativeRoot, "objects/obj_asset_bridge_broken/obj_asset_bridge_broken.yy"), `${JSON.stringify(brokenYy, null, 2)}\n`, "utf8");
  const yypPath = join(negativeRoot, "AssetBridgePilot.yyp");
  let yypText = await readFile(yypPath, "utf8");
  yypText = yypText.replace('"resources":[\n', '"resources":[\n    {"id":{"name":"obj_asset_bridge_broken","path":"objects/obj_asset_bridge_broken/obj_asset_bridge_broken.yy",},},\n');
  await writeFile(yypPath, yypText, "utf8");

  const negativeSnapshot = await bridge.inspectTarget({ ...requestBase, projectRoot: "negative-a", transactionId: "bridge-negative-inspect" });
  const planNeg = await bridge.planImport({ ...requestBase, projectRoot: "negative-a", transactionId: "bridge-negative", assetVersion: "1.0.0", expectedProjectFingerprint: negativeSnapshot.fingerprint });
  const applyNeg = await bridge.applyImport({ ...requestBase, projectRoot: "negative-a", transactionId: "bridge-negative", assetVersion: "1.0.0", plan: planNeg.plan, planHash: planNeg.planHash, bindingHash: planNeg.bindingHash, confirm: true, dryRun: false, expectedProjectFingerprint: planNeg.plan.projectFingerprint });
  if (applyNeg.state !== "APPLIED") throw new Error(`negative apply expected APPLIED, got ${applyNeg.state}`);
  let negativeError = null;
  try {
    await bridge.verifyImport({ ...requestBase, projectRoot: "negative-a", transactionId: "bridge-negative", assetVersion: "1.0.0", plan: planNeg.plan, planHash: planNeg.planHash, bindingHash: planNeg.bindingHash, expectedProjectFingerprint: applyNeg.projectFingerprint, levels: ["TEXT_VALID", "PROJECT_LOAD_VALID", "COMPILE_VALID"], igor: toolchain });
  } catch (error) { negativeError = error; }
  if (!(negativeError instanceof AssetGmBridgeError)) throw new Error(`negative compile expected VERIFY_COMPILE_FAILED, got ${negativeError?.message ?? "no error"}`);
  const negativeDetails = negativeError.details ?? {};
  const negativeResult = negativeDetails.result ?? {};
  if (negativeError.code !== "VERIFY_COMPILE_FAILED") throw new Error(`negative compile code ${negativeError.code}`);
  if (negativeResult.levels?.COMPILE_VALID?.passed !== false) throw new Error("negative compile: COMPILE_VALID must be passed=false");
  if (!negativeResult.compileExitCode || negativeResult.compileExitCode === 0) throw new Error("negative compile must have a real nonzero Igor exit code");
  const currentNeg = await bridge.inspectTarget({ ...requestBase, projectRoot: "negative-a", transactionId: "bridge-negative-rollback" });
  const rollbackNeg = await bridge.rollbackImport({ ...requestBase, projectRoot: "negative-a", transactionId: "bridge-negative", assetVersion: "1.0.0", planHash: planNeg.planHash, bindingHash: planNeg.bindingHash, confirm: true, expectedProjectFingerprint: currentNeg.fingerprint });
  if (!rollbackNeg.byteExact) throw new Error("negative rollback not byte-exact");
  cases.push(caseResult("negative-compile", { code: negativeError.code, compileExitCode: negativeResult.compileExitCode, compilePassed: negativeResult.levels?.COMPILE_VALID?.passed, rollbackRequired: negativeResult.rollbackRequired, rollbackByteExact: rollbackNeg.byteExact, ownedPids: negativeResult.ownedPids ?? [] }));

  // ── final process hygiene ──────────────────────────────────────────────────
  const finalInventory = await inventory();
  const finalOwnedOrGm = finalInventory.filter(isGmProcess);
  if (finalOwnedOrGm.length) throw new Error(`orphan GameMaker processes after pilot: ${finalOwnedOrGm.map(({ pid }) => pid).join(",")}`);
  const initialGmPids = initialForeign.map(({ pid }) => pid).sort((a, b) => a - b);
  const finalGmPids = finalOwnedOrGm.map(({ pid }) => pid).sort((a, b) => a - b);
  const gmProcessSetPreserved = JSON.stringify(initialGmPids) === JSON.stringify(finalGmPids);
  if (!gmProcessSetPreserved) throw new Error("GameMaker process baseline changed during pilot");
  cases.push(caseResult("process-hygiene", { initialGmPids, finalGmPids, gmProcessSetPreserved, nonGmPopulationCompared: false, foreignRunnerPreservationEvidence: "asset-gm-bridge toctou unit test" }));

  const report = Object.freeze({
    schemaVersion: 1,
    status: "COMPLETED / ASSET_GM_BRIDGE_V1_PILOT_VERIFIED",
    toolchain: Object.freeze({ ide: "GameMaker-LTS2026 2026.0.0.16", runtimeVersion, executable: basename(igor.executable), projectTool: basename(igor.projectTool), userDirectory: "<explicit-redacted>" }),
    catalog: Object.freeze({ path: relative(workRoot, catalogPath).split("\\").join("/"), sha256: sha256(await readFile(catalogPath)) }),
    runtimeEvidenceDir: relative(workRoot, runtimeEvidenceDir).split("\\").join("/"),
    cases: Object.freeze(cases),
    processOwnership: Object.freeze({ initialGmPids, finalGmPids, gmProcessSetPreserved, nonGmPopulationCompared: false }),
  });
  await writeFile(join(workRoot, "pilot-summary.json"), canonicalBytes(report));
  console.log(JSON.stringify(report, null, 2));
}

await main().catch((error) => { console.error(`PILOT FAILED: ${error instanceof Error ? error.stack : String(error)}`); process.exit(1); });
