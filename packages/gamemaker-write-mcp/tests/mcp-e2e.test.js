import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { GovernedGameMakerIdeAdapter } from "@tanguito/devlab-gm-ide-adapter";
import { planHash } from "@tanguito/devlab-gm-ide-adapter/internal";

const fixture = new URL("../../../fixtures/gamemaker/hermes-bridge-pilot/", import.meta.url);
const serverEntry = new URL("../dist/index.js", import.meta.url);
const targetFile = "objects/obj_gm_bridge_pilot/Create_0.gml";
const projectPath = "Demo";

async function treeState(root) {
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
  return { count: records.length, hash: createHash("sha256").update(JSON.stringify(records)).digest("hex") };
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
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function makeSandbox() {
  const root = await mkdtemp(join(tmpdir(), "gamemaker-write-e2e-"));
  const projectRoot = join(root, projectPath);
  await cp(fixture, projectRoot, { recursive: true });
  git(projectRoot, ["init", "--initial-branch=main"]);
  git(projectRoot, ["config", "core.autocrlf", "false"]);
  git(projectRoot, ["add", "--all"]);
  git(projectRoot, ["-c", "user.name=DevLab MCP Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-m", "fixture baseline"]);
  return { root, projectRoot };
}

/** Builds a real GM_PLAN_V1 plan the way the read-only server would. */
async function buildPlan(root, transactionId, content) {
  const adapter = new GovernedGameMakerIdeAdapter(root);
  const base = {
    projectRoot: projectPath,
    expectedProjectFingerprint: null,
    expectedHead: null,
    allowlist: [targetFile],
    transactionId,
    timeoutMs: 30_000,
    verificationPolicy: { projectLoad: false, compile: false, runtime: "forbidden" },
    evidenceRoot: ".plan-only",
  };
  const snapshot = await adapter.inspect({ ...base, capability: "GM_INSPECT_V1" });
  const plan = await adapter.plan({
    ...base,
    capability: "GM_PLAN_V1",
    expectedProjectFingerprint: snapshot.fingerprint,
    expectedHead: snapshot.gitHead,
    files: [{ path: targetFile, action: "modify", content }],
  });
  // Round-trip through JSON exactly as an MCP client would.
  return { plan: JSON.parse(JSON.stringify(plan)), planHash: planHash(plan), snapshot };
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
  const client = new Client({ name: "gamemaker-write-e2e", version: "1.0.0" });
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

test("MCP E2E: apply, verify and rollback complete a byte-exact write loop", { timeout: 60_000 }, async () => {
  const { root, projectRoot } = await makeSandbox();
  const baseline = await treeState(projectRoot);
  const baselineHead = git(projectRoot, ["rev-parse", "HEAD"]);
  const original = await readFile(join(projectRoot, targetFile), "utf8");
  const { plan, planHash: digest } = await buildPlan(root, "e2e-write-001", original.replace("GM_BRIDGE_PILOT_VALUE 1", "GM_BRIDGE_PILOT_VALUE 2"));

  const session = await connect(root, { DEVLAB_GM_WRITE_ALLOW: targetFile });
  try {
    const listed = await session.client.listTools();
    assert.deepEqual(listed.tools.map(({ name }) => name), [
      "gamemaker_apply",
      "gamemaker_verify_text",
      "gamemaker_rollback",
    ]);
    for (const tool of listed.tools) {
      assert.equal(tool.annotations.readOnlyHint, false, `${tool.name} must not claim to be read-only`);
      assert.equal(tool.annotations.openWorldHint, false);
    }

    // 1. Dry run writes nothing.
    const dry = await session.client.callTool({
      name: "gamemaker_apply",
      arguments: { projectPath, plan, planHash: digest, confirm: true },
    });
    assert.notEqual(dry.isError, true, JSON.stringify(dry));
    assert.equal(dry.structuredContent.state, "DRY_RUN");
    assert.equal(dry.structuredContent.applied, false);
    assert.deepEqual(await treeState(projectRoot), baseline);
    assert.equal(git(projectRoot, ["status", "--porcelain=v1"]), "");

    // 2. Real apply.
    const applied = await session.client.callTool({
      name: "gamemaker_apply",
      arguments: { projectPath, plan, planHash: digest, confirm: true, dryRun: false },
    });
    assert.notEqual(applied.isError, true, JSON.stringify(applied));
    assert.equal(applied.structuredContent.state, "APPLIED");
    assert.equal(applied.structuredContent.applied, true);
    assert.equal(applied.structuredContent.rollbackAvailable, true);
    assert.deepEqual(applied.structuredContent.changedFiles, [targetFile]);
    assert.match(await readFile(join(projectRoot, targetFile), "utf8"), /GM_BRIDGE_PILOT_VALUE 2/);
    assert.notEqual((await treeState(projectRoot)).hash, baseline.hash);
    assert.notEqual(git(projectRoot, ["status", "--porcelain=v1"]), "");

    // Evidence lives outside the project.
    assert.equal(await stat(join(projectRoot, ".devlab-gamemaker-mcp-write")).catch(() => null), null);
    assert.notEqual(await stat(join(root, ".devlab-gamemaker-mcp-write")).catch(() => null), null);

    // 3. Text verification of the applied state, with no compiler or runtime.
    const verified = await session.client.callTool({
      name: "gamemaker_verify_text",
      arguments: {
        projectPath,
        expectedProjectFingerprint: applied.structuredContent.projectFingerprint,
        plan,
        planHash: digest,
      },
    });
    assert.notEqual(verified.isError, true, JSON.stringify(verified));
    assert.equal(verified.structuredContent.textValid.passed, true);
    assert.equal(verified.structuredContent.compilerInvoked, false);
    assert.equal(verified.structuredContent.runtimeInvoked, false);
    assert.equal(verified.structuredContent.rollbackRequired, false);

    // 4. Rollback restores byte-exactly.
    const rolled = await session.client.callTool({
      name: "gamemaker_rollback",
      arguments: {
        projectPath,
        transactionId: plan.transactionId,
        planHash: digest,
        expectedProjectFingerprint: applied.structuredContent.projectFingerprint,
        confirm: true,
      },
    });
    assert.notEqual(rolled.isError, true, JSON.stringify(rolled));
    assert.equal(rolled.structuredContent.restored, true);
    assert.equal(rolled.structuredContent.byteExact, true);
    assert.deepEqual(rolled.structuredContent.restoredFiles, [targetFile]);

    assert.deepEqual(await treeState(projectRoot), baseline);
    assert.equal(await readFile(join(projectRoot, targetFile), "utf8"), original);
    assert.equal(git(projectRoot, ["rev-parse", "HEAD"]), baselineHead);
    assert.equal(git(projectRoot, ["status", "--porcelain=v1"]), "");
  } finally {
    await disconnect(session);
    assert.equal(session.stderr.join("").includes(root), false);
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP E2E: no GameMaker, Igor or Runner tool is reachable", { timeout: 30_000 }, async () => {
  const { root } = await makeSandbox();
  const session = await connect(root, { DEVLAB_GM_WRITE_ALLOW: "*" });
  try {
    const names = (await session.client.listTools()).tools.map(({ name }) => name);
    for (const forbidden of ["gamemaker_compile", "gamemaker_run", "gamemaker_verify", "gamemaker_import", "gamemaker_status", "gamemaker_inspect", "gamemaker_plan"]) {
      assert.equal(names.includes(forbidden), false, `${forbidden} must not be exposed by the write server`);
    }
    for (const surface of [() => session.client.listResources(), () => session.client.listPrompts()]) {
      await assert.rejects(surface);
    }
  } finally {
    await disconnect(session);
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP E2E: the server write allowlist cannot be widened by the caller", { timeout: 60_000 }, async () => {
  const { root, projectRoot } = await makeSandbox();
  const baseline = await treeState(projectRoot);
  const original = await readFile(join(projectRoot, targetFile), "utf8");
  const { plan, planHash: digest } = await buildPlan(root, "e2e-write-denied", `${original}\n// denied\n`);

  // The plan's own allowlist covers the file, but the server allowlist does not.
  const session = await connect(root, { DEVLAB_GM_WRITE_ALLOW: "rooms/" });
  try {
    const denied = await session.client.callTool({
      name: "gamemaker_apply",
      arguments: { projectPath, plan, planHash: digest, confirm: true, dryRun: false },
    });
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent.error.code, "GM_WRITE_NOT_ALLOWED");
    assert.deepEqual(await treeState(projectRoot), baseline);
  } finally {
    await disconnect(session);
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP E2E: an unconfigured write allowlist fails closed before any write", { timeout: 60_000 }, async () => {
  const { root, projectRoot } = await makeSandbox();
  const baseline = await treeState(projectRoot);
  const original = await readFile(join(projectRoot, targetFile), "utf8");
  const { plan, planHash: digest } = await buildPlan(root, "e2e-write-unconfigured", `${original}\n// unconfigured\n`);

  const session = await connect(root, { DEVLAB_GM_WRITE_ALLOW: undefined });
  try {
    const blocked = await session.client.callTool({
      name: "gamemaker_apply",
      arguments: { projectPath, plan, planHash: digest, confirm: true, dryRun: false },
    });
    assert.equal(blocked.isError, true);
    assert.equal(blocked.structuredContent.error.code, "GM_CONFIG_REQUIRED");
    assert.equal(blocked.structuredContent.error.recoverable, true);
    assert.deepEqual(await treeState(projectRoot), baseline);
  } finally {
    await disconnect(session);
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP E2E: tampered plans and stale bindings fail closed without touching the project", { timeout: 60_000 }, async () => {
  const { root, projectRoot } = await makeSandbox();
  const baseline = await treeState(projectRoot);
  const original = await readFile(join(projectRoot, targetFile), "utf8");
  const { plan, planHash: digest } = await buildPlan(root, "e2e-write-tamper", `${original}\n// tamper\n`);

  const session = await connect(root, { DEVLAB_GM_WRITE_ALLOW: "*" });
  try {
    const cases = [
      ["planHash does not match the plan", { plan, planHash: "0".repeat(64) }],
      ["content swapped without rehashing", {
        plan: { ...plan, files: [{ ...plan.files[0], afterContentBase64: Buffer.from("// swapped\n", "utf8").toString("base64") }] },
        planHash: digest,
      }],
      ["plan bound to another project", { plan: { ...plan, projectRoot: "Other" }, planHash: digest }],
      ["confirm cannot be false", { plan, planHash: digest, confirm: false }],
    ];
    for (const [label, overrides] of cases) {
      const result = await session.client.callTool({
        name: "gamemaker_apply",
        arguments: { projectPath, plan, planHash: digest, confirm: true, dryRun: false, ...overrides },
      });
      assert.equal(result.isError, true, `${label} must fail`);
      assert.deepEqual(await treeState(projectRoot), baseline, `${label} must not touch the project`);
    }

    // A path outside the project boundary is rejected by the adapter.
    const escaped = await session.client.callTool({
      name: "gamemaker_apply",
      arguments: { projectPath: "../escape", plan, planHash: digest, confirm: true, dryRun: false },
    });
    assert.equal(escaped.isError, true);
    assert.deepEqual(await treeState(projectRoot), baseline);
  } finally {
    await disconnect(session);
    await rm(root, { recursive: true, force: true });
  }
});
