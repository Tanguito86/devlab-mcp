import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";

import {
  GmAdapterError,
  GovernedGameMakerIdeAdapter,
  type GmAdapterErrorCode,
  type GmInspectRequest,
  type GmPlanRequest,
  type GmStatusRequest,
} from "@tanguito/devlab-gm-ide-adapter";
import {
  planHash,
  resolveInsideRoot,
  resolveRealRoot,
  safeRelativePath,
} from "@tanguito/devlab-gm-ide-adapter/internal";
import {
  authorObject,
  authorPlaceInstance,
  authorRoom,
  authorScript,
  authorTileLayer,
  authorTileset,
  GmAuthoringError,
  parseGmJson,
  tilesetResourcePath,
  type AuthoredResource,
  type ProjectTexts,
} from "@tanguito/devlab-gm-authoring";

import {
  MAX_READ_BYTES_PER_FILE,
  MAX_READ_BYTES_TOTAL,
  MAX_PLAN_CONTENT_BYTES_PER_FILE,
  MAX_PLAN_CONTENT_BYTES_TOTAL,
  READABLE_EXTENSIONS,
} from "./contracts.js";
import type {
  AuthoredPlanOutput,
  InspectInput,
  InspectOutput,
  NewObjectInput,
  NewRoomInput,
  NewScriptInput,
  NewTilesetInput,
  PlaceInstanceInput,
  PlanInput,
  PlanOutput,
  ReadTextInput,
  ReadTextOutput,
  StatusInput,
  StatusOutput,
  TileLayerInput,
  ToolOutput,
} from "./contracts.js";

export const PROJECTS_DIR_ENV = "DEVLAB_GM_PROJECTS_DIR";
const EVIDENCE_ROOT = ".devlab-gamemaker-mcp-readonly";
const TIMEOUT_MS = 5_000;
const PLAN_EXTENSIONS = Object.freeze(["gml", "json", "yy", "yyp"]);
/**
 * Authoring additionally touches `.resource_order`, the IDE's ordering file.
 * The hypothetical-edit tool keeps the narrower set: it edits existing files
 * and has no business rewriting project ordering metadata.
 */
const AUTHORING_EXTENSIONS = Object.freeze(["gml", "json", "resource_order", "yy", "yyp"]);
const VERIFICATION_POLICY = Object.freeze({
  projectLoad: false,
  compile: false,
  runtime: "forbidden" as const,
});

type PublicRequestId = string | number;

type LoadedProjectTexts = Readonly<{
  texts: ProjectTexts;
  root: string;
  files: ReadonlyMap<string, SnapshotTextFile>;
}>;

export class GmMcpError extends Error {
  constructor(
    readonly code:
      | "GM_CONFIG_REQUIRED"
      | "GM_CONFIG_INVALID"
      | "GM_INTERNAL_ERROR"
      | "GM_INVALID_REQUEST"
      | "GM_LIMIT_EXCEEDED",
    message: string,
    readonly recoverable: boolean,
  ) {
    super(message);
    this.name = "GmMcpError";
  }
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new GmAdapterError("CANCELLED", "The request was cancelled.", true);
  }
}

export function assertPlanContentLimits(
  changes: readonly Readonly<{ content: string }>[],
  signal?: AbortSignal,
): void {
  let totalBytes = 0;
  for (const change of changes) {
    if (signal !== undefined) assertActive(signal);
    const bytes = Buffer.byteLength(change.content, "utf8");
    if (bytes > MAX_PLAN_CONTENT_BYTES_PER_FILE) {
      throw new GmMcpError(
        "GM_LIMIT_EXCEEDED",
        `A planned file exceeds the ${MAX_PLAN_CONTENT_BYTES_PER_FILE} byte content limit.`,
        true,
      );
    }
    totalBytes += bytes;
    if (totalBytes > MAX_PLAN_CONTENT_BYTES_TOTAL) {
      throw new GmMcpError(
        "GM_LIMIT_EXCEEDED",
        `The plan exceeds the ${MAX_PLAN_CONTENT_BYTES_TOTAL} byte aggregate content limit.`,
        true,
      );
    }
  }
}

