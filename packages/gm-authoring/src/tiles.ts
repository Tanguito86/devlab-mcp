import { GmAuthoringError, renderGmJson } from "./gm-json.js";
import { assertResourceName, type ProjectIdentity } from "./resources.js";

/**
 * Tilesets and tile layers for GameMaker LTS 2026 / project format 225.
 *
 * Both records here were read from files the IDE itself wrote, not inferred.
 * Two details in particular resisted every attempt to derive them:
 *
 *  - The tileset and the room layer use DIFFERENT payload shapes. A tileset's
 *    `macroPageTiles` carries `TileSerialiseData` and no `TileDataFormat`,
 *    while a room's `tiles` carries `TileCompressedData` with
 *    `TileDataFormat: 1`. Using the compressed shape in a tileset fails the
 *    whole project load with "Failed to parse run-length encoded data".
 *  - An untouched cell is `-2147483648`, not `0`. Indices are zero-based in
 *    the tileset's reading order, but index 0 is GameMaker's blank tile: a
 *    cell holding it draws nothing. See {@link EMPTY_TILE}.
 *
 * Verified end to end against the real compiler, not just against the
 * fixture: a project authored by these functions compiles under Igor (VM,
 * exit 0) and the running game reports `tilemap_get_width/height` equal to
 * the authored grid and `tile_get_index` equal to the authored index for
 * every non-blank cell.
 */

/**
 * Value the IDE writes for a cell the user never painted.
 *
 * Index `0` is accepted too and is equally blank -- GameMaker reserves the
 * tileset's first slot as the empty tile, and `tilemap_get` returns the same
 * `0` for both. Prefer this constant so authored rooms read like IDE-written
 * ones.
 */
export const EMPTY_TILE = -2147483648;

export const MAX_TILE_LAYER_CELLS = 1_048_576;
/** Literal chunks are split at this length; any split is still valid. */
const MAX_LITERAL_RUN = 128;
/** A repeat is only worth its pair below this length. */
const MIN_REPEAT_RUN = 3;

export const tilesetResourcePath = (name: string): string => `tilesets/${name}/${name}.yy`;

/**
 * Run-length encodes a row-major cell array.
 *
 * The grammar, decoded from a file the IDE wrote:
 *   n > 0  -> the next n values are literal
 *   n < 0  -> the next single value repeats |n| times
 * and the decoded total must equal width * height.
 *
 * Any encoding obeying that grammar decodes identically, so this need not
 * reproduce the IDE's chunking byte for byte -- only its own output must be
 * deterministic, which the plan-hash model depends on.
 */
export function encodeTileData(cells: readonly number[]): readonly number[] {
  const out: number[] = [];
  let index = 0;
  while (index < cells.length) {
    let run = 1;
    while (index + run < cells.length && cells[index + run] === cells[index]) run += 1;

    if (run >= MIN_REPEAT_RUN) {
      out.push(-run, cells[index]!);
      index += run;
      continue;
    }

    // Gather literals until a repeat worth encoding starts, or the chunk fills.
    const literals: number[] = [];
    while (index < cells.length && literals.length < MAX_LITERAL_RUN) {
      let ahead = 1;
      while (index + ahead < cells.length && cells[index + ahead] === cells[index]) ahead += 1;
      if (ahead >= MIN_REPEAT_RUN) break;
      for (let step = 0; step < ahead; step += 1) literals.push(cells[index + step]!);
      index += ahead;
    }
    out.push(literals.length, ...literals);
  }
  return Object.freeze(out);
}

