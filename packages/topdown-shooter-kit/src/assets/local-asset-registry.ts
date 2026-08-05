export type AssetSourceKind = "generated" | "authored" | "licensed" | "derived";

export interface LocalAssetRegistryEntry {
  readonly assetId: string;
  readonly runtimePath: string;
  readonly sha256: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly source: { readonly kind: AssetSourceKind; readonly reference: string };
  readonly runtime: { readonly preload: boolean; readonly required: boolean };
}

export interface LocalAssetRegistry {
  readonly schemaVersion: 1;
  readonly assets: readonly LocalAssetRegistryEntry[];
}

export type AssetRegistryErrorCode =
  | "INVALID_DOCUMENT"
  | "DUPLICATE_ASSET_ID"
  | "DUPLICATE_RUNTIME_PATH"
  | "NON_CANONICAL_ORDER"
  | "MISSING_FILE"
  | "BYTE_SIZE_MISMATCH"
  | "HASH_MISMATCH";

export interface AssetRegistryError {
  readonly code: AssetRegistryErrorCode;
  readonly path: string;
  readonly message: string;
}

export interface AssetRegistryValidationResult {
  readonly ok: boolean;
  readonly errors: readonly AssetRegistryError[];
}

export interface AssetByteLoader {
  load(runtimePath: string): Uint8Array | Promise<Uint8Array>;
}

const SOURCE_KINDS = new Set<AssetSourceKind>(["generated", "authored", "licensed", "derived"]);
const SHA256 = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isCanonicalLocalPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value) || value.includes("\\") || value.includes("%") || value.includes("?") || value.includes("#") || value.startsWith("/")) return false;
  if (value.startsWith("//") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function validateEntry(value: unknown, index: number, errors: AssetRegistryError[]): value is LocalAssetRegistryEntry {
  const path = `assets[${index}]`;
  if (!isRecord(value) || !hasExactKeys(value, ["assetId", "runtimePath", "sha256", "mediaType", "byteSize", "source", "runtime"])) {
    errors.push({ code: "INVALID_DOCUMENT", path, message: `${path} must contain exactly the asset registry fields` });
    return false;
  }
  let valid = true;
  if (typeof value.assetId !== "string" || value.assetId.length === 0) { errors.push({ code: "INVALID_DOCUMENT", path: `${path}.assetId`, message: "assetId must be a non-empty string" }); valid = false; }
  if (!isCanonicalLocalPath(value.runtimePath)) { errors.push({ code: "INVALID_DOCUMENT", path: `${path}.runtimePath`, message: "runtimePath must be a normalized local relative path" }); valid = false; }
  if (typeof value.sha256 !== "string" || !SHA256.test(value.sha256)) { errors.push({ code: "INVALID_DOCUMENT", path: `${path}.sha256`, message: "sha256 must be 64 lowercase hexadecimal characters" }); valid = false; }
  if (typeof value.mediaType !== "string" || value.mediaType.length === 0) { errors.push({ code: "INVALID_DOCUMENT", path: `${path}.mediaType`, message: "mediaType must be a non-empty string" }); valid = false; }
  if (!Number.isSafeInteger(value.byteSize) || (value.byteSize as number) < 0) { errors.push({ code: "INVALID_DOCUMENT", path: `${path}.byteSize`, message: "byteSize must be a non-negative safe integer" }); valid = false; }
  if (!isRecord(value.source) || !hasExactKeys(value.source, ["kind", "reference"])) {
    errors.push({ code: "INVALID_DOCUMENT", path: `${path}.source`, message: "source must contain kind and reference" }); valid = false;
  } else {
    if (!SOURCE_KINDS.has(value.source.kind as AssetSourceKind)) { errors.push({ code: "INVALID_DOCUMENT", path: `${path}.source.kind`, message: "source.kind is not supported" }); valid = false; }
    if (typeof value.source.reference !== "string" || value.source.reference.length === 0 || value.source.reference.trim() !== value.source.reference || /[\u0000-\u001f\u007f]/.test(value.source.reference) || value.source.reference.startsWith("//") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value.source.reference)) { errors.push({ code: "INVALID_DOCUMENT", path: `${path}.source.reference`, message: "source.reference must be normalized, non-empty provenance metadata without a remote scheme" }); valid = false; }
  }
  if (!isRecord(value.runtime) || !hasExactKeys(value.runtime, ["preload", "required"]) || typeof value.runtime.preload !== "boolean" || typeof value.runtime.required !== "boolean") {
    errors.push({ code: "INVALID_DOCUMENT", path: `${path}.runtime`, message: "runtime must contain boolean preload and required flags" }); valid = false;
  }
  return valid;
}

