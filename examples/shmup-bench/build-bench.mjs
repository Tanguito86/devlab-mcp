// Builds and runs the bullet-count benchmark, over the MCP servers.
//
//   node examples/shmup-bench/build-bench.mjs --out H:/GameMaker-Projects --clean --run
//
// Answers one question with a number instead of an opinion: how many bullets
// GameMaker carries inside a 60 fps frame, and what representing them as
// instances rather than structs costs.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");

const requireFromPackage = createRequire(join(REPO, "packages/gamemaker-dev-mcp/package.json"));
const sdk = async (subpath) => import(pathToFileURL(requireFromPackage.resolve(subpath)).href);
const { Client } = await sdk("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = await sdk("@modelcontextprotocol/sdk/client/stdio.js");

const PROJECT = "ShmupBench";
// A classic vertical arcade resolution, so the numbers mean something for the
// game this is meant to decide.
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

const outRoot = resolve(option("out", join(REPO, "output", "shmup-bench")));
const runId = Math.random().toString(36).slice(2, 10);
const workRoot = join(outRoot, ".bench-work");
const catalogRoot = join(workRoot, "catalog");
const sourceRoot = join(workRoot, "aseprite");

const posix = (path) => path.split("\\").join("/");
const gml = (name) => readFileSync(join(HERE, "gml", name), "utf8");
const step = (label, detail = "") => console.log(`  ${label.padEnd(28)} ${detail}`);

console.log(`SHMUP BENCH -> ${join(outRoot, PROJECT)}`);

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
  "-b", "--script-param", `outdir=${posix(sourceRoot)}`, "--script", join(HERE, "art/bullet.lua"),
], { encoding: "utf8", windowsHide: true, timeout: 120_000 }).trim());

const clients = [];
async function connect(pkg, env) {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [join(REPO, "packages", pkg, "dist/index.js")],
    env: { ...process.env, ...env }, stderr: "pipe",
  });
  const client = new Client({ name: "shmup-bench", version: "1.0.0" });
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

  await ingest("aseprite_ingest", { source: "spr_bullet.aseprite", assetId: "bench-bullet", version: "1.0.0", origin: "centre" });
  await ingest("aseprite_publish", { assetId: "bench-bullet", version: "1.0.0", status: "APPROVED", confirm: true, dryRun: false });
  const before = await fingerprint();
  const plan = await asset("asset_plan_import", {
    projectPath: PROJECT, expectedProjectFingerprint: before,
    assetId: "bench-bullet", assetVersion: "1.0.0", resourceName: "spr_bullet", transactionId: `bench-bullet-${runId}`,
  });
  await asset("asset_apply_import", {
    projectPath: PROJECT, expectedProjectFingerprint: before,
    assetId: "bench-bullet", assetVersion: "1.0.0", resourceName: "spr_bullet", transactionId: `bench-bullet-${runId}`,
    planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, dryRun: false,
  });
  step("spr_bullet", "8x8, centre origin");

  await author("gamemaker_plan_new_script", { name: "scr_bench", gml: gml("scr_bench.gml") });
  step("scr_bench", "harness, ladder and reporting");

  await author("gamemaker_plan_new_object", {
    name: "obj_bullet", spriteName: "spr_bullet",
    events: [
      { event: "create", gml: gml("obj_bullet_create.gml") },
      { event: "step", gml: gml("obj_bullet_step.gml") },
    ],
  });
  step("obj_bullet", "one object per bullet");

  await author("gamemaker_plan_new_object", {
    name: "obj_bench",
    events: [
      { event: "create", gml: gml("obj_bench_create.gml") },
      { event: "step", eventNum: 1, gml: gml("obj_bench_beginstep.gml") },
      { event: "step", gml: gml("obj_bench_step.gml") },
      { event: "draw", gml: gml("obj_bench_draw.gml") },
      { event: "draw", eventNum: 64, gml: gml("obj_bench_drawgui.gml") },
    ],
  });
  step("obj_bench", "controller");

  await author("gamemaker_plan_new_room", {
    name: "rm_bench", width: ROOM_W, height: ROOM_H,
    instances: [{ objectName: "obj_bench", x: 0, y: 0 }],
  });
  step("rm_bench", `${ROOM_W}x${ROOM_H}`);

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
    ], { encoding: "utf8", timeout: 1_800_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    out = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    code = error.status ?? -1;
  }
  for (const line of out.split(/\r?\n/)) {
    if (/^\s*Error\s*:|BENCH /.test(line)) console.log(`  ${line.trim()}`);
  }
  console.log(`\nigor exit: ${code}`);
  if (!/BENCH DONE/.test(out)) {
    console.log("the run did not finish; the numbers above are incomplete");
    process.exitCode = 1;
  }
}
