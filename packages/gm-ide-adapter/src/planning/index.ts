import { readFile } from "node:fs/promises";
import type { GmPlanRequest, GmMutationPlan, PlannedFile } from "../contracts/index.js";
import { fail } from "../errors/index.js";
import { inspectProject } from "../inspection/index.js";
import { resolveInsideRoot, safeRelativePath, safeTransactionId } from "../paths/index.js";
import type { ProcessInventory } from "../processes/index.js";
import { canonicalHash, sha256 } from "../transactions/canonical.js";

export const planHash = (plan: GmMutationPlan): string => canonicalHash(plan);
const DEFAULT_ALLOWED_EXTENSIONS = Object.freeze(["gml", "yy", "yyp", "json"]);
function normalizeAllowedExtensions(input: readonly string[] | undefined): readonly string[] {
  const raw = input ?? DEFAULT_ALLOWED_EXTENSIONS;
  if (!raw.length || raw.length > 32) fail("INVALID_REQUEST", "allowedExtensions is outside policy");
  const normalized = [...new Set(raw.map((extension) => { if (typeof extension !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/.test(extension)) fail("INVALID_REQUEST", "allowedExtensions contains an invalid extension"); return extension.toLowerCase(); }))];
  return Object.freeze(normalized);
}
export async function createPlan(projectsDir: string, request: GmPlanRequest, inventory?: ProcessInventory): Promise<GmMutationPlan> {
  if (request.capability !== "GM_PLAN_V1") fail("GATE_VIOLATION", "plan requires GM_PLAN_V1"); safeTransactionId(request.transactionId);
  if (!request.expectedProjectFingerprint) fail("INVALID_REQUEST", "plan requires an expected project fingerprint");
  if (!request.files.length || request.files.length > 64) fail("LIMIT_EXCEEDED", "plan file count is outside policy");
  const allowedExtensions = normalizeAllowedExtensions(request.allowedExtensions);
  const allowlist = Object.freeze([...new Set(request.allowlist.map((path) => safeRelativePath(path, "allowlist")))].sort());
  const requestedPaths = request.files.map(({ path }) => safeRelativePath(path)); if (new Set(requestedPaths.map((path) => path.toLowerCase())).size !== requestedPaths.length) fail("INVALID_REQUEST", "plan has duplicate paths");
  for (const path of requestedPaths) if (!allowlist.includes(path)) fail("FILE_NOT_ALLOWLISTED", "planned file is outside allowlist", false, { path });
  const snapshot = await inspectProject(projectsDir, { ...request, capability: "GM_INSPECT_V1" }, inventory); const root = await resolveInsideRoot(projectsDir, request.projectRoot, { existing: true });
  const files: PlannedFile[] = [];
  for (const edit of [...request.files].sort((a, b) => a.path.localeCompare(b.path))) {
    const path = safeRelativePath(edit.path); const extension = path.split(".").pop() ?? ""; if (!allowedExtensions.includes(extension.toLowerCase())) fail("FILE_NOT_ALLOWLISTED", "file extension is not writable", false, { path });
    const hasText = typeof edit.content === "string"; const hasBinary = typeof edit.contentBase64 === "string"; if (hasText === hasBinary) fail("INVALID_REQUEST", "planned file must provide exactly one of content or contentBase64");
    const after = hasBinary ? Buffer.from(edit.contentBase64!, "base64") : Buffer.from(edit.content!, "utf8");
    if (after.byteLength > 4 * 1024 * 1024) fail("LIMIT_EXCEEDED", "planned content exceeds per-file limit");
    if (hasBinary && !/^[A-Za-z0-9+/]+={0,2}$/.test(edit.contentBase64!)) fail("INVALID_REQUEST", "contentBase64 is malformed");
    const absolute = await resolveInsideRoot(root, path); const before = await readFile(absolute).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (edit.action === "modify" && before === null) fail("INVALID_REQUEST", "modify target does not exist", false, { path });
    if (edit.action === "create" && before !== null) fail("INVALID_REQUEST", "create target already exists", false, { path });
    files.push(Object.freeze({ path, action: edit.action, beforeSha256: before ? sha256(before) : null, afterSha256: sha256(after), afterContentBase64: after.toString("base64") }));
  }
  return Object.freeze({ schemaVersion: 1, transactionId: request.transactionId, operation: "apply-safe", capability: "GM_APPLY_SAFE_V1", gate: "PLAN_ONLY", projectRoot: safeRelativePath(request.projectRoot), snapshotHash: snapshot.snapshotHash, projectFingerprint: snapshot.fingerprint, expectedHead: snapshot.gitHead, allowlist, files: Object.freeze(files), verification: Object.freeze({ ...request.verificationPolicy }), rollback: Object.freeze({ required: true }) });
}
