import { spawnSync } from "node:child_process";
import { lstat, open, opendir, readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import type { GmFileSnapshot, GmInspectRequest, GmProjectSnapshot } from "../contracts/index.js";
import { fail } from "../errors/index.js";
import { gameMakerProcesses, safeChildEnvironment, type ProcessInventory } from "../processes/index.js";
import { resolveInsideRoot, safeRelativePath } from "../paths/index.js";
import { canonicalHash, sha256 } from "../transactions/canonical.js";

export function parseGameMakerJson(text: string): unknown { return JSON.parse(text.replace(/,\s*([}\]])/g, "$1")); }
function gitEnvironment(): NodeJS.ProcessEnv {
  return Object.freeze({
    ...safeChildEnvironment(),
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0"
  });
}
const MAX_GIT_METADATA_ENTRIES = 100_000;
interface GitRepository { readonly gitDir: string; readonly workTree: string; readonly authorizedRoot: string; readonly executable: string }
interface GitCommandResult { readonly status: number; readonly stdout: string }

function isInside(parent: string, candidate: string): boolean {
  const back = relative(parent, candidate);
  return !back || (back !== ".." && !back.startsWith(`..${sep}`) && !isAbsolute(back));
}

async function metadataPath(authorizedRoot: string, candidate: string, expected: "file" | "directory", required = true): Promise<string | null> {
  const info = await lstat(candidate).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (!info) { if (required) fail("PATH_ESCAPE", "required Git metadata is unavailable"); return null; }
  if (info.isSymbolicLink()) fail("PATH_ESCAPE", "Git metadata cannot contain a symlink or junction");
  if ((expected === "file" && !info.isFile()) || (expected === "directory" && !info.isDirectory())) fail("PATH_ESCAPE", "Git metadata has an unexpected filesystem type");
  const physical = await realpath(candidate);
  if (!isInside(authorizedRoot, physical)) fail("PATH_ESCAPE", "Git metadata escapes the authorized root");
  return physical;
}

async function gitExecutable(): Promise<string> {
  const configured = process.env.DEVLAB_GIT;
  if (configured && (!isAbsolute(configured) || !/^git(?:\.exe)?$/i.test(basename(configured)))) fail("GATE_VIOLATION", "DEVLAB_GIT must be an absolute path to git or git.exe", true);
  const candidates = configured ? [configured] : process.platform === "win32"
    ? [
        "C:\\Program Files\\Git\\cmd\\git.exe",
        "C:\\Program Files\\Git\\bin\\git.exe",
        "C:\\Program Files (x86)\\Git\\cmd\\git.exe"
      ]
    : ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git", "/usr/local/git/bin/git"];
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    if (!isAbsolute(candidate) || !/^git(?:\.exe)?$/i.test(basename(candidate))) continue;
    const physical = await realpath(candidate).catch(() => null);
    if (!physical || !/^git(?:\.exe)?$/i.test(basename(physical))) continue;
    const info = await stat(physical).catch(() => null);
    if (info?.isFile()) return physical;
  }
  fail("GATE_VIOLATION", configured ? "DEVLAB_GIT does not identify a usable Git executable" : "a trusted Git executable is unavailable; configure DEVLAB_GIT", true);
}

async function auditGitMetadataTree(authorizedRoot: string, metadataRoot: string, budget: { entries: number }): Promise<void> {
  const pending = [metadataRoot];
  while (pending.length) {
    const current = pending.pop()!;
    if (++budget.entries > MAX_GIT_METADATA_ENTRIES) fail("LIMIT_EXCEEDED", "Git metadata entry limit exceeded", true);
    const info = await lstat(current).catch(() => fail("GATE_VIOLATION", "Git metadata changed during inspection", true));
    if (info.isSymbolicLink()) fail("PATH_ESCAPE", "Git metadata cannot contain a symlink or junction");
    if (!info.isDirectory() && !info.isFile()) fail("PATH_ESCAPE", "Git metadata has an unsupported filesystem type");
    const physical = await realpath(current).catch(() => fail("GATE_VIOLATION", "Git metadata identity could not be verified", true));
    if (!isInside(authorizedRoot, physical)) fail("PATH_ESCAPE", "Git metadata escapes the authorized root");
    if (!info.isDirectory()) continue;
    const directory = await opendir(current);
    for await (const entry of directory) pending.push(resolve(current, entry.name));
  }
}

