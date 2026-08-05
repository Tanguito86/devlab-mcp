import { createHash } from "node:crypto";

/**
 * Canonical, timestamp-free, sorted-key JSON serialization with a trailing
 * newline. This is the adapter-style canonical form (deterministic, no
 * generation string-policy): the asset-forge `canonicalJson` is the SAFE
 * GENERATION canonicalizer and correctly rejects long strings and newlines,
 * which makes it unusable for evidence blobs such as the stored plan's
 * base64 payloads. The two serializers produce byte-identical output for the
 * plain-data manifest/binding values (sorted keys, compact JSON), so hashes
 * remain stable.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError("non-canonical number"); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new TypeError("non-canonical value");
}
export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}
export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalBytes(value)).digest("hex");
}
export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
