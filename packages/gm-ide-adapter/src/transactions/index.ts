import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { copyFile, link, mkdir, open, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import type { GmApplyResult, GmApplySafeRequest, GmMutationPlan, GmRollbackRequest, GmRollbackResult } from "../contracts/index.js";
import { GmAdapterError, fail } from "../errors/index.js";
import { inspectProject } from "../inspection/index.js";
import {
  isSameOrDescendantFilesystemPath,
  resolveInsideRoot,
  safeAllowedExtensions,
  safeRelativePath,
  safeTransactionId,
} from "../paths/index.js";
import type { ProcessInventory } from "../processes/index.js";
import { planHash as hashPlan } from "../planning/index.js";
import { canonicalBytes, canonicalHash, sha256 } from "./canonical.js";

interface TransactionFile { readonly path: string; readonly action: "modify" | "create"; readonly beforeSha256: string | null; readonly afterSha256: string; readonly backupPath: string | null; readonly stagingPath: string }
interface TransactionManifest { readonly schemaVersion: 1; readonly transactionId: string; readonly projectRoot: string; readonly operation: "apply-safe"; readonly gate: "SAFE_WRITE"; readonly capability: "GM_APPLY_SAFE_V1"; readonly expectedHead: string | null; readonly expectedProjectFingerprint: string; readonly planHash: string; readonly confirm: true; readonly state: "PREPARING" | "WRITE_AHEAD" | "APPLIED" | "FAILED" | "ROLLING_BACK" | "ROLLED_BACK"; readonly files: readonly TransactionFile[]; readonly verification: GmMutationPlan["verification"]; readonly rollback: Readonly<{ available: boolean; required: true }> }
interface Ledger { readonly schemaVersion: 1; readonly transactionId: string; readonly manifestSha256: string; readonly state: TransactionManifest["state"] }
const exists = async (path: string): Promise<boolean> => Boolean(await stat(path).catch(() => null));
const pathIdentity = (path: string): string => path.normalize("NFKC").toLowerCase();
const hasExactKeys = (candidate: unknown, expected: readonly string[]): candidate is Record<string, unknown> => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  const actual = Object.keys(candidate).sort(); const canonical = [...expected].sort();
  return actual.length === canonical.length && actual.every((key, index) => key === canonical[index]);
};
async function optionalBytes(path: string): Promise<Buffer | null> { return readFile(path).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error)); }
async function atomicRename(source: string, destination: string): Promise<void> { let last: unknown; for (let attempt = 0; attempt < 3; attempt++) { try { await rename(source, destination); return; } catch (error) { last = error; await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1))); } } throw last; }
async function linkNoClobber(source: string, destination: string): Promise<void> { await link(source, destination); }
async function writeCanonical(path: string, value: unknown): Promise<void> {
  const parent = dirname(path); await mkdir(parent, { recursive: true }); const temporary = `${path}.next`; await rm(temporary, { force: true }); const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(canonicalBytes(value)); await handle.sync(); } finally { await handle.close(); }
  await atomicRename(temporary, path); const directory = await open(parent, "r").catch(() => null); if (directory) try { await directory.sync().catch((error: NodeJS.ErrnoException) => { if (error.code !== "EPERM" && error.code !== "EINVAL") throw error; }); } finally { await directory.close(); }
}
async function acquireLock(lockPath: string, transactionId: string): Promise<() => Promise<void>> {
  await mkdir(dirname(lockPath), { recursive: true }); const nonce = randomUUID();
  try { const handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); await handle.writeFile(canonicalBytes({ schemaVersion: 1, pid: process.pid, transactionId, nonce })); await handle.close(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // Node has no portable compare-and-swap for directory entries. Attempting
    // to "break" a stale lock can race and rename a newly-created live lock.
    // Fail closed; an operator may remove a confirmed stale lock out of band.
    fail("BUSY", "project transaction lock already exists", true);
  }
  return async () => {
    const value = await readFile(lockPath, "utf8").then((text) => JSON.parse(text) as { transactionId?: string; nonce?: string }).catch(() => null);
    if (value?.transactionId === transactionId && value.nonce === nonce) await rm(lockPath, { force: true });
  };
}
async function transactionProjectIdentity(projectsDir: string, projectRoot: string): Promise<string> {
  const absolute = await resolveInsideRoot(projectsDir, safeRelativePath(projectRoot), { existing: true });
  const canonical = await realpath(absolute); const info = await stat(canonical, { bigint: true });
  if (!info.isDirectory()) fail("AUTHZ_PROJECT_ROOT", "projectRoot must identify an existing real directory");
  // dev+ino is the physical identity. realpath is retained as a conservative
  // fallback/disambiguator for filesystems that report zero or recycled file
  // identifiers. Only Windows folds case; POSIX path spelling stays lossless.
  const physicalPath = canonical.replace(/\\/g, "/").replace(/\/+$/, "");
  const platformPath = process.platform === "win32" ? physicalPath.toLowerCase() : physicalPath;
  return `physical-v1:${process.platform}:${info.dev.toString()}:${info.ino.toString()}:${platformPath}`;
}
export async function transactionProjectNamespace(projectsDir: string, projectRoot: string): Promise<string> { return sha256(Buffer.from(await transactionProjectIdentity(projectsDir, projectRoot))); }
async function assertProjectIdentity(projectsDir: string, projectRoot: string, expected: string): Promise<void> { if (await transactionProjectIdentity(projectsDir, projectRoot) !== expected) fail("CONCURRENT_MODIFICATION", "project directory identity changed during transaction", true); }
export async function transactionRelativeRoot(projectsDir: string, evidenceRoot: string, projectRoot: string, transactionId: string): Promise<string> {
  const evidence = safeRelativePath(evidenceRoot, "evidenceRoot"); const project = safeRelativePath(projectRoot); if (await isSameOrDescendantFilesystemPath(projectsDir, project, evidence)) fail("AUTHZ_PROJECT_ROOT", "evidenceRoot must be outside projectRoot"); return `${evidence}/transactions/${await transactionProjectNamespace(projectsDir, project)}/${safeTransactionId(transactionId)}`;
}
async function transactionPaths(projectsDir: string, evidenceRoot: string, projectRoot: string, transactionId: string, createEvidence = false): Promise<Readonly<{ root: string; relativeRoot: string; staging: string; backups: string; manifest: string; ledger: string; lock: string }>> {
  const evidence = safeRelativePath(evidenceRoot, "evidenceRoot"); const namespace = await transactionProjectNamespace(projectsDir, projectRoot); const relativeRoot = await transactionRelativeRoot(projectsDir, evidence, projectRoot, transactionId); const evidenceDirectory = await resolveInsideRoot(projectsDir, evidence); if (createEvidence) await mkdir(evidenceDirectory, { recursive: true }); const transactionRoot = await resolveInsideRoot(projectsDir, relativeRoot); return Object.freeze({ root: transactionRoot, relativeRoot, staging: `${transactionRoot}/staging`, backups: `${transactionRoot}/backups`, manifest: `${transactionRoot}/manifest.json`, ledger: `${transactionRoot}/ledger.json`, lock: `${evidenceDirectory}/locks/projects/${namespace}.lock` });
}
function assertPlan(request: GmApplySafeRequest | GmRollbackRequest, plan?: GmMutationPlan): asserts plan is GmMutationPlan { if (!plan || hashPlan(plan) !== request.planHash || plan.transactionId !== request.transactionId || plan.projectRoot !== request.projectRoot) fail("PLAN_STALE", "plan hash or binding is invalid", true); }
function assertApplyPlanPolicy(plan: GmMutationPlan): void {
  if (plan.schemaVersion !== 1 || plan.operation !== "apply-safe" || plan.capability !== "GM_APPLY_SAFE_V1" || plan.gate !== "PLAN_ONLY" || (plan.expectedHead !== null && typeof plan.expectedHead !== "string") || !hasExactKeys(plan.verification, ["projectLoad", "compile", "runtime"]) || typeof plan.verification.projectLoad !== "boolean" || typeof plan.verification.compile !== "boolean" || !new Set(["required", "optional", "forbidden"]).has(plan.verification.runtime) || !hasExactKeys(plan.rollback, ["required"]) || plan.rollback.required !== true) fail("PLAN_STALE", "plan policy binding is invalid", true);
  safeTransactionId(plan.transactionId);
  if (!plan.files.length || plan.files.length > 64) fail("LIMIT_EXCEEDED", "plan file count is outside policy");
  const allowedExtensions = safeAllowedExtensions(plan.allowedExtensions);
  if (JSON.stringify(allowedExtensions) !== JSON.stringify(plan.allowedExtensions)) fail("PLAN_STALE", "allowed extension policy is not canonical", true);
  const identities = new Set<string>();
  for (const file of plan.files) {
    const path = safeRelativePath(file.path);
    // Every mutation path also has deterministic transaction-evidence names.
    // Reject a project path up front if prefixing/suffixing it would exceed the
    // same safe relative-path policy and later strand rollback evidence.
    for (const derived of [`staging/${path}`, `claims/${path}.original`, `applied/${path}`, `failed/${path}`, `restore/${path}.${"0".repeat(36)}.next`, `backups/${path}.blob`]) safeRelativePath(derived, "transaction evidence path");
    const identity = pathIdentity(path);
    if (identities.has(identity)) fail("PLAN_STALE", "plan has duplicate path identities", true, { path });
    identities.add(identity);
    if ((file.action === "create") !== (file.beforeSha256 === null)) fail("PLAN_STALE", "planned action does not match before state", true, { path });
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedExtensions.includes(extension)) fail("FILE_NOT_ALLOWLISTED", "file extension is not writable", false, { path });
    const after = Buffer.from(file.afterContentBase64, "base64");
    if (after.byteLength > 4 * 1024 * 1024) fail("LIMIT_EXCEEDED", "planned content exceeds per-file limit");
    if (sha256(after) !== file.afterSha256) fail("PLAN_STALE", "planned content hash is invalid", true, { path });
  }
}
async function writeManifest(paths: Awaited<ReturnType<typeof transactionPaths>>, manifest: TransactionManifest): Promise<string> {
  // manifest.json is the sole atomic authority. ledger.json remains a derived,
  // best-effort compatibility cache: a crash between two file renames must not
  // make a valid transaction permanently unrecoverable.
  await writeCanonical(paths.manifest, manifest); const digest = sha256(await readFile(paths.manifest));
  await writeCanonical(paths.ledger, { schemaVersion: 1, transactionId: manifest.transactionId, manifestSha256: digest, state: manifest.state } satisfies Ledger).catch(() => undefined);
  return digest;
}
function validateManifest(value: unknown): TransactionManifest {
  if (!hasExactKeys(value, ["schemaVersion", "transactionId", "projectRoot", "operation", "gate", "capability", "expectedHead", "expectedProjectFingerprint", "planHash", "confirm", "state", "files", "verification", "rollback"])) fail("ROLLBACK_UNAVAILABLE", "transaction manifest shape is invalid", false);
  const manifest = value as unknown as Partial<TransactionManifest>; const digest = /^[0-9a-f]{64}$/;
  if (manifest.schemaVersion !== 1 || manifest.operation !== "apply-safe" || manifest.gate !== "SAFE_WRITE" || manifest.capability !== "GM_APPLY_SAFE_V1" || manifest.confirm !== true || typeof manifest.transactionId !== "string" || typeof manifest.projectRoot !== "string" || (manifest.expectedHead !== null && typeof manifest.expectedHead !== "string") || typeof manifest.planHash !== "string" || !digest.test(manifest.planHash) || typeof manifest.expectedProjectFingerprint !== "string" || !digest.test(manifest.expectedProjectFingerprint) || !new Set(["PREPARING", "WRITE_AHEAD", "APPLIED", "FAILED", "ROLLING_BACK", "ROLLED_BACK"]).has(manifest.state ?? "") || !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > 64 || !hasExactKeys(manifest.verification, ["projectLoad", "compile", "runtime"]) || typeof manifest.verification.projectLoad !== "boolean" || typeof manifest.verification.compile !== "boolean" || !new Set(["required", "optional", "forbidden"]).has(manifest.verification.runtime) || !hasExactKeys(manifest.rollback, ["available", "required"]) || typeof manifest.rollback.available !== "boolean" || manifest.rollback.required !== true) fail("ROLLBACK_UNAVAILABLE", "transaction manifest is invalid", false);
  try { if (safeTransactionId(manifest.transactionId) !== manifest.transactionId || safeRelativePath(manifest.projectRoot) !== manifest.projectRoot) fail("ROLLBACK_UNAVAILABLE", "transaction manifest binding is invalid", false); }
  catch { fail("ROLLBACK_UNAVAILABLE", "transaction manifest binding is invalid", false); }
  const identities = new Set<string>();
  for (const candidate of manifest.files) {
    if (!hasExactKeys(candidate, ["path", "action", "beforeSha256", "afterSha256", "backupPath", "stagingPath"])) fail("ROLLBACK_UNAVAILABLE", "transaction manifest file shape is invalid", false);
    const file = candidate as unknown as Partial<TransactionFile>; let path: string;
    try { path = safeRelativePath(file.path ?? ""); for (const derived of [`staging/${path}`, `claims/${path}.original`, `applied/${path}`, `failed/${path}`, `restore/${path}.${"0".repeat(36)}.next`, `backups/${path}.blob`]) safeRelativePath(derived, "transaction evidence path"); } catch { fail("ROLLBACK_UNAVAILABLE", "transaction manifest path is invalid", false); }
    if (path !== file.path || identities.has(pathIdentity(path)) || (file.action !== "modify" && file.action !== "create") || (file.beforeSha256 !== null && (typeof file.beforeSha256 !== "string" || !digest.test(file.beforeSha256))) || typeof file.afterSha256 !== "string" || !digest.test(file.afterSha256) || (file.action === "create") !== (file.beforeSha256 === null) || file.backupPath !== (file.beforeSha256 === null ? null : `backups/${path}.blob`) || file.stagingPath !== `staging/${path}`) fail("ROLLBACK_UNAVAILABLE", "transaction manifest file binding is invalid", false, { path });
    identities.add(pathIdentity(path));
  }
  return manifest as TransactionManifest;
}
async function loadManifest(paths: Awaited<ReturnType<typeof transactionPaths>>): Promise<TransactionManifest> {
  if (!(await exists(paths.manifest))) fail("MUTATION_NOT_FOUND", "transaction evidence is missing", true);
  const bytes = await readFile(paths.manifest); let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch { fail("ROLLBACK_UNAVAILABLE", "transaction evidence is invalid", false); }
  const manifest = validateManifest(parsed);
  if (!bytes.equals(canonicalBytes(manifest))) fail("ROLLBACK_UNAVAILABLE", "transaction manifest is not canonical", false);
  return manifest;
}
export async function readTransactionEvidence(projectsDir: string, evidenceRoot: string, projectRoot: string, transactionId: string): Promise<Readonly<{ relativeRoot: string; planHash: string; state: TransactionManifest["state"]; files: readonly string[] }>> {
  const paths = await transactionPaths(projectsDir, evidenceRoot, projectRoot, transactionId); const manifest = await loadManifest(paths);
  if (manifest.transactionId !== transactionId || await transactionProjectIdentity(projectsDir, manifest.projectRoot) !== await transactionProjectIdentity(projectsDir, safeRelativePath(projectRoot))) fail("ROLLBACK_UNAVAILABLE", "transaction evidence binding is invalid", false);
  return Object.freeze({ relativeRoot: paths.relativeRoot, planHash: manifest.planHash, state: manifest.state, files: Object.freeze(manifest.files.map(({ path }) => path)) });
}

