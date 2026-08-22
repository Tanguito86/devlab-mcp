import { isAbsolute } from "node:path";
import { stat } from "node:fs/promises";

import { AssetGmBridgeError, GovernedAssetGmBridge } from "@tanguito/devlab-asset-gm-bridge";
import { GmAdapterError, type GmAdapterErrorCode } from "@tanguito/devlab-gm-ide-adapter";
import { resolveRealRoot, safeRelativePath } from "@tanguito/devlab-gm-ide-adapter/internal";

import type {
  AssetApplyImportInput,
  AssetInspectInput,
  AssetPlanImportInput,
  AssetRollbackImportInput,
  AssetStatusInput,
  ToolOutput,
} from "./contracts.js";

export const PROJECTS_DIR_ENV = "DEVLAB_GM_PROJECTS_DIR";
export const CATALOG_ENV = "DEVLAB_GM_ASSET_CATALOG";
export const REPO_ROOT_ENV = "DEVLAB_GM_ASSET_REPO_ROOT";
export const WRITE_ENV = "DEVLAB_GM_ASSET_WRITE";
export const EVIDENCE_ROOT_ENV = "DEVLAB_GM_EVIDENCE_ROOT";
export const DEFAULT_EVIDENCE_ROOT = ".devlab-gamemaker-mcp-asset";

const TIMEOUT_MS = 120_000;

/**
 * This server never compiles and never launches a runtime, so verifyImport is
 * deliberately not exposed: build verification belongs to the build tier, which
 * is separately gated. The policy is fixed here so no caller can request one.
 */
const VERIFICATION_POLICY = Object.freeze({
  projectLoad: false,
  compile: false,
  runtime: "forbidden" as const,
});

/**
 * Pilot instrumentation rewrites the GML of a fixture-only object. It is
 * scaffolding for the bridge's own pilot, never something an agent should be
 * able to request against a real project, so the mode is pinned here and has
 * no field in any tool contract.
 */
const INSTRUMENTATION = "NONE" as const;

type PublicRequestId = string | number;

export type GmAssetErrorCode =
  | "GM_CONFIG_REQUIRED"
  | "GM_CONFIG_INVALID"
  | "GM_ASSET_WRITE_NOT_ENABLED"
  | "GM_INTERNAL_ERROR";

export class GmAssetError extends Error {
  constructor(readonly code: GmAssetErrorCode, message: string, readonly recoverable: boolean) {
    super(message);
    this.name = "GmAssetError";
  }
}

const ADAPTER_PUBLIC_MESSAGES: Readonly<Record<GmAdapterErrorCode, string>> = Object.freeze({
  AUTHZ_PROJECT_ROOT: "The configured project root or project path is not authorized.",
  EXPECTED_HASH_MISMATCH: "The project fingerprint no longer matches the request.",
  EXPECTED_HEAD_MISMATCH: "The project Git HEAD no longer matches the request.",
  PATH_ESCAPE: "A supplied relative path violates the project boundary.",
  FILE_NOT_ALLOWLISTED: "A planned file is outside the declared allowlist or extension policy.",
  GATE_VIOLATION: "The requested operation is not authorized by the fixed server capability.",
  PLAN_STALE: "The plan is stale or its binding is invalid.",
  MUTATION_NOT_FOUND: "The referenced transaction does not exist.",
  MUTATION_ALREADY_APPLIED: "The referenced transaction was already applied.",
  VERIFICATION_FAILED: "Verification failed.",
  ROLLBACK_UNAVAILABLE: "Rollback evidence is unavailable or corrupt.",
  ROLLBACK_INCOMPLETE: "Rollback did not restore every file.",
  PROCESS_OWNERSHIP: "Process ownership could not be established.",
  RUN_BLOCKED_EXTERNAL_RUNNER: "A GameMaker Runner is running; close it first.",
  TIMEOUT: "The bounded request timed out.",
  CANCELLED: "The request was cancelled.",
  BUSY: "The project is busy; another transaction holds the lock.",
  CONCURRENT_MODIFICATION: "The project changed concurrently.",
  LIMIT_EXCEEDED: "The request exceeds the fixed safety limits.",
  REGISTRY_INVALID: "The project registry is invalid.",
  INVALID_REQUEST: "The request does not satisfy the GameMaker adapter contract.",
  ATOMIC_PROMOTION_FAILED: "Atomic promotion failed and the project was restored.",
  COMPILE_FAILED: "Compilation failed.",
});

async function requireAbsoluteExisting(
  env: Readonly<Record<string, string | undefined>>,
  variable: string,
  what: "file" | "directory",
): Promise<string> {
  const configured = env[variable];
  if (!configured) throw new GmAssetError("GM_CONFIG_REQUIRED", `${variable} must be configured before calling an asset tool.`, true);
  if (!isAbsolute(configured)) throw new GmAssetError("GM_CONFIG_INVALID", `${variable} must be an absolute path.`, true);
  const info = await stat(configured).catch(() => null);
  if (!info) throw new GmAssetError("GM_CONFIG_INVALID", `${variable} does not exist.`, true);
  if (what === "directory" && !info.isDirectory()) throw new GmAssetError("GM_CONFIG_INVALID", `${variable} must be a directory.`, true);
  if (what === "file" && !info.isFile()) throw new GmAssetError("GM_CONFIG_INVALID", `${variable} must be a file.`, true);
  return configured;
}

