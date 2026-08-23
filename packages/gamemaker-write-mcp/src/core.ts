import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import {
  GmAdapterError,
  GovernedGameMakerIdeAdapter,
  type GmAdapterErrorCode,
  type GmApplySafeRequest,
  type GmMutationPlan,
  type GmRollbackRequest,
  type GmVerifyRequest,
} from "@tanguito/devlab-gm-ide-adapter";
import {
  planHash as adapterPlanHash,
  resolveInsideRoot,
  resolveRealRoot,
  safeRelativePath,
} from "@tanguito/devlab-gm-ide-adapter/internal";
import { authorProject, GmAuthoringError } from "@tanguito/devlab-gm-authoring";

import type {
  ApplyInput,
  ApplyOutput,
  CreateProjectInput,
  CreateProjectOutput,
  MutationPlanInput,
  RollbackInput,
  RollbackOutput,
  ToolOutput,
  VerifyTextInput,
  VerifyTextOutput,
} from "./contracts.js";

export const PROJECTS_DIR_ENV = "DEVLAB_GM_PROJECTS_DIR";
export const WRITE_ALLOW_ENV = "DEVLAB_GM_WRITE_ALLOW";
export const EVIDENCE_ROOT_ENV = "DEVLAB_GM_EVIDENCE_ROOT";
export const DEFAULT_EVIDENCE_ROOT = ".devlab-gamemaker-mcp-write";
export const UNRESTRICTED_WRITE_ALLOW = "*";

const TIMEOUT_MS = 30_000;

/**
 * This server never compiles and never launches a runtime. The policy is fixed
 * here so no caller can request a compile or run through a tool argument.
 */
const VERIFICATION_POLICY = Object.freeze({
  projectLoad: false,
  compile: false,
  runtime: "forbidden" as const,
});

type PublicRequestId = string | number;

export type GmWriteErrorCode =
  | "GM_CONFIG_REQUIRED"
  | "GM_CONFIG_INVALID"
  | "GM_WRITE_NOT_ALLOWED"
  | "GM_INVALID_REQUEST"
  | "GM_INTERNAL_ERROR";

export class GmWriteError extends Error {
  constructor(
    readonly code: GmWriteErrorCode,
    message: string,
    readonly recoverable: boolean,
  ) {
    super(message);
    this.name = "GmWriteError";
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
  RUN_BLOCKED_EXTERNAL_RUNNER: "A foreign runner blocks the operation.",
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

export async function resolveProjectsDir(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<string> {
  const configured = env[PROJECTS_DIR_ENV];
  if (!configured) {
    throw new GmWriteError("GM_CONFIG_REQUIRED", `${PROJECTS_DIR_ENV} must be configured before calling a GameMaker tool.`, true);
  }
  if (!isAbsolute(configured)) {
    throw new GmWriteError("GM_CONFIG_INVALID", `${PROJECTS_DIR_ENV} must identify an existing absolute real directory.`, true);
  }
  try {
    return await resolveRealRoot(configured);
  } catch {
    throw new GmWriteError("GM_CONFIG_INVALID", `${PROJECTS_DIR_ENV} must identify an existing absolute real directory.`, true);
  }
}

export function resolveEvidenceRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = env[EVIDENCE_ROOT_ENV];
  if (!configured) return DEFAULT_EVIDENCE_ROOT;
  try {
    return safeRelativePath(configured, EVIDENCE_ROOT_ENV);
  } catch {
    throw new GmWriteError("GM_CONFIG_INVALID", `${EVIDENCE_ROOT_ENV} must be a safe relative path under the projects directory.`, true);
  }
}

/**
 * Server-side write boundary.
 *
 * The per-request allowlist is supplied by the caller, so on its own it is a
 * coherence check rather than an authorization boundary: a model can widen it
 * at will. This env-scoped allowlist is the part the caller cannot widen. It
 * must be configured explicitly; the operator opts out of it deliberately with
 * `*` rather than by forgetting to set it.
 *
 * Entries are separated by `;`. An entry ending in `/` matches anything below
 * that directory; any other entry must match a path exactly.
 */
export function resolveWriteAllowlist(
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] | null {
  const configured = env[WRITE_ALLOW_ENV];
  if (configured === undefined || configured.trim() === "") {
    throw new GmWriteError(
      "GM_CONFIG_REQUIRED",
      `${WRITE_ALLOW_ENV} must be configured before any write. Use "${UNRESTRICTED_WRITE_ALLOW}" to deliberately allow the whole project.`,
      true,
    );
  }
  const trimmed = configured.trim();
  if (trimmed === UNRESTRICTED_WRITE_ALLOW) return null;
  const entries = trimmed.split(";").map((entry) => entry.trim()).filter((entry) => entry !== "");
  if (!entries.length || entries.length > 256) {
    throw new GmWriteError("GM_CONFIG_INVALID", `${WRITE_ALLOW_ENV} does not contain a usable path list.`, true);
  }
  const normalized: string[] = [];
  for (const entry of entries) {
    const isPrefix = entry.endsWith("/");
    const bare = isPrefix ? entry.slice(0, -1) : entry;
    try {
      normalized.push(isPrefix ? `${safeRelativePath(bare, WRITE_ALLOW_ENV)}/` : safeRelativePath(bare, WRITE_ALLOW_ENV));
    } catch {
      throw new GmWriteError("GM_CONFIG_INVALID", `${WRITE_ALLOW_ENV} contains an entry that violates the path safety policy.`, true);
    }
  }
  return Object.freeze([...new Set(normalized)].sort());
}

export function assertWriteAllowed(paths: readonly string[], allowlist: readonly string[] | null): void {
  for (const candidate of paths) {
    // Path safety is checked in every mode. "Unrestricted" means anywhere
    // inside the project, never unchecked: the adapter would also reject an
    // escape downstream, but this server does not delegate its own boundary.
    const normalized = safeRelativePath(candidate);
    if (allowlist === null) continue;
    const permitted = allowlist.some((entry) => entry.endsWith("/")
      ? normalized.startsWith(entry)
      : normalized === entry);
    if (!permitted) {
      throw new GmWriteError(
        "GM_WRITE_NOT_ALLOWED",
        `A planned file is outside the server write allowlist configured in ${WRITE_ALLOW_ENV}.`,
        false,
      );
    }
  }
}

function derivedTransactionId(tool: string, input: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify({ tool, input })).digest("hex").slice(0, 32);
  return `gm-write-${digest}`;
}

export class GovernedGameMakerWriteService {
  constructor(
    private readonly env: Readonly<Record<string, string | undefined>> = process.env,
  ) {}

