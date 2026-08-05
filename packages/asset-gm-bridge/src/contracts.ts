import type { GmMutationPlan, VerificationPolicy } from "@tanguito/devlab-gm-ide-adapter";

export const ASSET_GM_BRIDGE_CAPABILITY = "ASSET_GM_BRIDGE_V1" as const;
export const ASSET_GM_BRIDGE_VERSION = "1.0.0" as const;
export const ASSET_GM_BRIDGE_CAPABILITY_CONTRACT = Object.freeze({
  schemaVersion: 1,
  id: "asset-gm-bridge",
  version: ASSET_GM_BRIDGE_VERSION,
  publicCapabilities: Object.freeze([ASSET_GM_BRIDGE_CAPABILITY]),
  publicHermesTools: 0,
  inputSchema: "packages/asset-gm-bridge/schemas/asset-gm-bridge-v1.schema.json",
  actionGate: Object.freeze(["READ_ONLY", "PLAN_ONLY", "SAFE_WRITE", "COMPILE", "RUN"]),
  destructiveEnabled: false,
  offlineRuntime: true,
  hermesRuntimeDependency: false,
  dependencies: Object.freeze(["ASSET_FORGE", "GM_ADAPTER"]),
  determinism: "BYTE_DETERMINISTIC_OUTPUTS_OPERATIONAL_TIMINGS_EXCLUDED",
  timeout: "REQUEST_BOUNDED",
  reversibility: "byte-exact backup and rollback required (gm-ide-adapter model)",
  errors: Object.freeze([
    "ASSET_NOT_APPROVED", "ASSET_NOT_FOUND", "ASSET_HASH_MISMATCH", "ASSET_BUDGET_EXCEEDED",
    "INVALID_ASSET_MANIFEST", "TARGET_PROJECT_MISMATCH", "TARGET_SNAPSHOT_CHANGED",
    "STALE_OR_TAMPERED_PLAN", "PATH_NOT_ALLOWED", "RESOURCE_COLLISION", "CASE_COLLISION",
    "APPLY_FAILED_RECOVERED", "APPLY_FAILED_RECOVERY_REQUIRED", "ROLLBACK_BLOCKED_CONCURRENT_CHANGE",
    "VERIFY_COMPILE_FAILED", "VERIFY_RUNTIME_FAILED",
  ]),
});

export type AssetGmBridgeState = "APPLIED" | "NO_CHANGE" | "DRY_RUN" | "FAILED";

export interface AssetGmBridgeRequestBase {
  readonly capability: typeof ASSET_GM_BRIDGE_CAPABILITY;
  readonly projectRoot: string;
  readonly evidenceRoot: string;
  readonly transactionId: string;
  readonly expectedProjectFingerprint: string | null;
  readonly expectedHead: string | null;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly resourceName: string;
  readonly timeoutMs: number;
  readonly cancellation?: AbortSignal;
  readonly verificationPolicy: VerificationPolicy;
}

export interface AssetGmBridgeInspectAssetRequest extends AssetGmBridgeRequestBase {
  readonly capability: typeof ASSET_GM_BRIDGE_CAPABILITY;
}
export interface AssetGmBridgeInspectTargetRequest extends AssetGmBridgeRequestBase {
  readonly capability: typeof ASSET_GM_BRIDGE_CAPABILITY;
}
export interface AssetGmBridgePlanRequest extends AssetGmBridgeRequestBase {
  readonly capability: typeof ASSET_GM_BRIDGE_CAPABILITY;
}
export interface AssetGmBridgeApplyRequest extends AssetGmBridgeRequestBase {
  readonly capability: typeof ASSET_GM_BRIDGE_CAPABILITY;
  readonly plan: GmMutationPlan;
  readonly planHash: string;
  readonly bindingHash: string;
  readonly confirm: boolean;
  readonly dryRun?: boolean;
  readonly faultAt?: "before-staging" | "during-staging" | "before-promotion" | "after-first-replace" | "leave-write-ahead-after-first-replace";
}
export interface AssetGmBridgeVerifyRequest extends AssetGmBridgeRequestBase {
  readonly capability: typeof ASSET_GM_BRIDGE_CAPABILITY;
  readonly plan: GmMutationPlan;
  readonly planHash: string;
  readonly bindingHash: string;
  readonly levels: readonly ("TEXT_VALID" | "PROJECT_LOAD_VALID" | "COMPILE_VALID" | "RUNTIME_VALID")[];
  readonly igor?: {
    readonly executable: string;
    readonly runtimePath: string;
    readonly userDirectory: string;
    readonly projectTool: string;
    readonly worker?: string;
    readonly runtime?: "VM" | "YYC";
    readonly target?: string;
  };
}
export interface AssetGmBridgeRollbackRequest extends AssetGmBridgeRequestBase {
  readonly capability: typeof ASSET_GM_BRIDGE_CAPABILITY;
  readonly planHash: string;
  readonly bindingHash: string;
  readonly confirm: boolean;
}

