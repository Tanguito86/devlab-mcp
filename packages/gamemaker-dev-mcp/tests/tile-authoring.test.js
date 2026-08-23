// The tile tools are exercised against a project the GameMaker IDE itself
// wrote, so the geometry they read back -- sprite size, tile size, tile count
// -- is the real thing rather than a hand-typed guess.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { parseGmJson } from "@tanguito/devlab-gm-authoring";

const bodyOf = (file) => Buffer.from(file.afterContentBase64, "base64").toString("utf8");

const fixture = new URL("../../../fixtures/gamemaker/tile-reference/", import.meta.url);
const serverEntry = new URL("../dist/index.js", import.meta.url);
const projectPath = "TilesetReference";
const EMPTY = -2147483648;

async function treeHash(root) {
  const records = [];
  const walk = async (directory, prefix = "") => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else records.push({ path: relative, bytes: (await readFile(absolute)).toString("base64") });
    }
  };
  await walk(root);
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

async function withServer(run) {
  const root = await mkdtemp(join(tmpdir(), "gm-tiles-"));
  await cp(fixture, join(root, projectPath), { recursive: true });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(serverEntry)],
    cwd: root,
    env: { ...process.env, DEVLAB_GM_PROJECTS_DIR: root },
    stderr: "pipe",
  });
  const client = new Client({ name: "gm-tiles-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const call = async (name, args) => (await client.callTool({ name, arguments: args })).structuredContent;
    const fingerprint = (await call("gamemaker_inspect", { projectPath })).fingerprint;
    await run({ call, fingerprint, root, projectRoot: join(root, projectPath) });
  } finally {
    await client.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

test("TILES: a tileset is planned from the sprite's real geometry and nothing is written", { timeout: 30_000 }, async () => {
  await withServer(async ({ call, fingerprint, projectRoot }) => {
    const before = await treeHash(projectRoot);

    const planned = await call("gamemaker_plan_new_tileset", {
      projectPath,
      expectedProjectFingerprint: fingerprint,
      name: "ts_authored",
      spriteName: "spr_tiles",
      tileWidth: 32,
      tileHeight: 32,
    });

    assert.equal(planned.ok, true, JSON.stringify(planned.error));
    assert.equal(planned.resourceKind, "tileset");
    assert.equal(planned.resourceName, "ts_authored");
    assert.equal(planned.resourcePath, "tilesets/ts_authored/ts_authored.yy");
    assert.equal(planned.serverGate, "PLAN_ONLY");
    assert.match(planned.planHash, /^[a-f0-9]{64}$/);

    // The sprite is 64x64, so a 32x32 tile gives a 2x2 set -- exactly what the
    // IDE recorded for ts_reference in this same project.
    const created = planned.plan.files.find(({ path }) => path === "tilesets/ts_authored/ts_authored.yy");
    const record = parseGmJson(bodyOf(created));
    assert.equal(record.tile_count, 4);
    assert.equal(record.out_columns, 2);
    assert.equal(record.tileWidth, 32);
    assert.equal(record.tileHeight, 32);
    assert.deepEqual(record.spriteId, { name: "spr_tiles", path: "sprites/spr_tiles/spr_tiles.yy" });

    // Every field the IDE writes is present, and only those: compared against
    // the tileset the IDE itself produced for this same sprite and tile size.
    const ideTileset = parseGmJson(await readFile(join(projectRoot, "tilesets/ts_reference/ts_reference.yy"), "utf8"));
    assert.deepEqual(Object.keys(record).sort(), Object.keys(ideTileset).sort());

    // The .yyp and the resource order are registered alongside it.
    const touched = planned.plan.files.map(({ path }) => path).sort();
    assert.deepEqual(touched, [
      "TilesetReference.resource_order",
      "TilesetReference.yyp",
      "tilesets/ts_authored/ts_authored.yy",
    ]);

    assert.equal(await treeHash(projectRoot), before, "planning must not touch the project");
  });
});

test("TILES: a tile layer is planned against the tileset's own tile count", { timeout: 30_000 }, async () => {
  await withServer(async ({ call, fingerprint, projectRoot }) => {
    const before = await treeHash(projectRoot);

    const cells = [0, 1, 2, 3, 2, 2, 2, 2, EMPTY, EMPTY, EMPTY, EMPTY];
    const planned = await call("gamemaker_plan_tile_layer", {
      projectPath,
      expectedProjectFingerprint: fingerprint,
      roomName: "rm_reference",
      layerName: "Tiles_authored",
      tilesetName: "ts_reference",
      width: 4,
      height: 3,
      cells,
    });

    assert.equal(planned.ok, true, JSON.stringify(planned.error));
    assert.equal(planned.resourceKind, "tileLayer");
    assert.equal(planned.resourceName, "Tiles_authored");
    assert.deepEqual(planned.plan.files.map(({ path }) => path), ["rooms/rm_reference/rm_reference.yy"]);

    const body = bodyOf(planned.plan.files[0]);
    assert.match(body, /"\$GMRTileLayer":"",/);
    assert.match(body, /"SerialiseWidth":4,/);
    assert.match(body, /"SerialiseHeight":3,/);
    assert.match(body, /"TileDataFormat":1,/);
    // Row 0 is four literals, row 1 a repeat, row 2 a repeat of the blank.
    assert.match(body, /"TileCompressedData":\[4,0,1,2,3,-4,2,-4,-2147483648,\]/);
    // The layer the IDE painted is still there, untouched. It took the
    // tileset's own name, which is what the room editor does by default.
    assert.match(body, /"%Name":"ts_reference",/);

    assert.equal(await treeHash(projectRoot), before, "planning must not touch the project");
  });
});

test("TILES: bad geometry, bad indices and name collisions are refused", { timeout: 30_000 }, async () => {
  await withServer(async ({ call, fingerprint, projectRoot }) => {
    const before = await treeHash(projectRoot);
    const base = { projectPath, expectedProjectFingerprint: fingerprint };
    const layer = {
      ...base, roomName: "rm_reference", tilesetName: "ts_reference",
      layerName: "Tiles_new", width: 2, height: 2, cells: [0, 1, 2, 3],
    };

    const refusals = [
      ["a sprite that is not in the project",
        "gamemaker_plan_new_tileset", { ...base, name: "ts_x", spriteName: "spr_missing", tileWidth: 32, tileHeight: 32 }],
      ["a tile larger than its sprite",
        "gamemaker_plan_new_tileset", { ...base, name: "ts_x", spriteName: "spr_tiles", tileWidth: 128, tileHeight: 128 }],
      ["a tileset name already taken",
        "gamemaker_plan_new_tileset", { ...base, name: "ts_reference", spriteName: "spr_tiles", tileWidth: 32, tileHeight: 32 }],
      ["a cell count that disagrees with the grid",
        "gamemaker_plan_tile_layer", { ...layer, cells: [0, 1, 2] }],
      ["a tile index past the end of the tileset",
        "gamemaker_plan_tile_layer", { ...layer, cells: [0, 1, 2, 9] }],
      ["a negative index that is not the blank sentinel",
        "gamemaker_plan_tile_layer", { ...layer, cells: [0, 1, 2, -7] }],
      ["a layer name the room already uses",
        "gamemaker_plan_tile_layer", { ...layer, layerName: "ts_reference" }],
      ["a tileset that is not in the project",
        "gamemaker_plan_tile_layer", { ...layer, tilesetName: "ts_missing" }],
      ["a room that is not in the project",
        "gamemaker_plan_tile_layer", { ...layer, roomName: "rm_missing" }],
    ];

    for (const [why, name, args] of refusals) {
      const result = await call(name, args);
      assert.equal(result.ok, false, `${why} should have been refused`);
      assert.equal(typeof result.error.message, "string");
      assert.ok(result.error.message.length > 0, `${why} produced an empty message`);
      // A refusal the caller can fix must say so, and must never leak a path.
      assert.equal(result.error.recoverable, true, why);
      assert.ok(!/[A-Za-z]:\\|\/tmp\//.test(result.error.message), `${why} leaked a filesystem path`);
    }

    assert.equal(await treeHash(projectRoot), before, "a refusal must not touch the project");
  });
});
