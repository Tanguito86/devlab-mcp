import { z } from "zod";

export const TOOL_NAMES = Object.freeze([
  "gamemaker_status",
  "gamemaker_inspect",
  "gamemaker_plan",
] as const);

export const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const requestIdSchema = z.union([z.string(), z.number()]);
const projectPathSchema = z.string().min(1).max(1024).describe(
  "GameMaker project directory relative to DEVLAB_GM_PROJECTS_DIR",
);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const relativePathSchema = z.string().min(1).max(1024);

export const statusInputSchema = z.object({
  projectPath: projectPathSchema,
}).strict();

export const inspectInputSchema = z.object({
  projectPath: projectPathSchema,
}).strict();

export const planInputSchema = z.object({
  projectPath: projectPathSchema,
  expectedProjectFingerprint: digestSchema.describe(
    "Exact fingerprint returned by gamemaker_inspect",
  ),
  allowlist: z.array(relativePathSchema).min(1).max(64),
  changes: z.array(z.object({
    path: relativePathSchema,
    content: z.string().max(1024 * 1024),
  }).strict()).min(1).max(64),
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

const processSummarySchema = z.object({
  gameMaker: z.boolean(),
  igor: z.boolean(),
  runner: z.boolean(),
  ownedCount: z.number().int().nonnegative(),
  foreignCount: z.number().int().nonnegative(),
}).strict();

export const statusSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("GM_STATUS_V1"),
  serverGate: z.literal("READ_ONLY"),
  observedAdapterGate: z.enum(["READ_ONLY", "PLAN_ONLY", "SAFE_WRITE", "COMPILE", "RUN", "DESTRUCTIVE"]),
  state: z.string().min(1),
  projectPath: relativePathSchema,
  projectFingerprint: digestSchema,
  processes: processSummarySchema,
  warnings: z.array(z.string()),
}).strict();

const fileSnapshotSchema = z.object({
  path: relativePathSchema,
  sha256: digestSchema,
  size: z.number().int().nonnegative(),
  kind: z.enum(["gml", "yy", "yyp", "json", "other"]),
}).strict();

export const inspectSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("GM_INSPECT_V1"),
  serverGate: z.literal("READ_ONLY"),
  projectPath: relativePathSchema,
  projectType: z.literal("GameMaker"),
  projectFile: relativePathSchema,
  projectFormat: z.string(),
  files: z.array(fileSnapshotSchema),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  gitHead: z.string().nullable(),
  gitStatus: z.array(z.string()),
  objects: z.array(relativePathSchema),
  rooms: z.array(relativePathSchema),
  scripts: z.array(relativePathSchema),
  references: z.array(relativePathSchema),
  warnings: z.array(z.string()),
  fingerprint: digestSchema,
  snapshotHash: digestSchema,
}).strict();

const plannedChangeSchema = z.object({
  path: relativePathSchema,
  action: z.literal("modify"),
  beforeSha256: digestSchema,
  afterSha256: digestSchema,
}).strict();

export const planSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("GM_PLAN_V1"),
  serverGate: z.literal("PLAN_ONLY"),
  immutable: z.literal(true),
  projectPath: relativePathSchema,
  projectFingerprint: digestSchema,
  snapshotHash: digestSchema,
  expectedHead: z.string().nullable(),
  allowlist: z.array(relativePathSchema),
  allowedExtensions: z.array(z.string()),
  changes: z.array(plannedChangeSchema),
  planHash: digestSchema,
}).strict();

export const statusOutputSchema = z.discriminatedUnion("ok", [statusSuccessSchema, errorSchema]);
export const inspectOutputSchema = z.discriminatedUnion("ok", [inspectSuccessSchema, errorSchema]);
export const planOutputSchema = z.discriminatedUnion("ok", [planSuccessSchema, errorSchema]);

// SDK 1.29 publishes object output schemas but omits top-level unions from
// tools/list. These strict transport envelopes validate both structured success
// and structured error responses; the schema catalog retains the conditional
// discriminated-union contract above.
const wireFields = {
  ok: z.boolean(),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  error: errorBodySchema.optional(),
};
export const statusWireOutputSchema = statusSuccessSchema.partial().extend(wireFields).strict();
export const inspectWireOutputSchema = inspectSuccessSchema.partial().extend(wireFields).strict();
export const planWireOutputSchema = planSuccessSchema.partial().extend(wireFields).strict();

export type StatusInput = z.infer<typeof statusInputSchema>;
export type InspectInput = z.infer<typeof inspectInputSchema>;
export type PlanInput = z.infer<typeof planInputSchema>;
export type StatusOutput = z.infer<typeof statusOutputSchema>;
export type InspectOutput = z.infer<typeof inspectOutputSchema>;
export type PlanOutput = z.infer<typeof planOutputSchema>;
export type ToolOutput = StatusOutput | InspectOutput | PlanOutput;
