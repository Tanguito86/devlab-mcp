// Builds FORTYTWO from nothing, over the MCP servers.
//
//   node examples/fortytwo/build-fortytwo.mjs --out H:/GameMaker-Projects [--clean] [--test] [--run]
//
//   --clean rebuild over an existing Fortytwo: the project directory and the
//           write tier's creation ledger for it, and nothing else
//   --test  fly the autopilot instead of the keyboard, and assert the outcome
//   --run   compile and launch with Igor when the build finishes
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");

// examples/ is not a workspace package, so the MCP SDK is resolved from one.
const requireFromPackage = createRequire(join(REPO, "packages/gamemaker-dev-mcp/package.json"));
const sdk = async (subpath) => import(pathToFileURL(requireFromPackage.resolve(subpath)).href);
const { Client } = await sdk("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = await sdk("@modelcontextprotocol/sdk/client/stdio.js");

const PROJECT = "Fortytwo";
const ROOM_W = 384;
const ROOM_H = 448;

const flag = (name) => process.argv.includes(`--${name}`);
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const ASEPRITE = process.env.DEVLAB_ASEPRITE ?? "C:/Program Files/Aseprite/Aseprite.exe";
const RUNTIME = process.env.DEVLAB_GM_RUNTIME ?? "C:/ProgramData/GameMakerStudio2/Cache/runtimes/runtime-2024.14.3.260";
const PROJECT_TOOL = process.env.DEVLAB_GM_PROJECT_TOOL ?? "H:/GameMaker-LTS2026/packages/gm-tools/project-tool-win-x64/ProjectTool.exe";
const GM_USER = process.env.DEVLAB_GM_USER_DIR ?? "C:/Users/Deposito/AppData/Roaming/GameMakerStudio2/divididoshastalaspelotas_4974629";

const outRoot = resolve(option("out", join(REPO, "output", "fortytwo")));
const testing = flag("test");
const runId = Math.random().toString(36).slice(2, 10);
const workRoot = join(outRoot, ".ft-work");
const catalogRoot = join(workRoot, "catalog");
const sourceRoot = join(workRoot, "aseprite");

const posix = (path) => path.split("\\").join("/");
const gml = (name) => readFileSync(join(HERE, "gml", name), "utf8");
const step = (label, detail = "") => console.log(`  ${label.padEnd(20)} ${detail}`);

console.log(`FORTYTWO -> ${join(outRoot, PROJECT)}${testing ? "   (autopilot)" : ""}`);

// The write tier records every creation in a ledger outside the project, so
// deleting the directory alone reads as a half-finished create and is refused.
const projectDir = join(outRoot, PROJECT);
const ledgerDir = join(outRoot, ".devlab-gamemaker-mcp-write", "create-projects");
const ledgers = existsSync(ledgerDir) ? readdirSync(ledgerDir) : [];
if (flag("clean")) {
  if (existsSync(projectDir)) rmSync(projectDir, { recursive: true, force: true, maxRetries: 10 });
  for (const entry of ledgers) rmSync(join(ledgerDir, entry), { force: true });
} else if (existsSync(projectDir) || ledgers.length) {
  console.error(`${projectDir} already exists. Pass --clean to rebuild it.`);
  process.exit(1);
}

rmSync(workRoot, { recursive: true, force: true, maxRetries: 10 });
mkdirSync(sourceRoot, { recursive: true });
mkdirSync(join(catalogRoot, "assets/catalog"), { recursive: true });
writeFileSync(
  join(catalogRoot, "assets/catalog/asset-catalog.json"),
  `${JSON.stringify({ entries: [], migration: "asset-catalog-v1", schemaVersion: 1 }, null, 2)}\n`,
  "utf8",
);

console.log("art");
step("aseprite", execFileSync(ASEPRITE, [
  "-b", "--script-param", `outdir=${posix(sourceRoot)}`, "--script", join(HERE, "art/fortytwo-art.lua"),
], { encoding: "utf8", windowsHide: true, timeout: 120_000 }).trim());

const clients = [];
async function connect(pkg, env) {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [join(REPO, "packages", pkg, "dist/index.js")],
    env: { ...process.env, ...env }, stderr: "pipe",
  });
  const client = new Client({ name: "fortytwo-build", version: "1.0.0" });
  await client.connect(transport);
  transport.stderr?.on("data", (chunk) => process.stderr.write(`[${pkg}] ${chunk}`));
  clients.push(client);
  return async (tool, args = {}) => {
    const result = await client.callTool({ name: tool, arguments: args });
    const body = result.structuredContent;
    if (!body) throw new Error(`${tool}: ${JSON.stringify(result.content)}`);
    if (body.ok === false) throw new Error(`${tool} refused: ${body.error.code} -- ${body.error.message}`);
    return body;
  };
}

