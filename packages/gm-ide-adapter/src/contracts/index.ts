export const PUBLIC_GM_CAPABILITIES = Object.freeze([
  "GM_STATUS_V1", "GM_INSPECT_V1", "GM_PLAN_V1", "GM_APPLY_SAFE_V1", "GM_VERIFY_V1", "GM_ROLLBACK_V1",
] as const);
export type GmCapability = typeof PUBLIC_GM_CAPABILITIES[number];
export type ActionGateLevel = "READ_ONLY" | "PLAN_ONLY" | "SAFE_WRITE" | "COMPILE" | "RUN" | "DESTRUCTIVE";
export type VerificationLevel = "TEXT_VALID" | "PROJECT_LOAD_VALID" | "COMPILE_VALID" | "RUNTIME_VALID";
export type AdapterState = "READY" | "DIRTY" | "PROJECT_OPEN" | "COMPILE_RUNNING" | "RUNNER_RUNNING_OWNED" | "RUNNER_RUNNING_FOREIGN" | "TRANSACTION_PENDING" | "ROLLBACK_AVAILABLE" | "BLOCKED";
export type RuntimePolicy = "required" | "optional" | "forbidden";

export interface VerificationPolicy { readonly projectLoad: boolean; readonly compile: boolean; readonly runtime: RuntimePolicy }
export interface GmRequestBase {
  readonly projectRoot: string;
  readonly expectedProjectFingerprint: string | null;
  readonly expectedHead: string | null;
  readonly allowlist: readonly string[];
  readonly capability: GmCapability;
  readonly transactionId: string;
  readonly timeoutMs: number;
  readonly cancellation?: AbortSignal;
  readonly verificationPolicy: VerificationPolicy;
  readonly evidenceRoot: string;
}
export interface GmStatusRequest extends GmRequestBase {}
export interface GmInspectRequest extends GmRequestBase { readonly maxFiles?: number }
export interface GmFileEdit { readonly path: string; readonly action: "modify" | "create"; readonly content: string }
export interface GmPlanRequest extends GmRequestBase { readonly files: readonly GmFileEdit[] }
export interface GmApplySafeRequest extends GmRequestBase { readonly plan: GmMutationPlan; readonly planHash: string; readonly confirm: boolean; readonly dryRun?: boolean; readonly faultAt?: "before-staging" | "during-staging" | "before-promotion" | "after-first-replace" | "leave-write-ahead-after-first-replace" }
export interface IgorConfiguration { readonly executable: string; readonly runtimePath: string; readonly userDirectory: string; readonly projectTool: string; readonly worker?: string; readonly runtime?: "VM" | "YYC"; readonly target?: string }
export interface GmVerifyRequest extends GmRequestBase { readonly plan?: GmMutationPlan; readonly planHash?: string; readonly levels: readonly VerificationLevel[]; readonly igor?: IgorConfiguration; readonly expectedRuntimeSignal?: string }
export interface GmRollbackRequest extends GmRequestBase { readonly planHash: string; readonly confirm: boolean }

export interface GmFileSnapshot { readonly path: string; readonly sha256: string; readonly size: number; readonly kind: "gml" | "yy" | "yyp" | "json" | "other" }
export interface GmProcessSnapshot { readonly pid: number; readonly parentPid: number | null; readonly name: string; readonly executable: string | null; readonly commandHash: string; readonly startToken: string; readonly ownerTransactionId: string | null }
export interface GmProjectSnapshot {
  readonly schemaVersion: 1; readonly projectRoot: string; readonly projectType: "GameMaker";
  readonly projectFile: string; readonly projectFormat: string; readonly files: readonly GmFileSnapshot[];
  readonly fileCount: number; readonly totalBytes: number; readonly gitHead: string | null; readonly gitStatus: readonly string[];
  readonly objects: readonly string[]; readonly rooms: readonly string[]; readonly scripts: readonly string[];
  readonly references: readonly string[]; readonly processes: readonly GmProcessSnapshot[]; readonly warnings: readonly string[];
  readonly fingerprint: string; readonly snapshotHash: string;
}
export interface GmAdapterStatus { readonly schemaVersion: 1; readonly state: AdapterState; readonly projectRoot: string; readonly projectFingerprint: string; readonly gate: ActionGateLevel; readonly ownedProcesses: readonly GmProcessSnapshot[]; readonly foreignProcesses: readonly GmProcessSnapshot[]; readonly pendingTransactions: readonly string[]; readonly rollbackAvailable: readonly string[]; readonly warnings: readonly string[] }
export interface PlannedFile { readonly path: string; readonly action: "modify" | "create"; readonly beforeSha256: string | null; readonly afterSha256: string; readonly afterContentBase64: string }
export interface GmMutationPlan {
  readonly schemaVersion: 1; readonly transactionId: string; readonly operation: "apply-safe"; readonly capability: "GM_APPLY_SAFE_V1";
  readonly gate: "PLAN_ONLY"; readonly projectRoot: string; readonly snapshotHash: string; readonly projectFingerprint: string;
  readonly expectedHead: string | null; readonly allowlist: readonly string[]; readonly files: readonly PlannedFile[];
  readonly verification: VerificationPolicy; readonly rollback: Readonly<{ required: true }>;
}
export interface GmApplyResult { readonly schemaVersion: 1; readonly transactionId: string; readonly applied: boolean; readonly dryRun: boolean; readonly state: "DRY_RUN" | "NO_CHANGE" | "APPLIED" | "FAILED"; readonly planHash: string; readonly manifestPath: string; readonly manifestSha256: string; readonly changedFiles: readonly string[]; readonly rollbackAvailable: boolean; readonly projectFingerprint: string }
export interface VerificationOutcome { readonly passed: boolean; readonly evidence: string; readonly detail: string }
export interface GmVerificationResult { readonly schemaVersion: 1; readonly transactionId: string; readonly levels: Readonly<Partial<Record<VerificationLevel, VerificationOutcome>>>; readonly highestLevel: VerificationLevel | null; readonly rollbackRequired: boolean; readonly compileExitCode: number | null; readonly runtimeObserved: boolean; readonly ownedPids: readonly number[]; readonly evidencePath: string }
export interface GmRollbackResult { readonly schemaVersion: 1; readonly transactionId: string; readonly restored: boolean; readonly byteExact: boolean; readonly restoredFiles: readonly string[]; readonly projectFingerprint: string; readonly manifestPath: string }

export interface GameMakerIdeAdapter {
  status(request: GmStatusRequest): Promise<GmAdapterStatus>;
  inspect(request: GmInspectRequest): Promise<GmProjectSnapshot>;
  plan(request: GmPlanRequest): Promise<GmMutationPlan>;
  applySafe(request: GmApplySafeRequest): Promise<GmApplyResult>;
  verify(request: GmVerifyRequest): Promise<GmVerificationResult>;
  rollback(request: GmRollbackRequest): Promise<GmRollbackResult>;
}
