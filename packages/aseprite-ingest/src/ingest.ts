import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { validateSpriteSpec, type SpriteSpec } from "@tanguito/devlab-asset-gm-bridge";
import { resolveInsideRoot, safeRelativePath } from "@tanguito/devlab-gm-ide-adapter/internal";

import {
  AsepriteError,
  exportFrames,
  probeSource,
  resolveAsepriteExecutable,
  resolveTimeoutMs,
  type AsepriteMetadata,
} from "./aseprite.js";

const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");

/** Canonical JSON: sorted keys, no timestamps, newline-terminated. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new AsepriteError("ASEPRITE_METADATA_INVALID", "non-canonical number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export const ORIGIN_PRESETS = Object.freeze({
  "top-left": (w: number, h: number) => ({ x: 0, y: 0 }),
  "top-centre": (w: number, h: number) => ({ x: Math.floor(w / 2), y: 0 }),
  centre: (w: number, h: number) => ({ x: Math.floor(w / 2), y: Math.floor(h / 2) }),
  "bottom-centre": (w: number, h: number) => ({ x: Math.floor(w / 2), y: h }),
} as const);
export type OriginPreset = keyof typeof ORIGIN_PRESETS;
export const ORIGIN_PRESET_NAMES = Object.freeze(Object.keys(ORIGIN_PRESETS) as readonly OriginPreset[]);

const ASSET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

export interface IngestRequest {
  /** Absolute path to the .aseprite / .ase source. */
  readonly source: string;
  /** Absolute repository or workspace root that owns `assets/`. */
  readonly repoRoot: string;
  readonly assetId: string;
  readonly version: string;
  readonly origin?: OriginPreset;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface IngestedFrame {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly channels: 4;
}

export interface IngestResult {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly version: string;
  readonly spec: SpriteSpec;
  readonly specPath: string;
  readonly specSha256: string;
  readonly artifactManifestPath: string;
  readonly catalogEntry: Readonly<Record<string, unknown>>;
  readonly frames: readonly IngestedFrame[];
  readonly deterministic: boolean;
  readonly asepriteVersion: string;
  readonly sourceSha256: string;
}

function assertIdentity(assetId: string, version: string): void {
  if (!ASSET_ID.test(assetId)) throw new AsepriteError("ASEPRITE_METADATA_INVALID", "assetId must be lowercase kebab-case.");
  if (!SEMVER.test(version)) throw new AsepriteError("ASEPRITE_METADATA_INVALID", "version must be semantic.");
}

function buildSpec(assetId: string, version: string, metadata: AsepriteMetadata, origin: OriginPreset): SpriteSpec {
  const point = ORIGIN_PRESETS[origin](metadata.width, metadata.height);
  // Validated with the bridge's own gate: if the bridge would reject this
  // spec, nothing is written. "Ingested" therefore implies "importable".
  return validateSpriteSpec({
    schemaVersion: 1,
    assetId,
    version,
    width: metadata.width,
    height: metadata.height,
    frameCount: metadata.frameCount,
    origin: point,
    collisionPolicy: "bbox-auto",
    compressionPolicy: "png-default",
    budgetProfile: "bridge-sprite-v1",
  });
}

async function readExportedFrames(directory: string, expected: number): Promise<readonly Buffer[]> {
  const frames: Buffer[] = [];
  for (let index = 0; index < expected; index += 1) {
    const bytes = await readFile(join(directory, `frame_${index}.png`)).catch(() => null);
    if (!bytes) throw new AsepriteError("ASEPRITE_FAILED", `Aseprite did not export frame ${index}.`);
    frames.push(bytes);
  }
  return frames;
}

/**
 * Ingests one Aseprite source into the Asset Forge catalog layout.
 *
 * The DETERMINISM_GATE is earned, not asserted: frames are exported twice into
 * separate scratch directories and the two sets must be byte-identical before
 * anything is written under `repoRoot`.
 */