export type SnapshotTextFile = Readonly<{ sha256: string; size: number }>;

/**
 * Reads at most the fixed per-file ceiling and binds the returned metadata to
 * those exact bytes. A file that changed after inspection is never returned as
 * if it still belonged to that snapshot.
 */
export async function readSnapshotTextFile(
  projectRoot: string,
  path: string,
  expected: SnapshotTextFile,
  signal: AbortSignal,
  maxBytes = MAX_READ_BYTES_PER_FILE,
): Promise<{ sha256: string; size: number; text: string }> {
  assertActive(signal);
  const absolute = await resolveInsideRoot(projectRoot, path, { existing: true });
  const handle = await open(absolute, "r");
  let bytes: Buffer;
  let observedSize: number;
  try {
    const before = await handle.stat();
    if (before.size > maxBytes) {
      if (before.size !== expected.size) {
        throw new GmAdapterError("CONCURRENT_MODIFICATION", "A requested file changed after inspection.", true);
      }
      throw new GmMcpError(
        "GM_LIMIT_EXCEEDED",
        `${path} is larger than the ${maxBytes} byte per-file read limit.`,
        true,
      );
    }
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.byteLength) {
      assertActive(signal);
      const chunk = await handle.read(buffer, bytesRead, buffer.byteLength - bytesRead, bytesRead);
      if (chunk.bytesRead === 0) break;
      bytesRead += chunk.bytesRead;
    }
    const after = await handle.stat();
    assertActive(signal);
    observedSize = after.size;
    if (before.size !== after.size || bytesRead !== after.size) {
      throw new GmAdapterError("CONCURRENT_MODIFICATION", "A requested file changed while it was read.", true);
    }
    bytes = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (observedSize !== expected.size || sha256 !== expected.sha256) {
    throw new GmAdapterError("CONCURRENT_MODIFICATION", "A requested file changed after inspection.", true);
  }
  if (bytes.byteLength > maxBytes) {
    throw new GmMcpError(
      "GM_LIMIT_EXCEEDED",
      `${path} is larger than the ${maxBytes} byte per-file read limit.`,
      true,
    );
  }
  let text: string;
  try {
    // Preserve a UTF-8 BOM as text. Stripping it would make a read/edit/plan
    // round-trip silently change bytes even when the caller changed nothing.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new GmMcpError("GM_INVALID_REQUEST", `${path} is not valid UTF-8 text.`, true);
  }
  return { sha256, size: bytes.byteLength, text };
}

const ADAPTER_PUBLIC_MESSAGES: Readonly<Record<GmAdapterErrorCode, string>> = Object.freeze({
  AUTHZ_PROJECT_ROOT: "The configured project root or project path is not authorized.",
  EXPECTED_HASH_MISMATCH: "The project fingerprint no longer matches the request.",
  EXPECTED_HEAD_MISMATCH: "The project Git HEAD no longer matches the request.",
  PATH_ESCAPE: "A supplied relative path violates the project boundary.",
  FILE_NOT_ALLOWLISTED: "A planned file is outside the declared allowlist or extension policy.",
  GATE_VIOLATION: "The requested operation is not authorized by the fixed server capability.",
  PLAN_STALE: "The hypothetical plan is stale.",
  MUTATION_NOT_FOUND: "The referenced mutation does not exist.",
  MUTATION_ALREADY_APPLIED: "The referenced mutation was already applied.",
  VERIFICATION_FAILED: "Verification failed.",
  ROLLBACK_UNAVAILABLE: "Rollback evidence is unavailable.",
  ROLLBACK_INCOMPLETE: "Rollback evidence is incomplete.",
  PROCESS_OWNERSHIP: "Process ownership could not be established.",
  RUN_BLOCKED_EXTERNAL_RUNNER: "A foreign runner blocks the operation.",
  TIMEOUT: "The bounded request timed out.",
  CANCELLED: "The request was cancelled.",
  BUSY: "The project is busy.",
  CONCURRENT_MODIFICATION: "The project changed concurrently.",
  LIMIT_EXCEEDED: "The request exceeds the fixed safety limits.",
  REGISTRY_INVALID: "The project registry is invalid.",
  INVALID_REQUEST: "The request does not satisfy the GameMaker adapter contract.",
  ATOMIC_PROMOTION_FAILED: "Atomic promotion failed.",
  COMPILE_FAILED: "Compilation failed.",
});

