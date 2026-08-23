import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import {
  AsepriteError,
  ASEPRITE_ENV,
  ingestAsepriteSprite,
  ORIGIN_PRESET_NAMES,
  publishAsepriteAsset,
  probeSource,
  resolveAsepriteExecutable,
  type OriginPreset,
} from "@tanguito/devlab-aseprite-ingest";
import { resolveInsideRoot, resolveRealRoot, safeRelativePath } from "@tanguito/devlab-gm-ide-adapter/internal";

import type {
  AsepriteIngestInput,
  AsepriteInspectInput,
  AsepritePublishInput,
  ToolOutput,
} from "./contracts.js";

export const SOURCE_ROOT_ENV = "DEVLAB_ASEPRITE_SOURCE_ROOT";
export const REPO_ROOT_ENV = "DEVLAB_ASEPRITE_REPO_ROOT";
/**
 * The catalog index, relative to the repository root. It is fixed rather than
 * configurable for the same reason the spec and artifact paths are: a caller
 * that could name the index could point a publish at any JSON file.
 */
export const CATALOG_INDEX_PATH = "assets/catalog/asset-catalog.json";
/** Recorded in an approved entry's provenance so the grant is attributable. */
export const APPROVED_BY = "aseprite-ingest-mcp";
export const WRITE_ENV = "DEVLAB_ASEPRITE_WRITE";
export { ASEPRITE_ENV };

const TIMEOUT_MS = 120_000;

type PublicRequestId = string | number;

export type GmIngestErrorCode =
  | "GM_CONFIG_REQUIRED"
  | "GM_CONFIG_INVALID"
  | "GM_INGEST_WRITE_NOT_ENABLED"
  | "GM_SOURCE_NOT_ALLOWED"
  | "GM_INTERNAL_ERROR";

export class GmIngestError extends Error {
  constructor(readonly code: GmIngestErrorCode, message: string, readonly recoverable: boolean) {
    super(message);
    this.name = "GmIngestError";
  }
}

async function resolveRoot(
  env: Readonly<Record<string, string | undefined>>,
  variable: string,
): Promise<string> {
  const configured = env[variable];
  if (!configured) throw new GmIngestError("GM_CONFIG_REQUIRED", `${variable} must be configured before calling an Aseprite tool.`, true);
  if (!isAbsolute(configured)) throw new GmIngestError("GM_CONFIG_INVALID", `${variable} must be an absolute path.`, true);
  try {
    return await resolveRealRoot(configured);
  } catch {
    throw new GmIngestError("GM_CONFIG_INVALID", `${variable} must identify an existing real directory.`, true);
  }
}

export function writeEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const raw = env[WRITE_ENV];
  return raw === "1" || raw?.toLowerCase() === "true";
}

const SOURCE_EXTENSION = /\.(?:aseprite|ase)$/i;

/**
 * Resolves a caller-named source inside the configured source root.
 *
 * The ingest library takes an absolute path because its CLI caller is trusted.
 * A tool caller is not: without this, any file on the host could be handed to
 * Aseprite. The adapter's path policy rejects traversal, drive letters, UNC
 * paths, NUL and symlinked segments, and only then is the file required to
 * actually be an Aseprite source.
 */
export async function resolveSource(
  env: Readonly<Record<string, string | undefined>>,
  source: string,
): Promise<Readonly<{ absolute: string; relative: string }>> {
  const root = await resolveRoot(env, SOURCE_ROOT_ENV);
  let relative: string;
  try {
    relative = safeRelativePath(source, "source");
  } catch {
    throw new GmIngestError("GM_SOURCE_NOT_ALLOWED", "The source path violates the source-root boundary.", false);
  }
  if (!SOURCE_EXTENSION.test(relative)) {
    throw new GmIngestError("GM_SOURCE_NOT_ALLOWED", "The source must be an .aseprite or .ase file.", false);
  }
  let absolute: string;
  try {
    absolute = await resolveInsideRoot(root, relative, { existing: true });
  } catch {
    throw new GmIngestError("GM_SOURCE_NOT_ALLOWED", "The source does not exist inside the configured source root.", true);
  }
  const info = await stat(absolute).catch(() => null);
  if (!info?.isFile()) throw new GmIngestError("GM_SOURCE_NOT_ALLOWED", "The source is not a regular file.", false);
  return Object.freeze({ absolute, relative });
}

export class GovernedAsepriteIngestService {
  constructor(private readonly env: Readonly<Record<string, string | undefined>> = process.env) {}

  async status(requestId: PublicRequestId) {
    const blockers: string[] = [];
    let asepriteConfigured = false;
    let asepritePresent = false;
    try {
      await resolveAsepriteExecutable(this.env);
      asepriteConfigured = true;
      asepritePresent = true;
    } catch (error) {
      asepriteConfigured = Boolean(this.env[ASEPRITE_ENV]);
      blockers.push(error instanceof AsepriteError ? error.code : `${ASEPRITE_ENV} is unusable`);
    }
    let sourceRootConfigured = false;
    try { await resolveRoot(this.env, SOURCE_ROOT_ENV); sourceRootConfigured = true; } catch { blockers.push(`${SOURCE_ROOT_ENV} is not usable`); }
    let repoRootConfigured = false;
    try { await resolveRoot(this.env, REPO_ROOT_ENV); repoRootConfigured = true; } catch { blockers.push(`${REPO_ROOT_ENV} is not usable`); }
    const enabled = writeEnabled(this.env);
    if (!enabled) blockers.push(`${WRITE_ENV} is not enabled`);

    return {
      ok: true as const,
      schemaVersion: 1 as const,
      requestId,
      serverGate: "READ_ONLY" as const,
      asepriteConfigured,
      asepritePresent,
      sourceRootConfigured,
      repoRootConfigured,
      writeEnabled: enabled,
      originPresets: [...ORIGIN_PRESET_NAMES],
      blockers,
    };
  }