export function validateLocalAssetRegistry(value: unknown): AssetRegistryValidationResult {
  const errors: AssetRegistryError[] = [];
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "assets"]) || value.schemaVersion !== 1 || !Array.isArray(value.assets)) {
    return { ok: false, errors: [{ code: "INVALID_DOCUMENT", path: "$", message: "registry must contain schemaVersion 1 and an assets array" }] };
  }
  const ids = new Set<string>();
  const paths = new Set<string>();
  let previousId: string | null = null;
  value.assets.forEach((entry, index) => {
    if (!validateEntry(entry, index, errors)) return;
    if (ids.has(entry.assetId)) errors.push({ code: "DUPLICATE_ASSET_ID", path: `assets[${index}].assetId`, message: `duplicate assetId: ${entry.assetId}` });
    if (paths.has(entry.runtimePath)) errors.push({ code: "DUPLICATE_RUNTIME_PATH", path: `assets[${index}].runtimePath`, message: `duplicate runtimePath: ${entry.runtimePath}` });
    if (previousId !== null && previousId >= entry.assetId) errors.push({ code: "NON_CANONICAL_ORDER", path: `assets[${index}].assetId`, message: "assets must be in ascending assetId order" });
    ids.add(entry.assetId); paths.add(entry.runtimePath); previousId = entry.assetId;
  });
  return { ok: errors.length === 0, errors };
}

function assertValidRegistry(value: unknown): asserts value is LocalAssetRegistry {
  const result = validateLocalAssetRegistry(value);
  if (!result.ok) throw new TypeError(result.errors.map(({ path, message }) => `${path}: ${message}`).join("; "));
}

export function canonicalizeLocalAssetRegistry(registry: LocalAssetRegistry): string {
  const sorted = { schemaVersion: 1 as const, assets: [...registry.assets].sort((left, right) => left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0) };
  assertValidRegistry(sorted);
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyLocalAssetRegistry(registry: LocalAssetRegistry, loader: AssetByteLoader): Promise<AssetRegistryValidationResult> {
  const structural = validateLocalAssetRegistry(registry);
  if (!structural.ok) return structural;
  const errors: AssetRegistryError[] = [];
  for (let index = 0; index < registry.assets.length; index += 1) {
    const entry = registry.assets[index]!;
    let bytes: Uint8Array;
    try { bytes = await loader.load(entry.runtimePath); }
    catch { errors.push({ code: "MISSING_FILE", path: `assets[${index}].runtimePath`, message: `missing local asset: ${entry.runtimePath}` }); continue; }
    if (!(bytes instanceof Uint8Array)) { errors.push({ code: "INVALID_DOCUMENT", path: `assets[${index}]`, message: "asset loader must return Uint8Array" }); continue; }
    if (bytes.byteLength !== entry.byteSize) errors.push({ code: "BYTE_SIZE_MISMATCH", path: `assets[${index}].byteSize`, message: `expected ${entry.byteSize} bytes, received ${bytes.byteLength}` });
    if (await sha256(bytes) !== entry.sha256) errors.push({ code: "HASH_MISMATCH", path: `assets[${index}].sha256`, message: `SHA-256 mismatch for ${entry.runtimePath}` });
  }
  return { ok: errors.length === 0, errors };
}
