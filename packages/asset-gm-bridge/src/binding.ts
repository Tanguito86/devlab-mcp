import type { AssetGmBridgeManifest } from "./contracts.js";
import { canonicalHash, sha256 } from "./canonical.js";

export interface PlanBindingInput {
  readonly bridgeVersion: string;
  readonly manifest: AssetGmBridgeManifest;
  readonly adapterPlanHash: string;
  readonly expectedHead: string | null;
  readonly plannedFiles: readonly Readonly<{ path: string; afterSha256: string }>[];
  readonly transactionId: string;
  readonly resourceName: string;
}

/**
 * The plan binding is the SHA-256 over the canonical form of everything the
 * import depends on: bridge version, the immutable manifest hash (which binds
 * asset identity/version/lifecycle/spec/export/hashes/provenance/target
 * snapshot/allowlist), the adapter plan hash (which binds target snapshot,
 * HEAD, allowlist and planned content), the exact planned file hashes, the
 * transaction id and the resource name. Any drift between plan and apply
 * invalidates the binding -> STALE_OR_TAMPERED_PLAN.
 */
export function computePlanBinding(input: PlanBindingInput): string {
  const payload = Object.freeze({
    schemaVersion: 1,
    bindingVersion: 1,
    bridgeVersion: input.bridgeVersion,
    manifestHash: canonicalHash(input.manifest),
    adapterPlanHash: input.adapterPlanHash,
    expectedHead: input.expectedHead,
    plannedFiles: Object.freeze([...input.plannedFiles].sort((a, b) => a.path.localeCompare(b.path)).map((file) => Object.freeze({ path: file.path, afterSha256: file.afterSha256 }))),
    transactionId: input.transactionId,
    resourceName: input.resourceName,
  });
  return canonicalHash(payload);
}

export function bindingPayload(input: PlanBindingInput): unknown {
  return Object.freeze({
    schemaVersion: 1,
    bindingVersion: 1,
    bridgeVersion: input.bridgeVersion,
    manifestHash: canonicalHash(input.manifest),
    adapterPlanHash: input.adapterPlanHash,
    expectedHead: input.expectedHead,
    plannedFiles: Object.freeze([...input.plannedFiles].sort((a, b) => a.path.localeCompare(b.path)).map((file) => Object.freeze({ path: file.path, afterSha256: file.afterSha256 }))),
    transactionId: input.transactionId,
    resourceName: input.resourceName,
  });
}

export const manifestHash = (manifest: AssetGmBridgeManifest): string => canonicalHash(manifest);
export const hashBytes = sha256;
