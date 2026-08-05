import { createHash } from "node:crypto";
import { closeSync, constants, lstatSync, openSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export interface ArtifactOutputInput { readonly path: string; readonly type: string; readonly bytes: Uint8Array; readonly dimensions?: Readonly<{ width: number; height: number }>; readonly producer: string; readonly license: string; readonly provenance: string }
export interface ArtifactOutput { readonly sequence: number; readonly path: string; readonly type: string; readonly bytes: number; readonly sha256: string; readonly dimensions?: Readonly<{ width: number; height: number }>; readonly producer: string; readonly license: string; readonly provenance: string }
export interface ArtifactManifestInput {
  readonly artifactId: string;
  readonly buildId: string;
  readonly generator: Readonly<{ name: string; version: string; sourceCommit: string; threeVersion: string }>;
  readonly input: Readonly<{ specPath: string; sha256: string }>;
  readonly outputs: readonly ArtifactOutputInput[];
  readonly capture: Readonly<{ target: string; backend: "webgl" | "webgpu" | "fake"; dimensions: Readonly<{ width: number; height: number }>; cameraParameters: Readonly<Record<string, string | number | boolean>>; options: Readonly<Record<string, string | number | boolean>> }>;
  readonly determinism: Readonly<{ seed: string; fixed: boolean }>;
  readonly performance: Readonly<{ generationMs: number; estimatedPeakMemoryBytes: number; pngBytesRead: number; decodedBytes: number; geometries: number; materials: number; textures: number; disposeMs: number; captures: number }>;
  readonly provenance: Readonly<{ manifest: string }>;
}
export interface ArtifactManifest extends Omit<ArtifactManifestInput, "outputs"> { readonly schemaVersion: 1; readonly outputs: readonly ArtifactOutput[] }

export function assertSafeRelativePath(candidate: string): string {
  if (!candidate || candidate.includes("\0") || isAbsolute(candidate) || /^[A-Za-z]:/.test(candidate) || candidate.startsWith("\\")) throw new Error("artifact path must be non-empty and relative");
  if (candidate.includes("/") && candidate.includes("\\")) throw new Error("artifact path cannot mix separators");
  const normalized = candidate.replace(/\\/g, "/");
  if (!/^[A-Za-z0-9._/-]+$/.test(normalized)) throw new Error("artifact path violates the portable ASCII policy");
  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) throw new Error("artifact path contains forbidden segment");
  if (parts.some((part) => /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part) || part.endsWith("."))) throw new Error("artifact path contains a Windows-reserved segment");
  return normalized;
}

export const resolveInsideRoot = resolveSecureArtifactPath;