/** Inverse of {@link encodeTileData}; also validates the declared cell total. */
export function decodeTileData(stream: readonly number[], expectedCells: number): readonly number[] {
  const cells: number[] = [];
  let index = 0;
  while (index < stream.length) {
    const count = stream[index++]!;
    if (!Number.isSafeInteger(count) || count === 0) throw new GmAuthoringError("INVALID_TILE_DATA", "run-length stream contains a zero or non-integer count");
    if (count > 0) {
      if (index + count > stream.length) throw new GmAuthoringError("INVALID_TILE_DATA", "literal run runs past the end of the stream");
      for (let step = 0; step < count; step += 1) cells.push(stream[index++]!);
    } else {
      if (index >= stream.length) throw new GmAuthoringError("INVALID_TILE_DATA", "repeat run has no value");
      const value = stream[index++]!;
      for (let step = 0; step < -count; step += 1) cells.push(value);
    }
    if (cells.length > expectedCells) throw new GmAuthoringError("INVALID_TILE_DATA", "run-length stream decodes past the declared size");
  }
  if (cells.length !== expectedCells) {
    throw new GmAuthoringError("INVALID_TILE_DATA", `run-length stream decodes to ${cells.length} cells, expected ${expectedCells}`);
  }
  return Object.freeze(cells);
}

export interface TilesetGeometry {
  readonly spriteName: string;
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
}

export interface TilesetLayout {
  readonly columns: number;
  readonly rows: number;
  readonly tileCount: number;
}

