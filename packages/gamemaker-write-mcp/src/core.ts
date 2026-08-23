import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
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
  isSameOrDescendantFilesystemPath,
  readTransactionEvidence,
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
const WRITE_PLAN_EXTENSIONS = Object.freeze(["gml", "json", "resource_order", "yy", "yyp"]);
const WRITE_PLAN_EXTENSION_SET = new Set<string>(WRITE_PLAN_EXTENSIONS);
const CREATE_CLAIM_NAME = ".devlab-create-claim.json";
const CREATE_FINALIZING_NAME = ".devlab-create-finalizing.json";
const CREATE_LEDGER_DIR = "create-projects";

type CreateFileBinding = Readonly<{ path: string; sha256: string; size: number }>;
type CreateRequestBinding = Readonly<{
  projectPath: string;
  name: string;
  confirm: true;
  dryRun: false;
}>;
type CreateClaim = Readonly<{
  schemaVersion: 1;
  kind: "DEVLAB_GM_CREATE_CLAIM";
  nonce: string;
  request: CreateRequestBinding;
  parentIdentity: string;
  targetIdentity: string;
  ledgerIdentity: string;
  files: readonly CreateFileBinding[];
}>;
type CreateFinalizing = Readonly<{
  schemaVersion: 1;
  kind: "DEVLAB_GM_CREATE_FINALIZING";
  claim: CreateClaim;
}>;
type CreateLedgerRecord = Readonly<{
  schemaVersion: 1;
  kind: "DEVLAB_GM_CREATE_LEDGER";
  state: "PREPARING" | "COMPLETED";
  claim: CreateClaim;
}>;

async function realDirectoryIdentity(path: string): Promise<string> {
  const canonical = await resolveRealRoot(path); const info = await lstat(canonical, { bigint: true });
  const physicalPath = canonical.replace(/\\/g, "/").replace(/\/+$/, "");
  return `${process.platform}:${info.dev.toString()}:${info.ino.toString()}:${process.platform === "win32" ? physicalPath.toLowerCase() : physicalPath}`;
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCreateClaim(bytes: Buffer): CreateClaim | null {
  try {
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "kind", "nonce", "request", "parentIdentity", "targetIdentity", "ledgerIdentity", "files"])) return null;
    if (value.schemaVersion !== 1 || value.kind !== "DEVLAB_GM_CREATE_CLAIM" || typeof value.nonce !== "string" || !/^[0-9a-f-]{36}$/i.test(value.nonce)) return null;
    if (typeof value.parentIdentity !== "string" || !value.parentIdentity || typeof value.targetIdentity !== "string" || !value.targetIdentity || typeof value.ledgerIdentity !== "string" || !value.ledgerIdentity) return null;
    if (!isRecord(value.request) || !hasExactKeys(value.request, ["projectPath", "name", "confirm", "dryRun"])) return null;
    if (typeof value.request.projectPath !== "string" || typeof value.request.name !== "string" || value.request.confirm !== true || value.request.dryRun !== false) return null;
    if (!Array.isArray(value.files) || value.files.length === 0) return null;
    const files: CreateFileBinding[] = [];
    for (const file of value.files) {
      if (!isRecord(file) || !hasExactKeys(file, ["path", "sha256", "size"])) return null;
      if (typeof file.path !== "string" || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || (file.size as number) < 0) return null;
      files.push({ path: file.path, sha256: file.sha256, size: file.size as number });
    }
    const claim: CreateClaim = {
      schemaVersion: 1,
      kind: "DEVLAB_GM_CREATE_CLAIM",
      nonce: value.nonce,
      request: {
        projectPath: value.request.projectPath,
        name: value.request.name,
        confirm: true,
        dryRun: false,
      },
      parentIdentity: value.parentIdentity,
      targetIdentity: value.targetIdentity,
      ledgerIdentity: value.ledgerIdentity,
      files,
    };
    return bytes.equals(jsonBytes(claim)) ? claim : null;
  } catch {
    return null;
  }
}