export async function resolveProjectsDir(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<string> {
  const configured = env[PROJECTS_DIR_ENV];
  if (!configured) {
    throw new GmMcpError(
      "GM_CONFIG_REQUIRED",
      `${PROJECTS_DIR_ENV} must be configured before calling a GameMaker tool.`,
      true,
    );
  }
  if (!isAbsolute(configured)) {
    throw new GmMcpError(
      "GM_CONFIG_INVALID",
      `${PROJECTS_DIR_ENV} must identify an existing absolute real directory.`,
      true,
    );
  }
  try {
    return await resolveRealRoot(configured);
  } catch {
    throw new GmMcpError(
      "GM_CONFIG_INVALID",
      `${PROJECTS_DIR_ENV} must identify an existing absolute real directory.`,
      true,
    );
  }
}

function transactionId(tool: string, input: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ tool, input }))
    .digest("hex")
    .slice(0, 32);
  return `gm-mcp-${digest}`;
}

function baseRequest(
  projectPath: string,
  capability: "GM_STATUS_V1" | "GM_INSPECT_V1" | "GM_PLAN_V1",
  input: unknown,
  signal: AbortSignal,
) {
  return {
    projectRoot: projectPath,
    expectedProjectFingerprint: null,
    expectedHead: null,
    allowlist: Object.freeze([] as string[]),
    capability,
    transactionId: transactionId(capability, input),
    timeoutMs: TIMEOUT_MS,
    cancellation: signal,
    verificationPolicy: VERIFICATION_POLICY,
    evidenceRoot: EVIDENCE_ROOT,
  };
}

export class ReadonlyGameMakerService {
  constructor(
    private readonly env: Readonly<Record<string, string | undefined>> = process.env,
  ) {}

  private async adapter(): Promise<GovernedGameMakerIdeAdapter> {
    return new GovernedGameMakerIdeAdapter(await resolveProjectsDir(this.env));
  }

  async status(
    input: StatusInput,
    requestId: PublicRequestId,
    signal: AbortSignal,
  ): Promise<StatusOutput> {
    const adapter = await this.adapter();
    const request: GmStatusRequest = baseRequest(
      input.projectPath,
      "GM_STATUS_V1",
      input,
      signal,
    );
    const status = await adapter.status(request);
    const processes = [...status.ownedProcesses, ...status.foreignProcesses];
    const has = (pattern: RegExp): boolean => processes.some(({ name }) => pattern.test(name));
    return {
      ok: true,
      schemaVersion: 1,
      requestId,
      capability: "GM_STATUS_V1",
      serverGate: "READ_ONLY",
      observedAdapterGate: status.gate,
      state: status.state,
      projectPath: input.projectPath.replace(/\\/g, "/"),
      projectFingerprint: status.projectFingerprint,
      processes: {
        gameMaker: has(/^GameMaker/i),
        igor: has(/^Igor/i),
        runner: has(/^Runner/i),
        ownedCount: status.ownedProcesses.length,
        foreignCount: status.foreignProcesses.length,
      },
      warnings: [...status.warnings],
    };
  }

  async inspect(
    input: InspectInput,
    requestId: PublicRequestId,
    signal: AbortSignal,
  ): Promise<InspectOutput> {
    const adapter = await this.adapter();
    const request: GmInspectRequest = baseRequest(
      input.projectPath,
      "GM_INSPECT_V1",
      input,
      signal,
    );
    const snapshot = await adapter.inspect(request);
    return {
      ok: true,
      schemaVersion: 1,
      requestId,
      capability: "GM_INSPECT_V1",
      serverGate: "READ_ONLY",
      projectPath: snapshot.projectRoot,
      projectType: snapshot.projectType,
      projectFile: snapshot.projectFile,
      projectFormat: snapshot.projectFormat,
      files: snapshot.files.map(({ path, sha256, size, kind }) => ({ path, sha256, size, kind })),
      fileCount: snapshot.fileCount,
      totalBytes: snapshot.totalBytes,
      gitHead: snapshot.gitHead,
      gitStatus: [...snapshot.gitStatus],
      objects: [...snapshot.objects],
      rooms: [...snapshot.rooms],
      scripts: [...snapshot.scripts],
      references: [...snapshot.references],
      warnings: [...snapshot.warnings],
      fingerprint: snapshot.fingerprint,
      snapshotHash: snapshot.snapshotHash,
    };
  }

