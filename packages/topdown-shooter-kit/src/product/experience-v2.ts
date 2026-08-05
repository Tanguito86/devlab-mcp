import { isCanonicalLocalPath } from "../assets/local-asset-registry.js";

export type ExperienceSeedPolicy = "fixed" | "session" | "explicit";

export interface ExperienceV2 {
  readonly schemaVersion: 2;
  readonly experienceId: string;
  readonly title: string;
  readonly version: string;
  readonly entryCapability: string;
  readonly session: { readonly targetDurationSeconds: number; readonly restartable: boolean };
  readonly input: { readonly primaryGesture: string };
  readonly simulation: { readonly fixedTimestepHz: number; readonly deterministic: true; readonly seedPolicy: ExperienceSeedPolicy };
  readonly lifecycle: { readonly visibilityPolicy: "freeze" };
  readonly assetsRegistry: string;
  readonly offline: true;
  readonly provenance: { readonly manifest: string };
}

export interface ExperienceValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const SEMVER_IDENTIFIER = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const SEMVER = new RegExp(`^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-${SEMVER_IDENTIFIER}(?:\\.${SEMVER_IDENTIFIER})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
const ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function objectAt(value: unknown, path: string, keys: readonly string[], errors: string[]): value is Record<string, unknown> {
  if (!isRecord(value) || !exactKeys(value, keys)) { errors.push(`${path}: expected exactly ${keys.join(", ")}`); return false; }
  return true;
}

export function validateExperienceV2(value: unknown): ExperienceValidationResult {
  const errors: string[] = [];
  if (!objectAt(value, "$", ["schemaVersion", "experienceId", "title", "version", "entryCapability", "session", "input", "simulation", "lifecycle", "assetsRegistry", "offline", "provenance"], errors)) return { ok: false, errors };
  if (value.schemaVersion !== 2) errors.push("$.schemaVersion: expected version 2; use a matching validator for another schema version");
  if (typeof value.experienceId !== "string" || !ID.test(value.experienceId)) errors.push("$.experienceId: expected a stable lowercase identifier");
  if (typeof value.title !== "string" || value.title.trim().length === 0) errors.push("$.title: expected a non-empty title");
  if (typeof value.version !== "string" || !SEMVER.test(value.version)) errors.push("$.version: expected semantic versioning");
  if (typeof value.entryCapability !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(value.entryCapability)) errors.push("$.entryCapability: expected a capability registry identifier");
  if (objectAt(value.session, "$.session", ["targetDurationSeconds", "restartable"], errors)) {
    if (!Number.isSafeInteger(value.session.targetDurationSeconds) || (value.session.targetDurationSeconds as number) < 1) errors.push("$.session.targetDurationSeconds: expected a positive integer");
    if (typeof value.session.restartable !== "boolean") errors.push("$.session.restartable: expected boolean");
  }
  if (objectAt(value.input, "$.input", ["primaryGesture"], errors) && (typeof value.input.primaryGesture !== "string" || value.input.primaryGesture.trim().length === 0)) errors.push("$.input.primaryGesture: expected a non-empty gesture description");
  if (objectAt(value.simulation, "$.simulation", ["fixedTimestepHz", "deterministic", "seedPolicy"], errors)) {
    if (!Number.isSafeInteger(value.simulation.fixedTimestepHz) || (value.simulation.fixedTimestepHz as number) < 1) errors.push("$.simulation.fixedTimestepHz: expected a positive integer");
    if (value.simulation.deterministic !== true) errors.push("$.simulation.deterministic: DevLab experiences must be deterministic");
    if (!new Set(["fixed", "session", "explicit"]).has(value.simulation.seedPolicy as string)) errors.push("$.simulation.seedPolicy: expected fixed, session, or explicit");
  }
  if (objectAt(value.lifecycle, "$.lifecycle", ["visibilityPolicy"], errors) && value.lifecycle.visibilityPolicy !== "freeze") errors.push("$.lifecycle.visibilityPolicy: expected freeze");
  if (!isCanonicalLocalPath(value.assetsRegistry)) errors.push("$.assetsRegistry: expected a normalized local relative path");
  if (value.offline !== true) errors.push("$.offline: DevLab experiences must be offline");
  if (objectAt(value.provenance, "$.provenance", ["manifest"], errors) && !isCanonicalLocalPath(value.provenance.manifest)) errors.push("$.provenance.manifest: expected a normalized local relative path");
  return { ok: errors.length === 0, errors };
}

export function assertExperienceV2(value: unknown): asserts value is ExperienceV2 {
  const result = validateExperienceV2(value);
  if (!result.ok) throw new TypeError(result.errors.join("; "));
}

export function validateExperienceEntryCapability(experience: ExperienceV2, capabilityIds: ReadonlySet<string>): ExperienceValidationResult {
  if (capabilityIds.has(experience.entryCapability)) return { ok: true, errors: [] };
  return { ok: false, errors: [`$.entryCapability: unknown capability ${experience.entryCapability}`] };
}
