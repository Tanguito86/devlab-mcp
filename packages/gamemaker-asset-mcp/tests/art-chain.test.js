// The whole art path across four servers: create a project, ingest an
// .aseprite, publish it APPROVED, import it as a sprite, and slice that sprite
// into a tileset. Until publishing existed the chain broke in the middle --
// ingest produced a DRAFT and nothing could register or promote it.
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const server = (name) => fileURLToPath(new URL(`../../${name}/dist/index.js`, import.meta.url));
const ASEPRITE_SOURCE = fileURLToPath(new URL("../../../fixtures/aseprite/ingest-pilot.aseprite", import.meta.url));

// CI has no Aseprite; a skip means "not exercised here", never "passed".
const aseprite = process.env.DEVLAB_ASEPRITE;
const gated = aseprite ? {} : { skip: "requires DEVLAB_ASEPRITE to point at a working Aseprite install" };

async function harness(run) {
  const root = await mkdtemp(join(tmpdir(), "art-chain-"));
  const repoRoot = join(root, "repo");
  const projects = join(root, "projects");
  const catalog = join(repoRoot, "assets/catalog/asset-catalog.json");
  await mkdir(projects, { recursive: true });
  await mkdir(join(repoRoot, "assets/catalog"), { recursive: true });
  await mkdir(join(repoRoot, "sources"), { recursive: true });
  await cp(ASEPRITE_SOURCE, join(repoRoot, "sources/tiles.aseprite"));
  await writeFile(catalog, `${JSON.stringify({ entries: [], migration: "asset-catalog-v1", schemaVersion: 1 }, null, 2)}\n`, "utf8");

  const clients = [];
  const connect = async (name, env) => {
    const transport = new StdioClientTransport({
      command: process.execPath, args: [server(name)],
      env: { ...process.env, ...env }, stderr: "pipe",
    });
    const client = new Client({ name: "art-chain", version: "1.0.0" });
    await client.connect(transport);
    clients.push(client);
    return async (tool, args = {}) => {
      const result = await client.callTool({ name: tool, arguments: args });
      const body = result.structuredContent;
      assert.ok(body, `${tool} returned no structured content: ${JSON.stringify(result.content)}`);
      return body;
    };
  };

  try {
    await run({
      root, repoRoot, projects, catalog,
      write: await connect("gamemaker-write-mcp", { DEVLAB_GM_PROJECTS_DIR: projects, DEVLAB_GM_WRITE_ALLOW: "*" }),
      read: await connect("gamemaker-dev-mcp", { DEVLAB_GM_PROJECTS_DIR: projects }),
      ingest: await connect("aseprite-ingest-mcp", {
        DEVLAB_ASEPRITE: aseprite,
        DEVLAB_ASEPRITE_SOURCE_ROOT: join(repoRoot, "sources"),
        DEVLAB_ASEPRITE_REPO_ROOT: repoRoot,
        DEVLAB_ASEPRITE_WRITE: "1",
      }),
      asset: await connect("gamemaker-asset-mcp", {
        DEVLAB_GM_PROJECTS_DIR: projects,
        DEVLAB_GM_ASSET_CATALOG: catalog,
        DEVLAB_GM_ASSET_REPO_ROOT: repoRoot,
        DEVLAB_GM_ASSET_WRITE: "1",
      }),
    });
  } finally {
    for (const client of clients) await client.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

const ok = (body, label) => {
  assert.equal(body.ok, true, `${label}: ${JSON.stringify(body.error)}`);
  return body;
};

test("ART CHAIN: an .aseprite becomes a tileset in a project created from nothing", { timeout: 300_000, ...gated }, async () => {
  await harness(async ({ read, write, ingest, asset, projects, catalog, repoRoot }) => {
    const projectPath = "ArtGame";

    ok(await write("gamemaker_create_project", { projectPath, name: "ArtGame", confirm: true, dryRun: false }), "create");

    const ingested = ok(await ingest("aseprite_ingest", {
      source: "tiles.aseprite", assetId: "game-tiles", version: "1.0.0",
    }), "ingest");
    assert.equal(ingested.catalogStatus, "DRAFT", "ingest still refuses to approve its own output");
    assert.ok(ingested.frameCount > 0);

    // Not yet in the catalog: ingest writes files, publish writes the index.
    assert.deepEqual(JSON.parse(await readFile(catalog, "utf8")).entries, []);

    const published = ok(await ingest("aseprite_publish", {
      assetId: "game-tiles", version: "1.0.0", status: "APPROVED", confirm: true, dryRun: false,
    }), "publish");
    assert.equal(published.status, "APPROVED");
    assert.equal(published.verifiedOutputs, ingested.frameCount, "every frame is re-verified before approval");

    const indexed = JSON.parse(await readFile(catalog, "utf8"));
    assert.equal(indexed.entries.length, 1);
    assert.equal(indexed.entries[0].status, "APPROVED");
    // The promotion is attributable.
    const log = (await readFile(join(repoRoot, "assets/catalog/approvals.jsonl"), "utf8")).trim();
    assert.match(log, /"by":"aseprite-ingest-mcp"/);

    const inspected = ok(await read("gamemaker_inspect", { projectPath }), "inspect");
    const planImport = ok(await asset("asset_plan_import", {
      projectPath, expectedProjectFingerprint: inspected.fingerprint,
      assetId: "game-tiles", assetVersion: "1.0.0", resourceName: "spr_tiles",
      transactionId: "art-chain-import",
    }), "plan import");

    ok(await asset("asset_apply_import", {
      projectPath, expectedProjectFingerprint: inspected.fingerprint,
      assetId: "game-tiles", assetVersion: "1.0.0", resourceName: "spr_tiles",
      transactionId: "art-chain-import", planHash: planImport.planHash,
      bindingHash: planImport.bindingHash, confirm: true, dryRun: false,
    }), "apply import");

    // The .yyp survived having its first-ever resource spliced in.
    const yyp = await readFile(join(projects, projectPath, "ArtGame.yyp"), "utf8");
    assert.ok(!/\[\s*,/.test(yyp), "the project file has a leading comma in an array");
    assert.doesNotThrow(() => JSON.parse(yyp.replace(/,(\s*[}\]])/g, "$1")));

    const withSprite = ok(await read("gamemaker_inspect", { projectPath }), "re-inspect");
    assert.ok(withSprite.files.some(({ path }) => path === "sprites/spr_tiles/spr_tiles.yy"), "the sprite reached the project");

    // And the tileset tool, which was unusable on a fresh project until now,
    // has something to slice.
    const tileset = ok(await read("gamemaker_plan_new_tileset", {
      projectPath, expectedProjectFingerprint: withSprite.fingerprint,
      name: "ts_game", spriteName: "spr_tiles", tileWidth: 8, tileHeight: 8,
    }), "plan tileset");
    ok(await write("gamemaker_apply", {
      projectPath, plan: tileset.plan, planHash: tileset.planHash, confirm: true, dryRun: false,
    }), "apply tileset");

    const final = ok(await read("gamemaker_inspect", { projectPath }), "final inspect");
    assert.ok(final.files.some(({ path }) => path === "tilesets/ts_game/ts_game.yy"));
  });
});

test("ART CHAIN: a DRAFT asset still cannot be imported", { timeout: 300_000, ...gated }, async () => {
  await harness(async ({ read, write, ingest, asset }) => {
    const projectPath = "DraftGame";
    ok(await write("gamemaker_create_project", { projectPath, name: "DraftGame", confirm: true, dryRun: false }), "create");
    ok(await ingest("aseprite_ingest", { source: "tiles.aseprite", assetId: "draft-tiles", version: "1.0.0" }), "ingest");
    ok(await ingest("aseprite_publish", {
      assetId: "draft-tiles", version: "1.0.0", status: "DRAFT", confirm: true, dryRun: false,
    }), "publish draft");

    const inspected = ok(await read("gamemaker_inspect", { projectPath }), "inspect");
    const refused = await asset("asset_plan_import", {
      projectPath, expectedProjectFingerprint: inspected.fingerprint,
      assetId: "draft-tiles", assetVersion: "1.0.0", resourceName: "spr_draft",
      transactionId: "draft-import",
    });
    assert.equal(refused.ok, false, "a DRAFT asset must not be importable");
    assert.match(refused.error.code, /ASSET_NOT_APPROVED/);
  });
});