  async plan(
    input: PlanInput,
    requestId: PublicRequestId,
    signal: AbortSignal,
  ): Promise<PlanOutput> {
    assertPlanContentLimits(input.changes, signal);
    const adapter = await this.adapter();
    const files: Array<{ path: string; action: "modify"; content: string }> = [];
    for (const { path, content } of input.changes) {
      assertActive(signal);
      files.push({ path, action: "modify", content });
    }
    const request: GmPlanRequest = {
      ...baseRequest(input.projectPath, "GM_PLAN_V1", input, signal),
      expectedProjectFingerprint: input.expectedProjectFingerprint,
      allowlist: Object.freeze([...input.allowlist]),
      files: Object.freeze(files.map((file) => Object.freeze(file))),
      allowedExtensions: PLAN_EXTENSIONS,
    };
    const plan = await adapter.plan(request);
    const changes = plan.files.map((file) => {
      assertActive(signal);
      if (file.action !== "modify" || file.beforeSha256 === null) {
        throw new GmMcpError("GM_INTERNAL_ERROR", "The adapter returned a non-read-only plan shape.", false);
      }
      return {
        path: file.path,
        action: "modify" as const,
        beforeSha256: file.beforeSha256,
        afterSha256: file.afterSha256,
      };
    });
    return {
      plan: JSON.parse(JSON.stringify(plan)),
      ok: true,
      schemaVersion: 1,
      requestId,
      capability: "GM_PLAN_V1",
      serverGate: "PLAN_ONLY",
      immutable: true,
      projectPath: plan.projectRoot,
      projectFingerprint: plan.projectFingerprint,
      snapshotHash: plan.snapshotHash,
      expectedHead: plan.expectedHead,
      allowlist: [...plan.allowlist],
      allowedExtensions: [...plan.allowedExtensions],
      changes,
      planHash: planHash(plan),
    };
  }

  /**
   * Reads the project texts the authoring layer needs. `inspect` supplies the
   * file and reference inventory; the .yyp and .resource_order bodies have to
   * be read directly, inside the authorized root.
   */
  private async projectTexts(projectsDir: string, projectPath: string, fingerprint: string, signal: AbortSignal, roomName?: string): Promise<LoadedProjectTexts> {
    const adapter = new GovernedGameMakerIdeAdapter(projectsDir);
    const snapshot = await adapter.inspect({
      ...baseRequest(projectPath, "GM_INSPECT_V1", { projectPath }, signal),
      expectedProjectFingerprint: fingerprint,
    });
    const root = await resolveInsideRoot(projectsDir, safeRelativePath(projectPath), { existing: true });
    const files = new Map(snapshot.files.map((file) => [file.path, file]));
    const readBound = async (path: string): Promise<string> => {
      const expected = files.get(path);
      if (expected === undefined) {
        throw new GmMcpError("GM_INTERNAL_ERROR", "A required project file is absent from its inspected snapshot.", false);
      }
      return (await readSnapshotTextFile(
        root,
        path,
        expected,
        signal,
        MAX_PLAN_CONTENT_BYTES_PER_FILE,
      )).text;
    };
    const yyp = await readBound(snapshot.projectFile);
    const parsed = parseGmJson(yyp) as { "%Name"?: unknown; name?: unknown };
    const projectName = String(parsed["%Name"] ?? parsed.name ?? "");
    if (!projectName) throw new GmMcpError("GM_INTERNAL_ERROR", "The project file declares no name.", false);
    const orderPath = `${projectName}.resource_order`;
    const resourceOrder = files.has(orderPath)
      ? await readBound(orderPath)
      : undefined;
    // Placing an instance patches an existing room as text, so its body has to
    // be read; every other operation only creates files.
    const roomPath = roomName === undefined ? undefined : `rooms/${roomName}/${roomName}.yy`;
    const roomText = roomPath !== undefined && files.has(roomPath)
      ? await readBound(roomPath)
      : undefined;
    return Object.freeze({
      root,
      files,
      texts: {
        identity: { projectName, projectFile: snapshot.projectFile },
        yyp,
        ...(resourceOrder === undefined ? {} : { resourceOrder }),
        ...(roomText === undefined ? {} : { roomText }),
        existingFiles: snapshot.files.map(({ path }) => path),
        existingReferences: [...snapshot.references],
      },
    });
  }

