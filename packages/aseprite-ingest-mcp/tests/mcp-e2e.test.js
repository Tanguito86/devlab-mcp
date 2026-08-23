import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const FIXTURE = fileURLToPath(new URL("../../../fixtures/aseprite/ingest-pilot.aseprite", import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * The real-Aseprite lane runs only where DEVLAB_ASEPRITE points at a working
 * install. CI has none and exercises the fail-closed lanes instead; a skip
 * means "not verifiable on this host", never "assumed to pass".
 */
const asepriteConfigured = Boolean(process.env.DEVLAB_ASEPRITE);
const realAseprite = asepriteConfigured ? {} : { skip: "requires DEVLAB_ASEPRITE to point at a working Aseprite install" };

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "aseprite-mcp-"));
  const sources = join(root, "art");
  const repo = join(root, "repo");
  mkdirSync(join(sources, "nested"), { recursive: true });
  mkdirSync(repo, { recursive: true });
  cpSync(FIXTURE, join(sources, "hero.aseprite"));
  cpSync(FIXTURE, join(sources, "nested", "villain.aseprite"));
  writeFileSync(join(sources, "notes.txt"), "not a sprite\n");
  // A file the source root must never reach.
  writeFileSync(join(root, "outside.aseprite"), "outside\n");
  return { root, sources, repo };
}

function tree(root) {
  const records = [];
  const walk = (dir, prefix = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else records.push(rel);
    }
  };
  walk(root);
  return records;
}

