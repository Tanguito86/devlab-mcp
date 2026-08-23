#!/usr/bin/env node
// @tanguito/aseprite-ingest-mcp — doctor
// Validates: build output present, stdio server starts, exactly the three
// ingest tools are advertised with honest annotations, and no resource/prompt
// surface exists. Never starts Aseprite.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const binPath = join(packageRoot, "dist", "index.js");
const EXPECTED_TOOLS = ["aseprite_ingest", "aseprite_inspect", "aseprite_publish", "aseprite_status"];

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
  ["DEVLAB_ASEPRITE", "tool calls fail closed with ASEPRITE_NOT_CONFIGURED"],
  ["DEVLAB_ASEPRITE_SOURCE_ROOT", "tool calls fail closed with GM_CONFIG_REQUIRED"],
  ["DEVLAB_ASEPRITE_REPO_ROOT", "tool calls fail closed with GM_CONFIG_REQUIRED"],
]) {
  if (process.env[variable]) ok.push(`${variable} is set`);
  else warn.push(`${variable} is not set; ${note}`);
}
const write = process.env.DEVLAB_ASEPRITE_WRITE;
if (write === "1" || write?.toLowerCase() === "true") warn.push("DEVLAB_ASEPRITE_WRITE is enabled; ingests can write into the catalog");
else warn.push("DEVLAB_ASEPRITE_WRITE is not enabled; ingests fail closed with GM_INGEST_WRITE_NOT_ENABLED");

if (fail.length === 0) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [binPath],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    stderr: "pipe",
  });
  const client = new Client({ name: "aseprite-ingest-mcp-doctor", version: "0.1.0" });
  try {
    await client.connect(transport);
    check("stdio server starts and completes the MCP handshake", true);

    const info = client.getServerVersion();
    check("server identifies as aseprite-ingest-mcp", info?.name === "aseprite-ingest-mcp", `got ${info?.name}`);

    const tools = (await client.listTools()).tools;
    const names = tools.map(({ name }) => name).sort();
    check(`advertises exactly ${EXPECTED_TOOLS.length} tools`, names.length === EXPECTED_TOOLS.length, `got ${names.length}`);
    check("tool names match the governed ingest set", names.join(",") === EXPECTED_TOOLS.join(","), names.join(",") || "none");

    // Inspection starts Aseprite; only status is genuinely inert.
    const notInert = ["aseprite_inspect", "aseprite_ingest"]
      .filter((name) => tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint !== false);
    check("process-starting tools are not annotated read-only", notInert.length === 0, notInert.join(","));

    const status = await client.callTool({ name: "aseprite_status", arguments: {} });
    const payload = status.structuredContent ?? {};
    check("status answers unconfigured", payload.ok === true);
    check("status returns no filesystem path", !/[A-Za-z]:[\\/]|\/home\/|\/Users\//.test(JSON.stringify(payload)));

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

console.log("@tanguito/aseprite-ingest-mcp Doctor");
console.log("════════════════════════════════════");
for (const line of ok) console.log(`  ✅ ${line}`);
for (const line of warn) console.log(`  ⚠️ ${line}`);
for (const line of fail) console.log(`  ❌ ${line}`);

if (fail.length > 0) {
  console.log(`\nResult: 🔴 ${fail.length} failure(s)`);
  process.exit(1);
}
console.log(`\nResult: Ready ✅ (${ok.length} checks passed${warn.length ? `, ${warn.length} warning(s)` : ""})`);
