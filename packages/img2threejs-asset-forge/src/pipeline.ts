import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertSafeRelativePath, resolveInsideRoot } from "./artifacts.js";
import { canonicalJson } from "./safe-generation.js";
import { AssetForgeError, type BuildStatus } from "./production.js";

export interface AtomicBuildRequest { readonly assetId: string; readonly version: string; readonly buildId: string; readonly resume: boolean }
export interface BuildAdapterResult { readonly status: BuildStatus; readonly artifactManifest: Readonly<Record<string, unknown>>; readonly openBlockers: readonly string[]; readonly openRequired: readonly string[]; readonly outputBytes: number }
export interface BuildAdapter { readonly id: string; build(request: AtomicBuildRequest, stagingDirectory: string): Promise<BuildAdapterResult> }
export interface AtomicBuildResult extends BuildAdapterResult { readonly assetId: string; readonly version: string; readonly buildId: string; readonly stagingDirectory: string; readonly canonicalDirectory?: string; readonly promoted: boolean; readonly reused: boolean; readonly failureCode?: string }

const bytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, "utf8");
const hash = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");
async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; } }

export async function runAtomicBuild(root: string, request: AtomicBuildRequest, adapter: BuildAdapter): Promise<AtomicBuildResult> {
  const assetId = assertSafeRelativePath(request.assetId); const version = assertSafeRelativePath(request.version); const buildId = assertSafeRelativePath(request.buildId);
  if (assetId.includes("/") || version.includes("/") || buildId.includes("/")) throw new AssetForgeError("INVALID_INPUT", "assetId, version and buildId must each be one safe segment");
  const stagingRelative = `staging/${buildId}/${assetId}/${version}`; const canonicalRelative = `artifacts/${assetId}/${version}`;
  await mkdir(root, { recursive: true }); const stagingDirectory = resolveInsideRoot(root, stagingRelative); const canonicalDirectory = resolveInsideRoot(root, canonicalRelative);
  if (await exists(stagingDirectory)) { if (!request.resume) await rm(stagingDirectory, { recursive: true, force: true }); }
  await mkdir(stagingDirectory, { recursive: true });
  await writeFile(join(stagingDirectory, "staging-state.json"), bytes({ schemaVersion: 1, state: "BUILDING", assetId, version, buildId, adapter: adapter.id }));
  try {
    const result = await adapter.build(request, stagingDirectory); const manifestBytes = bytes(result.artifactManifest); const manifestHash = hash(manifestBytes);
    await writeFile(join(stagingDirectory, "artifact-manifest.json"), manifestBytes);
    if (result.status !== "SUCCESS" || result.openBlockers.length || result.openRequired.length) {
      const failureCode = result.openBlockers.length ? "OPEN_BLOCKER" : result.openRequired.length ? "OPEN_REQUIRED" : "BUILD_NOT_SUCCESS";
      const failed = { schemaVersion: 1, state: "FAILED", failureCode, status: result.status, manifestSha256: manifestHash };
      await writeFile(join(stagingDirectory, "staging-state.json"), bytes(failed));
      return Object.freeze({ ...result, assetId, version, buildId, stagingDirectory, promoted: false, reused: false, failureCode });
    }
    await writeFile(join(stagingDirectory, "staging-state.json"), bytes({ schemaVersion: 1, state: "READY", status: result.status, manifestSha256: manifestHash }));
    await mkdir(dirname(canonicalDirectory), { recursive: true });
    if (await exists(canonicalDirectory)) {
      const existing = await readFile(join(canonicalDirectory, "artifact-manifest.json"));
      if (hash(existing) !== manifestHash) throw new AssetForgeError("VERSION_IMMUTABLE", `${assetId}@${version} already exists with different content`);
      await rm(stagingDirectory, { recursive: true, force: true });
      return Object.freeze({ ...result, assetId, version, buildId, stagingDirectory, canonicalDirectory, promoted: false, reused: true });
    }
    await rename(stagingDirectory, canonicalDirectory);
    return Object.freeze({ ...result, assetId, version, buildId, stagingDirectory, canonicalDirectory, promoted: true, reused: false });
  } catch (error) {
    const code = error instanceof AssetForgeError ? error.code : "INTERNAL_FAILURE";
    await writeFile(join(stagingDirectory, "staging-state.json"), bytes({ schemaVersion: 1, state: "FAILED", failureCode: code, message: error instanceof Error ? error.message : String(error) })).catch(() => undefined);
    return Object.freeze({ status: "BLOCKED", artifactManifest: Object.freeze({ schemaVersion: 1, incomplete: true }), openBlockers: Object.freeze([code]), openRequired: Object.freeze([]), outputBytes: 0, assetId, version, buildId, stagingDirectory, promoted: false, reused: false, failureCode: code });
  }
}

export interface BatchBuildRequest { readonly batchId: string; readonly concurrency: number; readonly resume: boolean; readonly assets: readonly Readonly<{ assetId: string; version: string; adapter: BuildAdapter }>[] }
export interface BatchBuildResult { readonly schemaVersion: 1; readonly batchId: string; readonly status: "SUCCESS" | "MIXED" | "BLOCKED"; readonly results: readonly AtomicBuildResult[]; readonly summary: Readonly<{ total: number; succeeded: number; changed: number; blocked: number }> }

export async function runBuildBatch(root: string, request: BatchBuildRequest): Promise<BatchBuildResult> {
  if (!Number.isSafeInteger(request.concurrency) || request.concurrency < 1 || request.concurrency > 4) throw new AssetForgeError("BATCH_LIMIT", "batch concurrency must be between 1 and 4");
  if (!request.assets.length || request.assets.length > 256) throw new AssetForgeError("BATCH_LIMIT", "batch asset count is outside policy");
  const ordered = [...request.assets].sort((a, b) => `${a.assetId}@${a.version}`.localeCompare(`${b.assetId}@${b.version}`)); const output = new Array<AtomicBuildResult>(ordered.length); let cursor = 0;
  const worker = async (): Promise<void> => { while (true) { const index = cursor; cursor += 1; const item = ordered[index]; if (!item) return; output[index] = await runAtomicBuild(root, { assetId: item.assetId, version: item.version, buildId: `${request.batchId}-${String(index + 1).padStart(3, "0")}`, resume: request.resume }, item.adapter); } };
  await Promise.all(Array.from({ length: Math.min(request.concurrency, ordered.length) }, () => worker()));
  const succeeded = output.filter(({ status }) => status === "SUCCESS").length; const changed = output.filter(({ status }) => status === "CHANGES_REQUIRED").length; const blocked = output.filter(({ status }) => status === "BLOCKED").length;
  const status = blocked === output.length ? "BLOCKED" : blocked || changed ? "MIXED" : "SUCCESS";
  return Object.freeze({ schemaVersion: 1, batchId: request.batchId, status, results: Object.freeze(output), summary: Object.freeze({ total: output.length, succeeded, changed, blocked }) });
}
