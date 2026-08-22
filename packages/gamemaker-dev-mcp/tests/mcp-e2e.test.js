import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const fixture = new URL("../../../fixtures/gamemaker/hermes-bridge-pilot/", import.meta.url);
const serverEntry = new URL("../dist/index.js", import.meta.url);
const targetFile = "objects/obj_gm_bridge_pilot/Create_0.gml";

async function workingTreeState(root) {
  const records = [];
  const walk = async (directory, prefix = "") => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!prefix && entry.name === ".git") continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) records.push({ path: relative, bytes: (await readFile(absolute)).toString("base64") });
      else records.push({ path: relative, irregular: true });
    }
  };
  await walk(root);
  return {
    count: records.length,
    hash: createHash("sha256").update(JSON.stringify(records)).digest("hex"),
    records,
  };
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
    },
  }).trim();
}

async function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("MCP E2E: stdio handshake and all three tools are read-only on a disposable fixture", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "gamemaker-mcp-e2e-"));
  const projectPath = "Demo";
  const projectRoot = join(root, projectPath);
  await cp(fixture, projectRoot, { recursive: true });
  git(projectRoot, ["init", "--initial-branch=main"]);
  git(projectRoot, ["config", "core.autocrlf", "false"]);
  git(projectRoot, ["add", "--all"]);
  git(projectRoot, ["-c", "user.name=DevLab MCP Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-m", "fixture baseline"]);

  const baseline = await workingTreeState(projectRoot);
  const baselineHead = git(projectRoot, ["rev-parse", "HEAD"]);
  const baselineStatus = git(projectRoot, ["status", "--porcelain=v1"]);
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(serverEntry)],
    cwd: root,
    env: { ...process.env, DEVLAB_GM_PROJECTS_DIR: root },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
  const client = new Client({ name: "gamemaker-mcp-e2e", version: "1.0.0" });
  let serverPid = null;
  try {
    await client.connect(transport);
    serverPid = transport.pid;
    assert.ok(Number.isInteger(serverPid));

    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(({ name }) => name), [
      "gamemaker_status",
      "gamemaker_inspect",
      "gamemaker_plan",
    ]);

    const status = await client.callTool({
      name: "gamemaker_status",
      arguments: { projectPath },
    });
    assert.notEqual(status.isError, true, JSON.stringify(status));
    assert.equal(status.structuredContent.capability, "GM_STATUS_V1");
    assert.deepEqual(await workingTreeState(projectRoot), baseline);
    assert.equal(git(projectRoot, ["status", "--porcelain=v1"]), baselineStatus);

    const inspected = await client.callTool({
      name: "gamemaker_inspect",
      arguments: { projectPath },
    });
    assert.notEqual(inspected.isError, true, JSON.stringify(inspected));
    assert.equal(inspected.structuredContent.capability, "GM_INSPECT_V1");
    assert.match(inspected.structuredContent.fingerprint, /^[a-f0-9]{64}$/);
    assert.deepEqual(await workingTreeState(projectRoot), baseline);
    assert.equal(git(projectRoot, ["status", "--porcelain=v1"]), baselineStatus);

    const current = await readFile(join(projectRoot, targetFile), "utf8");
    const planned = await client.callTool({
      name: "gamemaker_plan",
      arguments: {
        projectPath,
        expectedProjectFingerprint: inspected.structuredContent.fingerprint,
        allowlist: [targetFile],
        changes: [{ path: targetFile, content: `${current}\n// MCP hypothetical edit\n` }],
      },
    });
    assert.notEqual(planned.isError, true, JSON.stringify(planned));
    assert.equal(planned.structuredContent.capability, "GM_PLAN_V1");
    assert.equal(planned.structuredContent.immutable, true);
    assert.match(planned.structuredContent.planHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(await workingTreeState(projectRoot), baseline);
    assert.equal(await readFile(join(projectRoot, targetFile), "utf8"), current);
    assert.equal(git(projectRoot, ["rev-parse", "HEAD"]), baselineHead);
    assert.equal(git(projectRoot, ["status", "--porcelain=v1"]), baselineStatus);
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
    if (serverPid !== null) {
      const deadline = Date.now() + 2_000;
      while (await processExists(serverPid) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(await processExists(serverPid), false, "stdio server process must exit with the client");
    }
    assert.equal(stderr.join("").includes(root), false);
    await rm(root, { recursive: true, force: true });
  }
});
