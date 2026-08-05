import { createHash } from "node:crypto";
import { assertSafeRelativePath } from "./artifacts.js";
import { canonicalJson } from "./safe-generation.js";

export const ASSET_STATES = Object.freeze(["DRAFT", "PILOT", "CANDIDATE", "APPROVED", "DEPRECATED", "REJECTED"] as const);
export type AssetState = typeof ASSET_STATES[number];
export type BuildStatus = "SUCCESS" | "CHANGES_REQUIRED" | "BLOCKED";
export type ProductionFindingSeverity = "BLOCKER" | "REQUIRED" | "OPTIONAL" | "REJECTED";

export class AssetForgeError extends Error {
  constructor(readonly code: string, message: string, readonly details: Readonly<Record<string, unknown>> = Object.freeze({})) {
    super(message); this.name = "AssetForgeError";
  }
}

export interface OperationContract {
  readonly id: `asset_forge.${string}`;
  readonly inputSchema: string;
  readonly outputSchema: string;
  readonly effects: readonly string[];
  readonly writeRoots: readonly string[];
  readonly determinism: "BYTE_DETERMINISTIC" | "OPERATIONAL_ONLY";
  readonly limits: Readonly<Record<string, number>>;
  readonly errors: readonly string[];
  readonly dependencies: readonly string[];
  readonly offline: true;
  readonly rollback: string;
}

const commonErrors = Object.freeze(["INVALID_INPUT", "PATH_POLICY", "POLICY_VIOLATION", "INTERNAL_FAILURE"]);
const readOnly = Object.freeze(["READ_TRACKED_FILES"]);
const buildWrites = Object.freeze(["assets/builds/staging", "assets/builds/artifacts"]);

export const ASSET_FORGE_OPERATIONS: readonly OperationContract[] = Object.freeze([
  { id: "asset_forge.validate_spec", inputSchema: "asset-forge/spec-request-v1", outputSchema: "asset-forge/validation-result-v1", effects: readOnly, writeRoots: [], determinism: "BYTE_DETERMINISTIC", limits: { inputBytes: 1_048_576, nodes: 50_000 }, errors: [...commonErrors, "SPEC_INVALID"], dependencies: [], offline: true, rollback: "none; read-only" },
  { id: "asset_forge.build", inputSchema: "asset-forge/build-request-v1", outputSchema: "asset-forge/build-result-v1", effects: ["READ_TRACKED_FILES", "WRITE_STAGING", "ATOMIC_PROMOTE"], writeRoots: buildWrites, determinism: "BYTE_DETERMINISTIC", limits: { concurrency: 1, assets: 1, stagingBytes: 268_435_456 }, errors: [...commonErrors, "BUILD_FAILED", "VERSION_IMMUTABLE"], dependencies: ["THREEJS_CAPTURE_HARNESS"], offline: true, rollback: "mark failed staging; never publish partial canonical outputs" },
  { id: "asset_forge.build_batch", inputSchema: "asset-forge/batch-request-v1", outputSchema: "asset-forge/batch-result-v1", effects: ["READ_TRACKED_FILES", "WRITE_ISOLATED_STAGING", "ATOMIC_PROMOTE"], writeRoots: buildWrites, determinism: "BYTE_DETERMINISTIC", limits: { concurrency: 4, assets: 256, stagingBytes: 1_073_741_824 }, errors: [...commonErrors, "BATCH_LIMIT", "BUILD_FAILED"], dependencies: ["asset_forge.build"], offline: true, rollback: "rollback only failed asset staging; preserve completed isolated results" },
  { id: "asset_forge.capture", inputSchema: "asset-forge/capture-request-v1", outputSchema: "asset-forge/capture-result-v1", effects: ["LOOPBACK_RENDER", "WRITE_STAGING"], writeRoots: ["assets/builds/staging"], determinism: "BYTE_DETERMINISTIC", limits: { views: 32, pixelsPerView: 16_777_216 }, errors: [...commonErrors, "DEVICE_LOST", "CAPTURE_FAILED"], dependencies: ["THREEJS_CAPTURE_HARNESS"], offline: true, rollback: "reject incomplete frame and retain no canonical manifest" },
  { id: "asset_forge.critic", inputSchema: "asset-forge/critic-request-v1", outputSchema: "asset-forge/critic-result-v1", effects: ["READ_STAGING", "WRITE_STAGING"], writeRoots: ["assets/builds/staging"], determinism: "BYTE_DETERMINISTIC", limits: { findings: 512, evidencePaths: 2048 }, errors: [...commonErrors, "CRITIC_PROFILE_MISMATCH"], dependencies: [], offline: true, rollback: "discard unauthenticated report" },
  { id: "asset_forge.resolve", inputSchema: "asset-forge/resolve-request-v1", outputSchema: "asset-forge/resolution-v1", effects: ["READ_CRITIC_REPORTS", "WRITE_STAGING"], writeRoots: ["assets/builds/staging"], determinism: "BYTE_DETERMINISTIC", limits: { findings: 512 }, errors: [...commonErrors, "OPEN_REQUIRED", "BUILDER_FORBIDDEN"], dependencies: ["asset_forge.critic"], offline: true, rollback: "leave asset state unchanged" },
  { id: "asset_forge.export", inputSchema: "asset-forge/export-request-v1", outputSchema: "asset-forge/export-result-v1", effects: ["READ_FACTORY_OUTPUT", "WRITE_STAGING"], writeRoots: ["assets/builds/staging"], determinism: "BYTE_DETERMINISTIC", limits: { outputs: 16, outputBytes: 268_435_456 }, errors: [...commonErrors, "EXPORT_FAILED", "ROUNDTRIP_FAILED"], dependencies: [], offline: true, rollback: "remove or mark incomplete export staging" },
  { id: "asset_forge.inspect", inputSchema: "asset-forge/inspect-request-v1", outputSchema: "asset-forge/inspection-v1", effects: readOnly, writeRoots: [], determinism: "BYTE_DETERMINISTIC", limits: { inputBytes: 268_435_456 }, errors: [...commonErrors, "ARTIFACT_INVALID"], dependencies: [], offline: true, rollback: "none; read-only" },
] as unknown as readonly OperationContract[]);

