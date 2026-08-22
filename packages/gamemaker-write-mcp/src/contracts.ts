import { z } from "zod";

export const TOOL_NAMES = Object.freeze([
  "gamemaker_apply",
  "gamemaker_verify_text",
  "gamemaker_rollback",
] as const);

/**
 * Honest annotations. Every tool in this server writes: apply and rollback
 * mutate project files, and verify_text writes verification evidence outside
 * the project. None of them execute a compiler or a game runtime.
 */
export const MUTATING_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
});
export const EVIDENCE_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
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
const base64Schema = z.string().max(6 * 1024 * 1024).regex(/^[A-Za-z0-9+/]*={0,2}$/);

const verificationPolicySchema = z.object({
  projectLoad: z.boolean(),
  compile: z.boolean(),
  runtime: z.enum(["required", "optional", "forbidden"]),
}).strict();

const plannedFileSchema = z.object({
  path: relativePathSchema,
  action: z.enum(["modify", "create"]),
  beforeSha256: digestSchema.nullable(),
  afterSha256: digestSchema,
  afterContentBase64: base64Schema,
}).strict();

/**
 * The full immutable plan emitted by GM_PLAN_V1. It travels by value so the
 * read-only server never has to persist anything. planHash is a digest, not a
 * signature: this server cannot prove a plan came from the read server, and
 * does not try to. Authorization comes from the adapter re-validating the
 * plan against real on-disk state plus the server-side write allowlist.
 */
export const mutationPlanSchema = z.object({
  schemaVersion: z.literal(1),
  transactionId: transactionIdSchema,
  operation: z.literal("apply-safe"),
  capability: z.literal("GM_APPLY_SAFE_V1"),
  gate: z.literal("PLAN_ONLY"),
  projectRoot: relativePathSchema,
  snapshotHash: digestSchema,
  projectFingerprint: digestSchema,
  expectedHead: z.string().nullable(),
  allowlist: z.array(relativePathSchema).min(1).max(64),
  allowedExtensions: z.array(z.string().min(1).max(16)).min(1).max(32),
  files: z.array(plannedFileSchema).min(1).max(64),
  verification: verificationPolicySchema,
  rollback: z.object({ required: z.literal(true) }).strict(),
}).strict();

export const applyInputSchema = z.object({
  projectPath: projectPathSchema,
  plan: mutationPlanSchema.describe("Exact immutable plan object returned by gamemaker_plan"),
  planHash: digestSchema.describe("Exact planHash returned by gamemaker_plan"),
  confirm: z.literal(true).describe("Must be true; the server refuses to write otherwise"),
  dryRun: z.boolean().optional().describe("Defaults to true; pass false to actually write"),
}).strict();

export const verifyTextInputSchema = z.object({
  projectPath: projectPathSchema,
  expectedProjectFingerprint: digestSchema.describe(
    "Current fingerprint of the project being verified",
  ),
  plan: mutationPlanSchema.optional().describe(
    "Optional: binds verification to an applied transaction",
  ),
  planHash: digestSchema.optional(),
}).strict();

export const rollbackInputSchema = z.object({
  projectPath: projectPathSchema,
  transactionId: transactionIdSchema.describe("Transaction id of the applied plan"),
  planHash: digestSchema,
  expectedProjectFingerprint: digestSchema.describe(
    "Current fingerprint, as returned by the apply result or a fresh inspect",
  ),
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

export const applySuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("GM_APPLY_SAFE_V1"),
  serverGate: z.literal("SAFE_WRITE"),
  applied: z.boolean(),
  dryRun: z.boolean(),
  state: z.enum(["DRY_RUN", "NO_CHANGE", "APPLIED", "FAILED"]),
  transactionId: transactionIdSchema,
  planHash: digestSchema,
  manifestSha256: digestSchema,
  changedFiles: z.array(relativePathSchema),
  rollbackAvailable: z.boolean(),
  projectFingerprint: digestSchema,
}).strict();

const verificationOutcomeSchema = z.object({
  passed: z.boolean(),
  detail: z.string(),
}).strict();

export const verifyTextSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("GM_VERIFY_V1"),
  serverGate: z.literal("SAFE_WRITE"),
  levelsRequested: z.array(z.literal("TEXT_VALID")),
  textValid: verificationOutcomeSchema,
  highestLevel: z.string().nullable(),
  rollbackRequired: z.boolean(),
  compilerInvoked: z.literal(false),
  runtimeInvoked: z.literal(false),
  transactionId: transactionIdSchema,
}).strict();

export const rollbackSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("GM_ROLLBACK_V1"),
  serverGate: z.literal("SAFE_WRITE"),
  restored: z.boolean(),
  byteExact: z.boolean(),
  restoredFiles: z.array(relativePathSchema),
  transactionId: transactionIdSchema,
  projectFingerprint: digestSchema,
}).strict();

export const applyOutputSchema = z.discriminatedUnion("ok", [applySuccessSchema, errorSchema]);
export const verifyTextOutputSchema = z.discriminatedUnion("ok", [verifyTextSuccessSchema, errorSchema]);
export const rollbackOutputSchema = z.discriminatedUnion("ok", [rollbackSuccessSchema, errorSchema]);

// SDK 1.29 publishes object output schemas but omits top-level unions from
// tools/list, mirroring the read-only server's transport envelope.
const wireFields = {
  ok: z.boolean(),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  error: errorBodySchema.optional(),
};
export const applyWireOutputSchema = applySuccessSchema.partial().extend(wireFields).strict();
export const verifyTextWireOutputSchema = verifyTextSuccessSchema.partial().extend(wireFields).strict();
export const rollbackWireOutputSchema = rollbackSuccessSchema.partial().extend(wireFields).strict();

export type MutationPlanInput = z.infer<typeof mutationPlanSchema>;
export type ApplyInput = z.infer<typeof applyInputSchema>;
export type VerifyTextInput = z.infer<typeof verifyTextInputSchema>;
export type RollbackInput = z.infer<typeof rollbackInputSchema>;
export type ApplyOutput = z.infer<typeof applyOutputSchema>;
export type VerifyTextOutput = z.infer<typeof verifyTextOutputSchema>;
export type RollbackOutput = z.infer<typeof rollbackOutputSchema>;
export type ToolOutput = ApplyOutput | VerifyTextOutput | RollbackOutput;