function git(repository: GitRepository, root: string, args: readonly string[], allowedStatuses: readonly number[] = [0]): GitCommandResult {
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  const result = spawnSync(repository.executable, [
    "--no-optional-locks",
    `--git-dir=${repository.gitDir}`,
    `--work-tree=${repository.workTree}`,
    "-c", "core.fsmonitor=false",
    "-c", `core.hooksPath=${nullDevice}`,
    "-c", "core.untrackedCache=false",
    "-C", root,
    ...args
  ], {
    encoding: "utf8",
    env: gitEnvironment(),
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
    windowsHide: true
  });
  if (result.error || result.status === null || !allowedStatuses.includes(result.status)) fail("GATE_VIOLATION", "Git inspection failed closed", true, { operation: args[0] ?? "unknown" });
  return Object.freeze({ status: result.status, stdout: result.stdout.trim() });
}

async function discoverGitRepository(projectsDir: string, root: string): Promise<GitRepository | null> {
  const authorizedRoot = await realpath(projectsDir);
  let workTree = await realpath(root);
  while (isInside(authorizedRoot, workTree)) {
    const marker = resolve(workTree, ".git");
    const markerInfo = await lstat(marker).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (markerInfo) {
      if (markerInfo.isSymbolicLink()) fail("PATH_ESCAPE", "Git metadata cannot be a symlink or junction");
      let gitDir: string;
      if (markerInfo.isDirectory()) gitDir = (await metadataPath(authorizedRoot, marker, "directory"))!;
      else if (markerInfo.isFile()) {
        const match = /^gitdir:\s*(.+?)\s*$/i.exec(await readFile(marker, "utf8"));
        if (!match) fail("PATH_ESCAPE", "Git metadata file is invalid");
        gitDir = (await metadataPath(authorizedRoot, resolve(workTree, match[1]!), "directory"))!;
      } else fail("PATH_ESCAPE", "Git metadata has an unsupported filesystem type");
      if (!isInside(authorizedRoot, gitDir)) fail("PATH_ESCAPE", "Git metadata escapes the authorized root");
      const commonMarker = await metadataPath(authorizedRoot, resolve(gitDir, "commondir"), "file", false);
      let commonDir = gitDir;
      if (commonMarker) {
        const value = (await readFile(commonMarker, "utf8")).trim();
        if (!value || value.includes("\0") || /[\r\n]/.test(value)) fail("PATH_ESCAPE", "Git common directory pointer is invalid");
        commonDir = (await metadataPath(authorizedRoot, resolve(gitDir, value), "directory"))!;
      }
      const budget = { entries: 0 };
      await auditGitMetadataTree(authorizedRoot, commonDir, budget);
      if (gitDir !== commonDir) await auditGitMetadataTree(authorizedRoot, gitDir, budget);
      await metadataPath(authorizedRoot, resolve(gitDir, "HEAD"), "file");
      await metadataPath(authorizedRoot, resolve(gitDir, "index"), "file", false);
      await metadataPath(authorizedRoot, resolve(commonDir, "refs"), "directory", false);
      await metadataPath(authorizedRoot, resolve(commonDir, "packed-refs"), "file", false);
      const configPaths = [...new Set([resolve(commonDir, "config"), resolve(gitDir, "config"), resolve(gitDir, "config.worktree")])];
      const verifiedConfigPaths: string[] = [];
      for (const configPath of configPaths) {
        const verified = await metadataPath(authorizedRoot, configPath, "file", configPath === resolve(commonDir, "config"));
        if (verified) verifiedConfigPaths.push(verified);
      }
      const objectsDir = (await metadataPath(authorizedRoot, resolve(commonDir, "objects"), "directory"))!;
      if (gitDir !== commonDir) await metadataPath(authorizedRoot, resolve(gitDir, "objects"), "directory", false);
      const alternates = await metadataPath(authorizedRoot, resolve(objectsDir, "info", "alternates"), "file", false);
      if (alternates && (await readFile(alternates, "utf8")).trim()) fail("PATH_ESCAPE", "Git alternate object databases are not allowed");
      const repository = Object.freeze({ gitDir, workTree, authorizedRoot, executable: await gitExecutable() });
      for (const configPath of verifiedConfigPaths) {
        // Parse every repository-owned config file directly. `--local` omits
        // config.worktree when worktreeConfig is enabled, while a later status
        // command would load it and could execute a hidden filter or diff
        // driver. `--file` plus `--no-includes` makes the audit complete without
        // following an include before it can be rejected.
        const includes = git(repository, root, ["config", `--file=${configPath}`, "--no-includes", "--get-regexp", "^include([Ii]f\\..*)?\\.path$"], [0, 1]);
        if (includes.status === 0 && includes.stdout) fail("PATH_ESCAPE", "Git local config includes are not allowed");
        const executableConfig = git(repository, root, ["config", `--file=${configPath}`, "--no-includes", "--get-regexp", "^(filter\\..*\\.(clean|smudge|process)|diff\\..*\\.(command|textconv)|core\\.attributesfile)$"], [0, 1]);
        if (executableConfig.status === 0 && executableConfig.stdout) fail("GATE_VIOLATION", "Git local config contains executable filters, diff drivers, or an external attributes file", true);
      }
      const reportedGitDir = await realpath(git(repository, root, ["rev-parse", "--absolute-git-dir"]).stdout).catch(() => fail("GATE_VIOLATION", "Git directory identity could not be verified", true));
      const reportedWorkTree = await realpath(git(repository, root, ["rev-parse", "--show-toplevel"]).stdout).catch(() => fail("GATE_VIOLATION", "Git worktree identity could not be verified", true));
      const reportedCommonDir = await realpath(git(repository, root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).stdout).catch(() => fail("GATE_VIOLATION", "Git common directory identity could not be verified", true));
      if (reportedGitDir !== gitDir || reportedWorkTree !== workTree || reportedCommonDir !== commonDir) fail("PATH_ESCAPE", "Git repository identity escapes the authorized root");
      return repository;
    }
    if (workTree === authorizedRoot) break;
    workTree = dirname(workTree);
  }
  return null;
}
const kind = (path: string): GmFileSnapshot["kind"] => extname(path).toLowerCase() === ".gml" ? "gml" : extname(path).toLowerCase() === ".yy" ? "yy" : extname(path).toLowerCase() === ".yyp" ? "yyp" : extname(path).toLowerCase() === ".json" ? "json" : "other";
const comparePath = (a: string, b: string): number => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
async function walk(root: string, maxFiles: number): Promise<readonly GmFileSnapshot[]> {
  const output: GmFileSnapshot[] = []; const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }); entries.sort((a, b) => comparePath(a.name, b.name));
    for (const entry of entries) { const absolute = `${directory}/${entry.name}`; const info = await lstat(absolute); if (info.isSymbolicLink()) fail("PATH_ESCAPE", "project contains a symlink or junction", false, { path: relative(root, absolute) }); if (entry.name === ".git" || entry.name === ".gm-ide-staging") continue; if (entry.isDirectory()) await visit(absolute); else if (entry.isFile()) { if (++output.length > maxFiles) fail("LIMIT_EXCEEDED", "project file limit exceeded"); const bytes = await readFile(absolute); const path = relative(root, absolute).replace(/\\/g, "/"); output[output.length - 1] = Object.freeze({ path, sha256: sha256(bytes), size: bytes.byteLength, kind: kind(path) }); } }
  }; await visit(root); return Object.freeze(output.sort((a, b) => comparePath(a.path, b.path)));
}

