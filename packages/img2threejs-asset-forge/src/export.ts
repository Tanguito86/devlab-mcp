import { createHash } from "node:crypto";
import { canonicalJson } from "./safe-generation.js";
import { AssetForgeError } from "./production.js";

export type ExportFormat = "CANONICAL_JSON" | "GLTF" | "GLB" | "ATLAS_BRIDGE_MANIFEST";
export interface ExportRequest { readonly assetId: string; readonly version: string; readonly format: ExportFormat; readonly outputPath: string }
export interface ExportValidation { readonly ok: boolean; readonly errors: readonly string[] }
export interface ExportResult { readonly format: ExportFormat; readonly bytes: Uint8Array; readonly sha256: string; readonly byteSize: number; readonly provenance: Readonly<{ source: string; license: string }> }
export interface AssetExporter { readonly id: string; validate(request: ExportRequest): Promise<ExportValidation>; export(request: ExportRequest): Promise<ExportResult> }

export interface CanonicalAssetDescription {
  readonly schemaVersion: 1; readonly assetId: string; readonly version: string; readonly nodes: readonly Readonly<{ name: string; parent: string | null; position: readonly number[]; rotation: readonly number[]; scale: readonly number[]; mesh: boolean }>[];
  readonly geometries: number; readonly materials: readonly string[]; readonly triangles: number; readonly bounds: Readonly<{ min: readonly number[]; max: readonly number[] }>;
}

export function canonicalAssetJson(value: CanonicalAssetDescription): Uint8Array { return Buffer.from(`${canonicalJson(value)}\n`, "utf8"); }
export function createExportResult(format: ExportFormat, bytes: Uint8Array, source: string, license: string): ExportResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new AssetForgeError("EXPORT_FAILED", "export output must be non-empty bytes");
  return Object.freeze({ format, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength, provenance: Object.freeze({ source, license }) });
}

export interface GltfInspection { readonly format: "GLTF" | "GLB"; readonly version: "2.0"; readonly nodes: number; readonly meshes: number; readonly materials: number; readonly accessors: number; readonly buffers: number; readonly externalUris: readonly string[]; readonly names: readonly string[]; readonly finiteTransforms: boolean }
export function inspectGltf(bytes: Uint8Array, format: "GLTF" | "GLB"): GltfInspection {
  let json: Record<string, unknown>;
  if (format === "GLB") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new AssetForgeError("EXPORT_FAILED", "GLB header is invalid");
    const jsonLength = view.getUint32(12, true); json = JSON.parse(Buffer.from(bytes.subarray(20, 20 + jsonLength)).toString("utf8").trim());
  } else json = JSON.parse(Buffer.from(bytes).toString("utf8"));
  const asset = json.asset as Record<string, unknown> | undefined; if (asset?.version !== "2.0") throw new AssetForgeError("EXPORT_FAILED", "glTF asset.version must be 2.0");
  const nodes = Array.isArray(json.nodes) ? json.nodes as Record<string, unknown>[] : []; const buffers = Array.isArray(json.buffers) ? json.buffers as Record<string, unknown>[] : [];
  const externalUris = buffers.map(({ uri }) => uri).filter((uri): uri is string => typeof uri === "string" && !uri.startsWith("data:"));
  const finiteTransforms = nodes.every((node) => ["translation", "rotation", "scale", "matrix"].every((field) => !Array.isArray(node[field]) || (node[field] as unknown[]).every((entry) => typeof entry === "number" && Number.isFinite(entry))));
  if (externalUris.some((uri) => /^(?:https?|ftp):/i.test(uri))) throw new AssetForgeError("EXPORT_FAILED", "glTF contains a remote URL"); if (!finiteTransforms) throw new AssetForgeError("EXPORT_FAILED", "glTF contains non-finite transforms");
  return Object.freeze({ format, version: "2.0", nodes: nodes.length, meshes: Array.isArray(json.meshes) ? json.meshes.length : 0, materials: Array.isArray(json.materials) ? json.materials.length : 0, accessors: Array.isArray(json.accessors) ? json.accessors.length : 0, buffers: buffers.length, externalUris: Object.freeze(externalUris), names: Object.freeze(nodes.map(({ name }) => String(name ?? "")).sort()), finiteTransforms });
}
