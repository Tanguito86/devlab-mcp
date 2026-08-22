import { AssetForgeError } from "@tanguito/devlab-img2threejs-asset-forge";

/**
 * Generic sprite spec accepted by the bridge.
 *
 * Until GM-ASSET-IMPORT-01 the bridge validated every incoming spec with
 * `validateBridgeTestBeaconSpec`, which pinned `assetId` to the synthetic pilot
 * asset and `palette` to two literal values. That made the whole governed
 * import path unreachable for any real catalog asset. This validator keeps the
 * same strictness -- closed field set, no unknown keys, explicit policies --
 * without pinning identity.
 *
 * `palette` remains an accepted OPTIONAL field so the pilot beacon spec, which
 * carries one, still validates unchanged.
 */

export const SPRITE_SPEC_REQUIRED_FIELDS = Object.freeze([
  "schemaVersion", "assetId", "version", "width", "height", "frameCount",
  "origin", "collisionPolicy", "compressionPolicy", "budgetProfile",
] as const);

export const SPRITE_SPEC_OPTIONAL_FIELDS = Object.freeze(["palette"] as const);

export const SPRITE_COLLISION_POLICIES = Object.freeze(["bbox-auto"] as const);
export const SPRITE_COMPRESSION_POLICIES = Object.freeze(["stored-deflate", "png-default"] as const);
export const SPRITE_BUDGET_PROFILES = Object.freeze(["bridge-sprite-v1"] as const);

/** Hard ceilings; the budget profile still applies on top of these. */
export const SPRITE_MAX_DIMENSION = 4096;
export const SPRITE_MAX_FRAMES = 512;

const ASSET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

export interface SpriteSpec {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly version: string;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly collisionPolicy: typeof SPRITE_COLLISION_POLICIES[number];
  readonly compressionPolicy: typeof SPRITE_COMPRESSION_POLICIES[number];
  readonly budgetProfile: typeof SPRITE_BUDGET_PROFILES[number];
  readonly palette?: string;
}

function invalid(message: string, details?: Readonly<Record<string, unknown>>): never {
  throw new AssetForgeError("SPEC_INVALID", message, details);
}

function positiveInteger(record: Record<string, unknown>, field: string, max: number): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalid(`${field} must be a positive integer`);
  if ((value as number) > max) invalid(`${field} exceeds the sprite ceiling of ${max}`);
  return value as number;
}

export function validateSpriteSpec(value: unknown): SpriteSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("sprite spec must be a plain object");
  const record = value as Record<string, unknown>;

  const actual = Object.keys(record).sort();
  const missing = SPRITE_SPEC_REQUIRED_FIELDS.filter((field) => !actual.includes(field));
  const unknown = actual.filter((field) => !SPRITE_SPEC_REQUIRED_FIELDS.includes(field as never) && !SPRITE_SPEC_OPTIONAL_FIELDS.includes(field as never));
  if (missing.length || unknown.length) invalid("sprite spec has missing or unknown fields", { missing, unknown });

  if (record.schemaVersion !== 1) invalid("sprite spec schemaVersion must be 1");
  if (typeof record.assetId !== "string" || !ASSET_ID.test(record.assetId)) invalid("assetId must be lowercase kebab-case");
  if (typeof record.version !== "string" || !SEMVER.test(record.version)) invalid("version must be semantic");

  const width = positiveInteger(record, "width", SPRITE_MAX_DIMENSION);
  const height = positiveInteger(record, "height", SPRITE_MAX_DIMENSION);
  const frameCount = positiveInteger(record, "frameCount", SPRITE_MAX_FRAMES);

  const origin = record.origin as Record<string, unknown> | undefined;
  if (!origin || typeof origin !== "object" || Array.isArray(origin)) invalid("origin must be an object");
  if (Object.keys(origin).sort().join(",") !== "x,y") invalid("origin must declare exactly x and y");
  for (const axis of ["x", "y"] as const) {
    const component = origin[axis];
    if (typeof component !== "number" || !Number.isSafeInteger(component) || component < 0) invalid(`origin.${axis} must be a non-negative integer`);
  }
  if ((origin.x as number) > width || (origin.y as number) > height) invalid("origin must fall inside the sprite bounds");

  if (!SPRITE_COLLISION_POLICIES.includes(record.collisionPolicy as never)) invalid("collisionPolicy is not an accepted value");
  if (!SPRITE_COMPRESSION_POLICIES.includes(record.compressionPolicy as never)) invalid("compressionPolicy is not an accepted value");
  if (!SPRITE_BUDGET_PROFILES.includes(record.budgetProfile as never)) invalid("budgetProfile is not an accepted value");
  if (record.palette !== undefined && (typeof record.palette !== "string" || record.palette.length === 0 || record.palette.length > 64)) {
    invalid("palette must be a short non-empty string when present");
  }

  return Object.freeze({
    schemaVersion: 1,
    assetId: record.assetId,
    version: record.version,
    width,
    height,
    frameCount,
    origin: Object.freeze({ x: origin.x as number, y: origin.y as number }),
    collisionPolicy: record.collisionPolicy as SpriteSpec["collisionPolicy"],
    compressionPolicy: record.compressionPolicy as SpriteSpec["compressionPolicy"],
    budgetProfile: record.budgetProfile as SpriteSpec["budgetProfile"],
    ...(record.palette === undefined ? {} : { palette: record.palette as string }),
  });
}

/**
 * Canonical GameMaker resource name for a sprite asset: `spr_` plus the assetId
 * with dashes folded to underscores. Used to detect case/Unicode variants of
 * the same logical sprite before anything is planned.
 */
export function canonicalResourceName(assetId: string): string {
  return `spr_${assetId.replace(/-/g, "_")}`;
}