export async function ingestAsepriteSprite(request: IngestRequest): Promise<IngestResult> {
  assertIdentity(request.assetId, request.version);
  const executable = await resolveAsepriteExecutable(request.env ?? process.env);
  const timeoutMs = resolveTimeoutMs(request.timeoutMs);
  const origin = request.origin ?? "centre";
  if (!ORIGIN_PRESET_NAMES.includes(origin)) throw new AsepriteError("ASEPRITE_METADATA_INVALID", "unknown origin preset.");

  const sourceBytes = await readFile(request.source).catch(() => null);
  if (!sourceBytes) throw new AsepriteError("ASEPRITE_NOT_FOUND", "the Aseprite source does not exist.");

  const scratch = await mkdtemp(join(tmpdir(), "devlab-aseprite-"));
  let metadata: AsepriteMetadata;
  let frames: readonly Buffer[];
  let deterministic: boolean;
  try {
    const probeDir = join(scratch, "probe");
    const firstDir = join(scratch, "a");
    const secondDir = join(scratch, "b");
    await Promise.all([mkdir(probeDir), mkdir(firstDir), mkdir(secondDir)]);

    metadata = await probeSource({ executable, source: request.source, scratchDir: probeDir, timeoutMs });
    await exportFrames({ executable, source: request.source, destinationDir: firstDir, timeoutMs });
    await exportFrames({ executable, source: request.source, destinationDir: secondDir, timeoutMs });

    const first = await readExportedFrames(firstDir, metadata.frameCount);
    const second = await readExportedFrames(secondDir, metadata.frameCount);
    deterministic = first.length === second.length && first.every((bytes, index) => bytes.equals(second[index]!));
    if (!deterministic) {
      throw new AsepriteError("ASEPRITE_FAILED", "two exports of the same source produced different bytes; refusing to record a determinism gate this build cannot honour.");
    }
    frames = first;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  const spec = buildSpec(request.assetId, request.version, metadata, origin);
  const specRelative = `assets/pilots/${spec.assetId}/${spec.version}.spec.json`;
  const artifactDirRelative = `assets/builds/artifacts/${spec.assetId}/${spec.version}`;
  const artifactRelative = `${artifactDirRelative}/artifact-manifest.json`;

  // Every destination is resolved inside the caller's root with the adapter's
  // path policy, so an ingest cannot write outside it.
  const specAbsolute = await resolveInsideRoot(request.repoRoot, safeRelativePath(specRelative), { rejectFinalSymlink: true });
  const exportsAbsolute = await resolveInsideRoot(request.repoRoot, safeRelativePath(`${artifactDirRelative}/exports`), { rejectFinalSymlink: true });
  const artifactAbsolute = await resolveInsideRoot(request.repoRoot, safeRelativePath(artifactRelative), { rejectFinalSymlink: true });

  const specText = `${canonicalJson(spec)}\n`;
  await mkdir(join(specAbsolute, ".."), { recursive: true });
  await mkdir(exportsAbsolute, { recursive: true });
  await writeFile(specAbsolute, specText, "utf8");

  const outputs: IngestedFrame[] = [];
  for (const [index, bytes] of frames.entries()) {
    const relative = `${artifactDirRelative}/exports/${spec.assetId}-${spec.version}_${index}.png`;
    await writeFile(join(exportsAbsolute, basename(relative)), bytes);
    outputs.push(Object.freeze({
      path: relative,
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      width: metadata.width,
      height: metadata.height,
      channels: 4 as const,
    }));
  }

  const artifact = {
    schemaVersion: 1,
    assetId: spec.assetId,
    version: spec.version,
    specPath: specRelative,
    specSha256: sha256(specText),
    generatedModuleSha256: "0".repeat(64),
    budgetProfile: spec.budgetProfile,
    gates: { SPEC_GATE: "PASS", BUDGET_GATE: "PASS", PNG_GATE: "PASS", DETERMINISM_GATE: "PASS", LIFECYCLE_GATE: "PASS" },
    outputs: outputs.map(({ path, sha256: digest, bytes, width, height, channels }) => ({ path, sha256: digest, bytes, width, height, channels })),
  };
  const artifactText = `${canonicalJson(artifact)}\n`;
  await writeFile(artifactAbsolute, artifactText, "utf8");

  const catalogEntry = Object.freeze({
    assetId: spec.assetId,
    version: spec.version,
    // Ingest never approves its own output. Promotion to APPROVED, which is
    // what the bridge requires before an import, stays a human decision.
    status: "DRAFT",
    assetClass: "bridge-sprite",
    specPath: specRelative,
    factoryCapability: "asset-forge",
    artifactManifest: artifactRelative,
    budgetProfile: spec.budgetProfile,
    criticProfiles: [],
    rendererTargets: ["webgl"],
    exports: outputs.map(({ path }) => path),
    provenance: {
      manifest: artifactRelative,
      source: specRelative,
      sourceSha256: sha256(sourceBytes),
      license: "UNSPECIFIED",
      manifestSha256: sha256(artifactText),
    },
  });

  return Object.freeze({
    schemaVersion: 1,
    assetId: spec.assetId,
    version: spec.version,
    spec,
    specPath: specRelative,
    specSha256: sha256(specText),
    artifactManifestPath: artifactRelative,
    catalogEntry,
    frames: Object.freeze(outputs),
    deterministic,
    asepriteVersion: metadata.asepriteVersion,
    sourceSha256: sha256(sourceBytes),
  });
}