/** Internal testable primitive: atomically creates the AFTER name without ever
 * replacing a concurrently-created destination. Existing files are first
 * claimed into transaction evidence and re-hashed at the promotion boundary. */
export async function promoteStagedFile(
  destination: string,
  staged: string,
  claim: string,
  beforeSha256: string | null,
  afterSha256: string,
  faultAt?: string,
): Promise<void> {
  if (sha256(await readFile(staged)) !== afterSha256) fail("ATOMIC_PROMOTION_FAILED", "staged hash mismatch", false);
  if (beforeSha256 !== null) {
    await mkdir(dirname(claim), { recursive: true });
    try { await atomicRename(destination, claim); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") fail("CONCURRENT_MODIFICATION", "target disappeared during promotion", true); throw error; }
    if (sha256(await readFile(claim)) !== beforeSha256) {
      try { await linkNoClobber(claim, destination); await unlink(claim).catch(() => undefined); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      fail("CONCURRENT_MODIFICATION", "target changed after staging", true);
    }
    if (faultAt === "after-claim-before-promotion") throw new GmAdapterError("ATOMIC_PROMOTION_FAILED", "injected claim crash boundary", true, { leaveWriteAhead: true });
  }
  try { await linkNoClobber(staged, destination); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") fail("CONCURRENT_MODIFICATION", "target appeared during promotion", true);
    if (beforeSha256 !== null && await exists(claim) && !(await exists(destination))) { await linkNoClobber(claim, destination); await unlink(claim).catch(() => undefined); }
    throw error;
  }
  // Once link() succeeds the destination is already promoted. Staging cleanup
  // must never turn that success into a thrown error before the caller records
  // the promoted path. A valid claim is intentionally retained: it preserves
  // the original inode/metadata and closes the crash window before AFTER exists.
  await unlink(staged).catch(() => undefined);
}

type TransactionPaths = Awaited<ReturnType<typeof transactionPaths>>;
async function artifactPath(paths: TransactionPaths, relativePath: string): Promise<string> { return resolveInsideRoot(paths.root, safeRelativePath(relativePath)); }
async function validArtifact(paths: TransactionPaths, relativePath: string, expectedSha256: string): Promise<string | null> { const absolute = await artifactPath(paths, relativePath); const bytes = await optionalBytes(absolute); return bytes !== null && sha256(bytes) === expectedSha256 ? absolute : null; }
async function restoreOriginalFromEvidence(paths: TransactionPaths, file: TransactionFile, destination: string): Promise<void> {
  if (file.beforeSha256 === null) return;
  const claimRelative = `claims/${file.path}.original`; const claim = await validArtifact(paths, claimRelative, file.beforeSha256);
  let source = claim; let disposable = claim !== null;
  if (!source) {
    if (!file.backupPath) fail("ROLLBACK_UNAVAILABLE", "backup binding is missing", false, { path: file.path });
    const backup = await validArtifact(paths, file.backupPath, file.beforeSha256); if (!backup) fail("ROLLBACK_UNAVAILABLE", "backup blob is missing or corrupt", false, { path: file.path });
    const temporary = await artifactPath(paths, `restore/${file.path}.${randomUUID()}.next`); await mkdir(dirname(temporary), { recursive: true }); await copyFile(backup, temporary, constants.COPYFILE_EXCL); if (sha256(await readFile(temporary)) !== file.beforeSha256) fail("ROLLBACK_UNAVAILABLE", "restore copy is corrupt", false, { path: file.path }); source = temporary; disposable = true;
  }
  try { await linkNoClobber(source, destination); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") fail("CONCURRENT_MODIFICATION", "target appeared during restoration", true, { path: file.path }); throw error; }
  if (disposable) await unlink(source).catch(() => undefined);
  const restored = await optionalBytes(destination); if (restored === null || sha256(restored) !== file.beforeSha256) fail("ROLLBACK_INCOMPLETE", "restored bytes do not match backup", false, { path: file.path });
}
function assertExpectedProjectFiles(before: Awaited<ReturnType<typeof inspectProject>>, after: Awaited<ReturnType<typeof inspectProject>>, files: readonly TransactionFile[]): void {
  const expected = new Map(before.files.map((file) => [pathIdentity(file.path), file.sha256])); for (const file of files) expected.set(pathIdentity(file.path), file.afterSha256);
  if (after.files.length !== expected.size || after.files.some((file) => expected.get(pathIdentity(file.path)) !== file.sha256)) fail("CONCURRENT_MODIFICATION", "project file set changed during promotion", true);
}

export async function applyTransaction(projectsDir: string, request: GmApplySafeRequest, inventory?: ProcessInventory): Promise<GmApplyResult> {
  if (request.capability !== "GM_APPLY_SAFE_V1") fail("GATE_VIOLATION", "applySafe requires GM_APPLY_SAFE_V1"); if (!request.confirm) fail("GATE_VIOLATION", "SAFE_WRITE requires confirm=true"); assertPlan(request, request.plan);
  const dryRun = request.dryRun !== false; const plan = request.plan; const planDigest = hashPlan(plan); assertApplyPlanPolicy(plan); if (!request.expectedProjectFingerprint || request.expectedProjectFingerprint !== plan.projectFingerprint) fail("PLAN_STALE", "request fingerprint is not bound to plan", true);
  const projectRoot = safeRelativePath(request.projectRoot); const evidenceRoot = safeRelativePath(request.evidenceRoot); if (await isSameOrDescendantFilesystemPath(projectsDir, projectRoot, evidenceRoot)) fail("AUTHZ_PROJECT_ROOT", "evidenceRoot must be outside projectRoot");
  // Idempotent reapply: when every planned file already matches the plan's
  // AFTER state, the mutation is fully applied; report NO_CHANGE without
  // touching anything (this must precede the fingerprint/snapshot validation,
  // which would otherwise reject the already-applied project). A DIFFERENT
  // plan under the same transaction is still rejected downstream
  // (MUTATION_ALREADY_APPLIED / PLAN_STALE).
  const currentRoot = await resolveInsideRoot(projectsDir, projectRoot, { existing: true });
  const afterStates = await Promise.all(plan.files.map(async (file) => {
    const destination = await resolveInsideRoot(currentRoot, file.path);
    const current = await optionalBytes(destination);
    return (current === null ? null : sha256(current)) === file.afterSha256;
  }));
  if (afterStates.every(Boolean) && !plan.files.every((file) => file.beforeSha256 === file.afterSha256)) {
    const existingPaths = await transactionPaths(projectsDir, evidenceRoot, projectRoot, request.transactionId); if (!(await exists(existingPaths.manifest))) fail("PLAN_STALE", "after state is not bound to this transaction", true);
    const existingManifest = await loadManifest(existingPaths); if (existingManifest.transactionId !== request.transactionId || existingManifest.planHash !== planDigest || existingManifest.state !== "APPLIED" || await transactionProjectIdentity(projectsDir, existingManifest.projectRoot) !== await transactionProjectIdentity(projectsDir, projectRoot)) fail("PLAN_STALE", "after state belongs to a different transaction plan or state", true);
    const snapshot = await inspectProject(projectsDir, { ...request, capability: "GM_INSPECT_V1", expectedProjectFingerprint: null }, inventory);
    return Object.freeze({ schemaVersion: 1, transactionId: request.transactionId, applied: false, dryRun: false, state: "NO_CHANGE", planHash: planDigest, manifestPath: `${existingPaths.relativeRoot}/manifest.json`, manifestSha256: sha256(await readFile(existingPaths.manifest)), changedFiles: Object.freeze([]), rollbackAvailable: true, projectFingerprint: snapshot.fingerprint });
  }
  const snapshot = await inspectProject(projectsDir, { ...request, capability: "GM_INSPECT_V1" }, inventory); if (snapshot.snapshotHash !== plan.snapshotHash) fail("PLAN_STALE", "snapshot changed since plan", true);
  for (const file of plan.files) if (!plan.allowlist.includes(file.path) || !request.allowlist.map((path) => safeRelativePath(path)).includes(file.path)) fail("FILE_NOT_ALLOWLISTED", "apply allowlist differs from plan", false, { path: file.path });
  if (dryRun) return Object.freeze({ schemaVersion: 1, transactionId: request.transactionId, applied: false, dryRun: true, state: "DRY_RUN", planHash: planDigest, manifestPath: "", manifestSha256: canonicalHash({ planHash: planDigest, state: "DRY_RUN" }), changedFiles: Object.freeze([]), rollbackAvailable: false, projectFingerprint: snapshot.fingerprint });
  if (plan.files.every((file) => file.beforeSha256 === file.afterSha256)) {
    // A no-op still cannot recycle an identifier already bound to durable
    // evidence. Otherwise a caller could make a rolled-back transaction appear
    // to have been accepted as a fresh plan without ever consulting its state.
    const noChangePaths = await transactionPaths(projectsDir, evidenceRoot, projectRoot, request.transactionId);
    if (await exists(noChangePaths.root)) {
      if (await exists(noChangePaths.manifest)) {
        const prior = await loadManifest(noChangePaths);
        if (prior.planHash !== planDigest) fail("PLAN_STALE", "transactionId is bound to a different plan", true);
      }
      fail("MUTATION_ALREADY_APPLIED", "transactionId already has durable evidence", true);
    }
    return Object.freeze({ schemaVersion: 1, transactionId: request.transactionId, applied: false, dryRun: false, state: "NO_CHANGE", planHash: planDigest, manifestPath: "", manifestSha256: canonicalHash({ planHash: planDigest, state: "NO_CHANGE" }), changedFiles: Object.freeze([]), rollbackAvailable: false, projectFingerprint: snapshot.fingerprint });
  }
  if (snapshot.processes.some(({ name }) => /^(?:GameMaker|Igor|Runner)(?:\.exe)?$/i.test(name))) fail("GATE_VIOLATION", "SAFE_WRITE is blocked while GameMaker, Igor, or Runner is active", true);
  if (request.faultAt === "before-staging") fail("ATOMIC_PROMOTION_FAILED", "injected pre-staging failure", true);
  const expectedProjectIdentity = await transactionProjectIdentity(projectsDir, projectRoot);
  const paths = await transactionPaths(projectsDir, evidenceRoot, projectRoot, request.transactionId, true); const release = await acquireLock(paths.lock, request.transactionId); let root: string | undefined;
  const promotedPaths = new Set<string>();
  const txFiles: readonly TransactionFile[] = Object.freeze(plan.files.map((file) => Object.freeze({ path: file.path, action: file.action, beforeSha256: file.beforeSha256, afterSha256: file.afterSha256, backupPath: file.beforeSha256 === null ? null : `backups/${file.path}.blob`, stagingPath: `staging/${file.path}` })));
  let manifest: TransactionManifest = Object.freeze({ schemaVersion: 1, transactionId: request.transactionId, projectRoot, operation: "apply-safe", gate: "SAFE_WRITE", capability: "GM_APPLY_SAFE_V1", expectedHead: plan.expectedHead, expectedProjectFingerprint: plan.projectFingerprint, planHash: planDigest, confirm: true, state: "PREPARING", files: txFiles, verification: plan.verification, rollback: Object.freeze({ available: true, required: true }) });
  try {
    // The transaction root check belongs under the project lock. Checking only
    // before acquisition would allow a completed transaction to appear between
    // the check and lock acquisition, especially after a concurrent rollback.
    if (await exists(paths.root)) fail("MUTATION_ALREADY_APPLIED", "transaction directory already exists", true);
    await assertProjectIdentity(projectsDir, projectRoot, expectedProjectIdentity);
    root = await resolveInsideRoot(projectsDir, projectRoot, { existing: true });
    await mkdir(dirname(paths.root), { recursive: true });
    await mkdir(paths.root, { recursive: false });
    await resolveInsideRoot(projectsDir, paths.relativeRoot, { existing: true }); await assertProjectIdentity(projectsDir, projectRoot, expectedProjectIdentity);
    if ((request as unknown as { faultAt?: string }).faultAt === "after-transaction-root-before-manifest") throw new GmAdapterError("ATOMIC_PROMOTION_FAILED", "injected pre-manifest crash boundary", true, { leaveUninitialized: true });
    await writeManifest(paths, manifest);
    if ((request as unknown as { faultAt?: string }).faultAt === "after-preparing-manifest") throw new GmAdapterError("ATOMIC_PROMOTION_FAILED", "injected PREPARING crash boundary", true, { leaveWriteAhead: true });
    await mkdir(paths.staging, { recursive: true }); await mkdir(paths.backups, { recursive: true });
    for (const file of plan.files) {
      await assertProjectIdentity(projectsDir, projectRoot, expectedProjectIdentity);
      const destination = await resolveInsideRoot(root, file.path); const current = await optionalBytes(destination);
      if ((current === null ? null : sha256(current)) !== file.beforeSha256) fail("EXPECTED_HASH_MISMATCH", "target changed before staging", true, { path: file.path });
      const staged = `${paths.staging}/${file.path}`; await mkdir(dirname(staged), { recursive: true }); const after = Buffer.from(file.afterContentBase64, "base64"); await writeFile(staged, after, { flag: "wx" }); if (sha256(await readFile(staged)) !== file.afterSha256) fail("ATOMIC_PROMOTION_FAILED", "staged hash mismatch", false, { path: file.path });
      if (current !== null) { const backupPath = `backups/${file.path}.blob`; const backup = `${paths.root}/${backupPath}`; await mkdir(dirname(backup), { recursive: true }); await copyFile(destination, backup, constants.COPYFILE_EXCL); if (sha256(await readFile(backup)) !== file.beforeSha256) fail("ATOMIC_PROMOTION_FAILED", "backup hash mismatch", false, { path: file.path }); }
      await resolveInsideRoot(projectsDir, paths.relativeRoot, { existing: true }); await assertProjectIdentity(projectsDir, projectRoot, expectedProjectIdentity);
      if (request.faultAt === "during-staging") fail("ATOMIC_PROMOTION_FAILED", "injected staging failure", true);
    }
    manifest = Object.freeze({ ...manifest, state: "WRITE_AHEAD" }); await writeManifest(paths, manifest); if (request.faultAt === "before-promotion") fail("ATOMIC_PROMOTION_FAILED", "injected pre-promotion failure", true);
    for (const file of txFiles) {
      request.cancellation?.throwIfAborted();
      await assertProjectIdentity(projectsDir, projectRoot, expectedProjectIdentity);
      const destination = await resolveInsideRoot(root, file.path); await mkdir(dirname(destination), { recursive: true });
      await promoteStagedFile(destination, `${paths.root}/${file.stagingPath}`, `${paths.root}/claims/${file.path}.original`, file.beforeSha256, file.afterSha256, (request as GmApplySafeRequest & { faultAt?: string }).faultAt);
      await resolveInsideRoot(root, file.path, { existing: true }); await assertProjectIdentity(projectsDir, projectRoot, expectedProjectIdentity);
      promotedPaths.add(file.path);
      if (request.faultAt === "leave-write-ahead-after-first-replace" && promotedPaths.size === 1) throw new GmAdapterError("ATOMIC_PROMOTION_FAILED", "injected hard-crash boundary", true, { leaveWriteAhead: true });
      if (request.faultAt === "after-first-replace" && promotedPaths.size === 1) fail("ATOMIC_PROMOTION_FAILED", "injected post-replace failure", true);
    }
    for (const file of txFiles) if (sha256(await readFile(await resolveInsideRoot(root, file.path))) !== file.afterSha256) fail("ATOMIC_PROMOTION_FAILED", "post-promotion hash mismatch", false, { path: file.path });
    const promotedSnapshot = await inspectProject(projectsDir, { ...request, capability: "GM_INSPECT_V1", expectedProjectFingerprint: null }, inventory); assertExpectedProjectFiles(snapshot, promotedSnapshot, txFiles);
    manifest = Object.freeze({ ...manifest, state: "APPLIED" }); const manifestSha256 = await writeManifest(paths, manifest);
    await (request as GmApplySafeRequest & { afterAppliedManifest?: () => Promise<void> }).afterAppliedManifest?.();
    const afterSnapshot = await inspectProject(projectsDir, { ...request, capability: "GM_INSPECT_V1", expectedProjectFingerprint: null }, inventory); assertExpectedProjectFiles(snapshot, afterSnapshot, txFiles); if (afterSnapshot.fingerprint !== promotedSnapshot.fingerprint) fail("CONCURRENT_MODIFICATION", "project changed while finalizing the transaction", true);
    return Object.freeze({ schemaVersion: 1, transactionId: request.transactionId, applied: true, dryRun: false, state: "APPLIED", planHash: planDigest, manifestPath: `${paths.relativeRoot}/manifest.json`, manifestSha256, changedFiles: Object.freeze(txFiles.map(({ path }) => path)), rollbackAvailable: true, projectFingerprint: afterSnapshot.fingerprint });
  } catch (error) {
    if (error instanceof GmAdapterError && (error.details.leaveWriteAhead === true || error.details.leaveUninitialized === true)) throw error;
    const failed: TransactionManifest = Object.freeze({ ...manifest, state: "FAILED", rollback: Object.freeze({ available: promotedPaths.size > 0, required: true }) });
    // FAILED must become authoritative before recovery starts. If this process
    // crashes mid-recovery, rollback accepts the resulting before/after/claim
    // mixture instead of seeing an impossible APPLIED partial state.
    if (await exists(paths.root)) await writeManifest(paths, failed);
    if (promotedPaths.size > 0 && root) {
      for (const file of [...txFiles].reverse()) {
        if (!promotedPaths.has(file.path)) continue;
        await assertProjectIdentity(projectsDir, projectRoot, expectedProjectIdentity);
        const destination = await resolveInsideRoot(root, file.path); const current = await optionalBytes(destination);
        if (current === null || sha256(current) !== file.afterSha256) continue;
        const rescue = await artifactPath(paths, `failed/${file.path}`); if (await exists(rescue)) continue; await mkdir(dirname(rescue), { recursive: true }); await atomicRename(destination, rescue);
        if ((request as GmApplySafeRequest & { faultDuringRecoveryAfterFirst?: boolean }).faultDuringRecoveryAfterFirst) throw new GmAdapterError("ATOMIC_PROMOTION_FAILED", "injected recovery crash boundary", true, { leaveFailed: true });
        await restoreOriginalFromEvidence(paths, file, destination);
      }
    }
    if (await exists(paths.root)) await writeManifest(paths, failed).catch(() => undefined);
    throw error;
  } finally { await release(); }
}

export async function rollbackTransaction(projectsDir: string, request: GmRollbackRequest, inventory?: ProcessInventory): Promise<GmRollbackResult> {
  if (request.capability !== "GM_ROLLBACK_V1" || !request.confirm) fail("GATE_VIOLATION", "rollback requires GM_ROLLBACK_V1 and confirm=true"); const expectedProjectIdentity = await transactionProjectIdentity(projectsDir, request.projectRoot); const paths = await transactionPaths(projectsDir, request.evidenceRoot, request.projectRoot, request.transactionId); let manifest = await loadManifest(paths); if (manifest.planHash !== request.planHash || await transactionProjectIdentity(projectsDir, manifest.projectRoot) !== expectedProjectIdentity || !new Set(["PREPARING", "APPLIED", "WRITE_AHEAD", "FAILED", "ROLLING_BACK"]).has(manifest.state)) fail("ROLLBACK_UNAVAILABLE", "transaction binding or state is invalid", false);
  const requestAllowlist = new Set(request.allowlist.map((path) => safeRelativePath(path, "allowlist")));
  for (const file of manifest.files) if (!requestAllowlist.has(safeRelativePath(file.path))) fail("FILE_NOT_ALLOWLISTED", "rollback allowlist does not cover transaction files", false, { path: file.path });
  const release = await acquireLock(paths.lock, request.transactionId); const restored: string[] = [];
  try {
    const root = await resolveInsideRoot(projectsDir, request.projectRoot, { existing: true }); const current = await inspectProject(projectsDir, { ...request, capability: "GM_INSPECT_V1" }, inventory); if (request.expectedProjectFingerprint !== current.fingerprint) fail("CONCURRENT_MODIFICATION", "project changed before rollback", true);
    const observed = new Map<string, "before" | "after" | "restore-pending">();
    for (const file of manifest.files) {
      const destination = await resolveInsideRoot(root, file.path); const bytes = await optionalBytes(destination); const digest = bytes === null ? null : sha256(bytes);
      let state: "before" | "after" | "restore-pending" | null = digest === file.afterSha256 ? "after" : digest === file.beforeSha256 || (digest === null && file.beforeSha256 === null) ? "before" : null;
      const claim = file.beforeSha256 === null ? null : await validArtifact(paths, `claims/${file.path}.original`, file.beforeSha256); const backup = file.beforeSha256 === null || !file.backupPath ? null : await validArtifact(paths, file.backupPath, file.beforeSha256); const applied = await validArtifact(paths, `applied/${file.path}`, file.afterSha256); const failed = await validArtifact(paths, `failed/${file.path}`, file.afterSha256);
      if (state === null && manifest.state !== "APPLIED" && digest === null && file.beforeSha256 !== null && (claim || applied || failed)) state = "restore-pending";
      if (!state || (manifest.state === "APPLIED" && state !== "after")) fail("CONCURRENT_MODIFICATION", "target is neither the recorded before nor after state", true, { path: file.path });
      observed.set(file.path, state);
      if ((file.beforeSha256 === null) !== (file.backupPath === null)) fail("ROLLBACK_UNAVAILABLE", "backup binding is invalid", false, { path: file.path });
      if (file.beforeSha256 !== null && state !== "before" && !claim && !backup) fail("ROLLBACK_UNAVAILABLE", "rollback source is missing or corrupt", false, { path: file.path });
    }
    if (manifest.state !== "ROLLING_BACK") { manifest = Object.freeze({ ...manifest, state: "ROLLING_BACK", rollback: Object.freeze({ available: true, required: true }) }); await writeManifest(paths, manifest); }
    for (const file of [...manifest.files].reverse()) {
      request.cancellation?.throwIfAborted();
      await assertProjectIdentity(projectsDir, request.projectRoot, expectedProjectIdentity);
      const state = observed.get(file.path); const destination = await resolveInsideRoot(root, file.path); const claim = file.beforeSha256 === null ? null : await artifactPath(paths, `claims/${file.path}.original`);
      if (state === "before") { if (claim && await exists(claim)) await unlink(claim).catch(() => undefined); continue; }
      const applied = await artifactPath(paths, `applied/${file.path}`);
      if (state === "after") {
        const latest = await optionalBytes(destination); if (latest === null || sha256(latest) !== file.afterSha256) fail("CONCURRENT_MODIFICATION", "target changed during rollback", true, { path: file.path });
        if (await exists(applied)) fail("ROLLBACK_UNAVAILABLE", "applied evidence already exists", false, { path: file.path });
        await mkdir(dirname(applied), { recursive: true }); await atomicRename(destination, applied);
      }
      await restoreOriginalFromEvidence(paths, file, destination);
      await assertProjectIdentity(projectsDir, request.projectRoot, expectedProjectIdentity);
      restored.push(file.path);
      if ((request as GmRollbackRequest & { faultAt?: string }).faultAt === "after-first-restore" && restored.length === 1) throw new GmAdapterError("ATOMIC_PROMOTION_FAILED", "injected rollback crash boundary", true, { leaveRollingBack: true });
    }
    for (const file of manifest.files) { if (file.beforeSha256 === null) { if (await exists(await resolveInsideRoot(root, file.path))) fail("ROLLBACK_INCOMPLETE", "created file remains after rollback"); } else if (sha256(await readFile(await resolveInsideRoot(root, file.path))) !== file.beforeSha256) fail("ROLLBACK_INCOMPLETE", "restored bytes do not match backup", false, { path: file.path }); }
    manifest = Object.freeze({ ...manifest, state: "ROLLED_BACK", rollback: Object.freeze({ available: false, required: true }) }); await writeManifest(paths, manifest); const snapshot = await inspectProject(projectsDir, { ...request, capability: "GM_INSPECT_V1", expectedProjectFingerprint: null }, inventory);
    return Object.freeze({ schemaVersion: 1, transactionId: request.transactionId, restored: true, byteExact: snapshot.fingerprint === manifest.expectedProjectFingerprint, restoredFiles: Object.freeze(manifest.files.map(({ path }) => path).sort()), projectFingerprint: snapshot.fingerprint, manifestPath: `${paths.relativeRoot}/manifest.json` });
  } finally { await release(); }
}

export async function listTransactions(projectsDir: string, evidenceRoot: string, projectRoot: string): Promise<Readonly<{ pending: readonly string[]; rollback: readonly string[] }>> {
  const evidence = safeRelativePath(evidenceRoot); const expectedProject = safeRelativePath(projectRoot); if (await isSameOrDescendantFilesystemPath(projectsDir, expectedProject, evidence)) fail("AUTHZ_PROJECT_ROOT", "evidenceRoot must be outside projectRoot"); const expectedProjectIdentity = await transactionProjectIdentity(projectsDir, expectedProject); const relativeTransactions = `${evidence}/transactions/${await transactionProjectNamespace(projectsDir, expectedProject)}`; const transactions = await resolveInsideRoot(projectsDir, relativeTransactions); if (!(await exists(transactions))) return Object.freeze({ pending: Object.freeze([]), rollback: Object.freeze([]) });
  const { readdir } = await import("node:fs/promises"); const ids = (await readdir(transactions)).sort(); const pending: string[] = []; const rollback: string[] = [];
  for (const id of ids) {
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(id)) continue;
    const paths = await transactionPaths(projectsDir, evidence, expectedProject, id).catch(() => null); const manifest = paths ? await loadManifest(paths).catch(() => null) : null;
    // A transaction root without a valid canonical manifest is not clean: it
    // is visible as pending so an interrupted PREPARING write cannot silently
    // disappear while still burning its transactionId.
    if (!manifest || manifest.transactionId !== id || await transactionProjectIdentity(projectsDir, manifest.projectRoot).catch(() => null) !== expectedProjectIdentity) { pending.push(id); continue; }
    if (manifest.state === "PREPARING" || manifest.state === "WRITE_AHEAD" || manifest.state === "FAILED" || manifest.state === "ROLLING_BACK") pending.push(id); if (manifest.state === "APPLIED" || manifest.state === "ROLLING_BACK") rollback.push(id);
  }
  return Object.freeze({ pending: Object.freeze(pending), rollback: Object.freeze(rollback) });
}