async function readSnapshotBytes(root: string, file: GmFileSnapshot): Promise<Buffer> {
  const absolute = await resolveInsideRoot(root, file.path, { existing: true });
  const handle = await open(absolute, "r");
  try {
    const before = await handle.stat();
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.size !== after.size || bytes.byteLength !== after.size
      || bytes.byteLength !== file.size || sha256(bytes) !== file.sha256) {
      fail("CONCURRENT_MODIFICATION", "project metadata changed during inspection", true, { path: file.path });
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function inspectProject(projectsDir: string, request: GmInspectRequest, inventory?: ProcessInventory): Promise<GmProjectSnapshot> {
  if (request.capability !== "GM_INSPECT_V1" && request.capability !== "GM_STATUS_V1") fail("GATE_VIOLATION", "inspect requires GM_INSPECT_V1 or GM_STATUS_V1");
  const projectRoot = safeRelativePath(request.projectRoot, "projectRoot"); const root = await resolveInsideRoot(projectsDir, projectRoot, { existing: true });
  const info = await stat(root); if (!info.isDirectory()) fail("AUTHZ_PROJECT_ROOT", "projectRoot is not a directory");
  const files = await walk(root, request.maxFiles ?? 10_000); const projectFiles = files.filter(({ kind: entryKind }) => entryKind === "yyp"); if (projectFiles.length !== 1) fail("INVALID_REQUEST", "project must contain exactly one .yyp file");
  await (request as GmInspectRequest & { afterWalk?: () => Promise<void> }).afterWalk?.();
  const projectFileSnapshot = projectFiles[0]!;
  const projectFile = projectFileSnapshot.path;
  const projectBytes = await readSnapshotBytes(root, projectFileSnapshot);
  let projectText: string;
  try { projectText = new TextDecoder("utf-8", { fatal: true }).decode(projectBytes); }
  catch { fail("INVALID_REQUEST", "project file is not valid UTF-8 text"); }
  const parsed = parseGameMakerJson(projectText) as Record<string, unknown>; if (parsed.resourceType !== "GMProject") fail("INVALID_REQUEST", "project file is not a GMProject");
  const resources = Array.isArray(parsed.resources) ? parsed.resources as Array<Record<string, unknown>> : []; const refs = resources.map((resource) => (resource.id as Record<string, unknown> | undefined)?.path).filter((value): value is string => typeof value === "string").sort();
  const fingerprint = canonicalHash(files.map(({ path, sha256: digest, size }) => ({ path, sha256: digest, size })));
  const repository = await discoverGitRepository(projectsDir, root);
  const headResult = repository ? git(repository, root, ["rev-parse", "--verify", "--quiet", "HEAD"], [0, 1]) : null;
  const gitHead = headResult?.status === 0 ? headResult.stdout : null;
  const statusText = repository ? git(repository, root, ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=all", "--", "."]).stdout : "";
  const gitStatus = Object.freeze(statusText ? statusText.split(/\r?\n/).sort() : []);
  const processes = await gameMakerProcesses(inventory); const warnings: string[] = [];
  if (gitStatus.length) warnings.push("DIRTY"); if (processes.some(({ name }) => /^GameMaker/i.test(name))) warnings.push("PROJECT_OPEN_UNCONFIRMED");
  const projectFormat = String((parsed.MetaData as Record<string, unknown> | undefined)?.IDEVersion ?? parsed.resourceVersion ?? "unknown"); const objects = Object.freeze(refs.filter((path) => path.startsWith("objects/"))); const rooms = Object.freeze(refs.filter((path) => path.startsWith("rooms/"))); const scripts = Object.freeze(refs.filter((path) => path.startsWith("scripts/"))); const references = Object.freeze(refs);
  const snapshotHash = canonicalHash({ schemaVersion: 1, projectRoot, projectFile, projectFormat, files, gitHead, objects, rooms, scripts, references, fingerprint });
  const snapshot = Object.freeze({ schemaVersion: 1 as const, projectRoot, projectType: "GameMaker" as const, projectFile, projectFormat, files, fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0), gitHead, gitStatus, objects, rooms, scripts, references, processes, warnings: Object.freeze(warnings.sort()), fingerprint, snapshotHash });
  if (request.expectedProjectFingerprint && request.expectedProjectFingerprint !== fingerprint) fail("EXPECTED_HASH_MISMATCH", "project fingerprint does not match request", true, { expected: request.expectedProjectFingerprint, actual: fingerprint });
  if (request.expectedHead !== null && request.expectedHead !== gitHead) fail("EXPECTED_HEAD_MISMATCH", "Git HEAD does not match request", true, { expected: request.expectedHead, actual: gitHead });
  return snapshot;
}
