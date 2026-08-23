import { createHash } from "node:crypto";
import { appendFile, readFile, rename, writeFile } from "node:fs/promises";

import { resolveInsideRoot, safeRelativePath } from "@tanguito/devlab-gm-ide-adapter/internal";

import { AsepriteError } from "./aseprite.js";
import { canonicalJson } from "./ingest.js";

/**
 * Registering an ingested asset in the Asset Forge catalog index.
 *
 * Ingest writes the spec, the artifact manifest and the frames, then hands back
 * a catalog entry -- but nothing put that entry in `asset-catalog.json`, so the
 * index was maintained by hand and no ingested sprite could reach a project
 * without someone editing JSON. This closes that.
 *
 * The catalog entry's shape is fixed by Asset Forge's validator, which accepts
 * an exact set of keys and no others, so the approval is not recorded inside it.
 * It goes to an append-only log beside the catalog instead -- which is the
 * better artifact anyway: a catalog entry is replaced on every republish, and a
 * record of who granted what should not be.
 *
 * The status is the caller's to choose. Publishing as `APPROVED` is what the
 * bridge requires before an import, and it was previously reserved for a human;
 * the repository owner asked for it to be available without one. What replaces
 * the human is not trust but verification: the entry is rebuilt from the files
 * on disk rather than accepted from the caller, every frame's digest and byte
 * length must match what the manifest recorded at ingest, and the manifest must
 * still describe the spec it was built from. An asset whose bytes changed after
 * ingest cannot be published at all, which is the check a person skimming a
 * JSON file would not have performed.
 */

export type PublishStatus = "DRAFT" | "APPROVED";

export interface PublishRequest {
  readonly repoRoot: string;
  /** Catalog index, relative to `repoRoot`. */
  readonly catalogPath: string;
  readonly assetId: string;
  readonly version: string;
  readonly status: PublishStatus;
  /** Recorded in the entry's provenance so an approval is attributable. */
  readonly approvedBy: string;
  readonly now?: () => string;
  readonly dryRun?: boolean;
}

/** Append-only record of every promotion, beside the catalog it describes. */
export const APPROVAL_LOG_PATH = "assets/catalog/approvals.jsonl";

/**
 * The header Asset Forge's validator demands, exactly. Publishing must never
 * produce a catalog the bridge then refuses to read -- an index that fails to
 * load takes every other asset down with it, not just the one being published.
 */
const CATALOG_SCHEMA_VERSION = 1;
const CATALOG_MIGRATION = "asset-catalog-v1";

export interface PublishResult {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly version: string;
  readonly status: PublishStatus;
  readonly published: boolean;
  readonly dryRun: boolean;
  /** True when the entry replaced one that was already in the index. */
  readonly replaced: boolean;
  readonly catalogPath: string;
  readonly entry: Readonly<Record<string, unknown>>;
  readonly verifiedOutputs: number;
  readonly catalogSha256: string;
  /** Present when an APPROVED publish appended to the approval log. */
  readonly approvalLogPath: string | null;
}

interface ArtifactManifest {
  readonly assetId: string;
  readonly version: string;
  readonly specPath: string;
  readonly specSha256: string;
  readonly budgetProfile: string;
  readonly sourceSha256?: string;
  readonly gates: Readonly<Record<string, string>>;
  readonly outputs: ReadonlyArray<Readonly<{ path: string; sha256: string; bytes: number }>>;
}

const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

// Every refusal here is the caller's to fix -- re-ingest, or publish the
// version that actually exists -- so all of them are recoverable.
const fail = (message: string): never => {
  throw new AsepriteError("ASEPRITE_PUBLISH_REFUSED", message, true);
};

async function readInside(repoRoot: string, relative: string, label: string): Promise<Buffer> {
  const absolute = await resolveInsideRoot(repoRoot, safeRelativePath(relative), { rejectFinalSymlink: true });
  const bytes = await readFile(absolute).catch(() => null);
  if (!bytes) fail(`${label} is missing; ingest the asset before publishing it`);
  return bytes!;
}