export const ASSET_FORGE_CAPABILITY = Object.freeze({
  schemaVersion: 1, id: "asset-forge", version: "1.0.0", publicOperations: ASSET_FORGE_OPERATIONS,
  publicRendererApi: false, offline: true, networkPolicy: "DENY_EXTERNAL",
});

export interface CatalogProvenance { readonly manifest: string; readonly source: string; readonly sourceSha256: string; readonly license: string; readonly manifestSha256: string }
export interface AssetCatalogEntry {
  readonly assetId: string; readonly version: string; readonly status: AssetState; readonly assetClass: string;
  readonly specPath: string; readonly factoryCapability: "asset-forge"; readonly artifactManifest: string;
  readonly budgetProfile: string; readonly criticProfiles: readonly string[]; readonly rendererTargets: readonly ("webgl" | "webgpu")[];
  readonly exports: readonly string[]; readonly provenance: CatalogProvenance;
}
export interface AssetCatalog { readonly schemaVersion: 1; readonly migration: "asset-catalog-v1"; readonly entries: readonly AssetCatalogEntry[] }

function plain(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new AssetForgeError("SCHEMA", `${field} must be a plain object`);
}
function exact(value: Record<string, unknown>, keys: readonly string[], field: string): void {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.join("|") !== expected.join("|")) throw new AssetForgeError("SCHEMA", `${field} has missing or unknown fields`, { actual, expected });
}
function text(value: unknown, field: string, pattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/): string {
  if (typeof value !== "string" || value.length > 256 || !pattern.test(value)) throw new AssetForgeError("SCHEMA", `${field} is invalid`); return value;
}
function sha256(value: unknown, field: string): string { return text(value, field, /^[0-9a-f]{64}$/); }
function semver(value: unknown, field: string): string { return text(value, field, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/); }

