import { basename, isAbsolute } from "node:path";
import { stat } from "node:fs/promises";

import {
  GmAdapterError,
  GovernedGameMakerIdeAdapter,
  type GmAdapterErrorCode,
  type GmVerifyRequest,
  type IgorConfiguration,
} from "@tanguito/devlab-gm-ide-adapter";
import { resolveRealRoot, safeRelativePath } from "@tanguito/devlab-gm-ide-adapter/internal";

import type {
  ToolchainStatusOutput,
  ToolOutput,
  VerifyBuildInput,
  VerifyBuildOutput,
} from "./contracts.js";

export const PROJECTS_DIR_ENV = "DEVLAB_GM_PROJECTS_DIR";
export const IGOR_ENV = "DEVLAB_GM_IGOR";
export const RUNTIME_ENV = "DEVLAB_GM_RUNTIME";
export const PROJECT_TOOL_ENV = "DEVLAB_GM_PROJECT_TOOL";
export const USER_DIR_ENV = "DEVLAB_GM_USER_DIR";
export const ALLOW_IGOR_ENV = "DEVLAB_GM_ALLOW_IGOR";
export const EVIDENCE_ROOT_ENV = "DEVLAB_GM_EVIDENCE_ROOT";
export const TIMEOUT_ENV = "DEVLAB_GM_TIMEOUT_MS";

export const DEFAULT_EVIDENCE_ROOT = ".devlab-gamemaker-mcp-build";
export const DEFAULT_TIMEOUT_MS = 180_000;
export const MIN_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 900_000;

/**
 * Igor is always invoked by the adapter with the `Run` verb, so a build
 * verification compiles AND briefly launches the game. There is no
 * compile-without-run path, and this server does not pretend otherwise.
 * Runtime verification is therefore not a separate, more dangerous tool; it is
 * one extra assertion over the same invocation.
 */
const VERIFICATION_POLICY = Object.freeze({
  projectLoad: true,
  compile: true,
  runtime: "optional" as const,
});

type PublicRequestId = string | number;

export type GmBuildErrorCode =
  | "GM_CONFIG_REQUIRED"
  | "GM_CONFIG_INVALID"
  | "GM_IGOR_NOT_ENABLED"
  | "GM_PLATFORM_UNSUPPORTED"
  | "GM_INTERNAL_ERROR";

export class GmBuildError extends Error {
  constructor(
    readonly code: GmBuildErrorCode,
    message: string,
    readonly recoverable: boolean,
  ) {
    super(message);
    this.name = "GmBuildError";
  }
}

const ADAPTER_PUBLIC_MESSAGES: Readonly<Record<GmAdapterErrorCode, string>> = Object.freeze({
  AUTHZ_PROJECT_ROOT: "The configured project root or project path is not authorized.",
  EXPECTED_HASH_MISMATCH: "The project fingerprint no longer matches the request.",
  EXPECTED_HEAD_MISMATCH: "The project Git HEAD no longer matches the request.",
  PATH_ESCAPE: "A supplied relative path violates the project boundary.",
  FILE_NOT_ALLOWLISTED: "A file is outside the declared allowlist or extension policy.",
  GATE_VIOLATION: "The requested operation is not authorized by the fixed server capability.",
  PLAN_STALE: "The plan binding is stale.",
  MUTATION_NOT_FOUND: "The referenced transaction does not exist.",
  MUTATION_ALREADY_APPLIED: "The referenced transaction was already applied.",
  VERIFICATION_FAILED: "Verification failed.",
  ROLLBACK_UNAVAILABLE: "Rollback evidence is unavailable.",
  ROLLBACK_INCOMPLETE: "Rollback evidence is incomplete.",
  PROCESS_OWNERSHIP: "Process ownership could not be established; the build was refused.",
  RUN_BLOCKED_EXTERNAL_RUNNER: "A GameMaker Runner is already running; close it before building.",
  TIMEOUT: "The build exceeded the configured timeout and the owned process was terminated.",
  CANCELLED: "The build was cancelled and the owned process was terminated.",
  BUSY: "The project is busy.",
  CONCURRENT_MODIFICATION: "The project changed concurrently.",
  LIMIT_EXCEEDED: "The request exceeds the fixed safety limits.",
  REGISTRY_INVALID: "The project registry is invalid.",
  INVALID_REQUEST: "The request does not satisfy the GameMaker adapter contract.",
  ATOMIC_PROMOTION_FAILED: "Atomic promotion failed.",
  COMPILE_FAILED: "Compilation failed.",
});

export function isPlatformSupported(platform: string = process.platform): boolean {
  return platform === "win32";
}

export function igorEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const raw = env[ALLOW_IGOR_ENV];
  return raw === "1" || raw?.toLowerCase() === "true";
}

