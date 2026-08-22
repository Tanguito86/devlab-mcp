/**
 * Parses GameMaker asset-compiler diagnostics out of an Igor console log.
 *
 * The shape below is the one the installed compiler actually emits, captured
 * from a real failing build:
 *
 *   Error : gml_Object_obj_player_Create_0(12) : unexpected symbol ";" in expression
 *
 * Everything else in the log -- chunk writes, timing stats, option paths -- is
 * noise and is discarded. Nothing from a filesystem path is ever carried into a
 * diagnostic: only the compiler's own symbol, line and message survive.
 */

export const MAX_DIAGNOSTICS = 50;
export const MAX_MESSAGE_LENGTH = 300;

export type DiagnosticSeverity = "error" | "warning";

export interface GmDiagnostic {
  readonly severity: DiagnosticSeverity;
  /** The compiler symbol, e.g. "gml_Object_obj_player_Create_0". */
  readonly symbol: string;
  /** Object name when the symbol names an object event. */
  readonly object?: string;
  /** Event name when the symbol names an object event, e.g. "Create_0". */
  readonly event?: string;
  /** Script name when the symbol names a script. */
  readonly script?: string;
  readonly line: number;
  readonly message: string;
}

export interface DiagnosticReport {
  readonly diagnostics: readonly GmDiagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly truncated: boolean;
}

const DIAGNOSTIC_LINE = /^\s*(Error|Warning)\s*:\s*([^()]+?)\((\d+)\)\s*:\s*(.+?)\s*$/;
const OBJECT_SYMBOL = /^gml_Object_(.+)_([A-Za-z]+_\d+)$/;
const SCRIPT_SYMBOL = /^gml_(?:Global)?Script_(.+)$/;

/** Drops anything that looks like a filesystem path before it reaches a caller. */
function scrub(message: string): string {
  const cleaned = message
    .replace(/[A-Za-z]:[\\/][^\s"']*/g, "<path>")
    .replace(/\\\\[^\s"']+/g, "<path>")
    .replace(/(?:\/[\w.-]+){2,}/g, "<path>");
  return cleaned.length > MAX_MESSAGE_LENGTH ? `${cleaned.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : cleaned;
}

function decompose(symbol: string): Pick<GmDiagnostic, "object" | "event" | "script"> {
  const asObject = OBJECT_SYMBOL.exec(symbol);
  if (asObject) return { object: asObject[1]!, event: asObject[2]! };
  const asScript = SCRIPT_SYMBOL.exec(symbol);
  if (asScript) return { script: asScript[1]! };
  return {};
}

export function parseIgorDiagnostics(log: string): DiagnosticReport {
  const seen = new Set<string>();
  const collected: GmDiagnostic[] = [];
  let errorCount = 0;
  let warningCount = 0;
  let truncated = false;

  for (const rawLine of log.split(/\r?\n/)) {
    const match = DIAGNOSTIC_LINE.exec(rawLine);
    if (!match) continue;
    const severity: DiagnosticSeverity = match[1] === "Warning" ? "warning" : "error";
    const symbol = match[2]!.trim();
    const line = Number(match[3]);
    if (!Number.isSafeInteger(line) || line < 0) continue;
    const message = scrub(match[4]!);

    const identity = `${severity}|${symbol}|${line}|${message}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    if (severity === "error") errorCount += 1;
    else warningCount += 1;

    if (collected.length >= MAX_DIAGNOSTICS) { truncated = true; continue; }
    collected.push(Object.freeze({ severity, symbol, ...decompose(symbol), line, message }));
  }

  return Object.freeze({
    diagnostics: Object.freeze(collected),
    errorCount,
    warningCount,
    truncated,
  });
}
