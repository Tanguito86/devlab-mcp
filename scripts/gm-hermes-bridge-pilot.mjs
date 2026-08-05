import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GovernedGameMakerIdeAdapter } from "../packages/gm-ide-adapter/dist/index.js";
import { planHash } from "../packages/gm-ide-adapter/dist/planning/index.js";
import { windowsProcessInventory } from "../packages/gm-ide-adapter/dist/processes/index.js";
import { canonicalBytes } from "../packages/gm-ide-adapter/dist/transactions/canonical.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const value = (flag) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] : undefined; };
const required = (flag) => { const result = value(flag); if (!result) throw new Error(`${flag} is required`); return resolve(result); };
const workRoot = required("--work-root");
const runtimePath = required("--runtime-root");
const executable = required("--igor");
const projectTool = required("--project-tool");
const userDirectory = required("--user-dir");
const runtimeVersion = basename(runtimePath).replace(/^runtime-/, "");
for (const [name, path] of Object.entries({ executable, runtimePath, projectTool, userDirectory })) if (!path || !(await stat(path).catch(() => null))) throw new Error(`missing ${name}: ${path}`);

await mkdir(workRoot, { recursive: true });
const source = join(repoRoot, "fixtures/gamemaker/hermes-bridge-pilot");
const initialProcesses = await windowsProcessInventory();
if (initialProcesses.some(({ name }) => /^(?:Igor|Runner)(?:\.exe)?$/i.test(name))) throw new Error("foreign Igor/Runner exists before pilot");
const toolchain = { executable, runtimePath, userDirectory, projectTool };
const target = "objects/obj_gm_bridge_pilot/Create_0.gml";
const verificationPolicy = Object.freeze({ projectLoad: true, compile: true, runtime: "optional" });

async function runCase({ projectRoot, transactionId, content, levels, expectedRuntimeSignal }) {
  await cp(source, join(workRoot, projectRoot), { recursive: true, errorOnExist: true, force: false });
  const adapter = new GovernedGameMakerIdeAdapter(workRoot); const evidenceRoot = ".evidence";
  const common = { projectRoot, expectedProjectFingerprint: null, expectedHead: null, allowlist: [target], transactionId, timeoutMs: 180_000, verificationPolicy, evidenceRoot };
  const stateA = await adapter.inspect({ ...common, capability: "GM_INSPECT_V1" });
  const plan = await adapter.plan({ ...common, capability: "GM_PLAN_V1", expectedProjectFingerprint: stateA.fingerprint, expectedHead: stateA.gitHead, files: [{ path: target, action: "modify", content }] });
  const digest = planHash(plan); const applied = await adapter.applySafe({ ...common, capability: "GM_APPLY_SAFE_V1", expectedProjectFingerprint: stateA.fingerprint, expectedHead: stateA.gitHead, plan, planHash: digest, confirm: true, dryRun: false });
  let verification; try { verification = await adapter.verify({ ...common, capability: "GM_VERIFY_V1", expectedProjectFingerprint: applied.projectFingerprint, plan, planHash: digest, levels, igor: toolchain, ...(expectedRuntimeSignal ? { expectedRuntimeSignal } : {}) }); }
  finally { const current = await adapter.inspect({ ...common, capability: "GM_INSPECT_V1" }); const rollback = await adapter.rollback({ ...common, capability: "GM_ROLLBACK_V1", expectedProjectFingerprint: current.fingerprint, planHash: digest, confirm: true }); if (!rollback.byteExact || rollback.projectFingerprint !== stateA.fingerprint) throw new Error(`${transactionId}: rollback was not byte-exact`); }
  const stateRestored = await adapter.inspect({ ...common, capability: "GM_INSPECT_V1" });
  return Object.freeze({ transactionId, stateA: Object.freeze({ fingerprint: stateA.fingerprint, files: stateA.files.map(({ path, sha256, size }) => ({ path, sha256, size })) }), planHash: digest, stateB: Object.freeze({ fingerprint: applied.projectFingerprint, manifestSha256: applied.manifestSha256 }), verification, stateRestored: Object.freeze({ fingerprint: stateRestored.fingerprint, files: stateRestored.files.map(({ path, sha256, size }) => ({ path, sha256, size })) }), byteExact: stateRestored.fingerprint === stateA.fingerprint });
}

const canonical = await readFile(join(source, target), "utf8");
const positive = await runCase({ projectRoot: "Mi Proyecto Test ñ", transactionId: "pilot-positive-v1", content: canonical.replace("GM_BRIDGE_PILOT_VALUE 1", "GM_BRIDGE_PILOT_VALUE 2"), levels: ["TEXT_VALID", "PROJECT_LOAD_VALID", "COMPILE_VALID", "RUNTIME_VALID"], expectedRuntimeSignal: "GM_BRIDGE_PILOT_VALUE=2" });
if (!positive.verification.levels.COMPILE_VALID?.passed || !positive.verification.levels.RUNTIME_VALID?.passed) throw new Error("positive compile/runtime gate failed");
const negative = await runCase({ projectRoot: "Negative Compile Fixture", transactionId: "pilot-negative-v1", content: "#macro GM_BRIDGE_PILOT_VALUE 2\nGM_BRIDGE_INTENTIONAL_SYNTAX_ERROR {\n", levels: ["TEXT_VALID", "PROJECT_LOAD_VALID", "COMPILE_VALID"] });
if (negative.verification.levels.COMPILE_VALID?.passed || negative.verification.compileExitCode === 0 || !negative.verification.rollbackRequired) throw new Error("negative compile did not fail as expected");
const finalProcesses = await windowsProcessInventory(); const remaining = finalProcesses.filter(({ name }) => /^(?:Igor|Runner)(?:\.exe)?$/i.test(name)); if (remaining.length) throw new Error(`orphan GameMaker processes: ${remaining.map(({ pid }) => pid).join(",")}`);
const report = Object.freeze({ schemaVersion: 1, status: "COMPLETED / HERMES_BRIDGE_PILOT_VERIFIED", toolchain: Object.freeze({ ide: "GameMaker-LTS2026 2026.0.0.16", runtimeVersion, executable, projectTool }), initialForeignProcessCount: initialProcesses.filter(({ name }) => /^(?:Igor|Runner)(?:\.exe)?$/i.test(name)).length, finalOwnedProcessCount: remaining.length, positive, negative });
await writeFile(join(workRoot, "pilot-summary.json"), canonicalBytes(report)); console.log(JSON.stringify(report, null, 2));