function parseCreateFinalizing(bytes: Buffer): CreateFinalizing | null {
  try {
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "kind", "claim"]) || value.schemaVersion !== 1 || value.kind !== "DEVLAB_GM_CREATE_FINALIZING") return null;
    const claimBytes = jsonBytes(value.claim);
    const claim = parseCreateClaim(claimBytes);
    if (!claim) return null;
    const finalizing: CreateFinalizing = { schemaVersion: 1, kind: "DEVLAB_GM_CREATE_FINALIZING", claim };
    return bytes.equals(jsonBytes(finalizing)) ? finalizing : null;
  } catch {
    return null;
  }
}

function createLedgerBytes(state: CreateLedgerRecord["state"], claim: CreateClaim): Buffer {
  return jsonBytes({ schemaVersion: 1, kind: "DEVLAB_GM_CREATE_LEDGER", state, claim } satisfies CreateLedgerRecord);
}

function parseCreateLedger(bytes: Buffer, expectedState: CreateLedgerRecord["state"]): CreateLedgerRecord | null {
  try {
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "kind", "state", "claim"]) || value.schemaVersion !== 1 || value.kind !== "DEVLAB_GM_CREATE_LEDGER" || value.state !== expectedState) return null;
    const claim = parseCreateClaim(jsonBytes(value.claim));
    if (!claim) return null;
    const record: CreateLedgerRecord = { schemaVersion: 1, kind: "DEVLAB_GM_CREATE_LEDGER", state: expectedState, claim };
    return bytes.equals(jsonBytes(record)) ? record : null;
  } catch {
    return null;
  }
}

function phaseName(index: number): string {
  return `.devlab-create-phase-${index.toString().padStart(4, "0")}.json`;
}

function phaseBytes(claim: CreateClaim, index: number): Buffer {
  return jsonBytes({
    schemaVersion: 1,
    kind: "DEVLAB_GM_CREATE_WRITING",
    nonce: claim.nonce,
    index,
    file: claim.files[index],
  });
}

async function readIfPresent(path: string): Promise<Buffer | null> {
  const before = await lstat(path, { bigint: true }).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (before === null) return null;
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new GmWriteError("GM_INVALID_REQUEST", "A project creation entry changed type unexpectedly.", true);
  }
  const bytes = await readFile(path);
  const after = await lstat(path, { bigint: true });
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
    throw new GmWriteError("GM_INVALID_REQUEST", "A project creation entry changed unexpectedly.", true);
  }
  return bytes;
}

async function syncDirectoryPortable(path: string): Promise<void> {
  // Windows does not expose portable directory fsync through Node. File data is
  // still synced there; POSIX directory entries are synced where supported.
  if (process.platform === "win32") return;
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  } finally {
    await handle.close();
  }
}

async function ensureDurableDirectory(root: string, relativePath: string): Promise<string> {
  const parts = safeRelativePath(relativePath).split("/");
  let current = await resolveRealRoot(root);
  const prefix: string[] = [];
  for (const part of parts) {
    prefix.push(part);
    const candidate = await resolveInsideRoot(root, prefix.join("/"));
    let created = false;
    try {
      await mkdir(candidate, { recursive: false });
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = await lstat(candidate);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new GmWriteError("GM_CONFIG_INVALID", "The creation evidence directory must be a real directory.", true);
    }
    const verified = await resolveInsideRoot(root, prefix.join("/"), { existing: true });
    if (created) await syncDirectoryPortable(current);
    current = verified;
  }
  return current;
}

function relativePathIdentity(path: string): string {
  return path.normalize("NFKC").toLowerCase();
}

