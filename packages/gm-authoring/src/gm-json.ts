/**
 * GameMaker text-file primitives.
 *
 * GameMaker's `.yy`, `.yyp` and `.resource_order` files are JSON with trailing
 * commas. They must be rendered in the IDE's own layout and patched by minimal
 * splices that preserve every other byte, so a project edited here still reads
 * as the IDE wrote it.
 *
 * `asset-gm-bridge` carries an equivalent copy of these helpers for its sprite
 * renderer. Consolidating the two is tracked separately; importing them from
 * there would drag the whole Asset Forge dependency tree into the read-only
 * MCP server, which is a worse trade than sixty duplicated lines.
 */

export class GmAuthoringError extends Error {
  constructor(readonly code: GmAuthoringErrorCode, message: string) {
    super(message);
    this.name = "GmAuthoringError";
  }
}

export type GmAuthoringErrorCode =
  | "INVALID_RESOURCE_NAME"
  | "INVALID_EVENT"
  | "RESOURCE_EXISTS"
  | "INVALID_PROJECT_TEXT"
  | "INVALID_ROOM"
  | "LIMIT_EXCEEDED";

export function renderGmJson(value: unknown, depth = 0): string {
  const pad = "  ".repeat(depth);
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new GmAuthoringError("INVALID_PROJECT_TEXT", "non-canonical number in GameMaker JSON");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${pad}  ${renderGmJson(item, depth + 1)},`).join("\n")}\n${pad}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([key, entry]) => `${pad}  ${JSON.stringify(key)}:${renderGmJson(entry, depth + 1)},`).join("\n")}\n${pad}}`;
}

/** Parses GameMaker JSON, which permits trailing commas. */
export function parseGmJson(text: string): unknown {
  return JSON.parse(text.replace(/,\s*([}\])])/g, "$1"));
}

function findArrayClose(text: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") index += 1;
        else if (text[index] === '"') break;
        index += 1;
      }
      continue;
    }
    if (char === "[") depth += 1;
    else if (char === "]") { depth -= 1; if (depth === 0) return index; }
  }
  throw new GmAuthoringError("INVALID_PROJECT_TEXT", "GameMaker file has unbalanced arrays");
}

/**
 * Splices one canonical entry into the named array, preserving every other
 * byte. Returns the text unchanged when the entry path is already present, so
 * repeated planning of the same resource is idempotent.
 */
export function insertIntoGmArray(text: string, openMarker: string, entryPath: string, entryLine: string, indent = "    "): string {
  const open = text.indexOf(openMarker);
  if (open < 0) throw new GmAuthoringError("INVALID_PROJECT_TEXT", `GameMaker file is missing ${openMarker}`);
  const arrayOpen = text.indexOf("[", open);
  if (arrayOpen < 0) throw new GmAuthoringError("INVALID_PROJECT_TEXT", `GameMaker file is missing the ${openMarker} array`);
  const close = findArrayClose(text, arrayOpen);
  if (text.slice(arrayOpen, close).includes(`"${entryPath}"`)) return text;
  const before = text.slice(0, close);
  const separator = /,\s*$/.test(before) ? "" : ",";
  const insertionPoint = before.trimEnd().length;
  return `${before.slice(0, insertionPoint)}${separator}\n${indent}${entryLine},${before.slice(insertionPoint)}${text.slice(close)}`;
}

/** Canonical `.yyp` resources entry for any resource kind. */
export function yypResourceEntry(name: string, resourcePath: string): string {
  return `{"id":{"name":"${name}","path":"${resourcePath}",},}`;
}

/** Canonical `.resource_order` entry. */
export function resourceOrderEntry(name: string, resourcePath: string, order: number): string {
  return `{"name":"${name}","order":${order},"path":"${resourcePath}",}`;
}

/** Next free order index, derived from the project's existing settings. */
export function nextResourceOrder(yypText: string): number {
  const parsed = parseGmJson(yypText) as {
    ResourceOrderSettings?: ReadonlyArray<Readonly<{ order?: unknown }>>;
    resourceOrderSettings?: ReadonlyArray<Readonly<{ order?: unknown }>>;
  };
  const orders = (parsed.ResourceOrderSettings ?? parsed.resourceOrderSettings ?? [])
    .map((entry) => entry.order)
    .filter((value): value is number => typeof value === "number");
  return orders.length ? Math.max(...orders) + 1 : 0;
}