  async inspect(input: AsepriteInspectInput, requestId: PublicRequestId) {
    // The source boundary is checked before the toolchain is even resolved, so
    // a hostile path is refused for the right reason on any host -- including
    // one with no Aseprite at all, where CI runs.
    const source = await resolveSource(this.env, input.source);
    const executable = await resolveAsepriteExecutable(this.env);
    const scratch = await mkdtemp(join(tmpdir(), "aseprite-mcp-probe-"));
    try {
      const metadata = await probeSource({ executable, source: source.absolute, scratchDir: scratch, timeoutMs: TIMEOUT_MS });
      const bytes = await readFile(source.absolute);
      return {
        ok: true as const,
        schemaVersion: 1 as const,
        requestId,
        serverGate: "READ_ONLY" as const,
        // The relative name is echoed back, never the resolved host path.
        source: source.relative,
        sourceSha256: createHash("sha256").update(bytes).digest("hex"),
        frameCount: metadata.frameCount,
        width: metadata.width,
        height: metadata.height,
        colourFormat: metadata.format,
        asepriteVersion: metadata.asepriteVersion,
        frameDurationsMs: metadata.frames.map(({ durationMs }) => durationMs),
      };
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }

  async ingest(input: AsepriteIngestInput, requestId: PublicRequestId) {
    if (!writeEnabled(this.env)) {
      throw new GmIngestError("GM_INGEST_WRITE_NOT_ENABLED", `Set ${WRITE_ENV}=1 to allow this server to write into the asset catalog.`, true);
    }
    const source = await resolveSource(this.env, input.source);
    const repoRoot = await resolveRoot(this.env, REPO_ROOT_ENV);
    const result = await ingestAsepriteSprite({
      source: source.absolute,
      repoRoot,
      assetId: input.assetId,
      version: input.version,
      origin: (input.origin ?? "centre") as OriginPreset,
      timeoutMs: TIMEOUT_MS,
      env: this.env,
    });
    if (!result.deterministic) {
      // The library refuses first; this is a belt-and-braces guard so a future
      // change cannot quietly relax the gate on the way out.
      throw new GmIngestError("GM_INTERNAL_ERROR", "The ingest reported a non-deterministic export.", false);
    }
    return {
      ok: true as const,
      schemaVersion: 1 as const,
      requestId,
      serverGate: "CATALOG_WRITE" as const,
      assetId: result.assetId,
      version: result.version,
      frameCount: result.frames.length,
      dimensions: { width: result.spec.width, height: result.spec.height },
      origin: { x: result.spec.origin.x, y: result.spec.origin.y },
      specPath: result.specPath,
      specSha256: result.specSha256,
      artifactManifestPath: result.artifactManifestPath,
      exports: result.frames.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })),
      deterministic: true as const,
      asepriteVersion: result.asepriteVersion,
      catalogStatus: "DRAFT" as const,
      catalogEntry: { ...result.catalogEntry },
    };
  }

  /**
   * Registers an ingested asset in the catalog index, at the status the caller
   * asks for.
   *
   * Nothing previously wrote this file, so an ingested sprite could not reach a
   * project without someone editing JSON by hand. Granting APPROVED here is
   * deliberate and was asked for; the safety that replaces the human review is
   * in the library, which rebuilds the entry from the files on disk and refuses
   * to publish an asset whose frames changed since ingest.
   */
  async publish(input: AsepritePublishInput, requestId: PublicRequestId) {
    if (!writeEnabled(this.env)) {
      throw new GmIngestError("GM_INGEST_WRITE_NOT_ENABLED", `Set ${WRITE_ENV}=1 to allow this server to write into the asset catalog.`, true);
    }
    const repoRoot = await resolveRoot(this.env, REPO_ROOT_ENV);
    const result = await publishAsepriteAsset({
      repoRoot,
      catalogPath: CATALOG_INDEX_PATH,
      assetId: input.assetId,
      version: input.version,
      status: input.status,
      approvedBy: APPROVED_BY,
      dryRun: input.dryRun ?? true,
    });
    return {
      ok: true as const,
      schemaVersion: 1 as const,
      requestId,
      serverGate: "CATALOG_WRITE" as const,
      assetId: result.assetId,
      version: result.version,
      status: result.status,
      published: result.published,
      dryRun: result.dryRun,
      replaced: result.replaced,
      catalogPath: result.catalogPath,
      verifiedOutputs: result.verifiedOutputs,
      catalogSha256: result.catalogSha256,
      entry: { ...result.entry },
    };
  }
}

export function mapToolError(error: unknown, requestId: PublicRequestId): ToolOutput {
  if (error instanceof GmIngestError) {
    return { ok: false, schemaVersion: 1, requestId, error: { code: error.code, message: error.message, recoverable: error.recoverable } };
  }
  // Ingest errors already use a public, path-free vocabulary.
  if (error instanceof AsepriteError) {
    return { ok: false, schemaVersion: 1, requestId, error: { code: error.code, message: error.message, recoverable: error.recoverable } };
  }
  const type = error instanceof Error ? error.name : typeof error;
  process.stderr.write(`[aseprite-ingest-mcp] GM_INTERNAL_ERROR request=${String(requestId)} type=${type}\n`);
  return {
    ok: false,
    schemaVersion: 1,
    requestId,
    error: { code: "GM_INTERNAL_ERROR", message: "The Aseprite request failed closed.", recoverable: false },
  };
}