export async function resolveProjectsDir(env: Readonly<Record<string, string | undefined>> = process.env): Promise<string> {
  const configured = env[PROJECTS_DIR_ENV];
  if (!configured) throw new GmAssetError("GM_CONFIG_REQUIRED", `${PROJECTS_DIR_ENV} must be configured before calling an asset tool.`, true);
  if (!isAbsolute(configured)) throw new GmAssetError("GM_CONFIG_INVALID", `${PROJECTS_DIR_ENV} must identify an existing absolute real directory.`, true);
  try {
    return await resolveRealRoot(configured);
  } catch {
    throw new GmAssetError("GM_CONFIG_INVALID", `${PROJECTS_DIR_ENV} must identify an existing absolute real directory.`, true);
  }
}

export function resolveEvidenceRoot(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env[EVIDENCE_ROOT_ENV];
  if (!configured) return DEFAULT_EVIDENCE_ROOT;
  try {
    return safeRelativePath(configured, EVIDENCE_ROOT_ENV);
  } catch {
    throw new GmAssetError("GM_CONFIG_INVALID", `${EVIDENCE_ROOT_ENV} must be a safe relative path under the projects directory.`, true);
  }
}

/** Importing writes into a project, so it needs a deliberate host opt-in. */
export function writeEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const raw = env[WRITE_ENV];
  return raw === "1" || raw?.toLowerCase() === "true";
}

export class GovernedAssetMcpService {
  constructor(private readonly env: Readonly<Record<string, string | undefined>> = process.env) {}

  private async bridge(): Promise<GovernedAssetGmBridge> {
    const projectsDir = await resolveProjectsDir(this.env);
    const catalogPath = await requireAbsoluteExisting(this.env, CATALOG_ENV, "file");
    const repoRoot = await requireAbsoluteExisting(this.env, REPO_ROOT_ENV, "directory");
    return new GovernedAssetGmBridge(projectsDir, { catalogPath, repoRoot });
  }

  private base(input: Readonly<{ projectPath?: string; assetId: string; assetVersion: string; resourceName?: string; transactionId?: string }>, signal: AbortSignal) {
    return {
      capability: "ASSET_GM_BRIDGE_V1" as const,
      projectRoot: input.projectPath ?? "",
      evidenceRoot: resolveEvidenceRoot(this.env),
      transactionId: input.transactionId ?? "asset-read",
      assetId: input.assetId,
      assetVersion: input.assetVersion,
      resourceName: input.resourceName ?? "spr_placeholder",
      expectedProjectFingerprint: null,
      expectedHead: null,
      timeoutMs: TIMEOUT_MS,
      cancellation: signal,
      verificationPolicy: VERIFICATION_POLICY,
    };
  }

  private assertWritable(): void {
    if (!writeEnabled(this.env)) {
      throw new GmAssetError("GM_ASSET_WRITE_NOT_ENABLED", `Set ${WRITE_ENV}=1 to allow this server to write imported assets into a project.`, true);
    }
  }

  async inspect(input: AssetInspectInput, requestId: PublicRequestId, signal: AbortSignal) {
    const bridge = await this.bridge();
    const result = await bridge.inspectAsset(this.base(input, signal));
    return {
      ok: true as const,
      schemaVersion: 1 as const,
      requestId,
      capability: "ASSET_GM_BRIDGE_V1" as const,
      serverGate: "READ_ONLY" as const,
      assetId: result.assetId,
      assetVersion: result.assetVersion,
      status: result.status,
      assetClass: result.assetClass,
      approved: result.approved,
      frameCount: result.frameCount,
      dimensions: { ...result.dimensions },
      boundingBox: { ...result.boundingBox },
      estimatedDecodedBytes: result.estimatedDecodedBytes,
      specSha256: result.specSha256,
      exportSha256: result.exportSha256,
      budget: { status: result.budget.status, findings: result.budget.findings.map((finding) => ({ ...finding })) },
      // Paths inside provenance stay on the host; only the error text crosses.
      provenanceErrors: [...result.provenance.errors],
    };
  }

  async status(input: AssetStatusInput, requestId: PublicRequestId, signal: AbortSignal) {
    const bridge = await this.bridge();
    const result = await bridge.status(this.base(input, signal));
    return {
      ok: true as const,
      schemaVersion: 1 as const,
      requestId,
      capability: "ASSET_GM_BRIDGE_V1" as const,
      serverGate: "READ_ONLY" as const,
      state: result.state,
      assetId: result.assetId,
      assetVersion: result.assetVersion,
      assetApproved: result.assetApproved,
      projectState: result.projectState,
      projectFingerprint: result.projectFingerprint,
      pendingTransactions: [...result.pendingTransactions],
      rollbackAvailable: [...result.rollbackAvailable],
      warnings: [...result.warnings],
      writeEnabled: writeEnabled(this.env),
    };
  }

