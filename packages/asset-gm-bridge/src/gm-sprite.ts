import type { AssetGmBridgeManifest } from "./contracts.js";
import { fail } from "./errors.js";

/**
 * Deterministic GameMaker resource rendering for sprite imports.
 * - The .yyp and .resource_order are patched with minimal TEXT splices that
 *   preserve every other byte (no global reformatting).
 * - The sprite .yy is generated in the exact GameMaker LTS 2024 (project
 *   format 225) IDE record shape: every tag, tag-and-version value, field
 *   name and field order below is the record written by the installed
 *   compiler's own WriteExact serialisers and demanded by its ReadExact
 *   deserialisers in strict mode (no `sdlm=` leniency flag is used by the
 *   adapter). The tag-and-version value grammar is `"v<N>"` with a whole
 *   number 1..1000, or `""` for version 0 — so `"$GMSprite":"v2"` (GMSCVersion
 *   2), `"$GMSpriteFrame":"v1"` (GMSCVersion 1), `"$GMSequence":"v1"`, and
 *   `"$GMImageLayer":""` (unversioned record).
 * - Each frame has both the IDE-editable bitmap layer at
 *   `sprites/<name>/layers/<frame>/default.png` and the compiler composite at
 *   `sprites/<name>/<frame>.png` (frame names are "0", "1", ...).
 * - Identities are name+path based (GM2024 format): the sprite record itself
 *   produces no UUIDs, so identical executions produce byte-identical outputs.
 */

/** Name of the single bitmap layer the bridge renders (must match the image path). */
export const SPRITE_IMAGE_LAYER = "default";

/** Canonical sprite image path for a frame: `sprites/<name>/layers/<i>/default.png`. */
export function spriteImagePath(resourceName: string, frameIndex: number): string {
  return `sprites/${resourceName}/layers/${frameIndex}/${SPRITE_IMAGE_LAYER}.png`;
}

/** Composite frame path consumed directly by the installed asset compiler. */
export function spriteCompositeImagePath(resourceName: string, frameIndex: number): string {
  return `sprites/${resourceName}/${frameIndex}.png`;
}

export function renderGmJson(value: unknown, depth = 0): string {
  const pad = "  ".repeat(depth);
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value) || Object.is(value, -0)) fail("INVALID_REQUEST", "non-canonical number in GameMaker JSON"); return JSON.stringify(value); }
  if (typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${pad}  ${renderGmJson(item, depth + 1)},`).join("\n")}\n${pad}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([key, entry]) => `${pad}  ${JSON.stringify(key)}:${renderGmJson(entry, depth + 1)},`).join("\n")}\n${pad}}`;
}

function findArrayClose(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i]!;
    if (char === '"') { i += 1; while (i < text.length) { if (text[i] === "\\") i += 1; else if (text[i] === '"') break; i += 1; } continue; }
    if (char === "[") depth += 1;
    else if (char === "]") { depth -= 1; if (depth === 0) return i; }
  }
  fail("INVALID_REQUEST", "GameMaker file has unbalanced arrays");
}

/**
 * Inserts one canonical entry line into the named array of a GameMaker text
 * file, preserving every other byte. Returns the original text unchanged when
 * the entry path is already present (idempotent).
 */
export function insertIntoGmArray(text: string, openMarker: string, entryPath: string, entryLine: string, indent = "    "): string {
  const open = text.indexOf(openMarker);
  if (open < 0) fail("INVALID_REQUEST", `GameMaker file is missing ${openMarker}`);
  const arrayOpen = text.indexOf("[", open);
  if (arrayOpen < 0) fail("INVALID_REQUEST", `GameMaker file is missing the ${openMarker} array`);
  const close = findArrayClose(text, arrayOpen);
  const body = text.slice(arrayOpen, close);
  if (body.includes(`"${entryPath}"`)) return text;
  // GM text arrays sometimes omit the element-separating comma on the last
  // element (e.g. hand-authored .yyp). A valid array needs a separator before
  // the inserted element, so add one when the previous element lacks it. The
  // entry is spliced right after the last element (before any trailing
  // whitespace of the closing bracket line) so the patch is a minimal,
  // parseable insertion that preserves every other byte.
  const before = text.slice(0, close);
  const separator = /,\s*$/.test(before) ? "" : ",";
  const insertionPoint = before.trimEnd().length;
  return `${before.slice(0, insertionPoint)}${separator}\n${indent}${entryLine},${before.slice(insertionPoint)}${text.slice(close)}`;
}