export function validateAssetCatalog(value: unknown): AssetCatalog {
  plain(value, "catalog"); exact(value, ["schemaVersion", "migration", "entries"], "catalog");
  if (value.schemaVersion !== 1 || value.migration !== "asset-catalog-v1" || !Array.isArray(value.entries)) throw new AssetForgeError("CATALOG_INVALID", "catalog header is invalid");
  const entries = value.entries.map((candidate, index): AssetCatalogEntry => {
    plain(candidate, `entries[${index}]`); exact(candidate, ["assetId", "version", "status", "assetClass", "specPath", "factoryCapability", "artifactManifest", "budgetProfile", "criticProfiles", "rendererTargets", "exports", "provenance"], `entries[${index}]`);
    const assetId = text(candidate.assetId, `entries[${index}].assetId`); const version = semver(candidate.version, `entries[${index}].version`);
    if (!ASSET_STATES.includes(candidate.status as AssetState)) throw new AssetForgeError("CATALOG_INVALID", `entries[${index}].status is invalid`);
    if (candidate.factoryCapability !== "asset-forge") throw new AssetForgeError("CATALOG_INVALID", "factoryCapability must be asset-forge");
    if (!Array.isArray(candidate.criticProfiles) || !Array.isArray(candidate.rendererTargets) || !Array.isArray(candidate.exports)) throw new AssetForgeError("CATALOG_INVALID", "catalog arrays are invalid");
    plain(candidate.provenance, `entries[${index}].provenance`); exact(candidate.provenance, ["manifest", "source", "sourceSha256", "license", "manifestSha256"], `entries[${index}].provenance`);
    const entry: AssetCatalogEntry = Object.freeze({
      assetId, version, status: candidate.status as AssetState, assetClass: text(candidate.assetClass, "assetClass"),
      specPath: assertSafeRelativePath(text(candidate.specPath, "specPath", /^[\x21-\x7e]+$/)), factoryCapability: "asset-forge",
      artifactManifest: assertSafeRelativePath(text(candidate.artifactManifest, "artifactManifest", /^[\x21-\x7e]+$/)), budgetProfile: text(candidate.budgetProfile, "budgetProfile"),
      criticProfiles: Object.freeze(candidate.criticProfiles.map((item, i) => text(item, `criticProfiles[${i}]`))),
      rendererTargets: Object.freeze(candidate.rendererTargets.map((item) => { if (item !== "webgl" && item !== "webgpu") throw new AssetForgeError("CATALOG_INVALID", "renderer target is invalid"); return item; })),
      exports: Object.freeze(candidate.exports.map((item, i) => assertSafeRelativePath(text(item, `exports[${i}]`, /^[\x21-\x7e]+$/)))),
      provenance: Object.freeze({ manifest: assertSafeRelativePath(text(candidate.provenance.manifest, "provenance.manifest", /^[\x21-\x7e]+$/)), source: assertSafeRelativePath(text(candidate.provenance.source, "provenance.source", /^[\x21-\x7e]+$/)), sourceSha256: sha256(candidate.provenance.sourceSha256, "provenance.sourceSha256"), license: text(candidate.provenance.license, "provenance.license", /^[A-Za-z0-9][A-Za-z0-9.+-]*$/), manifestSha256: sha256(candidate.provenance.manifestSha256, "provenance.manifestSha256") }),
    }); return entry;
  });
  const identities = entries.map(({ assetId, version }) => `${assetId}@${version}`.toLowerCase());
  if (new Set(identities).size !== identities.length) throw new AssetForgeError("CATALOG_DUPLICATE", "catalog contains duplicate assetId + version");
  const sorted = [...identities].sort(); if (identities.join("|") !== sorted.join("|")) throw new AssetForgeError("CATALOG_ORDER", "catalog entries must use canonical assetId + version order");
  return Object.freeze({ schemaVersion: 1, migration: "asset-catalog-v1", entries: Object.freeze(entries) });
}

const transitions = new Set(["DRAFT>PILOT", "PILOT>CANDIDATE", "CANDIDATE>APPROVED", "CANDIDATE>REJECTED", "APPROVED>DEPRECATED", "REJECTED>DRAFT"]);
export function assertLifecycleTransition(from: AssetState, to: AssetState, actor: "BUILDER" | "RESOLVER", findings: readonly Readonly<{ severity: ProductionFindingSeverity }>[], evidenceComplete: boolean): void {
  if (!transitions.has(`${from}>${to}`)) throw new AssetForgeError("LIFECYCLE_TRANSITION", `transition ${from} -> ${to} is not allowed`);
  if (to === "APPROVED" && actor === "BUILDER") throw new AssetForgeError("BUILDER_FORBIDDEN", "builder cannot promote an asset to APPROVED");
  if ((to === "CANDIDATE" || to === "APPROVED") && findings.some(({ severity }) => severity === "BLOCKER" || severity === "REQUIRED")) throw new AssetForgeError("OPEN_REQUIRED", "BLOCKER or REQUIRED finding prevents promotion");
  if (to === "APPROVED" && !evidenceComplete) throw new AssetForgeError("EVIDENCE_INCOMPLETE", "APPROVED assets require complete evidence and hashes");
}

