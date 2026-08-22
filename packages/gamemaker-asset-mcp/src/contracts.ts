import { z } from "zod";

export const TOOL_NAMES = Object.freeze([
  "asset_status",
  "asset_inspect",
  "asset_plan_import",
  "asset_apply_import",
  "asset_rollback_import",
] as const);

export const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

/** Planning writes a binding record outside the project, so not read-only. */
export const PLAN_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const MUTATING_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
});

export const ROLLBACK_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
});

const requestIdSchema = z.union([z.string(), z.number()]);
const projectPathSchema = z.string().min(1).max(1024).describe(
  "GameMaker project directory relative to DEVLAB_GM_PROJECTS_DIR",
);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const relativePathSchema = z.string().min(1).max(1024);
const transactionIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/);
const assetIdSchema = z.string().min(1).max(64);
const versionSchema = z.string().min(1).max(64);
const resourceNameSchema = z.string().min(1).max(64).describe("GameMaker sprite resource name, e.g. spr_hero");

export const assetInspectInputSchema = z.object({
  assetId: assetIdSchema,
  assetVersion: versionSchema,
}).strict();

export const assetStatusInputSchema = z.object({
  projectPath: projectPathSchema,
  assetId: assetIdSchema,
  assetVersion: versionSchema,
}).strict();

export const assetPlanImportInputSchema = z.object({
  projectPath: projectPathSchema,
  expectedProjectFingerprint: digestSchema.describe("Exact fingerprint returned by asset_status"),
  assetId: assetIdSchema,
  assetVersion: versionSchema,
  resourceName: resourceNameSchema,
  transactionId: transactionIdSchema,
}).strict();

export const assetApplyImportInputSchema = z.object({
  projectPath: projectPathSchema,
  expectedProjectFingerprint: digestSchema.describe(
    "The fingerprint the plan was made against; the import is refused if the project moved",
  ),
  assetId: assetIdSchema,
  assetVersion: versionSchema,
  resourceName: resourceNameSchema,
  transactionId: transactionIdSchema,
  planHash: digestSchema,
  bindingHash: digestSchema,
  confirm: z.literal(true),
  dryRun: z.boolean().optional().describe("Defaults to true; pass false to actually write"),
}).strict();

export const assetRollbackImportInputSchema = z.object({
  projectPath: projectPathSchema,
  expectedProjectFingerprint: digestSchema,
  assetId: assetIdSchema,
  assetVersion: versionSchema,
  resourceName: resourceNameSchema,
  transactionId: transactionIdSchema,
  planHash: digestSchema,
  bindingHash: digestSchema,
  confirm: z.literal(true),
}).strict();

const errorBodySchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  recoverable: z.boolean(),
}).strict();

const errorSchema = z.object({
  ok: z.literal(false),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  error: errorBodySchema,
}).strict();

const budgetSchema = z.object({
  status: z.string(),
  findings: z.array(z.object({
    severity: z.string(),
    code: z.string(),
    actual: z.number(),
    limit: z.number(),
  }).strict()),
}).strict();

export const assetInspectSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("ASSET_GM_BRIDGE_V1"),
  serverGate: z.literal("READ_ONLY"),
  assetId: z.string(),
  assetVersion: z.string(),
  status: z.string(),
  assetClass: z.string(),
  approved: z.boolean(),
  frameCount: z.number().int().nonnegative(),
  dimensions: z.object({ width: z.number().int(), height: z.number().int() }).strict(),
  boundingBox: z.object({
    left: z.number().int(), top: z.number().int(), right: z.number().int(), bottom: z.number().int(),
  }).strict(),
  estimatedDecodedBytes: z.number().int().nonnegative(),
  specSha256: digestSchema,
  exportSha256: digestSchema,
  budget: budgetSchema,
  provenanceErrors: z.array(z.string()),
}).strict();

