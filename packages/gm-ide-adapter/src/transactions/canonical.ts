import { createHash } from "node:crypto";
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError("non-canonical number"); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`; }
  throw new TypeError("non-canonical value");
}
export const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
export const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, "utf8");
export const canonicalHash = (value: unknown): string => sha256(canonicalBytes(value));