try {
  mkdirSync(outRoot, { recursive: true });
  const write = await connect("gamemaker-write-mcp", { DEVLAB_GM_PROJECTS_DIR: outRoot, DEVLAB_GM_WRITE_ALLOW: "*" });
  const read = await connect("gamemaker-dev-mcp", { DEVLAB_GM_PROJECTS_DIR: outRoot });
  const ingest = await connect("aseprite-ingest-mcp", {
    DEVLAB_ASEPRITE: ASEPRITE,
    DEVLAB_ASEPRITE_SOURCE_ROOT: sourceRoot,
    DEVLAB_ASEPRITE_REPO_ROOT: catalogRoot,
    DEVLAB_ASEPRITE_WRITE: "1",
  });
  const asset = await connect("gamemaker-asset-mcp", {
    DEVLAB_GM_PROJECTS_DIR: outRoot,
    DEVLAB_GM_ASSET_CATALOG: join(catalogRoot, "assets/catalog/asset-catalog.json"),
    DEVLAB_GM_ASSET_REPO_ROOT: catalogRoot,
    DEVLAB_GM_ASSET_WRITE: "1",
  });

  const fingerprint = async () => (await read("gamemaker_inspect", { projectPath: PROJECT })).fingerprint;
  async function author(tool, args) {
    const plan = await read(tool, { projectPath: PROJECT, expectedProjectFingerprint: await fingerprint(), ...args });
    await write("gamemaker_apply", { projectPath: PROJECT, plan: plan.plan, planHash: plan.planHash, confirm: true, dryRun: false });
    return plan;
  }

  console.log("project");
  await write("gamemaker_create_project", { projectPath: PROJECT, name: PROJECT, confirm: true, dryRun: false });
  step("create_project", `${PROJECT}.yyp`);

  console.log("sprites");
  const sprites = [
    ["ft-player", "spr_player", "spr_player.aseprite", "centre"],
    ["ft-enemy", "spr_enemy", "spr_enemy.aseprite", "centre"],
    ["ft-shot", "spr_shot", "spr_shot.aseprite", "centre"],
    ["ft-eshot", "spr_eshot", "spr_eshot.aseprite", "centre"],
    ["ft-boom", "spr_boom", "spr_boom.aseprite", "centre"],
    // The sea is tiled from its corner in Draw Begin, not centred on a point.
    ["ft-sea", "spr_sea", "spr_sea.aseprite", "top-left"],
  ];
  for (const [assetId, resourceName, file, origin] of sprites) {
    await ingest("aseprite_ingest", { source: file, assetId, version: "1.0.0", origin });
    await ingest("aseprite_publish", { assetId, version: "1.0.0", status: "APPROVED", confirm: true, dryRun: false });
    const transactionId = `ft-${assetId}-${runId}`;
    const before = await fingerprint();
    const plan = await asset("asset_plan_import", {
      projectPath: PROJECT, expectedProjectFingerprint: before,
      assetId, assetVersion: "1.0.0", resourceName, transactionId,
    });
    await asset("asset_apply_import", {
      projectPath: PROJECT, expectedProjectFingerprint: before,
      assetId, assetVersion: "1.0.0", resourceName, transactionId,
      planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, dryRun: false,
    });
    step(resourceName, `from ${assetId}`);
  }

  console.log("resources");
  await author("gamemaker_plan_new_script", { name: "scr_ft", gml: gml("scr_ft.gml") });
  step("scr_ft", "waves, paths, scoring");

  await author("gamemaker_plan_new_script", { name: "scr_ft_pilot", gml: gml("scr_ft_pilot.gml") });
  step("scr_ft_pilot", "keyboard and autopilot");

  await author("gamemaker_plan_new_script", {
    name: "scr_ft_testing",
    gml: `// Written by build-fortytwo.mjs. --test flies the autopilot.\nfunction ft_testing() {\n  return ${testing};\n}\n`,
  });
  step("scr_ft_testing", `ft_testing() -> ${testing}`);

  const actors = [
    ["obj_shot", "spr_shot", "obj_shot_create.gml", "obj_shot_step.gml"],
    ["obj_eshot", "spr_eshot", "obj_eshot_create.gml", "obj_eshot_step.gml"],
    ["obj_boom", "spr_boom", "obj_boom_create.gml", "obj_boom_step.gml"],
    ["obj_enemy", "spr_enemy", "obj_enemy_create.gml", "obj_enemy_step.gml"],
  ];
  for (const [name, spriteName, createGml, stepGml] of actors) {
    await author("gamemaker_plan_new_object", {
      name, spriteName,
      events: [
        { event: "create", gml: gml(createGml) },
        { event: "step", gml: gml(stepGml) },
      ],
    });
    step(name, spriteName);
  }

  await author("gamemaker_plan_new_object", {
    name: "obj_player", spriteName: "spr_player",
    events: [
      { event: "create", gml: gml("obj_player_create.gml") },
      { event: "step", gml: gml("obj_player_step.gml") },
      { event: "draw", gml: gml("obj_player_draw.gml") },
    ],
  });
  step("obj_player", "move, fire, roll");

  await author("gamemaker_plan_new_object", {
    name: "obj_game",
    events: [
      { event: "create", gml: gml("obj_game_create.gml") },
      { event: "step", gml: gml("obj_game_step.gml") },
      { event: "draw", gml: gml("obj_game_draw.gml") },
      { event: "draw", eventNum: 64, gml: gml("obj_game_drawgui.gml") },
    ],
  });
  step("obj_game", "waves, score, HUD");

  await author("gamemaker_plan_new_room", {
    name: "rm_ft", width: ROOM_W, height: ROOM_H,
    instances: [{ objectName: "obj_game", x: 0, y: 0 }],
  });
  step("rm_ft", `${ROOM_W}x${ROOM_H}`);

  const final = await read("gamemaker_inspect", { projectPath: PROJECT });
  console.log(`\nbuilt: ${final.fileCount} files`);
} finally {
  for (const client of clients) await client.close().catch(() => {});
}

