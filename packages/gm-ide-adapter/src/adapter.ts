import type { GameMakerIdeAdapter, GmAdapterStatus, GmApplyResult, GmApplySafeRequest, GmInspectRequest, GmMutationPlan, GmPlanRequest, GmProjectSnapshot, GmRollbackRequest, GmRollbackResult, GmStatusRequest, GmVerificationResult, GmVerifyRequest } from "./contracts/index.js";
import { assertCapabilityGate } from "./capabilities/index.js";
import { fail } from "./errors/index.js";
import { inspectProject } from "./inspection/index.js";
import { createPlan } from "./planning/index.js";
import { ProcessLedger, type ProcessInventory, windowsProcessInventory } from "./processes/index.js";
import { applyTransaction, listTransactions, rollbackTransaction } from "./transactions/index.js";
import { verifyProject } from "./verification/index.js";

export class GovernedGameMakerIdeAdapter implements GameMakerIdeAdapter {
  readonly ledger: ProcessLedger;
  constructor(readonly projectsDir: string, inventory: ProcessInventory = windowsProcessInventory) { if (!projectsDir) fail("AUTHZ_PROJECT_ROOT", "projectsDir is required"); this.ledger = new ProcessLedger(inventory); }
  inspect(request: GmInspectRequest): Promise<GmProjectSnapshot> { assertCapabilityGate(request.capability, "READ_ONLY"); return inspectProject(this.projectsDir, request, this.ledger.inventory); }
  plan(request: GmPlanRequest): Promise<GmMutationPlan> { assertCapabilityGate(request.capability, "PLAN_ONLY"); return createPlan(this.projectsDir, request, this.ledger.inventory); }
  applySafe(request: GmApplySafeRequest): Promise<GmApplyResult> { assertCapabilityGate(request.capability, "SAFE_WRITE"); return applyTransaction(this.projectsDir, request, this.ledger.inventory); }
  verify(request: GmVerifyRequest): Promise<GmVerificationResult> { assertCapabilityGate(request.capability, request.levels.includes("RUNTIME_VALID") ? "RUN" : request.levels.includes("COMPILE_VALID") ? "COMPILE" : "SAFE_WRITE"); return verifyProject(this.projectsDir, request, this.ledger); }
  rollback(request: GmRollbackRequest): Promise<GmRollbackResult> { assertCapabilityGate(request.capability, "SAFE_WRITE"); return rollbackTransaction(this.projectsDir, request, this.ledger.inventory); }
  async status(request: GmStatusRequest): Promise<GmAdapterStatus> {
    assertCapabilityGate(request.capability, "READ_ONLY"); if (request.capability !== "GM_STATUS_V1") fail("GATE_VIOLATION", "status requires GM_STATUS_V1"); const snapshot = await inspectProject(this.projectsDir, { ...request, capability: "GM_STATUS_V1" }, this.ledger.inventory); const transactions = await listTransactions(this.projectsDir, request.evidenceRoot); const ownedIds = new Set(this.ledger.records(request.transactionId).map(({ pid }) => pid)); const ownedProcesses = Object.freeze(snapshot.processes.filter(({ pid }) => ownedIds.has(pid))); const foreignProcesses = Object.freeze(snapshot.processes.filter(({ pid }) => !ownedIds.has(pid)));
    let state: GmAdapterStatus["state"] = "READY"; if (transactions.pending.length) state = "TRANSACTION_PENDING"; else if (foreignProcesses.some(({ name }) => /^Runner/i.test(name))) state = "RUNNER_RUNNING_FOREIGN"; else if (foreignProcesses.some(({ name }) => /^Igor/i.test(name))) state = "COMPILE_RUNNING"; else if (foreignProcesses.some(({ name }) => /^GameMaker/i.test(name))) state = "PROJECT_OPEN"; else if (ownedProcesses.some(({ name }) => /^Runner/i.test(name))) state = "RUNNER_RUNNING_OWNED"; else if (transactions.rollback.length) state = "ROLLBACK_AVAILABLE"; else if (snapshot.gitStatus.length) state = "DIRTY";
    return Object.freeze({ schemaVersion: 1, state, projectRoot: snapshot.projectRoot, projectFingerprint: snapshot.fingerprint, gate: state === "PROJECT_OPEN" || state === "RUNNER_RUNNING_FOREIGN" || state === "COMPILE_RUNNING" ? "READ_ONLY" : "SAFE_WRITE", ownedProcesses, foreignProcesses, pendingTransactions: transactions.pending, rollbackAvailable: transactions.rollback, warnings: snapshot.warnings });
  }
}
