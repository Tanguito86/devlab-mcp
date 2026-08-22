import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { GovernedGameMakerIdeAdapter } from "@tanguito/devlab-gm-ide-adapter";

const fixture = new URL("../../../fixtures/gamemaker/hermes-bridge-pilot/", import.meta.url);
const serverEntry = new URL("../dist/index.js", import.meta.url);
const projectPath = "Demo";

/**
 * The real-Igor lane runs only where a GameMaker install is configured. CI is
 * Ubuntu with no GameMaker, so it exercises the fail-closed lanes instead. A
 * skip here means "not verifiable on this host", never "assumed to pass".
 */
const IGOR_ENV_KEYS = ["DEVLAB_GM_IGOR", "DEVLAB_GM_RUNTIME", "DEVLAB_GM_PROJECT_TOOL", "DEVLAB_GM_USER_DIR"];
const igorConfigured = process.platform === "win32" && IGOR_ENV_KEYS.every((key) => Boolean(process.env[key]));
const realIgor = igorConfigured ? {} : { skip: "requires a configured Windows GameMaker toolchain" };

async function treeState(root) {
  const records = [];
  const walk = async (directory, prefix = "") => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) records.push({ path: relative, bytes: (await readFile(absolute)).toString("base64") });
    }
  };
  await walk(root);
  return { count: records.length, hash: createHash("sha256").update(JSON.stringify(records)).digest("hex") };
}

async function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function gameMakerProcessPids() {
  if (process.platform !== "win32") return [];
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const script = "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(Igor|Runner)' } | ForEach-Object { $_.ProcessId }";
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 20_000, windowsHide: true });
  return stdout.split(/\r?\n/).map((line) => Number(line.trim())).filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), "gm-compile-e2e-"));
  await cp(fixture, join(root, projectPath), { recursive: true });
  return root;
}

async function connect(root, env) {
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(serverEntry)],
    cwd: root,
    env: { ...process.env, DEVLAB_GM_PROJECTS_DIR: root, ...env },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
  const client = new Client({ name: "gm-compile-e2e", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport, stderr };
}

