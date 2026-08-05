import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fail } from "../errors/index.js";

const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;
export function safeRelativePath(candidate: string, field = "path"): string {
  if (!candidate || candidate.includes("\0") || candidate.length > 1024 || isAbsolute(candidate) || /^[A-Za-z]:/.test(candidate) || candidate.startsWith("\\") || candidate.startsWith("//")) fail("PATH_ESCAPE", `${field} must be a non-empty relative path`);
  if (candidate.includes("/") && candidate.includes("\\")) fail("PATH_ESCAPE", `${field} cannot mix separators`);
  const normalized = candidate.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.length > 64 || parts.some((part) => !part || part === "." || part === ".." || part.includes(":") || part.endsWith(".") || reserved.test(part) || /%2e|%2f|%5c/i.test(part))) fail("PATH_ESCAPE", `${field} contains a forbidden segment`);
  return normalized;
}
export function safeTransactionId(value: string): string { if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) fail("INVALID_REQUEST", "transactionId is invalid"); return value; }
export async function resolveRealRoot(root: string): Promise<string> { const absolute = resolve(root); const info = await lstat(absolute).catch(() => null); if (!info?.isDirectory() || info.isSymbolicLink()) fail("AUTHZ_PROJECT_ROOT", "projectsDir must be an existing real directory"); return realpath(absolute); }
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
