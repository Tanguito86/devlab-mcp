import { z } from "zod";

export const TOOL_NAMES = Object.freeze([
  "gamemaker_toolchain_status",
  "gamemaker_verify_build",
] as const);

export const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

/**
 * `gamemaker_verify_build` starts a real process that compiles the project and
 * launches the game. It does not modify project files, but "read-only" would
 * be a false promise for something that spawns a compiler and a Runner.
 */
export const BUILD_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const requestIdSchema = z.union([z.string(), z.number()]);
const projectPathSchema = z.string().min(1).max(1024).describe(
  "GameMaker project directory relative to DEVLAB_GM_PROJECTS_DIR",
);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const toolchainStatusInputSchema = z.object({}).strict();

export const verifyBuildInputSchema = z.object({
  projectPath: projectPathSchema,
  expectedProjectFingerprint: digestSchema.describe(
    "Current fingerprint of the project, as returned by gamemaker_inspect",
  ),
  expectedRuntimeSignal: z.string().min(1).max(256).optional().describe(
    "Optional text the running game must print for RUNTIME_VALID to pass",
  ),
}).strict();

export const diagnosticSchema = z.object({
  severity: z.enum(["error", "warning"]),
  symbol: z.string().min(1),
  object: z.string().min(1).optional(),
  event: z.string().min(1).optional(),
  script: z.string().min(1).optional(),
  line: z.number().int().nonnegative(),
  message: z.string().min(1),
}).strict();

const errorBodySchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  recoverable: z.boolean(),
  // Present when the compiler produced diagnostics before the failure, so a
  // timed-out or aborted build still tells the caller what was wrong.
  diagnostics: z.array(diagnosticSchema).optional(),
  diagnosticsTruncated: z.boolean().optional(),
}).strict();

const errorSchema = z.object({
  ok: z.literal(false),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  error: errorBodySchema,
}).strict();

/**
 * Toolchain presence is reported as booleans plus a runtime label. Absolute
 * installation paths are configuration, not tool output, and never cross the
 * transport.
 */
export const toolchainStatusSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  serverGate: z.literal("READ_ONLY"),
  platformSupported: z.boolean(),
  igorEnabled: z.boolean(),
  projectsDirConfigured: z.boolean(),
  toolchainConfigured: z.boolean(),
  toolchainPresent: z.boolean(),
  runtimeLabel: z.string().nullable(),
  timeoutMs: z.number().int().positive(),
  blockers: z.array(z.string()),
}).strict();

const levelOutcomeSchema = z.object({
  passed: z.boolean(),
  detail: z.string(),
}).strict();

export const verifyBuildSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  capability: z.literal("GM_VERIFY_V1"),
  serverGate: z.literal("RUN"),
  igorInvoked: z.literal(true),
  compileExitCode: z.number().int().nullable(),
  levels: z.object({
    TEXT_VALID: levelOutcomeSchema.optional(),
    PROJECT_LOAD_VALID: levelOutcomeSchema.optional(),
    COMPILE_VALID: levelOutcomeSchema.optional(),
    RUNTIME_VALID: levelOutcomeSchema.optional(),
  }).strict(),
  highestLevel: z.string().nullable(),
  runtimeObserved: z.boolean(),
  ownedProcessCount: z.number().int().nonnegative(),
  rollbackRequired: z.boolean(),
  evidencePath: z.string().min(1),
  transactionId: z.string().min(1),
  diagnostics: z.array(diagnosticSchema),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  diagnosticsTruncated: z.boolean(),
}).strict();

export const toolchainStatusOutputSchema = z.discriminatedUnion("ok", [toolchainStatusSuccessSchema, errorSchema]);
export const verifyBuildOutputSchema = z.discriminatedUnion("ok", [verifyBuildSuccessSchema, errorSchema]);

const wireFields = {
  ok: z.boolean(),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  error: errorBodySchema.optional(),
};
export const toolchainStatusWireOutputSchema = toolchainStatusSuccessSchema.partial().extend(wireFields).strict();
export const verifyBuildWireOutputSchema = verifyBuildSuccessSchema.partial().extend(wireFields).strict();

export type ToolchainStatusInput = z.infer<typeof toolchainStatusInputSchema>;
export type VerifyBuildInput = z.infer<typeof verifyBuildInputSchema>;
export type ToolchainStatusOutput = z.infer<typeof toolchainStatusOutputSchema>;
export type VerifyBuildOutput = z.infer<typeof verifyBuildOutputSchema>;
export type ToolOutput = ToolchainStatusOutput | VerifyBuildOutput;
