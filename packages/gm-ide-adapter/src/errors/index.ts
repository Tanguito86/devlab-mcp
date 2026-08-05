export type GmAdapterErrorCode =
  | "AUTHZ_PROJECT_ROOT" | "EXPECTED_HASH_MISMATCH" | "EXPECTED_HEAD_MISMATCH"
  | "PATH_ESCAPE" | "FILE_NOT_ALLOWLISTED" | "GATE_VIOLATION" | "PLAN_STALE"
  | "MUTATION_NOT_FOUND" | "MUTATION_ALREADY_APPLIED" | "VERIFICATION_FAILED"
  | "ROLLBACK_UNAVAILABLE" | "ROLLBACK_INCOMPLETE" | "PROCESS_OWNERSHIP"
  | "RUN_BLOCKED_EXTERNAL_RUNNER" | "TIMEOUT" | "CANCELLED" | "BUSY"
  | "CONCURRENT_MODIFICATION" | "LIMIT_EXCEEDED" | "REGISTRY_INVALID"
  | "INVALID_REQUEST" | "ATOMIC_PROMOTION_FAILED" | "COMPILE_FAILED";

export class GmAdapterError extends Error {
  constructor(
    readonly code: GmAdapterErrorCode,
    message: string,
    readonly recoverable: boolean,
    readonly details: Readonly<Record<string, unknown>> = Object.freeze({}),
  ) { super(message); this.name = "GmAdapterError"; }
}

export function fail(code: GmAdapterErrorCode, message: string, recoverable = false, details: Readonly<Record<string, unknown>> = {}): never {
  throw new GmAdapterError(code, message, recoverable, Object.freeze({ ...details }));
}
