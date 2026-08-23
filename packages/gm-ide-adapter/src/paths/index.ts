import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fail } from "../errors/index.js";

const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;
export function safeRelativePath(candidate: string, field = "path"): string {
  if (!candidate || candidate.includes("\0") || candidate.length > 1024 || isAbsolute(candidate) || /^[A-Za-z]:/.test(candidate) || candidate.startsWith("\\") || candidate.startsWith("//")) fail("PATH_ESCAPE", `${field} must be a non-empty relative path`);
  if (candidate.includes("/") && candidate.includes("\\")) fail("PATH_ESCAPE", `${field} cannot mix separators`);
  const normalized = candidate.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.length > 64 || parts.some((part) => !part || part === "." || part === ".." || part.includes(":") || part.endsWith(".") || part.endsWith(" ") || reserved.test(part) || /%2e|%2f|%5c/i.test(part))) fail("PATH_ESCAPE", `${field} contains a forbidden segment`);
  return normalized;
}
export function safeTransactionId(value: string): string { if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) fail("INVALID_REQUEST", "transactionId must use canonical lowercase ASCII"); return value; }
const DEFAULT_ALLOWED_EXTENSIONS = Object.freeze(["gml", "yy", "yyp", "json"]);
export function safeAllowedExtensions(input: readonly string[] | undefined): readonly string[] {
  const raw = input ?? DEFAULT_ALLOWED_EXTENSIONS;
  if (!raw.length || raw.length > 32) fail("INVALID_REQUEST", "allowedExtensions is outside policy");
  const normalized = [...new Set(raw.map((extension) => {
    if (typeof extension !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/.test(extension)) fail("INVALID_REQUEST", "allowedExtensions contains an invalid extension");
    return extension.toLowerCase();
  }))].sort();
  return Object.freeze(normalized);
}
export async function resolveRealRoot(root: string): Promise<string> { const absolute = resolve(root); const info = await lstat(absolute).catch(() => null); if (!info?.isDirectory() || info.isSymbolicLink()) fail("AUTHZ_PROJECT_ROOT", "projectsDir must be an existing real directory"); return realpath(absolute); }

/**
 * Return a conservative identity for a path below an authorized filesystem
 * root. Every existing component is canonicalized with realpath(), which is
 * important on Windows where a DOS 8.3 name can address the same directory as
 * its long name. Once the first missing component is reached, the remaining
 * suffix is appended to that real existing ancestor.
 *
 * NFKC + case folding deliberately remain fail-closed on non-Windows hosts so
 * plans created elsewhere cannot introduce identities that would collide when
 * later applied on Windows.
 */
export async function resolveFilesystemPathIdentity(root: string, candidate: string): Promise<string> {
  const normalized = safeRelativePath(candidate);
  const realRoot = await resolveRealRoot(root);
  const parts = normalized.split("/");
  let canonical = realRoot;

  for (let index = 0; index < parts.length; index += 1) {
    const probe = resolve(canonical, parts[index]!);
    const info = await lstat(probe).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (!info) {
      canonical = resolve(canonical, ...parts.slice(index));
      break;
    }
    canonical = await realpath(probe);
    const back = relative(realRoot, canonical);
    if (back === ".." || back.startsWith(`..${sep}`) || isAbsolute(back)) fail("PATH_ESCAPE", "path escapes authorized root");
  }

  const back = relative(realRoot, canonical);
  if (back === ".." || back.startsWith(`..${sep}`) || isAbsolute(back)) fail("PATH_ESCAPE", "path escapes authorized root");
  return resolve(canonical).replace(/\\/g, "/").replace(/\/+$/, "").normalize("NFKC").toLowerCase();
}

/** Compare two authorized relative paths by their actual filesystem identity. */
export async function isSameOrDescendantFilesystemPath(root: string, parent: string, candidate: string): Promise<boolean> {
  const [parentIdentity, candidateIdentity] = await Promise.all([
    resolveFilesystemPathIdentity(root, parent),
    resolveFilesystemPathIdentity(root, candidate),
  ]);
  return candidateIdentity === parentIdentity || candidateIdentity.startsWith(`${parentIdentity}/`);
}

export async function resolveInsideRoot(root: string, candidate: string, options: Readonly<{ existing?: boolean; rejectFinalSymlink?: boolean }> = {}): Promise<string> {
  const normalized = safeRelativePath(candidate); const realRoot = await resolveRealRoot(root); const target = resolve(realRoot, ...normalized.split("/")); const back = relative(realRoot, target);
  if (!back || back === ".." || back.startsWith(`..${sep}`) || isAbsolute(back)) fail("PATH_ESCAPE", "path escapes authorized root");
  let cursor = realRoot;
  for (const [index, part] of normalized.split("/").entries()) {
    cursor = resolve(cursor, part); const info = await lstat(cursor).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (info?.isSymbolicLink() && (options.rejectFinalSymlink !== false || index < normalized.split("/").length - 1)) fail("PATH_ESCAPE", "path traverses a symlink or junction");
  }
  if (options.existing && !(await stat(target).catch(() => null))) fail("AUTHZ_PROJECT_ROOT", "authorized path does not exist");
  return target;
}