  private async adapter(): Promise<GovernedGameMakerIdeAdapter> {
    return new GovernedGameMakerIdeAdapter(await resolveProjectsDir(this.env));
  }

  private base(projectPath: string, transactionId: string, allowlist: readonly string[], signal: AbortSignal) {
    return {
      projectRoot: projectPath,
      expectedHead: null,
      allowlist,
      transactionId,
      timeoutMs: TIMEOUT_MS,
      cancellation: signal,
      verificationPolicy: VERIFICATION_POLICY,
      evidenceRoot: resolveEvidenceRoot(this.env),
    };
  }

  async apply(input: ApplyInput, requestId: PublicRequestId, signal: AbortSignal): Promise<ApplyOutput> {
    const plan = input.plan as unknown as GmMutationPlan;
    if (adapterPlanHash(plan) !== input.planHash) {
      throw new GmWriteError("GM_INTERNAL_ERROR", "The supplied planHash does not match the supplied plan.", false);
    }
    if (plan.projectRoot !== safeRelativePath(input.projectPath)) {
      throw new GmWriteError("GM_INTERNAL_ERROR", "The plan is bound to a different project than the request.", false);
    }
    assertWriteAllowed(plan.files.map(({ path }) => path), resolveWriteAllowlist(this.env));

    const adapter = await this.adapter();
    const request: GmApplySafeRequest = {
      ...this.base(input.projectPath, plan.transactionId, plan.allowlist, signal),
      capability: "GM_APPLY_SAFE_V1",
      expectedProjectFingerprint: plan.projectFingerprint,
      expectedHead: plan.expectedHead,
      plan,
      planHash: input.planHash,
      confirm: true,
      dryRun: input.dryRun ?? true,
    };
    const result = await adapter.applySafe(request);
    return {
      ok: true,
      schemaVersion: 1,
      requestId,
      capability: "GM_APPLY_SAFE_V1",
      serverGate: "SAFE_WRITE",
      applied: result.applied,
      dryRun: result.dryRun,
      state: result.state,
      transactionId: result.transactionId,
      planHash: result.planHash,
      manifestSha256: result.manifestSha256,
      changedFiles: [...result.changedFiles],
      rollbackAvailable: result.rollbackAvailable,
      projectFingerprint: result.projectFingerprint,
    };
  }