export interface AssetGmBridgeManifest {
  readonly schemaVersion: 1;
  readonly bridgeVersion: typeof ASSET_GM_BRIDGE_VERSION;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly assetLifecycle: "APPROVED";
  readonly assetSpecHash: string;
  readonly assetExportHash: string;
  readonly assetManifestHash: string;
  readonly assetForgeProfile: Readonly<{ operationContracts: readonly string[]; budgetProfile: string }>;
  readonly sourceProvenance: Readonly<{ source: string; license: string; sourceSha256: string; manifestSha256: string }>;
  readonly targetEngine: "GameMaker";
  readonly targetProjectIdentity: Readonly<{ projectName: string; projectFile: string; resourceVersion: string; ideVersion: string }>;
  readonly targetSnapshotHash: string;
  readonly plannedPaths: readonly string[];
  readonly resourceName: string;
  readonly resourceType: "sprite";
  readonly dimensions: Readonly<{ width: number; height: number }>;
  readonly frameCount: number;
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly boundingBox: Readonly<{ left: number; top: number; right: number; bottom: number; mode: "auto" }>;
  readonly collisionPolicy: string;
  readonly compressionPolicy: string;
  readonly estimatedDecodedBytes: number;
  readonly allowlist: readonly string[];
  readonly transactionId: string;
  readonly createdByCapability: typeof ASSET_GM_BRIDGE_CAPABILITY;
}

export interface AssetGmBridgePlannedFile {
  readonly path: string;
  readonly action: "modify" | "create";
  readonly beforeSha256: string | null;
  readonly afterSha256: string;
}

export interface AssetGmBridgePlanResult {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly manifest: AssetGmBridgeManifest;
  readonly manifestHash: string;
  readonly manifestPath: string;
  readonly plan: GmMutationPlan;
  readonly planHash: string;
  readonly bindingHash: string;
  readonly files: readonly AssetGmBridgePlannedFile[];
  readonly asset: Readonly<{
    assetId: string;
    assetVersion: string;
    status: "APPROVED";
    specSha256: string;
    exportSha256: string;
    frameCount: number;
    dimensions: Readonly<{ width: number; height: number }>;
    boundingBox: Readonly<{ left: number; top: number; right: number; bottom: number }>;
    estimatedDecodedBytes: number;
    budget: Readonly<{ status: string; findings: readonly Readonly<{ severity: string; code: string; actual: number; limit: number }>[] }>;
  }>;
}

export interface AssetGmBridgeApplyResult {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly applied: boolean;
  readonly dryRun: boolean;
  readonly state: AssetGmBridgeState;
  readonly planHash: string;
  readonly bindingHash: string;
  readonly manifestSha256: string;
  readonly changedFiles: readonly string[];
  readonly rollbackAvailable: boolean;
  readonly projectFingerprint: string;
}

export interface AssetGmBridgeRollbackResult {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly restored: boolean;
  readonly byteExact: boolean;
  readonly restoredFiles: readonly string[];
  readonly projectFingerprint: string;
  readonly manifestPath: string;
}

export interface AssetGmBridgeAssetInspection {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly status: string;
  readonly assetClass: string;
  readonly specSha256: string;
  readonly exportSha256: string;
  readonly manifestSha256: string;
  readonly provenance: Readonly<{ source: string; license: string; sourceSha256: string; manifestSha256: string; errors: readonly string[] }>;
  readonly frames: readonly Readonly<{ path: string; sha256: string; bytes: number; width: number; height: number; channels: number }>[];
  readonly frameCount: number;
  readonly dimensions: Readonly<{ width: number; height: number }>;
  readonly boundingBox: Readonly<{ left: number; top: number; right: number; bottom: number }>;
  readonly estimatedDecodedBytes: number;
  readonly budget: Readonly<{ status: string; findings: readonly Readonly<{ severity: string; code: string; actual: number; limit: number }>[] }>;
  readonly approved: boolean;
}

export interface AssetGmBridgeStatus {
  readonly schemaVersion: 1;
  readonly state: "READY" | "TRANSACTION_PENDING" | "BLOCKED";
  readonly assetId: string | null;
  readonly assetVersion: string | null;
  readonly assetApproved: boolean;
  readonly projectState: string;
  readonly projectFingerprint: string;
  readonly pendingTransactions: readonly string[];
  readonly rollbackAvailable: readonly string[];
  readonly warnings: readonly string[];
}