if (flag("run")) {
  console.log("\nigor");
  const cache = join(workRoot, "cache");
  const temp = join(workRoot, "temp");
  mkdirSync(cache, { recursive: true });
  mkdirSync(temp, { recursive: true });
  let out = "";
  let code = 0;
  try {
    out = execFileSync(`${RUNTIME}/bin/igor/windows/x64/Igor.exe`, [
      `--project=${join(outRoot, PROJECT, `${PROJECT}.yyp`)}`,
      `--rp=${RUNTIME}`, `--user=${GM_USER}`, `--projectool=${PROJECT_TOOL}`,
      "--runtime=VM", `--cache=${cache}`, `--temp=${temp}`, "--consoleRedirect",
      "--", "windows", "Run",
    ], { encoding: "utf8", timeout: 900_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    out = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    code = error.status ?? -1;
  }
  for (const line of out.split(/\r?\n/)) {
    if (/^\s*Error\s*:|FT /.test(line)) console.log(`  ${line.trim()}`);
  }
  console.log(`\nigor exit: ${code}`);

  if (testing) {
    const field = (name) => Number((new RegExp(`FT (?:CLEAR|OVER)[^\\n]*?${name}=(\\d+)`).exec(out) ?? [])[1] ?? 0);
    const cleared = /FT CLEAR/.test(out);
    console.log(`autopilot: cleared=${cleared} score=${field("score")} kills=${field("kills")}`
      + ` formations=${field("bonuses")} rolls=${field("rolls")} lives_lost=${field("lost")}`);
    // The pilot is not meant to play well. It is meant to prove the systems
    // connect: input moves the plane, shots kill, kills score, formations pay,
    // and the roll fires. It flies a clean run, so the death and respawn path
    // is NOT covered by this -- see the README.
    if (!cleared || field("kills") < 10 || field("bonuses") < 1 || field("rolls") < 1) {
      console.log("FAILED: the run did not finish with kills, a formation bonus and at least one roll");
      process.exitCode = 1;
    }
  } else if (code !== 0) {
    process.exitCode = 1;
  }
}