export function parseGmJson(text: string): unknown {
  return JSON.parse(text.replace(/,\s*([}\])])/g, "$1"));
}

export interface SpriteRenderContext {
  readonly projectName: string;
  readonly projectFile: string;
  readonly ideVersion: string;
  readonly resourceName: string;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  /** Pivot in pixels. This, not the origin index, is what the engine uses. */
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly boundingBox: Readonly<{ left: number; top: number; right: number; bottom: number }>;
}

/**
 * GameMaker's origin preset index.
 *
 * Measured, not assumed: a sprite compiled with `origin: 1` and a sequence
 * pivot of (0,0) reports `sprite_get_xoffset() == 0`, while `origin: 0` with a
 * sequence pivot of (8,24) reports 8. The engine reads the sequence pivot and
 * ignores this index, which is IDE metadata. It is still emitted accurately so
 * the IDE shows the right preset instead of always claiming "top centre".
 */
export function originIndexFor(
  origin: Readonly<{ x: number; y: number }>,
  width: number,
  height: number,
): number {
  const column = origin.x === 0 ? 0 : origin.x === Math.floor(width / 2) ? 1 : origin.x === width ? 2 : -1;
  const row = origin.y === 0 ? 0 : origin.y === Math.floor(height / 2) ? 1 : origin.y === height ? 2 : -1;
  if (column < 0 || row < 0) return 9; // custom
  return row * 3 + column;
}

/**
 * GMSpriteFrame record (GMSCVersion 1, tag `$GMSpriteFrame:"v1"`). The frame
 * name doubles as its image subfolder: frame i renders
 * `sprites/<name>/layers/<i>/default.png`.
 */
function spriteFrame(index: number): unknown {
  return Object.freeze({
    $GMSpriteFrame: "v1",
    "%Name": String(index),
    name: String(index),
    resourceType: "GMSpriteFrame",
    resourceVersion: "2.0",
  });
}

/**
 * GMImageLayer bitmap layer record (unversioned, tag `$GMImageLayer:""`).
 * The layer name must equal SPRITE_IMAGE_LAYER so the compiler resolves the
 * frame image at `layers/<frame>/default.png`.
 */
function imageLayer(): unknown {
  return Object.freeze({
    $GMImageLayer: "",
    "%Name": SPRITE_IMAGE_LAYER,
    blendMode: 0,
    displayName: "",
    isLocked: false,
    name: SPRITE_IMAGE_LAYER,
    opacity: 100.0,
    resourceType: "GMImageLayer",
    resourceVersion: "2.0",
    visible: true,
  });
}

/**
 * GMNineSliceData record (unversioned). Disabled by default.
 *
 * GameMaker's resource constructor initializes four guide colours and five
 * tile modes. The asset compiler indexes all five tile modes even when nine
 * slice rendering is disabled, so emitting empty arrays loads in the project
 * parser but crashes the compiler with IndexOutOfRangeException.
 */
function nineSliceData(): unknown {
  return Object.freeze({
    $GMNineSliceData: "",
    bottom: 0,
    enabled: false,
    guideColour: Object.freeze([4294902015, 4294902015, 4294902015, 4294902015]),
    highlightColour: 1728023040,
    highlightStyle: 0,
    left: 0,
    resourceType: "GMNineSliceData",
    resourceVersion: "2.0",
    right: 0,
    tileMode: Object.freeze([0, 0, 0, 0, 0]),
    top: 0,
  });
}

/**
 * KeyframeStore<T> record (unversioned). The bridge sprite has no animation
 * keyframes, so the store is empty; the empty store keeps the .yy free of
 * UUIDs (a Keyframe record would demand a Guid `id`).
 */
function emptyKeyframeStore(typeName: string): unknown {
  return Object.freeze({
    [`$KeyframeStore<${typeName}>`]: "",
    Keyframes: Object.freeze([]),
    resourceType: `KeyframeStore<${typeName}>`,
    resourceVersion: "2.0",
  });
}

