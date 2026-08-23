import { z } from "zod";

export const TOOL_NAMES = Object.freeze([
  "aseprite_status",
  "aseprite_inspect",
  "aseprite_ingest",
  "aseprite_publish",
] as const);

export const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

/** Inspection starts Aseprite. It writes nothing, but it is not inert. */
export const PROBE_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

/**
 * Publishing writes the catalog index and can grant the APPROVED status the
 * bridge requires before an import. It replaces an entry in place, so it is
 * idempotent, but it is emphatically not read-only.
 */
export const PUBLISH_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
});

export const INGEST_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const requestIdSchema = z.union([z.string(), z.number()]);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Sources are named relative to DEVLAB_ASEPRITE_SOURCE_ROOT. An absolute path
 * would let a caller point the ingest at any file on the host, so the contract
 * has no way to express one.
 */
const sourcePathSchema = z.string().min(1).max(1024).describe(
  "Aseprite file relative to DEVLAB_ASEPRITE_SOURCE_ROOT",
);
const assetIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).describe("Lowercase kebab-case identity");
const versionSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/);
const originSchema = z.enum(["top-left", "top-centre", "centre", "bottom-centre"]);

export const asepriteStatusInputSchema = z.object({}).strict();

export const asepriteInspectInputSchema = z.object({
  source: sourcePathSchema,
}).strict();

export const asepriteIngestInputSchema = z.object({
  source: sourcePathSchema,
  assetId: assetIdSchema,
  version: versionSchema,
  origin: originSchema.optional().describe("Defaults to centre"),
}).strict();

export const asepritePublishInputSchema = z.object({
  assetId: assetIdSchema,
  version: versionSchema,
  status: z.enum(["DRAFT", "APPROVED"]).describe(
    "APPROVED is the status the Asset-GM bridge requires before an import",
  ),
  confirm: z.literal(true).describe("Must be true; the server refuses to write otherwise"),
  dryRun: z.boolean().optional().describe("Defaults to true; pass false to actually write the catalog"),
}).strict();

export const asepritePublishSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  serverGate: z.literal("CATALOG_WRITE"),
  assetId: assetIdSchema,
  version: versionSchema,
  status: z.enum(["DRAFT", "APPROVED"]),
  published: z.boolean(),
  dryRun: z.boolean(),
  replaced: z.boolean().describe("True when an entry for this assetId and version was already indexed"),
  catalogPath: z.string().min(1),
  verifiedOutputs: z.number().int().positive().describe("Frames whose bytes were re-checked against the ingest manifest"),
  catalogSha256: digestSchema,
  entry: z.record(z.string(), z.unknown()),
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

export const asepriteStatusSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  serverGate: z.literal("READ_ONLY"),
  asepriteConfigured: z.boolean(),
  asepritePresent: z.boolean(),
  sourceRootConfigured: z.boolean(),
  repoRootConfigured: z.boolean(),
  writeEnabled: z.boolean(),
  originPresets: z.array(originSchema),
  blockers: z.array(z.string()),
}).strict();

export const asepriteInspectSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  serverGate: z.literal("READ_ONLY"),
  source: z.string().min(1),
  sourceSha256: digestSchema,
  frameCount: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  colourFormat: z.string(),
  asepriteVersion: z.string(),
  frameDurationsMs: z.array(z.number().int().nonnegative()),
}).strict();

export const asepriteIngestSuccessSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  serverGate: z.literal("CATALOG_WRITE"),
  assetId: z.string(),
  version: z.string(),
  frameCount: z.number().int().positive(),
  dimensions: z.object({ width: z.number().int(), height: z.number().int() }).strict(),
  origin: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
  specPath: z.string().min(1),
  specSha256: digestSchema,
  artifactManifestPath: z.string().min(1),
  exports: z.array(z.object({
    path: z.string().min(1),
    sha256: digestSchema,
    bytes: z.number().int().nonnegative(),
  }).strict()),
  deterministic: z.literal(true),
  asepriteVersion: z.string(),
  catalogStatus: z.literal("DRAFT"),
  catalogEntry: z.record(z.string(), z.unknown()),
}).strict();

export const asepriteStatusOutputSchema = z.discriminatedUnion("ok", [asepriteStatusSuccessSchema, errorSchema]);
export const asepriteInspectOutputSchema = z.discriminatedUnion("ok", [asepriteInspectSuccessSchema, errorSchema]);
export const asepriteIngestOutputSchema = z.discriminatedUnion("ok", [asepriteIngestSuccessSchema, errorSchema]);
export const asepritePublishOutputSchema = z.discriminatedUnion("ok", [asepritePublishSuccessSchema, errorSchema]);

const wireFields = {
  ok: z.boolean(),
  schemaVersion: z.literal(1),
  requestId: requestIdSchema,
  error: errorBodySchema.optional(),
};
export const asepriteStatusWireOutputSchema = asepriteStatusSuccessSchema.partial().extend(wireFields).strict();
export const asepriteInspectWireOutputSchema = asepriteInspectSuccessSchema.partial().extend(wireFields).strict();
export const asepriteIngestWireOutputSchema = asepriteIngestSuccessSchema.partial().extend(wireFields).strict();
export const asepritePublishWireOutputSchema = asepritePublishSuccessSchema.partial().extend(wireFields).strict();

export type AsepriteStatusInput = z.infer<typeof asepriteStatusInputSchema>;
export type AsepriteInspectInput = z.infer<typeof asepriteInspectInputSchema>;
export type AsepriteIngestInput = z.infer<typeof asepriteIngestInputSchema>;
export type AsepritePublishInput = z.infer<typeof asepritePublishInputSchema>;
export type ToolOutput =
  | z.infer<typeof asepriteStatusOutputSchema>
  | z.infer<typeof asepriteInspectOutputSchema>
  | z.infer<typeof asepriteIngestOutputSchema>
  | z.infer<typeof asepritePublishOutputSchema>;