async function disconnect(session) {
  const pid = session.transport.pid;
  await session.client.close().catch(() => undefined);
  await session.transport.close().catch(() => undefined);
  if (Number.isInteger(pid)) {
    const deadline = Date.now() + 2_000;
    while (await processExists(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    assert.equal(await processExists(pid), false, "stdio server process must exit with the client");
  }
}

async function fingerprintOf(root) {
  const adapter = new GovernedGameMakerIdeAdapter(root);
  const snapshot = await adapter.inspect({
    capability: "GM_INSPECT_V1", projectRoot: projectPath, expectedProjectFingerprint: null, expectedHead: null,
    allowlist: [], transactionId: "e2e-inspect", timeoutMs: 30_000,
    verificationPolicy: { projectLoad: false, compile: false, runtime: "forbidden" }, evidenceRoot: ".none",
  });
  return snapshot.fingerprint;
}

test("MCP E2E: exactly two tools, no other surface", { timeout: 30_000 }, async () => {
  const root = await sandbox();
  const session = await connect(root, {});
  try {
    const tools = (await session.client.listTools()).tools;
    assert.deepEqual(tools.map(({ name }) => name), ["gamemaker_toolchain_status", "gamemaker_verify_build"]);
    assert.equal(tools.find(({ name }) => name === "gamemaker_verify_build").annotations.readOnlyHint, false);
    for (const surface of [() => session.client.listResources(), () => session.client.listPrompts()]) {
      await assert.rejects(surface);
    }
  } finally {
    await disconnect(session);
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP E2E: toolchain status reports blockers and never returns a path", { timeout: 30_000 }, async () => {
  const root = await sandbox();
  const session = await connect(root, { DEVLAB_GM_ALLOW_IGOR: undefined, DEVLAB_GM_IGOR: undefined, DEVLAB_GM_RUNTIME: undefined, DEVLAB_GM_PROJECT_TOOL: undefined, DEVLAB_GM_USER_DIR: undefined });
  try {
    const result = await session.client.callTool({ name: "gamemaker_toolchain_status", arguments: {} });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const body = result.structuredContent;
    assert.equal(body.igorEnabled, false);
    assert.equal(body.toolchainConfigured, false);
    assert.ok(body.blockers.length >= 2);
    const serialized = JSON.stringify(body);
    assert.equal(/[A-Za-z]:[\\/]/.test(serialized), false, "status must not leak a drive path");
    assert.equal(serialized.includes(root), false);
  } finally {
    await disconnect(session);
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP E2E: a build is refused while Igor is not explicitly enabled", { timeout: 30_000 }, async () => {
  const root = await sandbox();
  const before = await treeState(join(root, projectPath));
  const fingerprint = await fingerprintOf(root);
  const session = await connect(root, { DEVLAB_GM_ALLOW_IGOR: undefined });
  try {
    const result = await session.client.callTool({
      name: "gamemaker_verify_build",
      arguments: { projectPath, expectedProjectFingerprint: fingerprint },
    });
    assert.equal(result.isError, true);
    const code = result.structuredContent.error.code;
    assert.ok(
      code === "GM_IGOR_NOT_ENABLED" || code === "GM_PLATFORM_UNSUPPORTED",
      `expected a fail-closed gate, got ${code}`,
    );
    assert.deepEqual(await treeState(join(root, projectPath)), before);
  } finally {
    await disconnect(session);
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP E2E: enabling Igor without a toolchain still fails closed", { timeout: 30_000 }, async () => {
  const root = await sandbox();
  const before = await treeState(join(root, projectPath));
  const fingerprint = await fingerprintOf(root);
  const session = await connect(root, {
    DEVLAB_GM_ALLOW_IGOR: "1",
    DEVLAB_GM_IGOR: undefined, DEVLAB_GM_RUNTIME: undefined, DEVLAB_GM_PROJECT_TOOL: undefined, DEVLAB_GM_USER_DIR: undefined,
  });
  try {
    const result = await session.client.callTool({
      name: "gamemaker_verify_build",
      arguments: { projectPath, expectedProjectFingerprint: fingerprint },
    });
    assert.equal(result.isError, true);
    const code = result.structuredContent.error.code;
    assert.ok(
      code === "GM_CONFIG_REQUIRED" || code === "GM_PLATFORM_UNSUPPORTED",
      `expected a fail-closed gate, got ${code}`,
    );
    assert.deepEqual(await treeState(join(root, projectPath)), before);
  } finally {
    await disconnect(session);
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP E2E: a stale fingerprint is refused before Igor starts", { timeout: 60_000, ...realIgor }, async () => {
  const root = await sandbox();
  const before = await treeState(join(root, projectPath));
  const session = await connect(root, { DEVLAB_GM_ALLOW_IGOR: "1" });
  try {
    const result = await session.client.callTool({
      name: "gamemaker_verify_build",
      arguments: { projectPath, expectedProjectFingerprint: "0".repeat(64) },
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "EXPECTED_HASH_MISMATCH");
    assert.deepEqual(await treeState(join(root, projectPath)), before);
  } finally {
    await disconnect(session);
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP E2E: a real Igor build compiles the fixture and leaves no orphan process", { timeout: 600_000, ...realIgor }, async () => {
  const root = await sandbox();
  const projectRoot = join(root, projectPath);
  const before = await treeState(projectRoot);
  const fingerprint = await fingerprintOf(root);
  const pidsBefore = await gameMakerProcessPids();
  const session = await connect(root, { DEVLAB_GM_ALLOW_IGOR: "1", DEVLAB_GM_TIMEOUT_MS: "300000" });
  try {
    const status = await session.client.callTool({ name: "gamemaker_toolchain_status", arguments: {} });
    assert.equal(status.structuredContent.toolchainPresent, true, JSON.stringify(status.structuredContent));
    assert.deepEqual(status.structuredContent.blockers, []);

    const result = await session.client.callTool({
      name: "gamemaker_verify_build",
      arguments: { projectPath, expectedProjectFingerprint: fingerprint, expectedRuntimeSignal: "GM_BRIDGE_PILOT_VALUE=1" },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const body = result.structuredContent;
    assert.equal(body.igorInvoked, true);
    assert.equal(body.levels.TEXT_VALID.passed, true);
    assert.equal(body.levels.PROJECT_LOAD_VALID.passed, true);
    assert.equal(body.levels.COMPILE_VALID.passed, true, `Igor exited ${body.compileExitCode}`);
    assert.equal(body.compileExitCode, 0);
    assert.ok(body.ownedProcessCount >= 1, "the build must own at least the Igor process");

    // The build never edits the project itself; evidence lands outside it.
    assert.deepEqual(await treeState(projectRoot), before);
    assert.equal(await stat(join(projectRoot, ".devlab-gamemaker-mcp-build")).catch(() => null), null);
    assert.notEqual(await stat(join(root, ".devlab-gamemaker-mcp-build")).catch(() => null), null);
  } finally {
    await disconnect(session);
    const pidsAfter = await gameMakerProcessPids();
    const orphans = pidsAfter.filter((pid) => !pidsBefore.includes(pid));
    assert.deepEqual(orphans, [], "the build must leave no Igor or Runner process behind");
    await rm(root, { recursive: true, force: true });
  }
});