/**
 * GMSequence record (GMSCVersion 1, tag `$GMSequence:"v1"`) — the sprite's
 * auto-created sequence. Tracks are intentionally empty: the pilot renders
 * draw_sprite subimages, never the sequence asset, and an empty track list is
 * the deterministic, UUID-free form the compiler accepts.
 */
function spriteSequence(context: SpriteRenderContext): unknown {
  const sequenceName = `${context.resourceName}_sequence`;
  return Object.freeze({
    $GMSequence: "v1",
    "%Name": sequenceName,
    autoRecord: true,
    backdropHeight: context.height,
    backdropImageOpacity: 0.5,
    backdropImagePath: "",
    backdropWidth: context.width,
    backdropXOffset: 0.0,
    backdropYOffset: 0.0,
    events: emptyKeyframeStore("MessageEventKeyframe"),
    eventStubScript: null,
    eventToFunction: Object.freeze({}),
    length: 1.0,
    lockOrigin: false,
    moments: emptyKeyframeStore("MomentsEventKeyframe"),
    name: sequenceName,
    playback: 1,
    playbackSpeed: 30.0,
    playbackSpeedType: 0,
    resourceType: "GMSequence",
    resourceVersion: "2.0",
    showBackdrop: true,
    showBackdropImage: true,
    timeUnits: 0,
    tracks: Object.freeze([]),
    visibleRange: Object.freeze({ x: 0.0, y: 0.0 }),
    volume: 1.0,
    // The authoritative pivot. sprite_get_xoffset/yoffset read these.
    xorigin: context.origin.x,
    yorigin: context.origin.y,
  });
}

/**
 * Renders the sprite resource .yy in the authoritative LTS 2024 shape:
 * `$GMSprite:"v2"` (GMSCVersion 2) with the exact IDE field order.
 */
export function renderSpriteYy(context: SpriteRenderContext): string {
  const frames = Array.from({ length: context.frameCount }, (_, index) => spriteFrame(index));
  const layers = [imageLayer()];
  // GMSprite v2 `swatchColours` is a ResourceList<uint> (GMSprite.cs:68,
  // Code.cs WriteExact(GMSprite) 31039-31041): a plain array of ABGR uint
  // colour values, NOT records. The legacy GM2022 `swatchColors` object shape
  // ({colour,name}) makes the strict ReadExact fail with "Unsigned 32-bit
  // number expected" (GMSCJsonReader.ExpectUint32) the moment the reader hits
  // the first `{`. The default IDE palette, in the IDE's own order:
  // Black, White, Navy, Aqua, Maroon, Red, Olive, Fuchsia.
  const swatchColours = Object.freeze([
    4278190080, 4294967295, 4278190335, 4286611584,
    4283215696, 4294901760, 4286611456, 4278255615,
  ]);
  const value = Object.freeze({
    $GMSprite: "v2",
    "%Name": context.resourceName,
    bboxMode: 0,
    bbox_bottom: context.boundingBox.bottom,
    bbox_left: context.boundingBox.left,
    bbox_right: context.boundingBox.right,
    bbox_top: context.boundingBox.top,
    collisionKind: 1,
    collisionTolerance: 0,
    DynamicTexturePage: false,
    edgeFiltering: false,
    For3D: false,
    frames,
    gridX: 0,
    gridY: 0,
    height: context.height,
    HTile: false,
    layers,
    name: context.resourceName,
    nineSlice: nineSliceData(),
    origin: originIndexFor(context.origin, context.width, context.height),
    parent: Object.freeze({ name: context.projectName, path: context.projectFile }),
    preMultiplyAlpha: false,
    resourceType: "GMSprite",
    resourceVersion: "2.0",
    sequence: spriteSequence(context),
    swatchColours,
    swfPrecision: 2.525,
    textureGroupId: Object.freeze({ name: "Default", path: "texturegroups/Default" }),
    type: 0,
    VTile: false,
    width: context.width,
  });
  return renderGmJson(value);
}

/** Canonical .yyp resources entry line for a sprite resource. */
export function yypResourceEntry(resourceName: string): string {
  return `{"id":{"name":"${resourceName}","path":"sprites/${resourceName}/${resourceName}.yy",},}`;
}