/** Derives the grid the IDE would compute for a sprite of this size. */
export function tilesetLayout(geometry: TilesetGeometry): TilesetLayout {
  for (const [label, value] of [
    ["spriteWidth", geometry.spriteWidth], ["spriteHeight", geometry.spriteHeight],
    ["tileWidth", geometry.tileWidth], ["tileHeight", geometry.tileHeight],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new GmAuthoringError("INVALID_TILE_DATA", `${label} must be a positive integer`);
  }
  if (geometry.tileWidth > geometry.spriteWidth || geometry.tileHeight > geometry.spriteHeight) {
    throw new GmAuthoringError("INVALID_TILE_DATA", "a tile cannot be larger than its source sprite");
  }
  const columns = Math.floor(geometry.spriteWidth / geometry.tileWidth);
  const rows = Math.floor(geometry.spriteHeight / geometry.tileHeight);
  return Object.freeze({ columns, rows, tileCount: columns * rows });
}

/**
 * GMTileSet record. `macroPageTiles` uses the UNCOMPRESSED payload, with no
 * `TileDataFormat` field -- copying the room layer's compressed shape here is
 * what makes a project fail to load.
 */
export function renderTilesetYy(name: string, project: ProjectIdentity, geometry: TilesetGeometry): string {
  assertResourceName(name, "tileset");
  assertResourceName(geometry.spriteName, "sprite");
  const layout = tilesetLayout(geometry);
  return renderGmJson({
    $GMTileSet: "v1",
    "%Name": name,
    autoTileSets: [],
    macroPageTiles: { SerialiseHeight: 0, SerialiseWidth: 0, TileSerialiseData: [] },
    name,
    out_columns: layout.columns,
    out_tilehborder: 2,
    out_tilevborder: 2,
    parent: { name: project.projectName, path: project.projectFile },
    resourceType: "GMTileSet",
    resourceVersion: "2.0",
    spriteId: { name: geometry.spriteName, path: `sprites/${geometry.spriteName}/${geometry.spriteName}.yy` },
    spriteNoExport: false,
    textureGroupId: { name: "Default", path: "texturegroups/Default" },
    tileAnimationFrames: [],
    tileAnimationSpeed: 15.0,
    tileHeight: geometry.tileHeight,
    tilehsep: 0,
    tilevsep: 0,
    tileWidth: geometry.tileWidth,
    tilexoff: 0,
    tileyoff: 0,
    tile_count: layout.tileCount,
  });
}

export interface TileLayerSpec {
  readonly layerName: string;
  readonly tilesetName: string;
  /** Cells in columns; must equal the room width divided by the tile width. */
  readonly width: number;
  readonly height: number;
  /** Row-major cell values; EMPTY_TILE for a blank cell. Index 0 also draws blank. */
  readonly cells: readonly number[];
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly depth?: number;
}

export function assertTileCells(spec: TileLayerSpec, tileCount: number): void {
  const expected = spec.width * spec.height;
  if (!Number.isSafeInteger(spec.width) || !Number.isSafeInteger(spec.height) || spec.width <= 0 || spec.height <= 0) {
    throw new GmAuthoringError("INVALID_TILE_DATA", "tile layer width and height must be positive integers");
  }
  if (expected > MAX_TILE_LAYER_CELLS) throw new GmAuthoringError("LIMIT_EXCEEDED", "tile layer exceeds the cell ceiling");
  if (spec.cells.length !== expected) {
    throw new GmAuthoringError("INVALID_TILE_DATA", `expected ${expected} cells for ${spec.width}x${spec.height}, got ${spec.cells.length}`);
  }
  for (const cell of spec.cells) {
    if (cell === EMPTY_TILE) continue;
    if (!Number.isSafeInteger(cell) || cell < 0 || cell >= tileCount) {
      throw new GmAuthoringError("INVALID_TILE_DATA", `tile index ${cell} is outside the tileset's ${tileCount} tiles`);
    }
  }
}

/** GMRTileLayer record, tag-and-version `""`. */
export function tileLayerRecord(spec: TileLayerSpec): unknown {
  return {
    $GMRTileLayer: "",
    "%Name": spec.layerName,
    depth: spec.depth ?? 100,
    effectEnabled: true,
    effectType: null,
    gridX: spec.tileWidth,
    gridY: spec.tileHeight,
    hierarchyFrozen: false,
    inheritLayerDepth: false,
    inheritLayerSettings: false,
    inheritSubLayers: true,
    inheritVisibility: true,
    layers: [],
    name: spec.layerName,
    properties: [],
    resourceType: "GMRTileLayer",
    resourceVersion: "2.0",
    tiles: {
      SerialiseHeight: spec.height,
      SerialiseWidth: spec.width,
      TileCompressedData: [...encodeTileData(spec.cells)],
      TileDataFormat: 1,
    },
    tilesetId: { name: spec.tilesetName, path: tilesetResourcePath(spec.tilesetName) },
    userdefinedDepth: false,
    visible: true,
    x: 0,
    y: 0,
  };
}

const LAYERS_MARKER = '"layers":[';
const ANY_LAYER_TAG = /"\$GMR\w*Layer"/;

/**
 * Splices a tile layer into a room's top-level layer list, preserving every
 * other byte.
 *
 * Every layer record carries its own nested `"layers":[]`, so the top-level
 * array is identified as the occurrence that precedes the first layer tag.
 * A room whose first `"layers":[` came after a layer record would be
 * unrecognisable, and is refused rather than patched blind.
 */
export function spliceTileLayerIntoRoom(roomText: string, spec: TileLayerSpec): string {
  const marker = roomText.indexOf(LAYERS_MARKER);
  if (marker < 0) throw new GmAuthoringError("INVALID_ROOM", "the room declares no layer list");
  const firstTag = roomText.search(ANY_LAYER_TAG);
  if (firstTag >= 0 && firstTag < marker) {
    throw new GmAuthoringError("INVALID_ROOM", "the room's layer list could not be identified unambiguously");
  }
  if (new RegExp(`"%Name"\\s*:\\s*"${spec.layerName}"`).test(roomText)) {
    throw new GmAuthoringError("RESOURCE_EXISTS", `the room already has a layer named ${spec.layerName}`);
  }

  const arrayOpen = roomText.indexOf("[", marker);
  const record = renderGmJson(tileLayerRecord(spec)).replace(/\s*\n\s*/g, "");
  const head = roomText.slice(0, arrayOpen + 1);
  const tail = roomText.slice(arrayOpen + 1);
  // A tile layer is drawn under instances, so it goes last in the list; the
  // insertion still happens at the head, which the array's own separator
  // handling makes safe whether or not other layers follow.
  const separator = /^\s*\]/.test(tail) ? "" : ",";
  return `${head}\n    ${record}${separator}${tail}`;
}
