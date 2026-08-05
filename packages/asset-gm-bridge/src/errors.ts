import { AssetForgeError } from "@tanguito/devlab-img2threejs-asset-forge";
import { GmAdapterError } from "@tanguito/devlab-gm-ide-adapter";

export type AssetGmBridgeErrorCode =
  | "ASSET_NOT_APPROVED" | "ASSET_NOT_FOUND" | "ASSET_HASH_MISMATCH" | "ASSET_BUDGET_EXCEEDED"
  | "INVALID_ASSET_MANIFEST" | "TARGET_PROJECT_MISMATCH" | "TARGET_SNAPSHOT_CHANGED"
  | "STALE_OR_TAMPERED_PLAN" | "PATH_NOT_ALLOWED" | "RESOURCE_COLLISION" | "CASE_COLLISION"
  | "APPLY_FAILED_RECOVERED" | "APPLY_FAILED_RECOVERY_REQUIRED" | "ROLLBACK_BLOCKED_CONCURRENT_CHANGE"
  | "VERIFY_COMPILE_FAILED" | "VERIFY_RUNTIME_FAILED"
  | "GATE_VIOLATION" | "INVALID_REQUEST" | "BUSY" | "TIMEOUT" | "CANCELLED" | "LIMIT_EXCEEDED"
  | "PROCESS_OWNERSHIP" | "RUN_BLOCKED_EXTERNAL_RUNNER" | "MUTATION_NOT_FOUND" | "MUTATION_ALREADY_APPLIED";

export class AssetGmBridgeError extends Error {
  constructor(
    readonly code: AssetGmBridgeErrorCode,
    message: string,
    readonly recoverable: boolean,
    readonly details: Readonly<Record<string, unknown>> = Object.freeze({}),
  ) { super(message); this.name = "AssetGmBridgeError"; }
}

export function fail(code: AssetGmBridgeErrorCode, message: string, recoverable = false, details: Readonly<Record<string, unknown>> = {}): never {
  throw new AssetGmBridgeError(code, message, recoverable, Object.freeze({ ...details }));
}

export function publicErrorShape(error: unknown): Readonly<{ code: string; message: string; recoverable: boolean }> {
  if (error instanceof AssetGmBridgeError) return Object.freeze({ code: error.code, message: error.message, recoverable: error.recoverable });
  if (error instanceof GmAdapterError) return Object.freeze({ code: error.code, message: error.message, recoverable: error.recoverable });
  if (error instanceof AssetForgeError) return Object.freeze({ code: error.code, message: error.message, recoverable: false });
  const message = error instanceof Error ? error.message : String(error);
  return Object.freeze({ code: "INTERNAL_FAILURE", message, recoverable: false });
}

/** Maps gm-ide-adapter failures onto the public Asset Bridge vocabulary (fail-closed). */
export function mapAdapterError(error: unknown, context: Readonly<{ phase: "plan" | "apply" | "verify" | "rollback"; verify?: "compile" | "runtime" }>): never {
  if (error instanceof GmAdapterError) {
    switch (error.code) {
      case "PLAN_STALE":
      case "EXPECTED_HEAD_MISMATCH":
      case "EXPECTED_HASH_MISMATCH": throw new AssetGmBridgeError("STALE_OR_TAMPERED_PLAN", error.message, true, error.details);
      case "CONCURRENT_MODIFICATION": throw new AssetGmBridgeError(context.phase === "rollback" ? "ROLLBACK_BLOCKED_CONCURRENT_CHANGE" : "TARGET_SNAPSHOT_CHANGED", error.message, true, error.details);
      case "PATH_ESCAPE":
      case "FILE_NOT_ALLOWLISTED": throw new AssetGmBridgeError("PATH_NOT_ALLOWED", error.message, false, error.details);
      case "ATOMIC_PROMOTION_FAILED": throw new AssetGmBridgeError(error.details.leaveWriteAhead === true ? "APPLY_FAILED_RECOVERY_REQUIRED" : "APPLY_FAILED_RECOVERED", error.message, true, error.details);
      case "AUTHZ_PROJECT_ROOT": throw new AssetGmBridgeError("TARGET_PROJECT_MISMATCH", error.message, false, error.details);
      case "GATE_VIOLATION": throw new AssetGmBridgeError("GATE_VIOLATION", error.message, false, error.details);
      case "ROLLBACK_UNAVAILABLE":
      case "ROLLBACK_INCOMPLETE": throw new AssetGmBridgeError("STALE_OR_TAMPERED_PLAN", error.message, false, error.details);
      default: {
        if (context.phase === "verify" && error.code === "VERIFICATION_FAILED") throw new AssetGmBridgeError(context.verify === "runtime" ? "VERIFY_RUNTIME_FAILED" : "VERIFY_COMPILE_FAILED", error.message, true, error.details);
        throw new AssetGmBridgeError(error.code as AssetGmBridgeErrorCode, error.message, error.recoverable, error.details);
      }
    }
  }
  throw error;
}
