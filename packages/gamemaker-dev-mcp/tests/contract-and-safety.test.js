import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { TOOL_NAMES } from "../dist/contracts.js";
import {
  GmMcpError,
  mapToolError,
  ReadonlyGameMakerService,
  resolveProjectsDir,
} from "../dist/core.js";
import { createGameMakerMcpServer } from "../dist/server.js";

const fixture = new URL("../../../fixtures/gamemaker/hermes-bridge-pilot/", import.meta.url);
const targetFile = "objects/obj_gm_bridge_pilot/Create_0.gml";
const signal = new AbortController().signal;

async function sandbox(name = "Project") {
  const root = await mkdtemp(join(tmpdir(), "gamemaker-mcp-unit-"));
  await cp(fixture, join(root, name), { recursive: true });
  return { root, projectPath: name, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function treeState(root) {
  const records = [];
  const walk = async (directory, prefix = "") => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) records.push({
        path: relative,
        bytes: (await readFile(absolute)).toString("base64"),
      });
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

async function inMemoryClient(env = {}) {
  const server = createGameMakerMcpServer(new ReadonlyGameMakerService(env));
  const client = new Client({ name: "gamemaker-mcp-contract-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    server,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

test("MCP CONTRACT: tools/list exposes exactly three stable read-only tools", async () => {
  const session = await inMemoryClient();
  try {
    const listed = await session.client.listTools();
    assert.deepEqual(listed.tools.map(({ name }) => name), TOOL_NAMES);
    assert.deepEqual(session.client.getServerCapabilities(), { tools: { listChanged: true } });
    for (const tool of listed.tools) {
      assert.deepEqual(tool.annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.equal(tool.outputSchema.type, "object");
    }
    assert.deepEqual(listed.tools.map(({ name }) => name).filter((name) => /apply|verify|rollback|import|igor|runner/i.test(name)), []);
  } finally {
    await session.close();
  }
});

test("MCP CONTRACT: unknown and malformed inputs are rejected by the protocol schema", async () => {
  const session = await inMemoryClient();
  try {
    const unknown = await session.client.callTool({
      name: "gamemaker_status",
      arguments: { projectPath: "Project", capability: "GM_APPLY_SAFE_V1" },
    });
    assert.equal(unknown.isError, true);
    const malformed = await session.client.callTool({
      name: "gamemaker_plan",
      arguments: { projectPath: "Project", expectedProjectFingerprint: "bad", allowlist: [], changes: [] },
    });
    assert.equal(malformed.isError, true);
    const excessive = await session.client.callTool({
      name: "gamemaker_plan",
      arguments: {
        projectPath: "Project",
        expectedProjectFingerprint: "0".repeat(64),
        allowlist: [targetFile],
        changes: [{ path: targetFile, content: "x".repeat(1024 * 1024 + 1) }],
      },
    });
    assert.equal(excessive.isError, true);
  } finally {
    await session.close();
  }
});

test("CONFIG: tools/list works without configuration and calls fail with GM_CONFIG_REQUIRED", async () => {
  const session = await inMemoryClient({});
  try {
    assert.equal((await session.client.listTools()).tools.length, 3);
    const result = await session.client.callTool({
      name: "gamemaker_inspect",
      arguments: { projectPath: "Project" },
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "GM_CONFIG_REQUIRED");
    assert.equal(JSON.stringify(result).includes(process.cwd()), false);
  } finally {
    await session.close();
  }
});

test("CONFIG: relative, missing, and linked roots fail closed", async () => {
  await assert.rejects(
    () => resolveProjectsDir({ DEVLAB_GM_PROJECTS_DIR: "relative" }),
    (error) => error instanceof GmMcpError && error.code === "GM_CONFIG_INVALID",
  );
  const missing = join(tmpdir(), `missing-gm-root-${process.pid}-${Date.now()}`);
  await assert.rejects(
    () => resolveProjectsDir({ DEVLAB_GM_PROJECTS_DIR: missing }),
    (error) => error instanceof GmMcpError && error.code === "GM_CONFIG_INVALID",
  );
  const root = await mkdtemp(join(tmpdir(), "gamemaker-mcp-config-"));
  const real = join(root, "real");
  const linked = join(root, "linked");
  try {
    await mkdir(real);
    await symlink(real, linked, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      () => resolveProjectsDir({ DEVLAB_GM_PROJECTS_DIR: linked }),
      (error) => error instanceof GmMcpError && error.code === "GM_CONFIG_INVALID",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PATHS: project escape, absolute, drive, UNC, traversal, NUL, and junction are rejected", async () => {
  const box = await sandbox();
  const outside = await mkdtemp(join(tmpdir(), "gamemaker-mcp-outside-"));
  const linked = join(box.root, "LinkedProject");
  try {
    await cp(fixture, join(outside, "OutsideProject"), { recursive: true });
    await symlink(join(outside, "OutsideProject"), linked, process.platform === "win32" ? "junction" : "dir");
    const service = new ReadonlyGameMakerService({ DEVLAB_GM_PROJECTS_DIR: box.root });
    for (const candidate of [
      "../outside",
      join(box.root, box.projectPath),
      "C:/outside",
      "\\\\server\\share",
      "a/../Project",
      "Project\0child",
      "LinkedProject",
    ]) {
      await assert.rejects(
        () => service.inspect({ projectPath: candidate }, 1, signal),
        (error) => error.code === "PATH_ESCAPE",
        candidate,
      );
    }
  } finally {
    await box.cleanup();
    await rm(outside, { recursive: true, force: true });
  }
});

test("PROJECT CONTRACT: a project must contain exactly one valid GMProject .yyp", async () => {
  const root = await mkdtemp(join(tmpdir(), "gamemaker-mcp-project-contract-"));
  try {
    const none = join(root, "None");
    await mkdir(none);
    await writeFile(join(none, "readme.txt"), "not a project\n");
    const invalid = join(root, "Invalid");
    await mkdir(invalid);
    await writeFile(join(invalid, "Invalid.yyp"), '{"resourceType":"NotGMProject"}\n');
    const two = join(root, "Two");
    await mkdir(two);
    await writeFile(join(two, "A.yyp"), '{"resourceType":"GMProject","resources":[]}\n');
    await writeFile(join(two, "B.yyp"), '{"resourceType":"GMProject","resources":[]}\n');
    const service = new ReadonlyGameMakerService({ DEVLAB_GM_PROJECTS_DIR: root });
    for (const projectPath of ["None", "Invalid", "Two"]) {
      await assert.rejects(
        () => service.inspect({ projectPath }, 2, signal),
        (error) => error.code === "INVALID_REQUEST",
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FUNCTION: status, inspect, and plan preserve the complete project tree byte-for-byte", async () => {
  const box = await sandbox();
  try {
    const service = new ReadonlyGameMakerService({ DEVLAB_GM_PROJECTS_DIR: box.root });
    let before = await treeState(join(box.root, box.projectPath));
    const status = await service.status({ projectPath: box.projectPath }, "status", signal);
    assert.equal(status.ok, true);
    assert.equal(status.capability, "GM_STATUS_V1");
    assert.equal(JSON.stringify(status).includes(box.root), false);
    assert.deepEqual(await treeState(join(box.root, box.projectPath)), before);

    const inspected = await service.inspect({ projectPath: box.projectPath }, "inspect", signal);
    assert.equal(inspected.ok, true);
    assert.match(inspected.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(inspected.files.length, before.count);
    assert.equal(JSON.stringify(inspected).includes(box.root), false);
    assert.deepEqual(await treeState(join(box.root, box.projectPath)), before);

    const current = await readFile(join(box.root, box.projectPath, targetFile), "utf8");
    const planned = await service.plan({
      projectPath: box.projectPath,
      expectedProjectFingerprint: inspected.fingerprint,
      allowlist: [targetFile],
      changes: [{ path: targetFile, content: `${current}\n// hypothetical only\n` }],
    }, "plan", signal);
    assert.equal(planned.ok, true);
    assert.equal(planned.capability, "GM_PLAN_V1");
    assert.equal(planned.serverGate, "PLAN_ONLY");
    assert.match(planned.planHash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(planned).includes("afterContentBase64"), false);
    assert.equal(JSON.stringify(planned).includes("GM_APPLY_SAFE_V1"), false);
    assert.deepEqual(await treeState(join(box.root, box.projectPath)), before);
  } finally {
    await box.cleanup();
  }
});

test("PLAN SAFETY: stale fingerprint, non-allowlisted path, and forbidden extension fail closed", async () => {
  const box = await sandbox();
  try {
    const service = new ReadonlyGameMakerService({ DEVLAB_GM_PROJECTS_DIR: box.root });
    const before = await treeState(join(box.root, box.projectPath));
    const inspected = await service.inspect({ projectPath: box.projectPath }, 3, signal);
    const current = await readFile(join(box.root, box.projectPath, targetFile), "utf8");
    const base = {
      projectPath: box.projectPath,
      expectedProjectFingerprint: inspected.fingerprint,
      allowlist: [targetFile],
      changes: [{ path: targetFile, content: current }],
    };
    await assert.rejects(
      () => service.plan({ ...base, expectedProjectFingerprint: "0".repeat(64) }, 4, signal),
      (error) => error.code === "EXPECTED_HASH_MISMATCH",
    );
    await assert.rejects(
      () => service.plan({ ...base, allowlist: ["rooms/rm_gm_bridge_pilot/rm_gm_bridge_pilot.yy"] }, 5, signal),
      (error) => error.code === "FILE_NOT_ALLOWLISTED",
    );
    const forbidden = "HermesBridgePilot.resource_order";
    await assert.rejects(
      () => service.plan({
        ...base,
        allowlist: [forbidden],
        changes: [{ path: forbidden, content: "hypothetical\n" }],
      }, 6, signal),
      (error) => error.code === "FILE_NOT_ALLOWLISTED",
    );
    assert.deepEqual(await treeState(join(box.root, box.projectPath)), before);
  } finally {
    await box.cleanup();
  }
});

test("ERRORS: unexpected failures are sanitized and never expose stacks, paths, or tokens", () => {
  const mapped = mapToolError(new Error("C:\\private\\detail.txt host-detail"), "request-safe");
  assert.equal(mapped.ok, false);
  assert.equal(mapped.error.code, "GM_INTERNAL_ERROR");
  const serialized = JSON.stringify(mapped);
  assert.equal(serialized.includes("private"), false);
  assert.equal(serialized.includes("host-detail"), false);
  assert.equal(serialized.includes("stack"), false);
});
