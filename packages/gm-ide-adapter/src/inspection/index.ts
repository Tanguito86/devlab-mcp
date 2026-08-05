import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { extname, relative } from "node:path";
import type { GmFileSnapshot, GmInspectRequest, GmProjectSnapshot } from "../contracts/index.js";
import { fail } from "../errors/index.js";
import { gameMakerProcesses, type ProcessInventory } from "../processes/index.js";
import { resolveInsideRoot, safeRelativePath } from "../paths/index.js";
import { canonicalHash, sha256 } from "../transactions/canonical.js";

export function parseGameMakerJson(text: string): unknown { return JSON.parse(text.replace(/,\s*([}\]])/g, "$1")); }
function git(root: string, args: readonly string[]): string | null { try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } }
const kind = (path: string): GmFileSnapshot["kind"] => extname(path).toLowerCase() === ".gml" ? "gml" : extname(path).toLowerCase() === ".yy" ? "yy" : extname(path).toLowerCase() === ".yyp" ? "yyp" : extname(path).toLowerCase() === ".json" ? "json" : "other";
const comparePath = (a: string, b: string): number => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
async function walk(root: string, maxFiles: number): Promise<readonly GmFileSnapshot[]> {
  const output: GmFileSnapshot[] = []; const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }); entries.sort((a, b) => comparePath(a.name, b.name));
    for (const entry of entries) { if (entry.name === ".git" || entry.name === ".gm-ide-staging") continue; const absolute = `${directory}/${entry.name}`; const info = await lstat(absolute); if (info.isSymbolicLink()) fail("PATH_ESCAPE", "project contains a symlink or junction", false, { path: relative(root, absolute) }); if (entry.isDirectory()) await visit(absolute); else if (entry.isFile()) { if (++output.length > maxFiles) fail("LIMIT_EXCEEDED", "project file limit exceeded"); const bytes = await readFile(absolute); const path = relative(root, absolute).replace(/\\/g, "/"); output[output.length - 1] = Object.freeze({ path, sha256: sha256(bytes), size: bytes.byteLength, kind: kind(path) }); } }
  }; await visit(root); return Object.freeze(output.sort((a, b) => comparePath(a.path, b.path)));
}
export async function inspectProject(projectsDir: string, request: GmInspectRequest, inventory?: ProcessInventory): Promise<GmProjectSnapshot> {
  if (request.capability !== "GM_INSPECT_V1" && request.capability !== "GM_STATUS_V1") fail("GATE_VIOLATION", "inspect requires GM_INSPECT_V1 or GM_STATUS_V1");
  const projectRoot = safeRelativePath(request.projectRoot, "projectRoot"); const root = await resolveInsideRoot(projectsDir, projectRoot, { existing: true });
  const info = await stat(root); if (!info.isDirectory()) fail("AUTHZ_PROJECT_ROOT", "projectRoot is not a directory");
  const files = await walk(root, request.maxFiles ?? 10_000); const projectFiles = files.filter(({ kind: entryKind }) => entryKind === "yyp"); if (projectFiles.length !== 1) fail("INVALID_REQUEST", "project must contain exactly one .yyp file");
  const projectFile = projectFiles[0]!.path; const parsed = parseGameMakerJson(await readFile(`${root}/${projectFile}`, "utf8")) as Record<string, unknown>; if (parsed.resourceType !== "GMProject") fail("INVALID_REQUEST", "project file is not a GMProject");
  const resources = Array.isArray(parsed.resources) ? parsed.resources as Array<Record<string, unknown>> : []; const refs = resources.map((resource) => (resource.id as Record<string, unknown> | undefined)?.path).filter((value): value is string => typeof value === "string").sort();
  const fingerprint = canonicalHash(files.map(({ path, sha256: digest, size }) => ({ path, sha256: digest, size })));
  const gitHead = git(root, ["rev-parse", "HEAD"]); const statusText = git(root, ["status", "--porcelain", "--", "."]); const gitStatus = Object.freeze(statusText ? statusText.split(/\r?\n/).sort() : []);
  const processes = await gameMakerProcesses(inventory); const warnings: string[] = [];
  if (gitStatus.length) warnings.push("DIRTY"); if (processes.some(({ name }) => /^GameMaker/i.test(name))) warnings.push("PROJECT_OPEN_UNCONFIRMED");
  const projectFormat = String((parsed.MetaData as Record<string, unknown> | undefined)?.IDEVersion ?? parsed.resourceVersion ?? "unknown"); const objects = Object.freeze(refs.filter((path) => path.startsWith("objects/"))); const rooms = Object.freeze(refs.filter((path) => path.startsWith("rooms/"))); const scripts = Object.freeze(refs.filter((path) => path.startsWith("scripts/"))); const references = Object.freeze(refs);
  const snapshotHash = canonicalHash({ schemaVersion: 1, projectRoot, projectFile, projectFormat, files, gitHead, objects, rooms, scripts, references, fingerprint });
  const snapshot = Object.freeze({ schemaVersion: 1 as const, projectRoot, projectType: "GameMaker" as const, projectFile, projectFormat, files, fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0), gitHead, gitStatus, objects, rooms, scripts, references, processes, warnings: Object.freeze(warnings.sort()), fingerprint, snapshotHash });
  if (request.expectedProjectFingerprint && request.expectedProjectFingerprint !== fingerprint) fail("EXPECTED_HASH_MISMATCH", "project fingerprint does not match request", true, { expected: request.expectedProjectFingerprint, actual: fingerprint });
  if (request.expectedHead !== null && request.expectedHead !== gitHead) fail("EXPECTED_HEAD_MISMATCH", "Git HEAD does not match request", true, { expected: request.expectedHead, actual: gitHead });
  return snapshot;
}
