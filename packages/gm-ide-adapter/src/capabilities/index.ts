import type { ActionGateLevel, GmCapability } from "../contracts/index.js";

export interface GmCapabilityContract { readonly id: GmCapability; readonly inputSchema: string; readonly outputSchema: string; readonly effects: readonly string[]; readonly authorizedRoots: "REQUEST_EXPLICIT_RELATIVE"; readonly determinism: "BYTE_DETERMINISTIC" | "OPERATIONAL_EVIDENCE"; readonly timeout: "REQUEST_BOUNDED"; readonly reversibility: string; readonly evidence: readonly string[]; readonly errors: readonly string[]; readonly gate: ActionGateLevel }
const errors = Object.freeze(["INVALID_REQUEST", "PATH_ESCAPE", "EXPECTED_HASH_MISMATCH", "EXPECTED_HEAD_MISMATCH", "GATE_VIOLATION", "TIMEOUT", "CANCELLED"]);
const contract = (id: GmCapability, gate: ActionGateLevel, effects: readonly string[], determinism: GmCapabilityContract["determinism"], reversibility: string, evidence: readonly string[]): GmCapabilityContract => Object.freeze({ id, inputSchema: `gm/${id.toLowerCase()}-request-v1`, outputSchema: `gm/${id.toLowerCase()}-response-v1`, effects: Object.freeze([...effects]), authorizedRoots: "REQUEST_EXPLICIT_RELATIVE", determinism, timeout: "REQUEST_BOUNDED", reversibility, evidence: Object.freeze([...evidence]), errors, gate });
export const GM_CAPABILITY_CONTRACTS = Object.freeze([
  contract("GM_STATUS_V1", "READ_ONLY", ["READ_PROJECT", "READ_PROCESSES"], "BYTE_DETERMINISTIC", "not applicable", ["status"]),
  contract("GM_INSPECT_V1", "READ_ONLY", ["READ_PROJECT", "HASH_PROJECT"], "BYTE_DETERMINISTIC", "not applicable", ["snapshot", "fingerprint"]),
  contract("GM_PLAN_V1", "PLAN_ONLY", ["READ_PROJECT", "RETURN_IMMUTABLE_PLAN"], "BYTE_DETERMINISTIC", "no project mutation", ["plan", "planHash"]),
  contract("GM_APPLY_SAFE_V1", "SAFE_WRITE", ["WRITE_STAGING", "BACKUP", "ATOMIC_PROMOTE"], "BYTE_DETERMINISTIC", "byte-exact backup required", ["manifest", "hashes"]),
  contract("GM_VERIFY_V1", "RUN", ["READ_PROJECT", "OPTIONAL_IGOR", "OPTIONAL_RUNNER"], "OPERATIONAL_EVIDENCE", "rollback remains available", ["verify", "compile.log", "process-ledger"]),
  contract("GM_ROLLBACK_V1", "SAFE_WRITE", ["VERIFY_BACKUP", "ATOMIC_RESTORE"], "BYTE_DETERMINISTIC", "byte-exact and fail-closed", ["rollback", "restored hashes"]),
] as const);