export function resolveSecureArtifactPath(root: string, candidate: string): string {
  const normalized = assertSafeRelativePath(candidate);
  const requestedRoot = resolve(root); const rootStat = lstatSync(requestedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("artifact root must be an existing real directory");
  const absoluteRoot = realpathSync.native(requestedRoot); const output = resolve(absoluteRoot, ...normalized.split("/"));
  const back = relative(absoluteRoot, output);
  if (!back || back.startsWith(`..${sep}`) || back === ".." || isAbsolute(back)) throw new Error("artifact path escapes root");
  let current = absoluteRoot;
  for (const part of normalized.split("/")) {
    current = resolve(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error("artifact path traverses a symbolic link"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return output;
}

export function writeArtifactFileExclusive(root: string, candidate: string, bytes: Uint8Array): string {
  const output = resolveSecureArtifactPath(root, candidate); const parent = dirname(output);
  const realRoot = realpathSync.native(resolve(root)); const realParent = realpathSync.native(parent); const parentBack = relative(realRoot, realParent);
  if (parentBack === ".." || parentBack.startsWith(`..${sep}`) || isAbsolute(parentBack)) throw new Error("artifact parent escapes real root");
  if (process.platform !== "win32" && (statSync(realRoot).mode & 0o022) !== 0) throw new Error("artifact root must not be group/world writable");
  let descriptor: number | undefined;
  try {
    descriptor = openSync(output, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeFileSync(descriptor, bytes);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  return output;
}

function validateText(value: string, field: string): string {
  if (!value.trim() || value.length > 256 || value.includes("\0") || /\r|\n/.test(value)) throw new Error(`${field} is outside text policy`);
  return value;
}

function assertPlainKeys(value: unknown, required: readonly string[], optional: readonly string[], field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${field} must be a plain object`);
  const keys = Object.keys(value); const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) throw new Error(`${field} has missing or unknown fields`);
}

function canonicalRecord(input: Readonly<Record<string, string | number | boolean>>, field: string): Readonly<Record<string, string | number | boolean>> {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw new Error(`${field} must be a plain record`);
  const output: Record<string, string | number | boolean> = Object.create(null) as Record<string, string | number | boolean>;
  for (const key of Object.keys(input).sort()) {
    validateText(key, `${field}.key`); const value = input[key]!;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new Error(`${field}.${key} has an invalid value type`);
    if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) throw new Error(`${field}.${key} is not a valid finite number`);
    if (typeof value === "string") validateText(value, `${field}.${key}`);
    output[key] = value;
  }
  return Object.freeze(output);
}

export function createArtifactManifest(input: ArtifactManifestInput): ArtifactManifest {
  assertPlainKeys(input, ["artifactId", "buildId", "generator", "input", "outputs", "capture", "determinism", "performance", "provenance"], [], "manifest");
  assertPlainKeys(input.generator, ["name", "version", "sourceCommit", "threeVersion"], [], "generator");
  assertPlainKeys(input.input, ["specPath", "sha256"], [], "input");
  assertPlainKeys(input.capture, ["target", "backend", "dimensions", "cameraParameters", "options"], [], "capture");
  assertPlainKeys(input.capture.dimensions, ["width", "height"], [], "capture.dimensions");
  assertPlainKeys(input.determinism, ["seed", "fixed"], [], "determinism");
  assertPlainKeys(input.performance, ["generationMs", "estimatedPeakMemoryBytes", "pngBytesRead", "decodedBytes", "geometries", "materials", "textures", "disposeMs", "captures"], [], "performance");
  assertPlainKeys(input.provenance, ["manifest"], [], "provenance");
  for (const [field, value] of [["artifactId", input.artifactId], ["buildId", input.buildId], ["generator.name", input.generator.name], ["generator.version", input.generator.version], ["generator.sourceCommit", input.generator.sourceCommit], ["generator.threeVersion", input.generator.threeVersion], ["capture.target", input.capture.target], ["determinism.seed", input.determinism.seed]] as const) validateText(value, field);
  if (!/^[0-9a-f]{64}$/.test(input.input.sha256)) throw new Error("input sha256 must be lowercase SHA-256");
  if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(input.generator.sourceCommit)) throw new Error("generator sourceCommit must be an immutable hex pin");
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(input.generator.version) || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(input.generator.threeVersion)) throw new Error("generator and Three.js versions must be explicit semver values");
  if (!new Set(["webgl", "webgpu", "fake"]).has(input.capture.backend)) throw new Error("capture backend is invalid");
  if (input.determinism.fixed !== true) throw new Error("pilot manifest must declare fixed determinism as boolean true");
  if (!input.performance || typeof input.performance !== "object") throw new Error("performance metrics are required");
  const performanceKeys = ["generationMs", "estimatedPeakMemoryBytes", "pngBytesRead", "decodedBytes", "geometries", "materials", "textures", "disposeMs", "captures"] as const;
  if (Object.keys(input.performance).sort().join("|") !== [...performanceKeys].sort().join("|")) throw new Error("performance metrics must have the exact required shape");
  for (const field of performanceKeys) { const value = input.performance[field]; if (!Number.isFinite(value) || value < 0 || Object.is(value, -0)) throw new Error(`performance.${field} must be a non-negative finite number`); }
  const { width: captureWidth, height: captureHeight } = input.capture.dimensions; const capturePixels = captureWidth * captureHeight;
  if (!Number.isSafeInteger(captureWidth) || !Number.isSafeInteger(captureHeight) || captureWidth <= 0 || captureHeight <= 0 || captureWidth > 4096 || captureHeight > 4096 || !Number.isSafeInteger(capturePixels) || capturePixels > 4096 * 4096) throw new Error("capture dimensions are invalid");
  const cameraParameters = canonicalRecord(input.capture.cameraParameters, "cameraParameters"); const captureOptions = canonicalRecord(input.capture.options, "capture.options");
  const specPath = assertSafeRelativePath(input.input.specPath); const provenanceManifest = assertSafeRelativePath(input.provenance.manifest);
  if (!Array.isArray(input.outputs) || input.outputs.length === 0) throw new Error("manifest outputs must be a non-empty array");
  const sorted = [...input.outputs].map((entry) => ({ ...entry, path: assertSafeRelativePath(entry.path) })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (new Set(sorted.map(({ path }) => path.toLowerCase())).size !== sorted.length) throw new Error("artifact paths must be unique under portable case-folding");
  const outputs = sorted.map((entry, index): ArtifactOutput => {
    assertPlainKeys(entry, ["path", "type", "bytes", "producer", "license", "provenance"], ["dimensions"], "output");
    const outputEntry = entry as unknown as ArtifactOutputInput;
    if (!(outputEntry.bytes instanceof Uint8Array)) throw new Error("output bytes must be Uint8Array");
    validateText(outputEntry.type, "output.type"); validateText(outputEntry.producer, "output.producer"); validateText(outputEntry.license, "output.license"); validateText(outputEntry.provenance, "output.provenance");
    if (outputEntry.dimensions && (!Number.isSafeInteger(outputEntry.dimensions.width) || !Number.isSafeInteger(outputEntry.dimensions.height) || outputEntry.dimensions.width <= 0 || outputEntry.dimensions.height <= 0)) throw new Error("output dimensions are invalid");
    return Object.freeze({
    sequence: index + 1,
    path: outputEntry.path,
    type: outputEntry.type,
    bytes: outputEntry.bytes.byteLength,
    sha256: createHash("sha256").update(outputEntry.bytes).digest("hex"),
    ...(outputEntry.dimensions ? { dimensions: Object.freeze({ width: outputEntry.dimensions.width, height: outputEntry.dimensions.height }) } : {}),
    producer: outputEntry.producer,
    license: outputEntry.license,
    provenance: outputEntry.provenance,
  }); });
  return Object.freeze({
    schemaVersion: 1,
    artifactId: input.artifactId,
    buildId: input.buildId,
    generator: Object.freeze({ name: input.generator.name, version: input.generator.version, sourceCommit: input.generator.sourceCommit, threeVersion: input.generator.threeVersion }),
    input: Object.freeze({ specPath, sha256: input.input.sha256 }),
    outputs: Object.freeze(outputs),
    capture: Object.freeze({ target: input.capture.target, backend: input.capture.backend, dimensions: Object.freeze({ width: input.capture.dimensions.width, height: input.capture.dimensions.height }), cameraParameters, options: captureOptions }),
    determinism: Object.freeze({ seed: input.determinism.seed, fixed: true as const }),
    performance: Object.freeze({ generationMs: input.performance.generationMs, estimatedPeakMemoryBytes: input.performance.estimatedPeakMemoryBytes, pngBytesRead: input.performance.pngBytesRead, decodedBytes: input.performance.decodedBytes, geometries: input.performance.geometries, materials: input.performance.materials, textures: input.performance.textures, disposeMs: input.performance.disposeMs, captures: input.performance.captures }),
    provenance: Object.freeze({ manifest: provenanceManifest }),
  });
}