  async verifyText(input: VerifyTextInput, requestId: PublicRequestId, signal: AbortSignal): Promise<VerifyTextOutput> {
    const plan = input.plan as unknown as GmMutationPlan | undefined;
    if (plan && !input.planHash) {
      throw new GmWriteError("GM_INTERNAL_ERROR", "A supplied plan requires its planHash.", false);
    }
    if (plan && adapterPlanHash(plan) !== input.planHash) {
      throw new GmWriteError("GM_INTERNAL_ERROR", "The supplied planHash does not match the supplied plan.", false);
    }
    const transactionId = plan?.transactionId ?? derivedTransactionId("verify_text", input);
    const adapter = await this.adapter();
    const request: GmVerifyRequest = {
      ...this.base(input.projectPath, transactionId, plan?.allowlist ?? [], signal),
      capability: "GM_VERIFY_V1",
      expectedProjectFingerprint: input.expectedProjectFingerprint,
      levels: ["TEXT_VALID"],
      ...(plan ? { plan, planHash: input.planHash } : {}),
    };
    const result = await adapter.verify(request);
    const outcome = result.levels.TEXT_VALID;
    return {
      ok: true,
      schemaVersion: 1,
      requestId,
      capability: "GM_VERIFY_V1",
      serverGate: "SAFE_WRITE",
      levelsRequested: ["TEXT_VALID"],
      textValid: { passed: outcome?.passed ?? false, detail: outcome?.detail ?? "level was not executed" },
      highestLevel: result.highestLevel,
      rollbackRequired: result.rollbackRequired,
      compilerInvoked: false,
      runtimeInvoked: false,
      transactionId,
    };
  }

  async rollback(input: RollbackInput, requestId: PublicRequestId, signal: AbortSignal): Promise<RollbackOutput> {
    const adapter = await this.adapter();
    const request: GmRollbackRequest = {
      ...this.base(input.projectPath, input.transactionId, [], signal),
      capability: "GM_ROLLBACK_V1",
      expectedProjectFingerprint: input.expectedProjectFingerprint,
      planHash: input.planHash,
      confirm: true,
    };
    const result = await adapter.rollback(request);
    return {
      ok: true,
      schemaVersion: 1,
      requestId,
      capability: "GM_ROLLBACK_V1",
      serverGate: "SAFE_WRITE",
      restored: result.restored,
      byteExact: result.byteExact,
      restoredFiles: [...result.restoredFiles],
      transactionId: result.transactionId,
      projectFingerprint: result.projectFingerprint,
    };
  }

  /**
   * Creates the two files an empty GameMaker project consists of.
   *
   * There is no plan, no fingerprint and no rollback here, because there is no
   * prior state to bind to or restore. The safety that remains is the safety
   * that applies: the path policy, the env-scoped write allowlist, an explicit
   * confirm, and a refusal to touch a directory that already holds anything.
   * Removing a project is not offered -- deleting is the destructive tier's
   * business and this server has none.
   */
  async createProject(input: CreateProjectInput, requestId: PublicRequestId, signal: AbortSignal): Promise<CreateProjectOutput> {
    const projectsDir = await resolveProjectsDir(this.env);
    const projectPath = safeRelativePath(input.projectPath);
    const authored = authorProject(input.name);
    assertWriteAllowed(authored.files.map(({ path }) => path), resolveWriteAllowlist(this.env));

    const target = await resolveInsideRoot(projectsDir, projectPath);
    const existing = await readdir(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing !== null && existing.length > 0) {
      throw new GmWriteError("GM_INVALID_REQUEST", `${projectPath} already contains files; a project is only created in an empty directory.`, true);
    }

    const dryRun = input.dryRun ?? true;
    const files = authored.files.map(({ path, content }) => ({
      path,
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
      size: Buffer.byteLength(content, "utf8"),
    }));

    if (!dryRun) {
      signal.throwIfAborted();
      await mkdir(target, { recursive: true });
      for (const file of authored.files) {
        signal.throwIfAborted();
        // wx: never overwrite, even if something appeared since the check.
        await writeFile(join(target, file.path), file.content, { encoding: "utf8", flag: "wx" });
      }
    }

    return {
      ok: true,
      schemaVersion: 1,
      requestId,
      capability: "GM_CREATE_PROJECT_V1",
      serverGate: "SAFE_WRITE",
      created: !dryRun,
      dryRun,
      projectPath,
      projectFile: authored.projectFile,
      files,
    };
  }
}

export function mapToolError(error: unknown, requestId: PublicRequestId): ToolOutput {
  if (error instanceof GmWriteError) {
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
  // A rejected project name is the caller's to fix, so it keeps its own message.
  if (error instanceof GmAuthoringError) {
    return { ok: false, schemaVersion: 1, requestId, error: { code: error.code, message: error.message, recoverable: true } };
  }
  const type = error instanceof Error ? error.name : typeof error;
  process.stderr.write(`[gamemaker-write-mcp] GM_INTERNAL_ERROR request=${String(requestId)} type=${type}\n`);
  return {
    ok: false,
    schemaVersion: 1,
    requestId,
    error: { code: "GM_INTERNAL_ERROR", message: "The GameMaker request failed closed.", recoverable: false },
  };
}

export type { MutationPlanInput };