  /** Turns an authored resource into an immutable GM_PLAN_V1 plan. */
  private async planAuthored(
    input: Readonly<{ projectPath: string; expectedProjectFingerprint: string }>,
    authored: AuthoredResource,
    requestId: PublicRequestId,
    signal: AbortSignal,
    rawInput: unknown,
  ): Promise<AuthoredPlanOutput> {
    const projectsDir = await resolveProjectsDir(this.env);
    const adapter = new GovernedGameMakerIdeAdapter(projectsDir);
    const plan = await adapter.plan({
      ...baseRequest(input.projectPath, "GM_PLAN_V1", rawInput, signal),
      expectedProjectFingerprint: input.expectedProjectFingerprint,
      allowlist: [...authored.allowlist],
      files: authored.files.map(({ path, action, content }) => ({ path, action, content })),
      allowedExtensions: AUTHORING_EXTENSIONS,
    });
    return {
      ok: true,
      schemaVersion: 1,
      requestId,
      capability: "GM_PLAN_V1",
      serverGate: "PLAN_ONLY",
      immutable: true,
      resourceKind: authored.resourceKind,
      resourceName: authored.resourceName,
      resourcePath: authored.resourcePath,
      projectPath: plan.projectRoot,
      projectFingerprint: plan.projectFingerprint,
      snapshotHash: plan.snapshotHash,
      allowlist: [...plan.allowlist],
      changes: plan.files.map(({ path, action, beforeSha256, afterSha256 }) => ({ path, action, beforeSha256, afterSha256 })),
      planHash: planHash(plan),
      plan: JSON.parse(JSON.stringify(plan)),
    };
  }

  async planNewScript(input: NewScriptInput, requestId: PublicRequestId, signal: AbortSignal): Promise<AuthoredPlanOutput> {
    const projectsDir = await resolveProjectsDir(this.env);
    const loaded = await this.projectTexts(projectsDir, input.projectPath, input.expectedProjectFingerprint, signal);
    return this.planAuthored(input, authorScript(loaded.texts, { name: input.name, gml: input.gml }), requestId, signal, input);
  }

  async planNewObject(input: NewObjectInput, requestId: PublicRequestId, signal: AbortSignal): Promise<AuthoredPlanOutput> {
    const projectsDir = await resolveProjectsDir(this.env);
    const loaded = await this.projectTexts(projectsDir, input.projectPath, input.expectedProjectFingerprint, signal);
    const authored = authorObject(loaded.texts, {
      name: input.name,
      events: input.events,
      options: {
        spriteName: input.spriteName ?? null,
        ...(input.persistent === undefined ? {} : { persistent: input.persistent }),
        ...(input.visible === undefined ? {} : { visible: input.visible }),
        ...(input.solid === undefined ? {} : { solid: input.solid }),
      },
    });
    return this.planAuthored(input, authored, requestId, signal, input);
  }

  async planNewRoom(input: NewRoomInput, requestId: PublicRequestId, signal: AbortSignal): Promise<AuthoredPlanOutput> {
    const projectsDir = await resolveProjectsDir(this.env);
    const loaded = await this.projectTexts(projectsDir, input.projectPath, input.expectedProjectFingerprint, signal);
    const authored = authorRoom(loaded.texts, {
      name: input.name,
      ...(input.instances === undefined ? {} : { instances: input.instances }),
      options: {
        ...(input.width === undefined ? {} : { width: input.width }),
        ...(input.height === undefined ? {} : { height: input.height }),
        ...(input.persistent === undefined ? {} : { persistent: input.persistent }),
      },
    });
    return this.planAuthored(input, authored, requestId, signal, input);
  }

