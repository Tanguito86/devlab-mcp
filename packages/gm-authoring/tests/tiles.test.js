import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  authorTileLayer,
  authorTileset,
  decodeTileData,
  EMPTY_TILE,
  encodeTileData,
  MAX_TILE_LAYER_CELLS,
  parseGmJson,
  renderTilesetYy,
  spliceTileLayerIntoRoom,
  tilesetLayout,
} from "../dist/index.js";

/**
 * Ground truth: a tileset and a painted tile layer written by the GameMaker IDE
 * itself. Both records resisted derivation -- the empty-cell sentinel and the
 * fact that a tileset and a room layer use different payload shapes are not
 * things black-box probing produced.
 */
const REF = (name) => fileURLToPath(new URL(`../../../fixtures/gamemaker/tile-reference/${name}`, import.meta.url));
const referenceTileset = () => parseGmJson(readFileSync(REF("tilesets/ts_reference/ts_reference.yy"), "utf8"));
const referenceRoom = () => parseGmJson(readFileSync(REF("rooms/rm_reference/rm_reference.yy"), "utf8"));
const referenceTileLayer = () => referenceRoom().layers.find((layer) => layer.resourceType === "GMRTileLayer");

const IDENTITY = Object.freeze({ projectName: "TilesetReference", projectFile: "TilesetReference.yyp" });
const GEOMETRY = Object.freeze({
  spriteName: "spr_tiles", spriteWidth: 64, spriteHeight: 64, tileWidth: 32, tileHeight: 32,
});

test("REFERENCE: the IDE's tile layer decodes to the pattern that was painted", () => {
  const layer = referenceTileLayer();
  const { SerialiseWidth: w, SerialiseHeight: h, TileCompressedData: data, TileDataFormat: format } = layer.tiles;
  assert.equal(format, 1);
  assert.deepEqual(data, [4, 1, 3, 2, 2, -4, EMPTY_TILE, -4, 1, -52, EMPTY_TILE]);

  const cells = decodeTileData(data, w * h);
  assert.equal(cells.length, 64);
  // Row 0: four painted tiles, then blanks. Row 1: a run of four. Rest blank.
  assert.deepEqual([...cells.slice(0, 8)], [1, 3, 2, 2, EMPTY_TILE, EMPTY_TILE, EMPTY_TILE, EMPTY_TILE]);
  assert.deepEqual([...cells.slice(8, 16)], [1, 1, 1, 1, EMPTY_TILE, EMPTY_TILE, EMPTY_TILE, EMPTY_TILE]);
  assert.equal(cells.slice(16).every((cell) => cell === EMPTY_TILE), true);
});

test("REFERENCE: re-encoding the IDE's cells round-trips to the same cells", () => {
  const layer = referenceTileLayer();
  const cells = decodeTileData(layer.tiles.TileCompressedData, layer.tiles.SerialiseWidth * layer.tiles.SerialiseHeight);
  const reencoded = encodeTileData(cells);
  assert.deepEqual([...decodeTileData(reencoded, cells.length)], [...cells]);
});

test("REFERENCE: our tileset record matches the one the IDE wrote", () => {
  const mine = parseGmJson(renderTilesetYy("ts_reference", IDENTITY, GEOMETRY));
  const theirs = referenceTileset();
  assert.deepEqual(Object.keys(mine).sort(), Object.keys(theirs).sort());
  for (const key of Object.keys(theirs)) {
    assert.deepEqual(mine[key], theirs[key], `field ${key} differs from the IDE's record`);
  }
});

test("REFERENCE: a tileset carries the uncompressed payload, a layer the compressed one", () => {
  const tileset = referenceTileset();
  // These two shapes differ, and mixing them fails the whole project load.
  assert.deepEqual(tileset.macroPageTiles, { SerialiseHeight: 0, SerialiseWidth: 0, TileSerialiseData: [] });
  assert.equal("TileDataFormat" in tileset.macroPageTiles, false);
  assert.equal("TileCompressedData" in tileset.macroPageTiles, false);

  const layer = referenceTileLayer();
  assert.equal("TileCompressedData" in layer.tiles, true);
  assert.equal(layer.tiles.TileDataFormat, 1);
});

