import { GmAuthoringError } from "./gm-json.js";

/**
 * Object event vocabulary.
 *
 * Only events whose `eventType`/`eventNum` pairing and `.gml` filename are
 * known for certain are accepted. An unsupported event is refused rather than
 * guessed at, because a wrong pairing produces a project the compiler rejects
 * or, worse, an event that silently never fires.
 *
 * The Create/Step/Draw triple is verified against the compiler: it is exactly
 * what `fixtures/gamemaker/hermes-bridge-pilot` ships and builds with.
 */

export interface GmEventKind {
  readonly eventType: number;
  /** Filename stem, e.g. "Create" in Create_0.gml. */
  readonly stem: string;
  /** Accepted event numbers, or a predicate for ranged families. */
  readonly accepts: (eventNum: number) => boolean;
}

const only = (...values: readonly number[]) => (eventNum: number): boolean => values.includes(eventNum);
const range = (min: number, max: number) => (eventNum: number): boolean => eventNum >= min && eventNum <= max;

export const EVENT_KINDS: Readonly<Record<string, GmEventKind>> = Object.freeze({
  create: { eventType: 0, stem: "Create", accepts: only(0) },
  destroy: { eventType: 1, stem: "Destroy", accepts: only(0) },
  alarm: { eventType: 2, stem: "Alarm", accepts: range(0, 11) },
  step: { eventType: 3, stem: "Step", accepts: only(0, 1, 2) },
  draw: { eventType: 8, stem: "Draw", accepts: only(0, 64, 72, 73, 74, 75, 76, 77) },
  other: { eventType: 7, stem: "Other", accepts: range(0, 25) },
  cleanup: { eventType: 12, stem: "CleanUp", accepts: only(0) },
});

export const EVENT_NAMES = Object.freeze(Object.keys(EVENT_KINDS) as readonly (keyof typeof EVENT_KINDS)[]);
export type GmEventName = typeof EVENT_NAMES[number];

export interface GmEventSpec {
  readonly event: GmEventName;
  /** Defaults to 0. Step 1/2 are begin/end step; Draw 64 is Draw GUI. */
  readonly eventNum?: number;
  readonly gml: string;
}

export interface ResolvedEvent {
  readonly eventType: number;
  readonly eventNum: number;
  /** Relative filename inside the object folder, e.g. "Create_0.gml". */
  readonly fileName: string;
  readonly gml: string;
}

export const MAX_EVENTS_PER_OBJECT = 24;
export const MAX_GML_BYTES = 256 * 1024;

export function resolveEvent(spec: GmEventSpec): ResolvedEvent {
  const kind = EVENT_KINDS[spec.event as string];
  if (!kind) throw new GmAuthoringError("INVALID_EVENT", `unknown event "${String(spec.event)}"; supported: ${EVENT_NAMES.join(", ")}`);
  const eventNum = spec.eventNum ?? 0;
  if (!Number.isSafeInteger(eventNum) || eventNum < 0) throw new GmAuthoringError("INVALID_EVENT", "eventNum must be a non-negative integer");
  if (!kind.accepts(eventNum)) throw new GmAuthoringError("INVALID_EVENT", `event "${spec.event}" does not accept eventNum ${eventNum}`);
  if (typeof spec.gml !== "string") throw new GmAuthoringError("INVALID_EVENT", "each event requires GML text");
  if (Buffer.byteLength(spec.gml, "utf8") > MAX_GML_BYTES) throw new GmAuthoringError("LIMIT_EXCEEDED", "event GML exceeds the per-file limit");
  return Object.freeze({
    eventType: kind.eventType,
    eventNum,
    fileName: `${kind.stem}_${eventNum}.gml`,
    gml: spec.gml,
  });
}

export function resolveEvents(specs: readonly GmEventSpec[]): readonly ResolvedEvent[] {
  if (!specs.length) throw new GmAuthoringError("INVALID_EVENT", "an object needs at least one event");
  if (specs.length > MAX_EVENTS_PER_OBJECT) throw new GmAuthoringError("LIMIT_EXCEEDED", "too many events for one object");
  const resolved = specs.map(resolveEvent);
  const seen = new Set<string>();
  for (const event of resolved) {
    if (seen.has(event.fileName)) throw new GmAuthoringError("INVALID_EVENT", `duplicate event ${event.fileName}`);
    seen.add(event.fileName);
  }
  // Stable order: GameMaker writes events by type then number.
  return Object.freeze([...resolved].sort((a, b) => a.eventType - b.eventType || a.eventNum - b.eventNum));
}