export function resolveTimeoutMs(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env[TIMEOUT_ENV];
  if (raw === undefined || raw.trim() === "") return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < MIN_TIMEOUT_MS || parsed > MAX_TIMEOUT_MS) {
    throw new GmBuildError("GM_CONFIG_INVALID", `${TIMEOUT_ENV} must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}.`, true);
  }
  return parsed;
}

export function resolveEvidenceRoot(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env[EVIDENCE_ROOT_ENV];
  if (!configured) return DEFAULT_EVIDENCE_ROOT;
  try {
    return safeRelativePath(configured, EVIDENCE_ROOT_ENV);
  } catch {
    throw new GmBuildError("GM_CONFIG_INVALID", `${EVIDENCE_ROOT_ENV} must be a safe relative path under the projects directory.`, true);
  }
}

export async function resolveProjectsDir(env: Readonly<Record<string, string | undefined>> = process.env): Promise<string> {
  const configured = env[PROJECTS_DIR_ENV];
  if (!configured) throw new GmBuildError("GM_CONFIG_REQUIRED", `${PROJECTS_DIR_ENV} must be configured before calling a GameMaker tool.`, true);
  if (!isAbsolute(configured)) throw new GmBuildError("GM_CONFIG_INVALID", `${PROJECTS_DIR_ENV} must identify an existing absolute real directory.`, true);
  try {
    return await resolveRealRoot(configured);
  } catch {
    throw new GmBuildError("GM_CONFIG_INVALID", `${PROJECTS_DIR_ENV} must identify an existing absolute real directory.`, true);
  }
}

/**
 * The toolchain comes only from the environment. No tool contract has a field
 * for an executable, a runtime or a user directory, so a caller cannot point
 * Igor anywhere.
 */
export function resolveToolchain(env: Readonly<Record<string, string | undefined>> = process.env): IgorConfiguration {
  const fields: ReadonlyArray<readonly [string, string]> = [
    [IGOR_ENV, "executable"],
    [RUNTIME_ENV, "runtimePath"],
    [PROJECT_TOOL_ENV, "projectTool"],
    [USER_DIR_ENV, "userDirectory"],
  ];
  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  for (const [variable, field] of fields) {
    const value = env[variable];
    if (!value) { missing.push(variable); continue; }
    if (!isAbsolute(value)) throw new GmBuildError("GM_CONFIG_INVALID", `${variable} must be an absolute path.`, true);
    resolved[field] = value;
  }
  if (missing.length) throw new GmBuildError("GM_CONFIG_REQUIRED", `The Igor toolchain is not configured: ${missing.join(", ")}.`, true);
  if (!/^Igor\.exe$/i.test(basename(resolved.executable!))) throw new GmBuildError("GM_CONFIG_INVALID", `${IGOR_ENV} must point at Igor.exe.`, true);
  if (!/^ProjectTool\.exe$/i.test(basename(resolved.projectTool!))) throw new GmBuildError("GM_CONFIG_INVALID", `${PROJECT_TOOL_ENV} must point at ProjectTool.exe.`, true);
  return Object.freeze({
    executable: resolved.executable!,
    runtimePath: resolved.runtimePath!,
    projectTool: resolved.projectTool!,
    userDirectory: resolved.userDirectory!,
    runtime: "VM",
  });
}

/** Runtime folder name only, e.g. "runtime-2024.14.3.260". Never a full path. */
export function runtimeLabel(runtimePath: string): string {
  return basename(runtimePath);
}

function transactionIdFor(projectPath: string, fingerprint: string): string {
  return `gm-build-${fingerprint.slice(0, 24)}-${safeRelativePath(projectPath).replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40)}`
    .replace(/-+/g, "-")
    .replace(/-$/, "");
}

export class GovernedGameMakerBuildService {
  constructor(
    private readonly env: Readonly<Record<string, string | undefined>> = process.env,
  ) {}

  async toolchainStatus(requestId: PublicRequestId): Promise<ToolchainStatusOutput> {
    const blockers: string[] = [];
    const platformSupported = isPlatformSupported();
    if (!platformSupported) blockers.push("Igor process ownership requires Windows");
    const enabled = igorEnabled(this.env);
    if (!enabled) blockers.push(`${ALLOW_IGOR_ENV} is not enabled`);

    let projectsDirConfigured = false;
    try { await resolveProjectsDir(this.env); projectsDirConfigured = true; } catch { blockers.push(`${PROJECTS_DIR_ENV} is not usable`); }

    let toolchainConfigured = false;
    let toolchainPresent = false;
    let label: string | null = null;
    try {
      const toolchain = resolveToolchain(this.env);
      toolchainConfigured = true;
      label = runtimeLabel(toolchain.runtimePath);
      const checks = await Promise.all(
        [toolchain.executable, toolchain.runtimePath, toolchain.projectTool, toolchain.userDirectory]
          .map((path) => stat(path).then(() => true).catch(() => false)),
      );
      toolchainPresent = checks.every(Boolean);
      if (!toolchainPresent) blockers.push("a configured toolchain path does not exist on disk");
    } catch {
      blockers.push("the Igor toolchain is not configured");
    }

    let timeoutMs = DEFAULT_TIMEOUT_MS;
    try { timeoutMs = resolveTimeoutMs(this.env); } catch { blockers.push(`${TIMEOUT_ENV} is invalid`); }

    return {
      ok: true,
      schemaVersion: 1,
      requestId,
      serverGate: "READ_ONLY",
      platformSupported,
      igorEnabled: enabled,
      projectsDirConfigured,
      toolchainConfigured,
      toolchainPresent,
      runtimeLabel: label,
      timeoutMs,
      blockers,
    };
  }