test("ENCODING: literals, repeats and mixtures all round-trip", () => {
  const cases = [
    [0],
    [0, 1, 2, 3],
    [5, 5, 5, 5, 5],
    [EMPTY_TILE, EMPTY_TILE, 1, EMPTY_TILE],
    [1, 1, 2, 2, 2, 3, 4, 4, 4, 4, 5],
    Array.from({ length: 300 }, (_, index) => index % 7),
    Array.from({ length: 300 }, () => EMPTY_TILE),
  ];
  for (const cells of cases) {
    const stream = encodeTileData(cells);
    assert.deepEqual([...decodeTileData(stream, cells.length)], cells, JSON.stringify(cells.slice(0, 8)));
  }
});

test("ENCODING: a long uniform field compresses rather than listing every cell", () => {
  const cells = Array.from({ length: 4096 }, () => EMPTY_TILE);
  const stream = encodeTileData(cells);
  assert.deepEqual([...stream], [-4096, EMPTY_TILE]);
});

test("ENCODING: output is deterministic, which the plan hash depends on", () => {
  const cells = [1, 1, 2, EMPTY_TILE, EMPTY_TILE, EMPTY_TILE, 3];
  assert.deepEqual([...encodeTileData(cells)], [...encodeTileData(cells)]);
});

test("DECODING: malformed streams fail closed", () => {
  assert.throws(() => decodeTileData([0, 1], 1), (error) => error.code === "INVALID_TILE_DATA");
  assert.throws(() => decodeTileData([4, 1, 2], 4), (error) => error.code === "INVALID_TILE_DATA");
  assert.throws(() => decodeTileData([-3], 3), (error) => error.code === "INVALID_TILE_DATA");
  assert.throws(() => decodeTileData([2, 1, 2], 4), (error) => error.code === "INVALID_TILE_DATA");
  assert.throws(() => decodeTileData([-9, 1], 4), (error) => error.code === "INVALID_TILE_DATA");
});

test("LAYOUT: the tile grid is derived the way the IDE derives it", () => {
  assert.deepEqual(tilesetLayout(GEOMETRY), { columns: 2, rows: 2, tileCount: 4 });
  assert.deepEqual(tilesetLayout({ ...GEOMETRY, spriteWidth: 128, spriteHeight: 96 }), { columns: 4, rows: 3, tileCount: 12 });
  assert.equal(referenceTileset().tile_count, tilesetLayout(GEOMETRY).tileCount);
  assert.equal(referenceTileset().out_columns, tilesetLayout(GEOMETRY).columns);
});

test("LAYOUT: impossible geometry is refused", () => {
  for (const bad of [{ tileWidth: 0 }, { tileHeight: -1 }, { tileWidth: 128 }, { spriteWidth: 0 }]) {
    assert.throws(() => tilesetLayout({ ...GEOMETRY, ...bad }), (error) => error.code === "INVALID_TILE_DATA", JSON.stringify(bad));
  }
});

const project = (overrides = {}) => ({
  identity: IDENTITY,
  yyp: [
    "{", '  "$GMProject":"v1",', '  "%Name":"TilesetReference",', '  "resources":[',
    '    {"id":{"name":"spr_tiles","path":"sprites/spr_tiles/spr_tiles.yy",},},',
    '    {"id":{"name":"rm_reference","path":"rooms/rm_reference/rm_reference.yy",},}',
    "  ],", '  "ResourceOrderSettings":[],', '  "RoomOrderNodes":[],', '  "resourceType":"GMProject"', "}",
  ].join("\n"),
  existingFiles: ["sprites/spr_tiles/spr_tiles.yy", "rooms/rm_reference/rm_reference.yy"],
  existingReferences: ["sprites/spr_tiles/spr_tiles.yy", "rooms/rm_reference/rm_reference.yy"],
  ...overrides,
});

test("TILESET PLAN: creates the resource and registers it", () => {
  const authored = authorTileset(project(), { name: "ts_new", ...GEOMETRY });
  assert.equal(authored.resourceKind, "tileset");
  assert.deepEqual(authored.files.map(({ path }) => path), ["tilesets/ts_new/ts_new.yy", "TilesetReference.yyp"]);
  const yyp = authored.files.find(({ path }) => path.endsWith(".yyp")).content;
  assert.ok(yyp.includes("tilesets/ts_new/ts_new.yy"));
  assert.ok(yyp.includes("spr_tiles"), "existing resources must survive the splice");
});

test("TILESET PLAN: a sprite the project lacks is refused", () => {
  assert.throws(
    () => authorTileset(project(), { name: "ts_new", ...GEOMETRY, spriteName: "spr_missing" }),
    (error) => error.code === "INVALID_RESOURCE_NAME",
  );
});

