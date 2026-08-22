#!/usr/bin/env node
// @tanguito/gamemaker-compile-mcp — doctor
// Validates: build output present, stdio server starts, exactly the two build
// tools are advertised, the build tool is not annotated read-only, and no
// resource/prompt surface exists. Never starts Igor.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const binPath = join(packageRoot, "dist", "index.js");
const EXPECTED_TOOLS = ["gamemaker_toolchain_status", "gamemaker_verify_build"];

const ok = [];
const warn = [];
const fail = [];
const check = (label, pass, detail = "") => { if (pass) ok.push(label); else fail.push(`${label}${detail ? "  → " + detail : ""}`); };

let binText = "";
try {
  binText = readFileSync(binPath, "utf8");
  check("dist/index.js present", true);
} catch (error) {
  check("dist/index.js present", false, error.message);
}
check("bin declares a node shebang", binText.startsWith("#!/usr/bin/env node"));

for (const file of ["server.js", "core.js", "contracts.js"]) {
  try { readFileSync(join(packageRoot, "dist", file), "utf8"); check(`dist/${file} present`, true); }
  catch (error) { check(`dist/${file} present`, false, error.message); }
}

if (process.platform === "win32") ok.push("platform supports Igor process ownership");
else warn.push(`platform is ${process.platform}; builds fail closed with GM_PLATFORM_UNSUPPORTED`);

const allow = process.env.DEVLAB_GM_ALLOW_IGOR;
if (allow === "1" || allow?.toLowerCase() === "true") ok.push("DEVLAB_GM_ALLOW_IGOR is enabled");
else warn.push("DEVLAB_GM_ALLOW_IGOR is not enabled; builds fail closed with GM_IGOR_NOT_ENABLED");

const toolchain = ["DEVLAB_GM_IGOR", "DEVLAB_GM_RUNTIME", "DEVLAB_GM_PROJECT_TOOL", "DEVLAB_GM_USER_DIR"];
const missing = toolchain.filter((name) => !process.env[name]);
if (missing.length) warn.push(`toolchain not configured: ${missing.join(", ")}`);
else ok.push("Igor toolchain variables are configured");

if (fail.length === 0) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [binPath],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    stderr: "pipe",
  });
  const client = new Client({ name: "gamemaker-compile-mcp-doctor", version: "0.1.0" });
  try {
    await client.connect(transport);
    check("stdio server starts and completes the MCP handshake", true);

    const info = client.getServerVersion();
    check("server identifies as gamemaker-compile-mcp", info?.name === "gamemaker-compile-mcp", `got ${info?.name}`);

    const tools = (await client.listTools()).tools;
    const names = tools.map(({ name }) => name).sort();
    check(`advertises exactly ${EXPECTED_TOOLS.length} tools`, names.length === EXPECTED_TOOLS.length, `got ${names.length}`);
    check("tool names match the governed build set", names.join(",") === EXPECTED_TOOLS.join(","), names.join(",") || "none");

    const build = tools.find(({ name }) => name === "gamemaker_verify_build");
    check("the build tool is not annotated read-only", build?.annotations?.readOnlyHint === false);

    // The status tool must answer without a toolchain and without paths.
    const status = await client.callTool({ name: "gamemaker_toolchain_status", arguments: {} });
    const body = status.structuredContent ?? {};
    check("toolchain status answers unconfigured", body.ok === true);
    check("toolchain status returns no filesystem path", !/[A-Za-z]:[\\/]|\/home\/|\/Users\//.test(JSON.stringify(body)));

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

console.log("@tanguito/gamemaker-compile-mcp Doctor");
console.log("════════════════════════════════════");
for (const line of ok) console.log(`  ✅ ${line}`);
for (const line of warn) console.log(`  ⚠️ ${line}`);
for (const line of fail) console.log(`  ❌ ${line}`);

if (fail.length > 0) {
  console.log(`\nResult: 🔴 ${fail.length} failure(s)`);
  process.exit(1);
}
console.log(`\nResult: Ready ✅ (${ok.length} checks passed${warn.length ? `, ${warn.length} warning(s)` : ""})`);
