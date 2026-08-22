#!/usr/bin/env node
// @tanguito/gamemaker-asset-mcp — doctor
// Validates: build output present, stdio server starts, exactly the five asset
// tools are advertised with honest annotations, no build-tier or write-tier
// tool leaks in, and no resource/prompt surface exists. Starts no compiler.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const binPath = join(packageRoot, "dist", "index.js");
const EXPECTED_TOOLS = ["asset_apply_import", "asset_inspect", "asset_plan_import", "asset_rollback_import", "asset_status"];
const FORBIDDEN_TOOLS = ["asset_verify_import", "gamemaker_verify_build", "gamemaker_apply", "gamemaker_rollback"];

const ok = [];
const warn = [];
const fail = [];
const check = (label, pass, detail = "") => { if (pass) ok.push(label); else fail.push(`${label}${detail ? "  → " + detail : ""}`); };

let binText = "";
try { binText = readFileSync(binPath, "utf8"); check("dist/index.js present", true); }
catch (error) { check("dist/index.js present", false, error.message); }
check("bin declares a node shebang", binText.startsWith("#!/usr/bin/env node"));

for (const file of ["server.js", "core.js", "contracts.js"]) {
  try { readFileSync(join(packageRoot, "dist", file), "utf8"); check(`dist/${file} present`, true); }
  catch (error) { check(`dist/${file} present`, false, error.message); }
}

for (const [variable, note] of [
  ["DEVLAB_GM_PROJECTS_DIR", "tool calls fail closed with GM_CONFIG_REQUIRED"],
  ["DEVLAB_GM_ASSET_CATALOG", "tool calls fail closed with GM_CONFIG_REQUIRED"],
  ["DEVLAB_GM_ASSET_REPO_ROOT", "tool calls fail closed with GM_CONFIG_REQUIRED"],
]) {
  if (process.env[variable]) ok.push(`${variable} is set`);
  else warn.push(`${variable} is not set; ${note}`);
}
const write = process.env.DEVLAB_GM_ASSET_WRITE;
if (write === "1" || write?.toLowerCase() === "true") warn.push("DEVLAB_GM_ASSET_WRITE is enabled; imports can write into a project");
else warn.push("DEVLAB_GM_ASSET_WRITE is not enabled; imports fail closed with GM_ASSET_WRITE_NOT_ENABLED");

if (fail.length === 0) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [binPath],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    stderr: "pipe",
  });
  const client = new Client({ name: "gamemaker-asset-mcp-doctor", version: "0.1.0" });
  try {
    await client.connect(transport);
    check("stdio server starts and completes the MCP handshake", true);

    const info = client.getServerVersion();
    check("server identifies as gamemaker-asset-mcp", info?.name === "gamemaker-asset-mcp", `got ${info?.name}`);

    const tools = (await client.listTools()).tools;
    const names = tools.map(({ name }) => name).sort();
    check(`advertises exactly ${EXPECTED_TOOLS.length} tools`, names.length === EXPECTED_TOOLS.length, `got ${names.length}`);
    check("tool names match the governed asset set", names.join(",") === EXPECTED_TOOLS.join(","), names.join(",") || "none");

    const leaked = FORBIDDEN_TOOLS.filter((name) => names.includes(name));
    check("no build-tier or write-tier tool is exposed", leaked.length === 0, leaked.join(","));

    const mutating = ["asset_plan_import", "asset_apply_import", "asset_rollback_import"];
    const dishonest = tools.filter((tool) => mutating.includes(tool.name) && tool.annotations?.readOnlyHint !== false).map(({ name }) => name);
    check("every writing tool is annotated as non-read-only", dishonest.length === 0, dishonest.join(","));

    for (const [label, list] of [["resources", () => client.listResources()], ["prompts", () => client.listPrompts()]]) {
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

console.log("@tanguito/gamemaker-asset-mcp Doctor");
console.log("════════════════════════════════════");
for (const line of ok) console.log(`  ✅ ${line}`);
for (const line of warn) console.log(`  ⚠️ ${line}`);
for (const line of fail) console.log(`  ❌ ${line}`);

if (fail.length > 0) {
  console.log(`\nResult: 🔴 ${fail.length} failure(s)`);
  process.exit(1);
}
console.log(`\nResult: Ready ✅ (${ok.length} checks passed${warn.length ? `, ${warn.length} warning(s)` : ""})`);