  async planPlaceInstance(input: PlaceInstanceInput, requestId: PublicRequestId, signal: AbortSignal): Promise<AuthoredPlanOutput> {
    const projectsDir = await resolveProjectsDir(this.env);
    const loaded = await this.projectTexts(projectsDir, input.projectPath, input.expectedProjectFingerprint, signal, input.roomName);
    const authored = authorPlaceInstance(loaded.texts, { roomName: input.roomName, instances: input.instances });
    return this.planAuthored(input, authored, requestId, signal, input);
  }

  /**
   * Returns the text of project files the plan tools could write.
   *
   * The fingerprint is required for the same reason planning requires it: text
   * read against one project state and edited against another is how a
   * concurrent change gets silently overwritten. Each file's digest comes back
   * so the caller can prove the bytes it plans against are the bytes it read.
   */
  async readText(input: ReadTextInput, requestId: PublicRequestId, signal: AbortSignal): Promise<ReadTextOutput> {
    const projectsDir = await resolveProjectsDir(this.env);
    const adapter = new GovernedGameMakerIdeAdapter(projectsDir);
    const snapshot = await adapter.inspect({
      ...baseRequest(input.projectPath, "GM_INSPECT_V1", input, signal),
      expectedProjectFingerprint: input.expectedProjectFingerprint,
    });
    const root = await resolveInsideRoot(projectsDir, safeRelativePath(input.projectPath), { existing: true });
    const known = new Map(snapshot.files.map((file) => [file.path, file]));

    const files: Array<{ path: string; sha256: string; size: number; text: string }> = [];
    const seen = new Set<string>();
    let totalBytes = 0;
    for (const requested of input.paths) {
      assertActive(signal);
      // The path policy first, so a hostile path is refused for the right
      // reason rather than for merely being absent from the snapshot.
      const path = safeRelativePath(requested);
      if (seen.has(path)) continue;
      seen.add(path);

      const extension = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
      if (!READABLE_EXTENSIONS.includes(extension)) {
        throw new GmMcpError("GM_INVALID_REQUEST", `${path} is not one of the readable extensions: ${READABLE_EXTENSIONS.join(", ")}.`, true);
      }
      const file = known.get(path);
      if (file === undefined) throw new GmMcpError("GM_INVALID_REQUEST", `${path} is not a file in this project.`, true);
      const read = await readSnapshotTextFile(root, path, file, signal);
      totalBytes += read.size;
      if (totalBytes > MAX_READ_BYTES_TOTAL) {
        throw new GmMcpError("GM_LIMIT_EXCEEDED", `The request exceeds the ${MAX_READ_BYTES_TOTAL} byte total read limit.`, true);
      }
      files.push({ path, ...read });
    }

    // Close the window in which an earlier file could change while a later one
    // was being read. The write tier would still reject the stale fingerprint,
    // but the read operation itself should fail closed instead of returning a
    // mixed-time set of otherwise self-consistent buffers.
    assertActive(signal);
    await adapter.inspect({
      ...baseRequest(input.projectPath, "GM_INSPECT_V1", input, signal),
      expectedProjectFingerprint: snapshot.fingerprint,
    });

    return {
      ok: true,
      schemaVersion: 1,
      requestId,
      capability: "GM_INSPECT_V1",
      serverGate: "READ_ONLY",
      projectPath: snapshot.projectRoot,
      projectFingerprint: snapshot.fingerprint,
      files,
      totalBytes,
    };
  }