export function assertCatalogEvolution(previous: AssetCatalog, next: AssetCatalog): void {
  const nextMap = new Map(next.entries.map((entry) => [`${entry.assetId}@${entry.version}`, entry]));
  const byAsset = new Map<string, string[]>(); for (const entry of next.entries) byAsset.set(entry.assetId, [...(byAsset.get(entry.assetId) ?? []), entry.version]);
  for (const oldEntry of previous.entries) {
    const replacement = nextMap.get(`${oldEntry.assetId}@${oldEntry.version}`);
    if (!replacement) throw new AssetForgeError("CATALOG_DOWNGRADE", `existing version ${oldEntry.assetId}@${oldEntry.version} cannot disappear`);
    if ((oldEntry.status === "CANDIDATE" || oldEntry.status === "APPROVED" || oldEntry.status === "DEPRECATED") && canonicalJson(oldEntry) !== canonicalJson(replacement)) throw new AssetForgeError("VERSION_IMMUTABLE", `${oldEntry.assetId}@${oldEntry.version} is immutable`);
  }
  for (const [assetId, versions] of byAsset) {
    const oldVersions = previous.entries.filter((entry) => entry.assetId === assetId).map(({ version }) => version);
    if (oldVersions.length && versions.some((version) => compareSemver(version, oldVersions.sort(compareSemver).at(-1)!) < 0 && !oldVersions.includes(version))) throw new AssetForgeError("CATALOG_DOWNGRADE", `new ${assetId} version is lower than catalog head`);
  }
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(/[+-]/)[0]!.split(".").map(Number); const pb = b.split(/[+-]/)[0]!.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!; return a.localeCompare(b);
}

export interface BudgetProfile { readonly profileId: string; readonly version: 1; readonly immutable: true; readonly triangles: Readonly<{ target: number; maximum: number }>; readonly drawCalls: Readonly<{ target: number; maximum: number }>; readonly materials: Readonly<{ target: number; maximum: number }>; readonly textures: Readonly<{ target: number; maximum: number }>; readonly nodes: Readonly<{ target: number; maximum: number }>; readonly captureMilliseconds: Readonly<{ target: number }> }
export interface BudgetMetrics { readonly triangles: number; readonly drawCalls: number; readonly materials: number; readonly textures: number; readonly nodes: number; readonly captureMilliseconds: number; readonly geometryValid: boolean; readonly resourceLeak: boolean }

function profile(profileId: string, scale: number): BudgetProfile { return Object.freeze({ profileId, version: 1, immutable: true, triangles: Object.freeze({ target: 18_000 * scale, maximum: 30_000 * scale }), drawCalls: Object.freeze({ target: Math.max(4, 10 * scale), maximum: Math.max(6, 16 * scale) }), materials: Object.freeze({ target: Math.max(2, 5 * scale), maximum: Math.max(3, 8 * scale) }), textures: Object.freeze({ target: Math.max(0, Math.round(2 * (scale - 0.5))), maximum: Math.max(2, 4 * scale) }), nodes: Object.freeze({ target: 80 * scale, maximum: 140 * scale }), captureMilliseconds: Object.freeze({ target: 1500 * Math.max(0.75, scale) }) }); }
export const BUDGET_PROFILES: readonly BudgetProfile[] = Object.freeze([profile("tiny-prop-v1", 0.5), profile("small-prop-v1", 1), profile("medium-prop-v1", 2), profile("large-prop-v1", 4)]);

export function evaluateBudget(profileValue: BudgetProfile, metrics: BudgetMetrics): Readonly<{ status: BuildStatus; findings: readonly Readonly<{ severity: ProductionFindingSeverity; code: string; metric: string; actual: number | boolean; limit?: number }>[] }> {
  const findings: Array<Readonly<{ severity: ProductionFindingSeverity; code: string; metric: string; actual: number | boolean; limit?: number }>> = [];
  if (!metrics.geometryValid) findings.push(Object.freeze({ severity: "BLOCKER", code: "INVALID_GEOMETRY", metric: "geometryValid", actual: false }));
  if (metrics.resourceLeak) findings.push(Object.freeze({ severity: "BLOCKER", code: "RESOURCE_LEAK", metric: "resourceLeak", actual: true }));
  for (const metric of ["triangles", "drawCalls", "materials", "textures", "nodes"] as const) {
    const actual = metrics[metric]; const limit = profileValue[metric];
    if (actual > limit.maximum) findings.push(Object.freeze({ severity: "REQUIRED", code: `BUDGET_MAX_${metric.toUpperCase()}`, metric, actual, limit: limit.maximum }));
    else if (actual > limit.target) findings.push(Object.freeze({ severity: "OPTIONAL", code: `BUDGET_TARGET_${metric.toUpperCase()}`, metric, actual, limit: limit.target }));
  }
  if (metrics.captureMilliseconds > profileValue.captureMilliseconds.target) findings.push(Object.freeze({ severity: "OPTIONAL", code: "BUDGET_TARGET_CAPTURE", metric: "captureMilliseconds", actual: metrics.captureMilliseconds, limit: profileValue.captureMilliseconds.target }));
  const status: BuildStatus = findings.some(({ severity }) => severity === "BLOCKER") ? "BLOCKED" : findings.some(({ severity }) => severity === "REQUIRED") ? "CHANGES_REQUIRED" : "SUCCESS";
  return Object.freeze({ status, findings: Object.freeze(findings) });
}