export const assetStatusSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("ASSET_GM_BRIDGE_V1"),
  serverGate: z.literal("READ_ONLY"),
  state: z.enum(["READY", "TRANSACTION_PENDING", "BLOCKED"]),
  assetId: z.string().nullable(),
  assetVersion: z.string().nullable(),
  assetApproved: z.boolean(),
  projectState: z.string(),
  projectFingerprint: digestSchema,
  pendingTransactions: z.array(z.string()),
  rollbackAvailable: z.array(z.string()),
  warnings: z.array(z.string()),
  writeEnabled: z.boolean(),
}).strict();

export const assetPlanSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("ASSET_GM_BRIDGE_V1"),
  serverGate: z.literal("PLAN_ONLY"),
  transactionId: transactionIdSchema,
  planHash: digestSchema,
  bindingHash: digestSchema,
  manifestHash: digestSchema,
  resourceName: z.string(),
  frameCount: z.number().int().nonnegative(),
  dimensions: z.object({ width: z.number().int(), height: z.number().int() }).strict(),
  origin: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
  instrumentation: z.literal("NONE"),
  changes: z.array(z.object({
    path: relativePathSchema,
    action: z.enum(["modify", "create"]),
    beforeSha256: digestSchema.nullable(),
    afterSha256: digestSchema,
  }).strict()),
  budget: budgetSchema,
}).strict();

export const assetApplySuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("ASSET_GM_BRIDGE_V1"),
  serverGate: z.literal("SAFE_WRITE"),
  applied: z.boolean(),
  dryRun: z.boolean(),
  state: z.enum(["DRY_RUN", "NO_CHANGE", "APPLIED", "FAILED"]),
  transactionId: transactionIdSchema,
  planHash: digestSchema,
  bindingHash: digestSchema,
  changedFiles: z.array(relativePathSchema),
  rollbackAvailable: z.boolean(),
  projectFingerprint: digestSchema,
}).strict();

export const assetRollbackSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("ASSET_GM_BRIDGE_V1"),
  serverGate: z.literal("SAFE_WRITE"),
  restored: z.boolean(),
  byteExact: z.boolean(),
  restoredFiles: z.array(relativePathSchema),
  transactionId: transactionIdSchema,
  projectFingerprint: digestSchema,
}).strict();

export const assetInspectOutputSchema = z.discriminatedUnion("ok", [assetInspectSuccessSchema, errorSchema]);
export const assetStatusOutputSchema = z.discriminatedUnion("ok", [assetStatusSuccessSchema, errorSchema]);
export const assetPlanOutputSchema = z.discriminatedUnion("ok", [assetPlanSuccessSchema, errorSchema]);
export const assetApplyOutputSchema = z.discriminatedUnion("ok", [assetApplySuccessSchema, errorSchema]);
export const assetRollbackOutputSchema = z.discriminatedUnion("ok", [assetRollbackSuccessSchema, errorSchema]);

const wireFields = {
  ok: z.boolean(),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  error: errorBodySchema.optional(),
};
export const assetInspectWireOutputSchema = assetInspectSuccessSchema.partial().extend(wireFields).strict();
export const assetStatusWireOutputSchema = assetStatusSuccessSchema.partial().extend(wireFields).strict();
export const assetPlanWireOutputSchema = assetPlanSuccessSchema.partial().extend(wireFields).strict();
export const assetApplyWireOutputSchema = assetApplySuccessSchema.partial().extend(wireFields).strict();
export const assetRollbackWireOutputSchema = assetRollbackSuccessSchema.partial().extend(wireFields).strict();

export type AssetInspectInput = z.infer<typeof assetInspectInputSchema>;
export type AssetStatusInput = z.infer<typeof assetStatusInputSchema>;
export type AssetPlanImportInput = z.infer<typeof assetPlanImportInputSchema>;
export type AssetApplyImportInput = z.infer<typeof assetApplyImportInputSchema>;
export type AssetRollbackImportInput = z.infer<typeof assetRollbackImportInputSchema>;
export type ToolOutput =
  | z.infer<typeof assetInspectOutputSchema>
  | z.infer<typeof assetStatusOutputSchema>
  | z.infer<typeof assetPlanOutputSchema>
  | z.infer<typeof assetApplyOutputSchema>
  | z.infer<typeof assetRollbackOutputSchema>;