  async planNewTileset(input: NewTilesetInput, requestId: PublicRequestId, signal: AbortSignal): Promise<AuthoredPlanOutput> {
    const projectsDir = await resolveProjectsDir(this.env);
    const loaded = await this.projectTexts(projectsDir, input.projectPath, input.expectedProjectFingerprint, signal);
    // The sprite's pixel size decides how many tiles the set has, so it is read
    // from the project rather than taken on the caller's word; a wrong size
    // silently produces a tileset whose indices run off the end of the image.
    const spritePath = `sprites/${input.spriteName}/${input.spriteName}.yy`;
    const sprite = await this.readResource(loaded, spritePath, `sprite ${input.spriteName}`, signal);
    const spriteWidth = numericField(sprite, "width", `sprite ${input.spriteName}`);
    const spriteHeight = numericField(sprite, "height", `sprite ${input.spriteName}`);
    const authored = authorTileset(loaded.texts, {
      name: input.name,
      spriteName: input.spriteName,
      spriteWidth,
      spriteHeight,
      tileWidth: input.tileWidth,
      tileHeight: input.tileHeight,
    });
    return this.planAuthored(input, authored, requestId, signal, input);
  }

  async planTileLayer(input: TileLayerInput, requestId: PublicRequestId, signal: AbortSignal): Promise<AuthoredPlanOutput> {
    const projectsDir = await resolveProjectsDir(this.env);
    const loaded = await this.projectTexts(projectsDir, input.projectPath, input.expectedProjectFingerprint, signal, input.roomName);
    const tilesetPath = tilesetResourcePath(input.tilesetName);
    const tileset = await this.readResource(loaded, tilesetPath, `tileset ${input.tilesetName}`, signal);
    const authored = authorTileLayer(loaded.texts, {
      roomName: input.roomName,
      layerName: input.layerName,
      tilesetName: input.tilesetName,
      width: input.width,
      height: input.height,
      cells: input.cells,
      tileWidth: numericField(tileset, "tileWidth", `tileset ${input.tilesetName}`),
      tileHeight: numericField(tileset, "tileHeight", `tileset ${input.tilesetName}`),
      tilesetTileCount: numericField(tileset, "tile_count", `tileset ${input.tilesetName}`),
      ...(input.depth === undefined ? {} : { depth: input.depth }),
    });
    return this.planAuthored(input, authored, requestId, signal, input);
  }

  /** Reads one `.yy` the caller named, refusing anything not in the snapshot. */
  private async readResource(
    loaded: LoadedProjectTexts,
    resourcePath: string,
    label: string,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const expected = loaded.files.get(resourcePath);
    if (expected === undefined) {
      throw new GmAuthoringError("INVALID_RESOURCE_NAME", `${label} is not in this project`);
    }
    const text = (await readSnapshotTextFile(
      loaded.root,
      resourcePath,
      expected,
      signal,
      MAX_PLAN_CONTENT_BYTES_PER_FILE,
    )).text;
    const parsed = parseGmJson(text);
    if (typeof parsed !== "object" || parsed === null) {
      throw new GmAuthoringError("INVALID_PROJECT_TEXT", `${label} is not a readable resource file`);
    }
    return parsed as Record<string, unknown>;
  }
}

function numericField(record: Record<string, unknown>, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new GmAuthoringError("INVALID_PROJECT_TEXT", `${label} declares no usable ${field}`);
  }
  return value;
}

export function mapToolError(error: unknown, requestId: PublicRequestId): ToolOutput {
  if (error instanceof GmMcpError) {
    return {
      ok: false,
      schemaVersion: 1,
      requestId,
      error: { code: error.code, message: error.message, recoverable: error.recoverable },
    };
  }
  if (error instanceof GmAdapterError) {
    return {
      ok: false,
      schemaVersion: 1,
      requestId,
      error: {
        code: error.code,
        message: ADAPTER_PUBLIC_MESSAGES[error.code],
        recoverable: error.recoverable,
      },
    };
  }
  // Authoring refusals are the caller's to fix -- a bad identifier, an
  // unsupported event, a name already taken -- so they keep their own message.
  if (error instanceof GmAuthoringError) {
    return {
      ok: false,
      schemaVersion: 1,
      requestId,
      error: { code: error.code, message: error.message, recoverable: true },
    };
  }
  const type = error instanceof Error ? error.name : typeof error;
  process.stderr.write(`[gamemaker-dev-mcp] GM_INTERNAL_ERROR request=${String(requestId)} type=${type}\n`);
  return {
    ok: false,
    schemaVersion: 1,
    requestId,
    error: {
      code: "GM_INTERNAL_ERROR",
      message: "The GameMaker request failed closed.",
      recoverable: false,
    },
  };
}
