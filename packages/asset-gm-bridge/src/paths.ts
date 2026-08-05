import { safeRelativePath } from "@tanguito/devlab-gm-ide-adapter/internal";
import { fail } from "./errors.js";

/**
 * Path safety: REUSES the gm-ide-adapter `safeRelativePath` contract (NUL,
 * absolute paths, drive letters, UNC, mixed separators, "..", ".", ":", ADS,
 * trailing dot/space, reserved DOS names, percent-encoded separators, length
 * and segment limits) and ADDS case-collision and Unicode (NFKC) ambiguity
 * detection on top — checks the adapter does not perform.
 */

export function normalizePathIdentity(path: string): string {
  return path.normalize("NFKC").toLowerCase();
}

export interface CollisionScanResult {
  readonly collisions: readonly Readonly<{ kind: "CASE" | "UNICODE" | "DUPLICATE"; planned: string; existing: string }>[];
}

export function scanPathCollisions(planned: readonly string[], existing: readonly string[]): CollisionScanResult {
  const normalized = new Map<string, string>();
  const collisions: Array<Readonly<{ kind: "CASE" | "UNICODE" | "DUPLICATE"; planned: string; existing: string }>> = [];
  const seen = new Set<string>();
  for (const path of [...planned].sort()) {
    const safe = safeRelativePath(path);
    const identity = normalizePathIdentity(safe);
    if (seen.has(safe)) collisions.push(Object.freeze({ kind: "DUPLICATE", planned: safe, existing: safe }));
    seen.add(safe);
    const previous = normalized.get(identity);
    if (previous !== undefined && previous !== safe) {
      const kind = safe.normalize("NFC").toLowerCase() === previous.normalize("NFC").toLowerCase() ? "CASE" : "UNICODE";
      collisions.push(Object.freeze({ kind, planned: safe, existing: previous }));
    }
    normalized.set(identity, safe);
  }
  for (const path of [...existing].sort()) {
    const identity = normalizePathIdentity(path);
    const plannedMatch = normalized.get(identity);
    if (plannedMatch !== undefined && plannedMatch !== path) {
      const kind = path.normalize("NFC").toLowerCase() === plannedMatch.normalize("NFC").toLowerCase() ? "CASE" : "UNICODE";
      collisions.push(Object.freeze({ kind, planned: plannedMatch, existing: path }));
    }
  }
  const unique = new Map<string, Readonly<{ kind: "CASE" | "UNICODE" | "DUPLICATE"; planned: string; existing: string }>>();
  for (const collision of collisions) unique.set(`${collision.kind}|${collision.planned}|${collision.existing}`, collision);
  return Object.freeze({ collisions: Object.freeze([...unique.values()].sort((a, b) => a.planned.localeCompare(b.planned))) });
}

export function assertNoPathCollisions(planned: readonly string[], existing: readonly string[]): void {
  const { collisions } = scanPathCollisions(planned, existing);
  const first = collisions[0];
  if (!first) return;
  if (first.kind === "CASE") fail("CASE_COLLISION", `case-colliding path: ${first.planned} vs ${first.existing}`);
  if (first.kind === "UNICODE") fail("CASE_COLLISION", `ambiguous Unicode path: ${first.planned} vs ${first.existing}`);
  fail("RESOURCE_COLLISION", `duplicate planned path: ${first.planned}`);
}

/** GameMaker resource-name collision: an import must not duplicate or case-collide with existing resources. */
export function assertResourceNameAvailable(resourceName: string, existingReferences: readonly string[], existingFiles: readonly string[], allowExisting = false): void {
  let name: string;
  try { name = safeRelativePath(resourceName, "resourceName"); } catch { fail("PATH_NOT_ALLOWED", "resourceName is outside the path safety policy"); }
  if (name.includes("/") || name.includes("\\")) fail("PATH_NOT_ALLOWED", "resourceName must be a single path segment");
  const file = `sprites/${name}/${name}.yy`;
  for (const reference of existingReferences) {
    if (reference === file) {
      if (!allowExisting) fail("RESOURCE_COLLISION", `resource already referenced in project: ${file}`);
    } else if (normalizePathIdentity(reference) === normalizePathIdentity(file)) {
      fail("CASE_COLLISION", `case/Unicode-colliding resource: ${reference} vs ${file}`);
    }
  }
  for (const existing of existingFiles) {
    if (existing === file) {
      if (!allowExisting) fail("RESOURCE_COLLISION", `resource file already exists: ${file}`);
    } else if (normalizePathIdentity(existing) === normalizePathIdentity(file)) {
      fail("CASE_COLLISION", `case/Unicode-colliding resource: ${existing} vs ${file}`);
    }
  }
}