export interface PromotionRecordInput { readonly assetId: string; readonly version: string; readonly from: AssetState; readonly to: AssetState; readonly artifactManifestSha256: string; readonly criticReports: readonly string[]; readonly decision: "APPROVED" | "REJECTED"; readonly policyVersion: string }
export function createPromotionRecord(input: PromotionRecordInput): Readonly<PromotionRecordInput & { schemaVersion: 1; recordSha256: string }> {
  text(input.assetId, "assetId"); semver(input.version, "version"); sha256(input.artifactManifestSha256, "artifactManifestSha256");
  const criticReports = Object.freeze([...input.criticReports].map((path) => assertSafeRelativePath(path)).sort());
  const canonical = { schemaVersion: 1 as const, ...input, criticReports }; const recordSha256 = createHash("sha256").update(`${canonicalJson(canonical)}\n`).digest("hex");
  return Object.freeze({ ...canonical, recordSha256 });
}

export interface AtlasBridgeManifest { readonly schemaVersion: 1; readonly assetId: string; readonly sourceArtifact: string; readonly views: readonly unknown[]; readonly frames: readonly unknown[]; readonly trimPolicy: "none" | "alpha"; readonly anchorPolicy: "canonical"; readonly target: Readonly<{ consumer: "gvf" | "gamemaker"; pixelScale: number }> }
export function validateAtlasBridgeManifest(value: unknown): AtlasBridgeManifest {
  plain(value, "atlasBridge"); exact(value, ["schemaVersion", "assetId", "sourceArtifact", "views", "frames", "trimPolicy", "anchorPolicy", "target"], "atlasBridge"); plain(value.target, "target"); exact(value.target, ["consumer", "pixelScale"], "target");
  const consumer = value.target.consumer; const pixelScale = value.target.pixelScale;
  if (value.schemaVersion !== 1 || !Array.isArray(value.views) || !Array.isArray(value.frames) || (value.trimPolicy !== "none" && value.trimPolicy !== "alpha") || value.anchorPolicy !== "canonical" || (consumer !== "gvf" && consumer !== "gamemaker") || typeof pixelScale !== "number" || !Number.isSafeInteger(pixelScale) || pixelScale < 1 || pixelScale > 16) throw new AssetForgeError("ATLAS_BRIDGE_INVALID", "atlas bridge contract is invalid");
  return Object.freeze({ schemaVersion: 1, assetId: text(value.assetId, "assetId"), sourceArtifact: assertSafeRelativePath(text(value.sourceArtifact, "sourceArtifact", /^[\x21-\x7e]+$/)), views: Object.freeze(value.views), frames: Object.freeze(value.frames), trimPolicy: value.trimPolicy, anchorPolicy: "canonical", target: Object.freeze({ consumer, pixelScale }) });
}

export function scanCatalogProvenance(catalog: AssetCatalog): readonly Readonly<{ assetId: string; version: string; errors: readonly string[] }>[] {
  return Object.freeze(catalog.entries.map((entry) => {
    const errors: string[] = []; const candidatePaths = [entry.specPath, entry.artifactManifest, entry.provenance.manifest, entry.provenance.source, ...entry.exports];
    if (!entry.provenance.license) errors.push("license-missing"); if (!entry.provenance.sourceSha256 || !entry.provenance.manifestSha256) errors.push("hash-missing");
    for (const path of candidatePaths) { try { assertSafeRelativePath(path); } catch { errors.push(`unsafe-path:${path}`); } if (/^(?:https?|ftp):/i.test(path)) errors.push(`remote-url:${path}`); }
    return Object.freeze({ assetId: entry.assetId, version: entry.version, errors: Object.freeze(errors.sort()) });
  }));
}