const roomProject = (overrides = {}) => project({
  roomText: readFileSync(REF("rooms/rm_reference/rm_reference.yy"), "utf8"),
  existingFiles: ["sprites/spr_tiles/spr_tiles.yy", "rooms/rm_reference/rm_reference.yy", "tilesets/ts_reference/ts_reference.yy"],
  existingReferences: ["sprites/spr_tiles/spr_tiles.yy", "rooms/rm_reference/rm_reference.yy", "tilesets/ts_reference/ts_reference.yy"],
  ...overrides,
});

const layerRequest = (overrides = {}) => ({
  roomName: "rm_reference", layerName: "Tiles_new", tilesetName: "ts_reference",
  width: 8, height: 8, cells: Array.from({ length: 64 }, () => EMPTY_TILE),
  tileWidth: 32, tileHeight: 32, tilesetTileCount: 4,
  ...overrides,
});

test("TILE LAYER PLAN: patches the room as text and preserves every other layer", () => {
  const authored = authorTileLayer(roomProject(), layerRequest({
    cells: [0, 1, 2, 3, ...Array.from({ length: 60 }, () => EMPTY_TILE)],
  }));
  assert.equal(authored.resourceKind, "tileLayer");
  assert.deepEqual(authored.files.map(({ path, action }) => [path, action]), [["rooms/rm_reference/rm_reference.yy", "modify"]]);

  const patched = parseGmJson(authored.files[0].content);
  const tileLayers = patched.layers.filter((layer) => layer.resourceType === "GMRTileLayer");
  assert.equal(tileLayers.length, 2, "the IDE's own tile layer must survive");
  assert.equal(patched.layers.some((layer) => layer.resourceType === "GMRInstanceLayer"), true);
  assert.equal(patched.layers.some((layer) => layer.resourceType === "GMRBackgroundLayer"), true);

  const added = tileLayers.find((layer) => layer.name === "Tiles_new");
  assert.equal(added.$GMRTileLayer, "");
  assert.equal(added.tiles.TileDataFormat, 1);
  assert.deepEqual(added.tilesetId, { name: "ts_reference", path: "tilesets/ts_reference/ts_reference.yy" });
  assert.deepEqual([...decodeTileData(added.tiles.TileCompressedData, 64).slice(0, 4)], [0, 1, 2, 3]);
});

test("TILE LAYER PLAN: cell count, tile range and duplicate names are checked", () => {
  assert.throws(() => authorTileLayer(roomProject(), layerRequest({ cells: [0] })), (error) => error.code === "INVALID_TILE_DATA");
  assert.throws(
    () => authorTileLayer(roomProject(), layerRequest({ cells: [4, ...Array.from({ length: 63 }, () => EMPTY_TILE)] })),
    (error) => error.code === "INVALID_TILE_DATA",
    "tile index 4 is out of range for a four-tile set",
  );
  assert.throws(
    () => authorTileLayer(roomProject(), layerRequest({ layerName: "ts_reference" })),
    (error) => error.code === "RESOURCE_EXISTS",
    "the IDE named its layer after the tileset",
  );
});

test("TILE LAYER PLAN: a missing room, body or tileset is refused", () => {
  assert.throws(() => authorTileLayer(roomProject(), layerRequest({ roomName: "rm_missing" })), (error) => error.code === "INVALID_ROOM");
  assert.throws(() => authorTileLayer(roomProject({ roomText: undefined }), layerRequest()), (error) => error.code === "INVALID_ROOM");
  assert.throws(() => authorTileLayer(roomProject(), layerRequest({ tilesetName: "ts_missing" })), (error) => error.code === "INVALID_TILE_DATA");
});

test("SPLICE: an ambiguous room is refused rather than patched blind", () => {
  const spec = { layerName: "Tiles_x", tilesetName: "ts_reference", width: 1, height: 1, cells: [0], tileWidth: 32, tileHeight: 32 };
  assert.throws(() => spliceTileLayerIntoRoom("{}", spec), (error) => error.code === "INVALID_ROOM");
  // A layer record before the top-level list would make the target unknowable.
  assert.throws(
    () => spliceTileLayerIntoRoom('{"x":[{"$GMRTileLayer":""}],"layers":[]}', spec),
    (error) => error.code === "INVALID_ROOM",
  );
});

test("LIMITS: an oversized layer is refused", () => {
  const side = 2048;
  assert.throws(
    () => authorTileLayer(roomProject(), layerRequest({
      width: side, height: side, cells: Array.from({ length: side * side }, () => EMPTY_TILE),
    })),
    (error) => error.code === "LIMIT_EXCEEDED",
  );
  assert.ok(MAX_TILE_LAYER_CELLS < side * side);
});