async function connect(ws, env) {
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    cwd: ws.root,
    env: {
      ...process.env,
      DEVLAB_ASEPRITE_SOURCE_ROOT: ws.sources,
      DEVLAB_ASEPRITE_REPO_ROOT: ws.repo,
      ...env,
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
  const client = new Client({ name: "aseprite-mcp-e2e", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport, stderr };
}

async function close(session) {
  const pid = session.transport.pid;
  await session.client.close().catch(() => undefined);
  await session.transport.close().catch(() => undefined);
  if (Number.isInteger(pid)) {
    const deadline = Date.now() + 2_000;
    const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
    while (alive() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    assert.equal(alive(), false, "stdio server must exit with the client");
  }
}

const body = (result, label) => {
  assert.notEqual(result.isError, true, `${label}: ${JSON.stringify(result.structuredContent ?? result)}`);
  return result.structuredContent;
};

test("MCP E2E: exactly three tools and no other surface", { timeout: 30_000 }, async () => {
  const ws = workspace();
  const session = await connect(ws, {});
  try {
    const tools = (await session.client.listTools()).tools;
    assert.deepEqual(tools.map(({ name }) => name), ["aseprite_status", "aseprite_inspect", "aseprite_ingest"]);
    // Inspection starts Aseprite, so it must not claim to be read-only.
    assert.equal(tools.find(({ name }) => name === "aseprite_inspect").annotations.readOnlyHint, false);
    assert.equal(tools.find(({ name }) => name === "aseprite_ingest").annotations.readOnlyHint, false);
    assert.equal(tools.find(({ name }) => name === "aseprite_status").annotations.readOnlyHint, true);
    for (const surface of [() => session.client.listResources(), () => session.client.listPrompts()]) {
      await assert.rejects(surface);
    }
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: status reports blockers and leaks no path", { timeout: 30_000 }, async () => {
  const ws = workspace();
  const session = await connect(ws, { DEVLAB_ASEPRITE: undefined, DEVLAB_ASEPRITE_WRITE: undefined });
  try {
    const status = body(await session.client.callTool({ name: "aseprite_status", arguments: {} }), "status");
    assert.equal(status.writeEnabled, false);
    assert.equal(status.sourceRootConfigured, true);
    assert.equal(status.repoRootConfigured, true);
    assert.ok(status.blockers.length >= 2);
    assert.deepEqual(status.originPresets, ["top-left", "top-centre", "centre", "bottom-centre"]);
    const serialized = JSON.stringify(status);
    assert.equal(/[A-Za-z]:[\\/]/.test(serialized), false, "status must not leak a drive path");
    assert.equal(serialized.includes(ws.root), false);
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: sources outside the root are refused before Aseprite runs", { timeout: 60_000 }, async () => {
  const ws = workspace();
  const before = tree(ws.repo);
  const session = await connect(ws, { DEVLAB_ASEPRITE_WRITE: "1" });
  try {
    const cases = [
      ["traversal", "../outside.aseprite"],
      ["deep traversal", "../../outside.aseprite"],
      ["absolute windows", "C:/Windows/system.aseprite"],
      ["absolute posix", "/etc/passwd.aseprite"],
      ["UNC", "\\\\server\\share\\x.aseprite"],
      ["NUL byte", "hero\u0000.aseprite"],
      ["wrong extension", "notes.txt"],
      ["missing file", "ghost.aseprite"],
    ];
    for (const [label, source] of cases) {
      const result = await session.client.callTool({ name: "aseprite_inspect", arguments: { source } });
      assert.equal(result.isError, true, `${label} must be refused`);
      // The boundary must be the reason, not a missing toolchain: this runs on
      // hosts with no Aseprite, where a weaker assertion would pass for free.
      assert.equal(result.structuredContent.error.code, "GM_SOURCE_NOT_ALLOWED", label);
      const serialized = JSON.stringify(result.structuredContent);
      assert.equal(/[A-Za-z]:[\\/]/.test(serialized), false, `${label} must not echo a path`);
      assert.equal(serialized.includes(ws.root), false, label);
    }
    assert.deepEqual(tree(ws.repo), before, "nothing may be written while probing hostile inputs");
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: a symlinked source is refused", { timeout: 60_000 }, async (t) => {
  const ws = workspace();
  try {
    symlinkSync(join(ws.root, "outside.aseprite"), join(ws.sources, "link.aseprite"), "file");
  } catch (error) {
    rmSync(ws.root, { recursive: true, force: true });
    t.skip(`symlink unavailable: ${error.code}`);
    return;
  }
  const session = await connect(ws, { DEVLAB_ASEPRITE_WRITE: "1" });
  try {
    const result = await session.client.callTool({ name: "aseprite_inspect", arguments: { source: "link.aseprite" } });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "GM_SOURCE_NOT_ALLOWED");
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: identity and unknown keys are rejected by the closed schema", { timeout: 60_000 }, async () => {
  const ws = workspace();
  const session = await connect(ws, { DEVLAB_ASEPRITE_WRITE: "1" });
  try {
    for (const [label, args] of [
      ["uppercase assetId", { source: "hero.aseprite", assetId: "Hero", version: "1.0.0" }],
      ["path-like assetId", { source: "hero.aseprite", assetId: "../escape", version: "1.0.0" }],
      ["non-semver version", { source: "hero.aseprite", assetId: "hero", version: "one" }],
      ["unknown origin", { source: "hero.aseprite", assetId: "hero", version: "1.0.0", origin: "middle-left" }],
      ["smuggled timeout", { source: "hero.aseprite", assetId: "hero", version: "1.0.0", timeoutMs: 1 }],
      ["smuggled executable", { source: "hero.aseprite", assetId: "hero", version: "1.0.0", asepritePath: "C:/evil.exe" }],
      ["smuggled repoRoot", { source: "hero.aseprite", assetId: "hero", version: "1.0.0", repoRoot: "C:/" }],
    ]) {
      const result = await session.client.callTool({ name: "aseprite_ingest", arguments: args });
      assert.equal(result.isError, true, `${label} must be rejected`);
    }
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: ingesting is refused until the host opts in", { timeout: 60_000, ...realAseprite }, async () => {
  const ws = workspace();
  const before = tree(ws.repo);
  const session = await connect(ws, { DEVLAB_ASEPRITE_WRITE: undefined });
  try {
    const result = await session.client.callTool({
      name: "aseprite_ingest", arguments: { source: "hero.aseprite", assetId: "hero", version: "1.0.0" },
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "GM_INGEST_WRITE_NOT_ENABLED");
    assert.deepEqual(tree(ws.repo), before);
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: inspect reads a real source without writing", { timeout: 120_000, ...realAseprite }, async () => {
  const ws = workspace();
  const before = tree(ws.repo);
  const session = await connect(ws, {});
  try {
    const inspected = body(await session.client.callTool({
      name: "aseprite_inspect", arguments: { source: "hero.aseprite" },
    }), "inspect");
    assert.equal(inspected.frameCount, 3);
    assert.equal(inspected.width, 16);
    assert.equal(inspected.height, 24);
    assert.equal(inspected.colourFormat, "RGBA8888");
    assert.equal(inspected.source, "hero.aseprite", "the relative name is echoed, not the host path");
    assert.equal(inspected.sourceSha256, sha256(readFileSync(FIXTURE)));
    assert.deepEqual(tree(ws.repo), before);

    // A nested source resolves too.
    const nested = body(await session.client.callTool({
      name: "aseprite_inspect", arguments: { source: "nested/villain.aseprite" },
    }), "nested inspect");
    assert.equal(nested.frameCount, 3);
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: a real ingest writes a DRAFT catalog entry and is reproducible", { timeout: 300_000, ...realAseprite }, async () => {
  const ws = workspace();
  const session = await connect(ws, { DEVLAB_ASEPRITE_WRITE: "1" });
  try {
    const first = body(await session.client.callTool({
      name: "aseprite_ingest",
      arguments: { source: "hero.aseprite", assetId: "hero-runner", version: "1.0.0", origin: "bottom-centre" },
    }), "ingest");

    assert.equal(first.deterministic, true);
    assert.equal(first.catalogStatus, "DRAFT", "ingest must never approve its own output");
    assert.equal(first.catalogEntry.status, "DRAFT");
    assert.equal(first.frameCount, 3);
    assert.deepEqual(first.dimensions, { width: 16, height: 24 });
    assert.deepEqual(first.origin, { x: 8, y: 24 });
    assert.equal(first.exports.length, 3);

    for (const output of first.exports) {
      const bytes = readFileSync(join(ws.repo, output.path));
      assert.equal(sha256(bytes), output.sha256);
      assert.equal(bytes.byteLength, output.bytes);
    }
    assert.ok(existsSync(join(ws.repo, first.specPath)));
    assert.ok(existsSync(join(ws.repo, first.artifactManifestPath)));

    // Writes stay inside the catalog root.
    assert.equal(existsSync(join(ws.sources, "assets")), false);
    const serialized = JSON.stringify(first);
    assert.equal(/[A-Za-z]:[\\/]/.test(serialized), false, "no host path may cross the transport");

    // Re-ingesting the same source reproduces identical digests.
    const second = body(await session.client.callTool({
      name: "aseprite_ingest",
      arguments: { source: "hero.aseprite", assetId: "hero-runner", version: "1.0.0", origin: "bottom-centre" },
    }), "re-ingest");
    assert.equal(second.specSha256, first.specSha256);
    assert.deepEqual(second.exports.map(({ sha256: d }) => d), first.exports.map(({ sha256: d }) => d));
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});