/** Canonical .resource_order entry line (order = existing max + 1). */
export function resourceOrderEntry(resourceName: string, order: number): string {
  return `{"name":"${resourceName}","order":${order},"path":"sprites/${resourceName}/${resourceName}.yy",}`;
}

export interface GmProjectTexts {
  readonly yyp: string;
  readonly resourceOrder: string;
}

/** Patches the .yyp and .resource_order to reference the imported sprite. */
export function patchProjectTexts(texts: GmProjectTexts, resourceName: string): Readonly<{ yyp: string; resourceOrder: string }> {
  const yyp = insertIntoGmArray(texts.yyp, '"resources":[', `sprites/${resourceName}/${resourceName}.yy`, yypResourceEntry(resourceName));
  const parsed = parseGmJson(yyp) as { resourceOrderSettings?: ReadonlyArray<Readonly<{ order: number }>>; ResourceOrderSettings?: ReadonlyArray<Readonly<{ order: number }>> };
  const orders = (parsed.ResourceOrderSettings ?? parsed.resourceOrderSettings ?? []).map((entry) => entry.order).filter((value): value is number => typeof value === "number");
  const nextOrder = orders.length ? Math.max(...orders) + 1 : 0;
  const resourceOrder = insertIntoGmArray(texts.resourceOrder, '"ResourceOrderSettings":[', `sprites/${resourceName}/${resourceName}.yy`, resourceOrderEntry(resourceName, nextOrder));
  return Object.freeze({ yyp, resourceOrder });
}

export interface ImportedGml {
  readonly create: string;
  readonly step: string;
  readonly draw: string;
}

/** GML for the pilot object after import. Version macros drive the runtime marker. */
export function renderImportedGml(version: number, applied: boolean, screenshotName: string, resourceName: string): ImportedGml {
  const create = [
    `#macro GM_ASSET_BRIDGE_BEACON_VERSION ${version}`,
    `#macro GM_ASSET_BRIDGE_BEACON_APPLIED ${applied ? 1 : 0}`,
    "",
    "bridge_ticks = 0;",
    "bridge_evidence_dir = environment_get_variable(\"DEVLAB_ASSET_BRIDGE_EVIDENCE_DIR\");",
    "show_debug_message(\"GM_ASSET_BRIDGE_BEACON_VERSION=\" + string(GM_ASSET_BRIDGE_BEACON_VERSION));",
    "show_debug_message(\"GM_ASSET_BRIDGE_BEACON_APPLIED=\" + string(GM_ASSET_BRIDGE_BEACON_APPLIED));",
    "",
  ].join("\n");
  const step = [
    "bridge_ticks += 1;",
    "if (bridge_ticks >= 90) {",
    "    if (bridge_evidence_dir != \"\") {",
    `        screen_save(bridge_evidence_dir + "/${screenshotName}");`,
    "    }",
    "    game_end();",
    "}",
    "",
  ].join("\n");
  const draw = [
    "draw_set_color(c_white);",
    "draw_text(24, 24, \"GM_ASSET_BRIDGE_BEACON_VERSION=\" + string(GM_ASSET_BRIDGE_BEACON_VERSION));",
    `draw_sprite(${resourceName}, 1, 160, 120);`,
    "",
  ].join("\n");
  return Object.freeze({ create, step, draw });
}

export function assetVersionToNumber(assetVersion: string): number {
  const major = assetVersion.split(".")[0];
  const parsed = Number(major);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 999) fail("INVALID_ASSET_MANIFEST", "asset version cannot drive the runtime marker");
  return parsed;
}

/**
 * The runtime marker only exists when the import actually wrote the pilot
 * instrumentation. An uninstrumented import emits no marker, so claiming one
 * would make RUNTIME_VALID unsatisfiable-by-design rather than simply absent.
 */
export function runtimeSignalFor(manifest: AssetGmBridgeManifest): string | null {
  if (manifest.instrumentation !== "PILOT_BEACON_V1") return null;
  return `GM_ASSET_BRIDGE_BEACON_VERSION=${assetVersionToNumber(manifest.assetVersion)}`;
}
