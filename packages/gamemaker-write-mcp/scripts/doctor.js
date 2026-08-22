#!/usr/bin/env node
// @tanguito/gamemaker-write-mcp — doctor
// Validates: build output present, stdio server starts, exactly the three
// write-tier tools are advertised with honest annotations, no read-only or
// compiler tool leaks in, and no resource/prompt surface exists.
// Configuration is reported but never required: tool calls fail closed on
// their own when DEVLAB_GM_PROJECTS_DIR or DEVLAB_GM_WRITE_ALLOW is missing.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const binPath = join(packageRoot, "dist", "index.js");
const EXPECTED_TOOLS = ["gamemaker_apply", "gamemaker_rollback", "gamemaker_verify_text"];
const FORBIDDEN_TOOLS = ["gamemaker_compile", "gamemaker_run", "gamemaker_verify", "gamemaker_import"];

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
if (process.env.DEVLAB_GM_PROJECTS_DIR) ok.push("DEVLAB_GM_PROJECTS_DIR is set");
else warn.push("DEVLAB_GM_PROJECTS_DIR is not set; tool calls will fail closed with GM_CONFIG_REQUIRED");

const writeAllow = process.env.DEVLAB_GM_WRITE_ALLOW;
if (writeAllow === "*") warn.push('DEVLAB_GM_WRITE_ALLOW is "*"; the whole project is writable by deliberate opt-out');
else if (writeAllow) ok.push("DEVLAB_GM_WRITE_ALLOW restricts writes to an explicit path list");
else warn.push("DEVLAB_GM_WRITE_ALLOW is not set; writes will fail closed with GM_CONFIG_REQUIRED");

// 3. Live stdio handshake against the built bin.
if (fail.length === 0) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [binPath],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    stderr: "pipe",
  });
  const client = new Client({ name: "gamemaker-write-mcp-doctor", version: "0.1.0" });
  try {
    await client.connect(transport);
    check("stdio server starts and completes the MCP handshake", true);

    const info = client.getServerVersion();
    check("server identifies as gamemaker-write-mcp", info?.name === "gamemaker-write-mcp", `got ${info?.name}`);

    const tools = (await client.listTools()).tools;
    const names = tools.map(({ name }) => name).sort();
    check(`advertises exactly ${EXPECTED_TOOLS.length} tools`, names.length === EXPECTED_TOOLS.length, `got ${names.length}`);
    check("tool names match the governed write-tier set", names.join(",") === EXPECTED_TOOLS.join(","), names.join(",") || "none");

    const leaked = FORBIDDEN_TOOLS.filter((name) => names.includes(name));
    check("no compiler or runtime tool is exposed", leaked.length === 0, leaked.join(","));

    const dishonest = tools.filter((tool) => tool.annotations?.readOnlyHint !== false).map(({ name }) => name);
    check("every tool is annotated as non-read-only", dishonest.length === 0, dishonest.join(","));

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

// ════════════════════════════════════════
console.log("@tanguito/gamemaker-write-mcp Doctor");
console.log("════════════════════════════════════");
for (const line of ok) console.log(`  ✅ ${line}`);
for (const line of warn) console.log(`  ⚠️ ${line}`);
for (const line of fail) console.log(`  ❌ ${line}`);

if (fail.length > 0) {
  console.log(`\nResult: 🔴 ${fail.length} failure(s)`);
  process.exit(1);
}
console.log(`\nResult: Ready ✅ (${ok.length} checks passed${warn.length ? `, ${warn.length} warning(s)` : ""})`);