  async verifyBuild(input: VerifyBuildInput, requestId: PublicRequestId, signal: AbortSignal): Promise<VerifyBuildOutput> {
    if (!isPlatformSupported()) {
      throw new GmBuildError("GM_PLATFORM_UNSUPPORTED", "Igor build verification requires Windows process ownership.", false);
    }
    if (!igorEnabled(this.env)) {
      throw new GmBuildError("GM_IGOR_NOT_ENABLED", `Set ${ALLOW_IGOR_ENV}=1 to allow this server to start Igor and launch the game.`, true);
    }
    const projectsDir = await resolveProjectsDir(this.env);
    const igor = resolveToolchain(this.env);
    const timeoutMs = resolveTimeoutMs(this.env);
    const evidenceRoot = resolveEvidenceRoot(this.env);
    const projectPath = safeRelativePath(input.projectPath, "projectPath");
    if (evidenceRoot === projectPath || evidenceRoot.startsWith(`${projectPath}/`)) {
      throw new GmBuildError("GM_CONFIG_INVALID", `${EVIDENCE_ROOT_ENV} must resolve outside the project being built.`, true);
    }

    const adapter = new GovernedGameMakerIdeAdapter(projectsDir);
    const transactionId = transactionIdFor(projectPath, input.expectedProjectFingerprint);
    const levels = input.expectedRuntimeSignal
      ? (["TEXT_VALID", "PROJECT_LOAD_VALID", "COMPILE_VALID", "RUNTIME_VALID"] as const)
      : (["TEXT_VALID", "PROJECT_LOAD_VALID", "COMPILE_VALID"] as const);

    const request: GmVerifyRequest = {
      capability: "GM_VERIFY_V1",
      projectRoot: projectPath,
      expectedProjectFingerprint: input.expectedProjectFingerprint,
      expectedHead: null,
      allowlist: [],
      transactionId,
      timeoutMs,
      cancellation: signal,
      verificationPolicy: VERIFICATION_POLICY,
      evidenceRoot,
      levels: [...levels],
      igor,
      ...(input.expectedRuntimeSignal ? { expectedRuntimeSignal: input.expectedRuntimeSignal } : {}),
    };

    const result = await adapter.verify(request);
    const outcome = (name: keyof typeof result.levels) => {
      const value = result.levels[name];
      return value ? { passed: value.passed, detail: value.detail } : undefined;
    };
    return {
      ok: true,
      schemaVersion: 1,
      requestId,
      capability: "GM_VERIFY_V1",
      serverGate: "RUN",
      igorInvoked: true,
      compileExitCode: result.compileExitCode,
      levels: {
        ...(outcome("TEXT_VALID") ? { TEXT_VALID: outcome("TEXT_VALID")! } : {}),
        ...(outcome("PROJECT_LOAD_VALID") ? { PROJECT_LOAD_VALID: outcome("PROJECT_LOAD_VALID")! } : {}),
        ...(outcome("COMPILE_VALID") ? { COMPILE_VALID: outcome("COMPILE_VALID")! } : {}),
        ...(outcome("RUNTIME_VALID") ? { RUNTIME_VALID: outcome("RUNTIME_VALID")! } : {}),
      },
      highestLevel: result.highestLevel,
      runtimeObserved: result.runtimeObserved,
      ownedProcessCount: result.ownedPids.length,
      rollbackRequired: result.rollbackRequired,
      evidencePath: result.evidencePath,
      transactionId,
    };
  }
}

export function mapToolError(error: unknown, requestId: PublicRequestId): ToolOutput {
  if (error instanceof GmBuildError) {
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
  process.stderr.write(`[gamemaker-compile-mcp] GM_INTERNAL_ERROR request=${String(requestId)} type=${type}\n`);
  return {
    ok: false,
    schemaVersion: 1,
    requestId,
    error: { code: "GM_INTERNAL_ERROR", message: "The GameMaker build request failed closed.", recoverable: false },
  };
}
