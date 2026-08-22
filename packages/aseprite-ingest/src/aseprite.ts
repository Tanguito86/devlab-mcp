import { execFile } from "node:child_process";
import { basename, isAbsolute } from "node:path";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ASEPRITE_ENV = "DEVLAB_ASEPRITE";
export const DEFAULT_TIMEOUT_MS = 120_000;
export const MIN_TIMEOUT_MS = 5_000;
export const MAX_TIMEOUT_MS = 600_000;

export type AsepriteErrorCode =
  | "ASEPRITE_NOT_CONFIGURED"
  | "ASEPRITE_NOT_FOUND"
  | "ASEPRITE_FAILED"
  | "ASEPRITE_TIMEOUT"
  | "ASEPRITE_METADATA_INVALID";

export class AsepriteError extends Error {
  constructor(readonly code: AsepriteErrorCode, message: string, readonly recoverable = false) {
    super(message);
    this.name = "AsepriteError";
  }
}

/**
 * Accepted executable names. The path itself comes only from the environment,
 * never from a caller argument, so no request can point this at another binary.
 */
const EXECUTABLE_NAMES = /^aseprite(?:\.exe)?$/i;

export async function resolveAsepriteExecutable(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<string> {
  const configured = env[ASEPRITE_ENV];
  if (!configured) {
    throw new AsepriteError("ASEPRITE_NOT_CONFIGURED", `${ASEPRITE_ENV} must point at the Aseprite executable.`, true);
  }
  if (!isAbsolute(configured)) {
    throw new AsepriteError("ASEPRITE_NOT_CONFIGURED", `${ASEPRITE_ENV} must be an absolute path.`, true);
  }
  if (!EXECUTABLE_NAMES.test(basename(configured))) {
    throw new AsepriteError("ASEPRITE_NOT_CONFIGURED", `${ASEPRITE_ENV} must name the Aseprite executable.`, true);
  }
  if (!(await stat(configured).catch(() => null))) {
    throw new AsepriteError("ASEPRITE_NOT_FOUND", "The configured Aseprite executable does not exist.", true);
  }
  return configured;
}

export function resolveTimeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new AsepriteError("ASEPRITE_NOT_CONFIGURED", `timeoutMs must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}.`, true);
  }
  return value;
}

/**
 * Runs Aseprite headlessly. Argument shapes are constructed here; a caller
 * supplies inputs and destinations, never raw flags, so `--script` and other
 * code-execution switches are unreachable through this surface.
 */
async function runAseprite(executable: string, args: readonly string[], timeoutMs: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync(executable, [...args], { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; stderr?: string };
    if (failure.killed || failure.signal === "SIGTERM") {
      throw new AsepriteError("ASEPRITE_TIMEOUT", "Aseprite exceeded the configured timeout.", true);
    }
    throw new AsepriteError("ASEPRITE_FAILED", "Aseprite exited with a failure while processing the source.", false);
  }
}

export interface AsepriteFrameInfo {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
}

export interface AsepriteMetadata {
  readonly frames: readonly AsepriteFrameInfo[];
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly asepriteVersion: string;
}

/** Parses the `--data --format json-array` document Aseprite emits. */
export function parseAsepriteMetadata(text: string): AsepriteMetadata {
  let document: unknown;
  try { document = JSON.parse(text); } catch { throw new AsepriteError("ASEPRITE_METADATA_INVALID", "Aseprite metadata is not valid JSON."); }
  const record = document as { frames?: unknown; meta?: Record<string, unknown> };
  if (!Array.isArray(record.frames) || record.frames.length === 0) {
    throw new AsepriteError("ASEPRITE_METADATA_INVALID", "Aseprite metadata declares no frames.");
  }
  const frames = record.frames.map((entry, index) => {
    const source = (entry as { sourceSize?: { w?: unknown; h?: unknown }; duration?: unknown }).sourceSize;
    const width = source?.w;
    const height = source?.h;
    const duration = (entry as { duration?: unknown }).duration;
    if (typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      throw new AsepriteError("ASEPRITE_METADATA_INVALID", `frame ${index} has no usable source size.`);
    }
    return Object.freeze({
      index,
      width,
      height,
      durationMs: typeof duration === "number" && Number.isSafeInteger(duration) && duration >= 0 ? duration : 0,
    });
  });
  const first = frames[0]!;
  if (frames.some((frame) => frame.width !== first.width || frame.height !== first.height)) {
    throw new AsepriteError("ASEPRITE_METADATA_INVALID", "frames do not share one canvas size; trimmed or resized frames are not supported.");
  }
  const format = String(record.meta?.format ?? "");
  if (format !== "RGBA8888") {
    throw new AsepriteError("ASEPRITE_METADATA_INVALID", `unsupported colour format ${format || "unknown"}; the GameMaker sprite gate requires RGBA8888.`);
  }
  return Object.freeze({
    frames: Object.freeze(frames),
    frameCount: frames.length,
    width: first.width,
    height: first.height,
    format,
    asepriteVersion: String(record.meta?.version ?? "unknown"),
  });
}

/** Probes a source file, writing its throwaway sheet and data next to `scratchDir`. */
export async function probeSource(input: Readonly<{
  executable: string;
  source: string;
  scratchDir: string;
  timeoutMs: number;
}>): Promise<AsepriteMetadata> {
  const sheet = `${input.scratchDir}/probe-sheet.png`;
  const data = `${input.scratchDir}/probe-data.json`;
  await runAseprite(input.executable, [
    "-b", input.source,
    "--sheet", sheet,
    "--data", data,
    "--format", "json-array",
  ], input.timeoutMs);
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(data, "utf8").catch(() => {
    throw new AsepriteError("ASEPRITE_METADATA_INVALID", "Aseprite produced no metadata document.");
  });
  return parseAsepriteMetadata(text);
}

/**
 * Exports one PNG per frame. Aseprite auto-numbers from the trailing index in
 * the destination name, so `frame_0.png` yields frame_0..frame_N-1.
 */
export async function exportFrames(input: Readonly<{
  executable: string;
  source: string;
  destinationDir: string;
  timeoutMs: number;
}>): Promise<void> {
  await runAseprite(input.executable, [
    "-b", input.source,
    "--save-as", `${input.destinationDir}/frame_0.png`,
  ], input.timeoutMs);
}
