#!/usr/bin/env node
// @tanguito/gamemaker-dev-mcp — doctor
// Validates: build output present, stdio server starts, exactly three
// read-only tools are advertised, and no resource/prompt surface exists.
// Configuration is reported but never required: the server is designed to
// start and answer tools/list without DEVLAB_GM_PROJECTS_DIR.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const binPath = join(packageRoot, "dist", "index.js");
const EXPECTED_TOOLS = [
  "gamemaker_inspect",
  "gamemaker_plan",
  "gamemaker_plan_new_object",
  "gamemaker_plan_new_room",
  "gamemaker_plan_new_script",
  "gamemaker_plan_new_tileset",
  "gamemaker_plan_place_instance",
  "gamemaker_plan_tile_layer",
  "gamemaker_status",
];

const ok = [];
const warn = [];
const fail = [];

function check(label, pass, detail = "") {
  if (pass) ok.push(label);
  else fail.push(`${label}${detail ? "  → " + detail : ""}`);
}

// 1. Build output present.
let binText = "";
try {
  binText = readFileSync(binPath, "utf8");
  check("dist/index.js present", true);
} catch (error) {
  check("dist/index.js present", false, error.message);
}
check("bin declares a node shebang", binText.startsWith("#!/usr/bin/env node"));

for (const file of ["server.js", "core.js", "contracts.js"]) {
  try {
    readFileSync(join(packageRoot, "dist", file), "utf8");
    check(`dist/${file} present`, true);
  } catch (error) {
    check(`dist/${file} present`, false, error.message);
  }
}

// 2. Configuration is informational, never fatal.
const configured = process.env.DEVLAB_GM_PROJECTS_DIR;
if (configured) ok.push("DEVLAB_GM_PROJECTS_DIR is set");
else warn.push("DEVLAB_GM_PROJECTS_DIR is not set; tool calls will fail closed with GM_CONFIG_REQUIRED");

// 3. Live stdio handshake against the built bin.
if (fail.length === 0) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [binPath],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    stderr: "pipe",
  });
  const client = new Client({ name: "gamemaker-dev-mcp-doctor", version: "0.1.0" });
  try {
    await client.connect(transport);
    check("stdio server starts and completes the MCP handshake", true);

    const info = client.getServerVersion();
    check("server identifies as gamemaker-dev-mcp", info?.name === "gamemaker-dev-mcp", `got ${info?.name}`);

    const names = (await client.listTools()).tools.map(({ name }) => name).sort();
    check(`advertises exactly ${EXPECTED_TOOLS.length} tools`, names.length === EXPECTED_TOOLS.length, `got ${names.length}`);
    check("tool names match the governed read-only set", names.join(",") === EXPECTED_TOOLS.join(","), names.join(",") || "none");

    for (const surface of [["resources", () => client.listResources()], ["prompts", () => client.listPrompts()]]) {
      const [label, list] = surface;
      let exposed = true;
      try { await list(); } catch { exposed = false; }
      check(`no ${label} surface is exposed`, !exposed);
    }
  } catch (error) {
    fail.push(`stdio handshake failed  → ${error.message}`);
  } finally {
    await client.close().catch(() => undefined);
  }
} else {
  warn.push("skipped the stdio handshake because the build output is incomplete");
}

// ════════════════════════════════════════
console.log("@tanguito/gamemaker-dev-mcp Doctor");
console.log("════════════════════════════════════");
for (const line of ok) console.log(`  ✅ ${line}`);
for (const line of warn) console.log(`  ⚠️ ${line}`);
for (const line of fail) console.log(`  ❌ ${line}`);

if (fail.length > 0) {
  console.log(`\nResult: 🔴 ${fail.length} failure(s)`);
  process.exit(1);
}
console.log(`\nResult: Ready ✅ (${ok.length} checks passed${warn.length ? `, ${warn.length} warning(s)` : ""})`);