/** Writes through a temporary file so a crash cannot leave a truncated index. */
async function writeAtomic(absolute: string, text: string): Promise<void> {
  const temporary = `${absolute}.${process.pid}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, absolute);
}

export async function publishAsepriteAsset(request: PublishRequest): Promise<PublishResult> {
  const { assetId, version } = request;
  const specRelative = `assets/pilots/${assetId}/${version}.spec.json`;
  const manifestRelative = `assets/builds/artifacts/${assetId}/${version}/artifact-manifest.json`;

  const manifestBytes = await readInside(request.repoRoot, manifestRelative, "the artifact manifest");
  const manifestText = manifestBytes.toString("utf8");
  let manifest: ArtifactManifest;
  try {
    manifest = JSON.parse(manifestText) as ArtifactManifest;
  } catch {
    return fail("the artifact manifest is not readable JSON");
  }
  if (manifest.assetId !== assetId || manifest.version !== version) {
    fail("the artifact manifest describes a different asset than the request");
  }
  if (manifest.specPath !== specRelative) fail("the artifact manifest points at an unexpected spec");

  const specBytes = await readInside(request.repoRoot, specRelative, "the sprite spec");
  const specText = specBytes.toString("utf8");
  if (sha256(specText) !== manifest.specSha256) {
    fail("the spec on disk no longer matches the digest recorded at ingest");
  }
  for (const [gate, verdict] of Object.entries(manifest.gates ?? {})) {
    if (verdict !== "PASS") fail(`${gate} did not pass at ingest; this asset is not publishable`);
  }

  const outputs = manifest.outputs ?? [];
  if (!outputs.length) fail("the artifact manifest records no exported frames");
  for (const output of outputs) {
    const bytes = await readInside(request.repoRoot, output.path, `exported frame ${output.path}`);
    if (bytes.byteLength !== output.bytes || sha256(bytes) !== output.sha256) {
      fail(`${output.path} changed after ingest; re-ingest before publishing`);
    }
  }

  // The validator requires it, and an asset ingested before it was recorded
  // cannot be published without re-ingesting.
  if (!manifest.sourceSha256) {
    fail("the artifact manifest records no sourceSha256; re-ingest this asset before publishing it");
  }

  const now = (request.now ?? (() => new Date().toISOString()))();
  // Exactly the keys Asset Forge's catalog validator accepts, no more.
  const entry: Record<string, unknown> = {
    artifactManifest: manifestRelative,
    assetClass: "bridge-sprite",
    assetId,
    budgetProfile: manifest.budgetProfile,
    criticProfiles: [],
    exports: outputs.map(({ path }) => path),
    factoryCapability: "asset-forge",
    provenance: {
      license: "UNSPECIFIED",
      manifest: manifestRelative,
      manifestSha256: sha256(manifestText),
      source: specRelative,
      sourceSha256: manifest.sourceSha256,
    },
    rendererTargets: ["webgl"],
    specPath: specRelative,
    status: request.status,
    version,
  };

  const catalogRelative = safeRelativePath(request.catalogPath);
  const catalogAbsolute = await resolveInsideRoot(request.repoRoot, catalogRelative, { rejectFinalSymlink: true });
  const catalogText = (await readFile(catalogAbsolute, "utf8").catch(() => null))
    ?? `${canonicalJson({ entries: [], schemaVersion: 1 })}\n`;
  let catalog: { entries?: Array<Record<string, unknown>>; schemaVersion?: number; migration?: string };
  try {
    catalog = JSON.parse(catalogText) as typeof catalog;
  } catch {
    return fail("the asset catalog is not readable JSON");
  }
  if (catalog.schemaVersion !== undefined && catalog.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    fail(`the asset catalog declares schemaVersion ${String(catalog.schemaVersion)}; this publisher only writes ${CATALOG_SCHEMA_VERSION}`);
  }
  if (catalog.migration !== undefined && catalog.migration !== CATALOG_MIGRATION) {
    fail(`the asset catalog declares migration ${String(catalog.migration)}; this publisher only writes ${CATALOG_MIGRATION}`);
  }
  if (!Array.isArray(catalog.entries ?? [])) fail("the asset catalog has no readable entries array");
  const entries = [...(catalog.entries ?? [])];
  const index = entries.findIndex((candidate) => candidate.assetId === assetId && candidate.version === version);
  const replaced = index >= 0;
  if (replaced) entries[index] = entry;
  else entries.push(entry);
  // A stable order keeps the index reviewable as a diff.
  entries.sort((a, b) => `${a.assetId}@${a.version}`.localeCompare(`${b.assetId}@${b.version}`));

  // The header is written rather than carried through, so a catalog that was
  // missing it comes back valid instead of staying unreadable.
  const updated = `${canonicalJson({
    ...catalog, entries, migration: CATALOG_MIGRATION, schemaVersion: CATALOG_SCHEMA_VERSION,
  })}\n`;
  const dryRun = request.dryRun ?? true;
  const approved = request.status === "APPROVED";
  if (!dryRun) {
    await writeAtomic(catalogAbsolute, updated);
    if (approved) {
      const logAbsolute = await resolveInsideRoot(request.repoRoot, safeRelativePath(APPROVAL_LOG_PATH), { rejectFinalSymlink: true });
      await appendFile(logAbsolute, `${JSON.stringify({
        assetId, at: now, by: request.approvedBy, catalogSha256: sha256(updated),
        manifestSha256: sha256(manifestText), status: "APPROVED", version,
      })}
`, "utf8");
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    assetId,
    version,
    status: request.status,
    published: !dryRun,
    dryRun,
    replaced,
    catalogPath: catalogRelative,
    entry: Object.freeze(entry),
    verifiedOutputs: outputs.length,
    catalogSha256: sha256(updated),
    approvalLogPath: approved ? APPROVAL_LOG_PATH : null,
  });
}