  async planImport(input: AssetPlanImportInput, requestId: PublicRequestId, signal: AbortSignal) {
    const bridge = await this.bridge();
    const result = await bridge.planImport({
      ...this.base(input, signal),
      expectedProjectFingerprint: input.expectedProjectFingerprint,
      instrumentation: INSTRUMENTATION,
    });
    return {
      ok: true as const,
      schemaVersion: 1 as const,
      requestId,
      capability: "ASSET_GM_BRIDGE_V1" as const,
      serverGate: "PLAN_ONLY" as const,
      transactionId: result.transactionId,
      planHash: result.planHash,
      bindingHash: result.bindingHash,
      manifestHash: result.manifestHash,
      resourceName: result.manifest.resourceName,
      frameCount: result.manifest.frameCount,
      dimensions: { ...result.manifest.dimensions },
      origin: { ...result.manifest.origin },
      instrumentation: INSTRUMENTATION,
      changes: result.files.map(({ path, action, beforeSha256, afterSha256 }) => ({ path, action, beforeSha256, afterSha256 })),
      budget: { status: result.asset.budget.status, findings: result.asset.budget.findings.map((finding) => ({ ...finding })) },
    };
  }

  async applyImport(input: AssetApplyImportInput, requestId: PublicRequestId, signal: AbortSignal) {
    this.assertWritable();
    const bridge = await this.bridge();
    // Re-planning against the same fingerprint reloads the stored plan and
    // binding record and revalidates the asset itself, so a large plan object
    // never has to cross the transport. Deterministic re-planning of an
    // identical plan is allowed by the bridge; a different one is refused, and
    // an asset that changed since planning trips ASSET_HASH_MISMATCH here.
    const stored = await bridge.planImport({
      ...this.base(input, signal),
      expectedProjectFingerprint: input.expectedProjectFingerprint,
      instrumentation: INSTRUMENTATION,
    });
    if (stored.planHash !== input.planHash || stored.bindingHash !== input.bindingHash) {
      throw new GmAssetError("GM_INTERNAL_ERROR", "The stored plan no longer matches the supplied hashes.", false);
    }
    const result = await bridge.applyImport({
      ...this.base(input, signal),
      expectedProjectFingerprint: stored.plan.projectFingerprint,
      plan: stored.plan,
      planHash: input.planHash,
      bindingHash: input.bindingHash,
      confirm: true,
      dryRun: input.dryRun ?? true,
    });
    return {
      ok: true as const,
      schemaVersion: 1 as const,
      requestId,
      capability: "ASSET_GM_BRIDGE_V1" as const,
      serverGate: "SAFE_WRITE" as const,
      applied: result.applied,
      dryRun: result.dryRun,
      state: result.state,
      transactionId: result.transactionId,
      planHash: result.planHash,
      bindingHash: result.bindingHash,
      changedFiles: [...result.changedFiles],
      rollbackAvailable: result.rollbackAvailable,
      projectFingerprint: result.projectFingerprint,
    };
  }

  async rollbackImport(input: AssetRollbackImportInput, requestId: PublicRequestId, signal: AbortSignal) {
    this.assertWritable();
    const bridge = await this.bridge();
    const result = await bridge.rollbackImport({
      ...this.base(input, signal),
      expectedProjectFingerprint: input.expectedProjectFingerprint,
      planHash: input.planHash,
      bindingHash: input.bindingHash,
      confirm: true,
    });
    return {
      ok: true as const,
      schemaVersion: 1 as const,
      requestId,
      capability: "ASSET_GM_BRIDGE_V1" as const,
      serverGate: "SAFE_WRITE" as const,
      restored: result.restored,
      byteExact: result.byteExact,
      restoredFiles: [...result.restoredFiles],
      transactionId: result.transactionId,
      projectFingerprint: result.projectFingerprint,
    };
  }
}

export function mapToolError(error: unknown, requestId: PublicRequestId): ToolOutput {
  if (error instanceof GmAssetError) {
    return { ok: false, schemaVersion: 1, requestId, error: { code: error.code, message: error.message, recoverable: error.recoverable } };
  }
  // Bridge errors already carry a public, path-free vocabulary.
  if (error instanceof AssetGmBridgeError) {
    return { ok: false, schemaVersion: 1, requestId, error: { code: error.code, message: error.message, recoverable: error.recoverable } };
  }
  if (error instanceof GmAdapterError) {
    return {
      ok: false,
      schemaVersion: 1,
      requestId,
      error: { code: error.code, message: ADAPTER_PUBLIC_MESSAGES[error.code], recoverable: error.recoverable },
    };
  }
  const type = error instanceof Error ? error.name : typeof error;
  process.stderr.write(`[gamemaker-asset-mcp] GM_INTERNAL_ERROR request=${String(requestId)} type=${type}\n`);
  return {
    ok: false,
    schemaVersion: 1,
    requestId,
    error: { code: "GM_INTERNAL_ERROR", message: "The asset request failed closed.", recoverable: false },
  };
}
