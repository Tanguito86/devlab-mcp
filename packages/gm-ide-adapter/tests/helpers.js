import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GovernedGameMakerIdeAdapter } from "../dist/index.js";
import { planHash } from "../dist/planning/index.js";

export const fixtureSource = new URL("../../../fixtures/gamemaker/hermes-bridge-pilot/", import.meta.url);
export const targetFile = "objects/obj_gm_bridge_pilot/Create_0.gml";
export async function sandbox(name = "Project") { const root = await mkdtemp(join(tmpdir(), "gm-adapter-")); await cp(fixtureSource, join(root, name), { recursive: true }); return { root, projectRoot: name, cleanup: () => rm(root, { recursive: true, force: true }) }; }
export const policy = Object.freeze({ projectLoad: true, compile: true, runtime: "optional" });
export function base(projectRoot, transactionId, capability) { return { projectRoot, expectedProjectFingerprint: null, expectedHead: null, allowlist: [targetFile], capability, transactionId, timeoutMs: 5_000, verificationPolicy: policy, evidenceRoot: ".gm-bridge-evidence" }; }
export async function setupPlan(box, transactionId = "tx-001", afterValue = 2, adapter = new GovernedGameMakerIdeAdapter(box.root, async () => [])) { const snapshot = await adapter.inspect(base(box.projectRoot, transactionId, "GM_INSPECT_V1")); const current = await readFile(join(box.root, box.projectRoot, targetFile), "utf8"); const content = current.replace(/GM_BRIDGE_PILOT_VALUE \d+/, `GM_BRIDGE_PILOT_VALUE ${afterValue}`); const request = { ...base(box.projectRoot, transactionId, "GM_PLAN_V1"), expectedProjectFingerprint: snapshot.fingerprint, expectedHead: snapshot.gitHead, files: [{ path: targetFile, action: "modify", content }] }; const plan = await adapter.plan(request); return { adapter, snapshot, current, content, plan, planHash: planHash(plan) }; }
export async function applyPlanned(ctx, faultAt) { return ctx.adapter.applySafe({ ...base(ctx.plan.projectRoot, ctx.plan.transactionId, "GM_APPLY_SAFE_V1"), expectedProjectFingerprint: ctx.snapshot.fingerprint, expectedHead: ctx.snapshot.gitHead, plan: ctx.plan, planHash: ctx.planHash, confirm: true, dryRun: false, ...(faultAt ? { faultAt } : {}) }); }
export { readFile, writeFile, join };