function relativePathsOverlap(left: string, right: string): boolean {
  const a = relativePathIdentity(left);
  const b = relativePathIdentity(right);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function creationLedgerKey(projectPath: string, parentIdentity: string): string {
  return createHash("sha256").update(jsonBytes({
    schemaVersion: 1,
    projectPath: relativePathIdentity(projectPath),
    parentIdentity,
  })).digest("hex");
}

async function writeDurableExclusive(path: string, bytes: Buffer, mode = 0o600): Promise<void> {
  const handle = await open(path, "wx", mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function exactFile(path: string, expected: CreateFileBinding): Promise<"missing" | "exact" | "different"> {
  const bytes = await readIfPresent(path);
  if (bytes === null) return "missing";
  if (bytes.length !== expected.size) return "different";
  return createHash("sha256").update(bytes).digest("hex") === expected.sha256 ? "exact" : "different";
}

async function assertHardLinkSupport(ledgerDir: string, ledgerKey: string): Promise<void> {
  const nonce = randomUUID();
  const source = join(ledgerDir, `${ledgerKey}.link-probe-${nonce}.source`);
  const destination = join(ledgerDir, `${ledgerKey}.link-probe-${nonce}.destination`);
  const bytes = Buffer.from("DEVLAB_CREATE_LINK_PROBE", "ascii");
  await writeDurableExclusive(source, bytes);
  try {
    await link(source, destination);
    await syncDirectoryPortable(ledgerDir);
  } catch {
    throw new GmWriteError("GM_CONFIG_INVALID", "Create-only hard-link promotion is unavailable on the configured filesystem.", true);
  } finally {
    const sourceBytes = await readIfPresent(source);
    if (sourceBytes !== null && sourceBytes.equals(bytes)) await unlinkExactMetadata(source, bytes, ledgerDir);
    const destinationBytes = await readIfPresent(destination);
    if (destinationBytes !== null && destinationBytes.equals(bytes)) await unlinkExactMetadata(destination, bytes, ledgerDir);
  }
}

async function stageAndLinkBytes(
  ledgerDir: string,
  ledgerKey: string,
  label: string,
  destination: string,
  destinationDirectory: string,
  content: Buffer,
  mode: number,
): Promise<void> {
  const stage = join(ledgerDir, `${ledgerKey}.${label}.${randomUUID()}.stage`);
  await writeDurableExclusive(stage, content, mode);
  await syncDirectoryPortable(ledgerDir);
  try {
    await link(stage, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw new GmWriteError("GM_CONFIG_INVALID", "Create-only hard-link promotion is unavailable on the configured filesystem.", true);
    }
    const present = await readIfPresent(destination);
    if (present === null || !present.equals(content)) {
      throw new GmWriteError("GM_INVALID_REQUEST", "A create-only destination already exists with different authority or bytes.", true);
    }
  }
  await syncDirectoryPortable(destinationDirectory);
  const promoted = await readIfPresent(destination);
  if (promoted === null || !promoted.equals(content)) {
    throw new GmWriteError("GM_INVALID_REQUEST", "A create-only destination changed during atomic promotion.", true);
  }
  const staged = await readIfPresent(stage);
  if (staged !== null && staged.equals(content)) {
    await unlinkExactMetadata(stage, content, ledgerDir);
  }
}

async function stageAndLinkCreateFile(
  ledgerDir: string,
  ledgerKey: string,
  index: number,
  destination: string,
  target: string,
  content: Buffer,
  expected: CreateFileBinding,
): Promise<void> {
  // Content is made durable outside the project first. A process or power loss
  // can therefore leave only an evidence-stage fragment, never a partially
  // authored GameMaker file. The hard link is create-only and atomic.
  await stageAndLinkBytes(ledgerDir, ledgerKey, `file-${index.toString().padStart(4, "0")}`, destination, target, content, 0o666);
  if (await exactFile(destination, expected) !== "exact") {
    throw new GmWriteError("GM_INVALID_REQUEST", "A project file changed during create-only promotion.", true);
  }
}

async function unlinkExactMetadata(path: string, expected: Buffer, directory: string): Promise<void> {
  const before = await lstat(path, { bigint: true }).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (!before?.isFile() || before.isSymbolicLink() || !(await readFile(path)).equals(expected)) {
    throw new GmWriteError("GM_INVALID_REQUEST", "Project creation metadata changed unexpectedly.", true);
  }
  const after = await lstat(path, { bigint: true });
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
    throw new GmWriteError("GM_INVALID_REQUEST", "Project creation metadata changed unexpectedly.", true);
  }
  await unlink(path);
  await syncDirectoryPortable(directory);
}

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

/** A plan hash proves coherence, not provenance. This fixed policy is the
 * server-side authority a caller-controlled plan can never widen. */
export function assertFixedWritePathPolicy(paths: readonly string[]): void {
  const identities = new Set<string>();
  for (const candidate of paths) {
    const path = safeRelativePath(candidate); const identity = path.normalize("NFKC").toLowerCase();
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    if (!WRITE_PLAN_EXTENSION_SET.has(extension)) throw new GmWriteError("GM_WRITE_NOT_ALLOWED", "The write tier refuses a file type outside the fixed text-write policy.", false);
    if (identities.has(identity)) throw new GmWriteError("GM_INVALID_REQUEST", "The write tier refuses duplicate file path identities.", false);
    identities.add(identity);
  }
}

export function assertFixedWritePlanPolicy(plan: GmMutationPlan): void {
  const declared = plan.allowedExtensions.map((extension) => extension.toLowerCase());
  if (declared.some((extension) => !WRITE_PLAN_EXTENSION_SET.has(extension))) {
    throw new GmWriteError("GM_WRITE_NOT_ALLOWED", "The plan requests a file type outside the fixed text-write policy.", false);
  }
  assertFixedWritePathPolicy(plan.files.map(({ path }) => path));
  const pathIdentity = (path: string): string => path.normalize("NFKC").toLowerCase();
  const plannedPaths = new Map<string, string>();
  for (const file of plan.files) {
    const path = safeRelativePath(file.path);
    const identity = pathIdentity(path);
    if (plannedPaths.has(identity)) {
      throw new GmWriteError("GM_INVALID_REQUEST", "The plan contains duplicate file path identities.", false);
    }
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    if (!WRITE_PLAN_EXTENSION_SET.has(extension)) {
      throw new GmWriteError("GM_WRITE_NOT_ALLOWED", "The plan requests a file type outside the fixed text-write policy.", false);
    }
    if ((file.action === "modify") !== (file.beforeSha256 !== null)) {
      throw new GmWriteError("GM_INVALID_REQUEST", "The planned action does not match the recorded before state.", false);
    }
    const bytes = Buffer.from(file.afterContentBase64, "base64");
    if (bytes.toString("base64") !== file.afterContentBase64) {
      throw new GmWriteError("GM_WRITE_NOT_ALLOWED", "The write tier accepts only canonical base64 payloads.", false);
    }
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new GmWriteError("GM_WRITE_NOT_ALLOWED", "The write tier accepts only valid UTF-8 text content.", false); }
    if (text.includes("\0")) throw new GmWriteError("GM_WRITE_NOT_ALLOWED", "The write tier accepts only text content without NUL bytes.", false);
    plannedPaths.set(identity, path);
  }
  const allowlist = new Map<string, string>();
  for (const candidate of plan.allowlist) {
    const path = safeRelativePath(candidate, "allowlist"); const extension = path.split(".").pop()?.toLowerCase() ?? "";
    if (!WRITE_PLAN_EXTENSION_SET.has(extension)) throw new GmWriteError("GM_WRITE_NOT_ALLOWED", "The plan allowlist requests a file type outside the fixed text-write policy.", false);
    const identity = pathIdentity(path);
    if (allowlist.has(identity)) throw new GmWriteError("GM_INVALID_REQUEST", "The plan allowlist contains duplicate path identities.", false);
    allowlist.set(identity, path);
  }
  if (plannedPaths.size !== allowlist.size || [...plannedPaths.keys()].some((identity) => !allowlist.has(identity))) {
    throw new GmWriteError("GM_INVALID_REQUEST", "The plan allowlist must exactly match the planned files.", false);
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
    assertFixedWritePlanPolicy(plan);
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
    const serverAllowlist = resolveWriteAllowlist(this.env);
    const projectsDir = await resolveProjectsDir(this.env);
    const evidenceRoot = resolveEvidenceRoot(this.env);
    const transaction = await readTransactionEvidence(projectsDir, evidenceRoot, input.projectPath, input.transactionId);
    if (transaction.planHash !== input.planHash) throw new GmAdapterError("ROLLBACK_UNAVAILABLE", "transaction plan binding is invalid", false);
    const transactionPaths = transaction.files;
    assertFixedWritePathPolicy(transactionPaths);
    assertWriteAllowed(transactionPaths, serverAllowlist);
    const adapter = await this.adapter();
    const request: GmRollbackRequest = {
      ...this.base(input.projectPath, input.transactionId, transactionPaths, signal),
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
   * confirm, and a refusal to touch any path that already exists.
   * Removing a project is not offered -- deleting is the destructive tier's
   * business and this server has none.
  */
  async createProject(input: CreateProjectInput, requestId: PublicRequestId, signal: AbortSignal): Promise<CreateProjectOutput> {
    if (input.confirm !== true) {
      throw new GmWriteError("GM_INVALID_REQUEST", "Project creation requires explicit confirm=true.", true);
    }
    const projectsDir = await resolveProjectsDir(this.env);
    const projectPath = safeRelativePath(input.projectPath);
    const authored = authorProject(input.name);
    assertWriteAllowed(authored.files.map(({ path }) => path), resolveWriteAllowlist(this.env));
    const projectParts = projectPath.split("/");
    const parentRelative = projectParts.slice(0, -1).join("/");
    const parent = parentRelative
      ? await resolveInsideRoot(projectsDir, parentRelative, { existing: true })
      : projectsDir;
    const parentInfo = await lstat(parent);
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
      throw new GmWriteError("GM_INVALID_REQUEST", "The new project's parent must be an existing real directory.", true);
    }
    const parentIdentity = await realDirectoryIdentity(parent);

    const dryRun = input.dryRun ?? true;
    const files = authored.files.map(({ path, content }) => ({
      path,
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
      size: Buffer.byteLength(content, "utf8"),
    }));
    const requestBinding: CreateRequestBinding = {
      projectPath: input.projectPath,
      name: input.name,
      confirm: true,
      dryRun: false,
    };
    const target = await resolveInsideRoot(projectsDir, projectPath);
    const existing = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    if (dryRun) {
      if (existing !== null) {
        throw new GmWriteError("GM_INVALID_REQUEST", `${projectPath} already exists; a project is only created at an absent path.`, true);
      }
    } else {
      signal.throwIfAborted();
      const evidenceRelative = resolveEvidenceRoot(this.env);
      const ledgerRelative = `${evidenceRelative}/${CREATE_LEDGER_DIR}`;
      if (relativePathsOverlap(projectPath, evidenceRelative)
        || await isSameOrDescendantFilesystemPath(projectsDir, projectPath, evidenceRelative)
        || await isSameOrDescendantFilesystemPath(projectsDir, evidenceRelative, projectPath)) {
        throw new GmWriteError("GM_CONFIG_INVALID", "Project creation evidence must remain outside the project target.", true);
      }
      const ledgerKey = creationLedgerKey(projectPath, parentIdentity);
      let ledgerDir = await resolveInsideRoot(projectsDir, ledgerRelative);
      let ledgerPath = join(ledgerDir, `${ledgerKey}.preparing.json`);
      let completedLedgerPath = join(ledgerDir, `${ledgerKey}.completed.json`);
      const claimPath = join(target, CREATE_CLAIM_NAME);
      const finalizingPath = join(target, CREATE_FINALIZING_NAME);
      const expectedFileNames = new Set(files.map((file) => file.path));
      if (expectedFileNames.size !== files.length || [...expectedFileNames].some((path) => path.includes("/"))) {
        throw new GmWriteError("GM_INTERNAL_ERROR", "Project authoring returned an unsupported file layout.", false);
      }

      const refuseClaim = (): never => {
        throw new GmWriteError("GM_INVALID_REQUEST", "The existing project creation claim is not authorized for this request.", true);
      };
      const assertClaimBinding = async (claim: CreateClaim): Promise<void> => {
        if (JSON.stringify(claim.request) !== JSON.stringify(requestBinding) || JSON.stringify(claim.files) !== JSON.stringify(files)) refuseClaim();
        if (await realDirectoryIdentity(parent) !== claim.parentIdentity || await realDirectoryIdentity(target) !== claim.targetIdentity || await realDirectoryIdentity(ledgerDir) !== claim.ledgerIdentity) refuseClaim();
        const ledger = await readIfPresent(ledgerPath);
        if (ledger === null || !ledger.equals(createLedgerBytes("PREPARING", claim))) refuseClaim();
        const completedLedger = await readIfPresent(completedLedgerPath);
        if (completedLedger !== null && !completedLedger.equals(createLedgerBytes("COMPLETED", claim))) refuseClaim();
      };

      let claim: CreateClaim;
      let finalizing = false;
      let completed = false;
      let completedReceipt = false;
      if (existing === null) {
        ledgerDir = await ensureDurableDirectory(projectsDir, ledgerRelative);
        ledgerPath = join(ledgerDir, `${ledgerKey}.preparing.json`);
        completedLedgerPath = join(ledgerDir, `${ledgerKey}.completed.json`);
        if (await readIfPresent(ledgerPath) !== null || await readIfPresent(completedLedgerPath) !== null) refuseClaim();
        const [parentVolume, ledgerVolume] = await Promise.all([
          lstat(parent, { bigint: true }),
          lstat(ledgerDir, { bigint: true }),
        ]);
        if (parentVolume.dev !== ledgerVolume.dev) {
          throw new GmWriteError("GM_CONFIG_INVALID", "Creation evidence and the target parent must use the same filesystem.", true);
        }
        await assertHardLinkSupport(ledgerDir, ledgerKey);
        // mkdir is the portable no-clobber claim. A crash between mkdir and the
        // external authority record leaves an unowned empty directory which is
        // preserved and refused on retry; no portable Node primitive can make
        // those two acts atomic.
        await (input as CreateProjectInput & { beforeClaim?: () => Promise<void> }).beforeClaim?.();
        try {
          await mkdir(target, { recursive: false });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new GmWriteError("GM_INVALID_REQUEST", `${projectPath} appeared during project creation.`, true);
          }
          throw error;
        }
        await syncDirectoryPortable(parent);
        const targetIdentity = await realDirectoryIdentity(target);
        const ledgerIdentity = await realDirectoryIdentity(ledgerDir);
        if (await realDirectoryIdentity(parent) !== parentIdentity) {
          throw new GmWriteError("GM_INVALID_REQUEST", "The new project's parent changed during creation.", true);
        }
        claim = {
          schemaVersion: 1,
          kind: "DEVLAB_GM_CREATE_CLAIM",
          nonce: randomUUID(),
          request: requestBinding,
          parentIdentity,
          targetIdentity,
          ledgerIdentity,
          files,
        };
        // This external, server-owned record is the authority. The marker in
        // the target is deliberately secondary and cannot bootstrap a write by
        // itself, even if a project actor forges every calculable field.
        await stageAndLinkBytes(ledgerDir, ledgerKey, "authority-preparing", ledgerPath, ledgerDir, createLedgerBytes("PREPARING", claim), 0o600);
        if ((input as CreateProjectInput & { faultAt?: string }).faultAt === "after-external-authority") {
          throw new GmWriteError("GM_INTERNAL_ERROR", "Injected project creation failure.", true);
        }
        await stageAndLinkBytes(ledgerDir, ledgerKey, "claim", claimPath, target, jsonBytes(claim), 0o600);
      } else {
        if (!existing.isDirectory() || existing.isSymbolicLink()) refuseClaim();
        const ledgerInfo = await lstat(ledgerDir).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
        if (!ledgerInfo?.isDirectory() || ledgerInfo.isSymbolicLink()) refuseClaim();
        ledgerDir = await resolveInsideRoot(projectsDir, ledgerRelative, { existing: true });
        ledgerPath = join(ledgerDir, `${ledgerKey}.preparing.json`);
        completedLedgerPath = join(ledgerDir, `${ledgerKey}.completed.json`);
        const ledgerMarker = await readIfPresent(ledgerPath) ?? refuseClaim();
        const authoritative = parseCreateLedger(ledgerMarker, "PREPARING") ?? refuseClaim();
        claim = authoritative.claim;
        const completedLedgerMarker = await readIfPresent(completedLedgerPath);
        if (completedLedgerMarker !== null) {
          const terminal = parseCreateLedger(completedLedgerMarker, "COMPLETED") ?? refuseClaim();
          if (!jsonBytes(terminal.claim).equals(jsonBytes(claim))) refuseClaim();
          completedReceipt = true;
        }
        await assertClaimBinding(claim);
        const [claimMarker, finalizingMarker] = await Promise.all([
          readIfPresent(claimPath),
          readIfPresent(finalizingPath),
        ]);
        if (finalizingMarker !== null) {
          const parsed = parseCreateFinalizing(finalizingMarker);
          if (!parsed || !jsonBytes(parsed.claim).equals(jsonBytes(claim))) refuseClaim();
          finalizing = true;
          if (claimMarker !== null) {
            const base = parseCreateClaim(claimMarker);
            if (!base || !claimMarker.equals(jsonBytes(claim))) refuseClaim();
          }
        } else if (claimMarker !== null) {
          if (completedReceipt) refuseClaim();
          const parsed = parseCreateClaim(claimMarker);
          if (!parsed || !claimMarker.equals(jsonBytes(claim))) refuseClaim();
        } else {
          // The external authority is retained as a terminal receipt. If the
          // final marker was removed just before a crash or a lost response,
          // the exact completed project can be acknowledged idempotently.
          const entries = (await readdir(target)).sort();
          if (!completedReceipt && entries.length === 0) {
            // The authority record was published but the secondary target
            // marker was not. Recreate only that exact marker and resume.
            await stageAndLinkBytes(ledgerDir, ledgerKey, "claim-resume", claimPath, target, jsonBytes(claim), 0o600);
          } else if (completedReceipt) {
            if (JSON.stringify(entries) !== JSON.stringify([...expectedFileNames].sort())) refuseClaim();
            for (const file of files) if (await exactFile(join(target, file.path), file) !== "exact") refuseClaim();
            completed = true;
          } else refuseClaim();
        }
      }
      await assertClaimBinding(claim);
      const claimMarkerBytes = jsonBytes(claim);
      const finalizingMarkerBytes = jsonBytes({ schemaVersion: 1, kind: "DEVLAB_GM_CREATE_FINALIZING", claim } satisfies CreateFinalizing);

      const inspectPreparing = async (): Promise<{ phaseCount: number; states: readonly ("missing" | "exact")[] }> => {
        await assertClaimBinding(claim);
        const marker = await readIfPresent(claimPath);
        if (marker === null || !marker.equals(claimMarkerBytes) || await readIfPresent(finalizingPath) !== null) refuseClaim();
        const entries = await readdir(target);
        const allowed = new Set([CREATE_CLAIM_NAME, ...files.map((_, index) => phaseName(index)), ...expectedFileNames]);
        if (entries.some((entry) => !allowed.has(entry))) refuseClaim();

        let phaseCount = 0;
        let sawGap = false;
        for (const [index] of files.entries()) {
          const phase = await readIfPresent(join(target, phaseName(index)));
          if (phase === null) {
            sawGap = true;
          } else {
            if (sawGap || !phase.equals(phaseBytes(claim, index))) refuseClaim();
            phaseCount += 1;
          }
        }
        const states: ("missing" | "exact")[] = [];
        for (const [index, file] of files.entries()) {
          const state = await exactFile(join(target, file.path), file);
          if (state === "different") return refuseClaim();
          // Only the most recent durable WRITING record may authorize a file
          // that is still missing. A file without its record is foreign even if
          // its bytes happen to have the expected digest.
          if (index < phaseCount - 1 && state !== "exact") refuseClaim();
          if (index >= phaseCount && state !== "missing") refuseClaim();
          states.push(state);
        }
        return { phaseCount, states };
      };

      const inspectFinalizing = async (): Promise<ReadonlySet<string>> => {
        await assertClaimBinding(claim);
        const finalMarker = await readIfPresent(finalizingPath);
        if (finalMarker === null || !finalMarker.equals(finalizingMarkerBytes)) refuseClaim();
        const entries = await readdir(target);
        const allowed = new Set([CREATE_CLAIM_NAME, CREATE_FINALIZING_NAME, ...files.map((_, index) => phaseName(index)), ...expectedFileNames]);
        if (entries.some((entry) => !allowed.has(entry))) refuseClaim();
        const base = await readIfPresent(claimPath);
        if (base !== null && !base.equals(claimMarkerBytes)) refuseClaim();
        for (const [index, file] of files.entries()) {
          const phase = await readIfPresent(join(target, phaseName(index)));
          if (phase !== null && !phase.equals(phaseBytes(claim, index))) refuseClaim();
          if (await exactFile(join(target, file.path), file) !== "exact") refuseClaim();
        }
        return new Set(entries);
      };

      if (!finalizing && !completed) {
        for (const [index, file] of authored.files.entries()) {
          signal.throwIfAborted();
          let inspected = await inspectPreparing();
          if (inspected.phaseCount < index || inspected.phaseCount > index + 1) refuseClaim();
          if (inspected.phaseCount === index) {
            await stageAndLinkBytes(
              ledgerDir,
              ledgerKey,
              `phase-${index.toString().padStart(4, "0")}`,
              join(target, phaseName(index)),
              target,
              phaseBytes(claim, index),
              0o600,
            );
            inspected = await inspectPreparing();
            if ((input as CreateProjectInput & { faultAt?: string }).faultAt === "after-first-write-phase" && index === 0) {
              throw new GmWriteError("GM_INTERNAL_ERROR", "Injected project creation failure.", true);
            }
          }
          if (inspected.phaseCount !== index + 1) refuseClaim();
          if (inspected.states[index] === "missing") {
            const destination = await resolveInsideRoot(projectsDir, `${projectPath}/${safeRelativePath(file.path)}`);
            await assertClaimBinding(claim);
            await stageAndLinkCreateFile(
              ledgerDir,
              ledgerKey,
              index,
              destination,
              target,
              Buffer.from(file.content, "utf8"),
              files[index]!,
            );
          }
          inspected = await inspectPreparing();
          if (inspected.states[index] !== "exact") refuseClaim();
          if ((input as CreateProjectInput & { faultAt?: string }).faultAt === "after-first-staged-file" && index === 0) {
            throw new GmWriteError("GM_INTERNAL_ERROR", "Injected project creation failure.", true);
          }
        }
        const ready = await inspectPreparing();
        if (ready.phaseCount !== files.length || ready.states.some((state) => state !== "exact")) refuseClaim();
        await stageAndLinkBytes(ledgerDir, ledgerKey, "finalizing", finalizingPath, target, finalizingMarkerBytes, 0o600);
        finalizing = true;
      }

      if (finalizing) {
        for (const [index] of files.entries()) {
          const entries = await inspectFinalizing();
          const name = phaseName(index);
          if (entries.has(name)) await unlinkExactMetadata(join(target, name), phaseBytes(claim, index), target);
        }
        let entries = await inspectFinalizing();
        if (entries.has(CREATE_CLAIM_NAME)) await unlinkExactMetadata(claimPath, claimMarkerBytes, target);
        entries = await inspectFinalizing();
        const expectedBeforeCommit = [...expectedFileNames, CREATE_FINALIZING_NAME].sort();
        if (JSON.stringify([...entries].sort()) !== JSON.stringify(expectedBeforeCommit)) refuseClaim();
        if (!completedReceipt) {
          await stageAndLinkBytes(
            ledgerDir,
            ledgerKey,
            "authority-completed",
            completedLedgerPath,
            ledgerDir,
            createLedgerBytes("COMPLETED", claim),
            0o600,
          );
          completedReceipt = true;
        }
        await assertClaimBinding(claim);
        await unlinkExactMetadata(finalizingPath, finalizingMarkerBytes, target);
        if ((input as CreateProjectInput & { faultAt?: string }).faultAt === "after-final-marker-removal") {
          throw new GmWriteError("GM_INTERNAL_ERROR", "Injected project creation failure.", true);
        }
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
