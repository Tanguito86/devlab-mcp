import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { canonicalJson } from "@tanguito/devlab-img2threejs-asset-forge";
import { createBridgeTestBeacon } from "@tanguito/devlab-asset-gm-bridge";

const SERVER = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const GM_FIXTURE = new URL("../../../fixtures/gamemaker/asset-bridge-pilot/", import.meta.url);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const SPEC = Object.freeze({
  schemaVersion: 1, assetId: "bridge-test-beacon", version: "1.0.0", width: 64, height: 64,
  frameCount: 2, palette: "v1-cyan", origin: { x: 32, y: 64 },
  collisionPolicy: "bbox-auto", compressionPolicy: "stored-deflate", budgetProfile: "bridge-sprite-v1",
});

/** Builds a workspace with a catalog, a built asset and a GameMaker project. */
function workspace({ status = "APPROVED" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "asset-mcp-"));
  const specRel = "assets/pilots/bridge-test-beacon/1.0.0.spec.json";
  const artifactRel = "assets/builds/artifacts/bridge-test-beacon/1.0.0/artifact-manifest.json";
  mkdirSync(join(root, "assets/builds/artifacts/bridge-test-beacon/1.0.0/exports"), { recursive: true });
  mkdirSync(join(root, "assets/pilots/bridge-test-beacon"), { recursive: true });
  writeFileSync(join(root, specRel), `${canonicalJson(SPEC)}\n`);

  const asset = createBridgeTestBeacon(SPEC);
  const outputs = asset.pngBytes.map((png, index) => {
    const rel = `assets/builds/artifacts/bridge-test-beacon/1.0.0/exports/f_${index}.png`;
    writeFileSync(join(root, rel), png);
    return { path: rel, sha256: sha256(png), bytes: png.byteLength, width: 64, height: 64, channels: 4 };
  });
  const artifact = {
    schemaVersion: 1, assetId: "bridge-test-beacon", version: "1.0.0", specPath: specRel,
    specSha256: sha256(readFileSync(join(root, specRel))), generatedModuleSha256: "0".repeat(64),
    budgetProfile: "bridge-sprite-v1",
    gates: { SPEC_GATE: "PASS", BUDGET_GATE: "PASS", PNG_GATE: "PASS", DETERMINISM_GATE: "PASS", LIFECYCLE_GATE: "PASS" },
    outputs,
  };
  writeFileSync(join(root, artifactRel), `${canonicalJson(artifact)}\n`);
  mkdirSync(join(root, "assets/catalog"), { recursive: true });
  writeFileSync(join(root, "assets/catalog/asset-catalog.json"), `${canonicalJson({
    schemaVersion: 1, migration: "asset-catalog-v1",
    entries: [{
      assetId: "bridge-test-beacon", version: "1.0.0", status, assetClass: "bridge-sprite",
      specPath: specRel, factoryCapability: "asset-forge", artifactManifest: artifactRel,
      budgetProfile: "bridge-sprite-v1", criticProfiles: [], rendererTargets: ["webgl"],
      exports: outputs.map(({ path }) => path),
      provenance: { manifest: artifactRel, source: specRel, sourceSha256: "0".repeat(64), license: "MIT", manifestSha256: sha256(readFileSync(join(root, artifactRel))) },
    }],
  })}\n`);

  const projectsDir = join(root, "projects");
  mkdirSync(projectsDir, { recursive: true });
  cpSync(fileURLToPath(GM_FIXTURE), join(projectsDir, "game"), { recursive: true });
  return { root, projectsDir, catalogPath: join(root, "assets/catalog/asset-catalog.json") };
}

function treeState(root) {
  const records = [];
  const walk = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(directory, entry.name), rel);
      else records.push({ path: rel, bytes: readFileSync(join(directory, entry.name)).toString("base64") });
    }
  };
  walk(root);
  return { count: records.length, hash: sha256(JSON.stringify(records)) };
}

async function connect(ws, env) {
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    cwd: ws.root,
    env: {
      ...process.env,
      DEVLAB_GM_PROJECTS_DIR: ws.projectsDir,
      DEVLAB_GM_ASSET_CATALOG: ws.catalogPath,
      DEVLAB_GM_ASSET_REPO_ROOT: ws.root,
      ...env,
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
  const client = new Client({ name: "asset-mcp-e2e", version: "1.0.0" });
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

test("MCP E2E: exactly five asset tools and no other surface", { timeout: 30_000 }, async () => {
  const ws = workspace();
  const session = await connect(ws, {});
  try {
    const tools = (await session.client.listTools()).tools;
    assert.deepEqual(tools.map(({ name }) => name), [
      "asset_status", "asset_inspect", "asset_plan_import", "asset_apply_import", "asset_rollback_import",
    ]);
    // Compilation belongs to the build tier; this server must not offer it.
    for (const forbidden of ["asset_verify_import", "gamemaker_verify_build", "gamemaker_apply"]) {
      assert.equal(tools.some(({ name }) => name === forbidden), false, forbidden);
    }
    assert.equal(tools.find(({ name }) => name === "asset_apply_import").annotations.readOnlyHint, false);
    assert.equal(tools.find(({ name }) => name === "asset_inspect").annotations.readOnlyHint, true);
    for (const surface of [() => session.client.listResources(), () => session.client.listPrompts()]) {
      await assert.rejects(surface);
    }
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: inspect and status read without touching the project", { timeout: 30_000 }, async () => {
  const ws = workspace();
  const before = treeState(join(ws.projectsDir, "game"));
  const session = await connect(ws, {});
  try {
    const inspected = body(await session.client.callTool({
      name: "asset_inspect", arguments: { assetId: "bridge-test-beacon", assetVersion: "1.0.0" },
    }), "inspect");
    assert.equal(inspected.approved, true);
    assert.equal(inspected.frameCount, 2);
    assert.deepEqual(inspected.dimensions, { width: 64, height: 64 });
    assert.equal(inspected.budget.status, "SUCCESS");

    const status = body(await session.client.callTool({
      name: "asset_status", arguments: { projectPath: "game", assetId: "bridge-test-beacon", assetVersion: "1.0.0" },
    }), "status");
    assert.equal(status.assetApproved, true);
    assert.equal(status.writeEnabled, false, "writing must be off until the host opts in");
    assert.match(status.projectFingerprint, /^[a-f0-9]{64}$/);

    assert.deepEqual(treeState(join(ws.projectsDir, "game")), before);
    const serialized = JSON.stringify([inspected, status]);
    assert.equal(serialized.includes(ws.root), false, "no host path may cross the transport");
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: planning cannot place evidence inside the project", { timeout: 60_000 }, async () => {
  const ws = workspace();
  const gameRoot = join(ws.projectsDir, "game");
  const before = treeState(gameRoot);
  let statusSession;
  let nestedSession;
  try {
    statusSession = await connect(ws, { DEVLAB_GM_EVIDENCE_ROOT: ".safe-evidence" });
    const status = body(await statusSession.client.callTool({
      name: "asset_status", arguments: { projectPath: "game", assetId: "bridge-test-beacon", assetVersion: "1.0.0" },
    }), "safe status");
    await close(statusSession);
    statusSession = null;

    nestedSession = await connect(ws, { DEVLAB_GM_EVIDENCE_ROOT: "GAME/.evidence" });
    const planned = await nestedSession.client.callTool({
      name: "asset_plan_import",
      arguments: {
        projectPath: "game", expectedProjectFingerprint: status.projectFingerprint,
        assetId: "bridge-test-beacon", assetVersion: "1.0.0",
        resourceName: "spr_bridge_test_beacon", transactionId: "nested-evidence-001",
      },
    });
    assert.equal(planned.isError, true);
    assert.equal(planned.structuredContent.error.code, "PATH_NOT_ALLOWED");
    assert.deepEqual(treeState(gameRoot), before);
    assert.equal(existsSync(join(gameRoot, ".evidence")), false);
  } finally {
    if (statusSession) await close(statusSession);
    if (nestedSession) await close(nestedSession);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: import plans, applies and rolls back byte-exactly", { timeout: 120_000 }, async () => {
  const ws = workspace();
  const gameRoot = join(ws.projectsDir, "game");
  const before = treeState(gameRoot);
  const session = await connect(ws, { DEVLAB_GM_ASSET_WRITE: "1" });
  const common = {
    projectPath: "game", assetId: "bridge-test-beacon", assetVersion: "1.0.0",
    resourceName: "spr_bridge_test_beacon", transactionId: "mcp-import-001",
  };
  try {
    const status = body(await session.client.callTool({
      name: "asset_status", arguments: { projectPath: "game", assetId: "bridge-test-beacon", assetVersion: "1.0.0" },
    }), "status");
    assert.equal(status.writeEnabled, true);

    const planned = body(await session.client.callTool({
      name: "asset_plan_import",
      arguments: { ...common, expectedProjectFingerprint: status.projectFingerprint },
    }), "plan");
    assert.equal(planned.instrumentation, "NONE");
    assert.equal(planned.frameCount, 2);
    assert.deepEqual(planned.origin, { x: 32, y: 64 });
    assert.equal(planned.changes.some(({ path }) => path.endsWith(".gml")), false, "a plain import must not touch object code");
    // Planning leaves the project itself untouched.
    assert.deepEqual(treeState(gameRoot), before);

    const dry = body(await session.client.callTool({
      name: "asset_apply_import",
      arguments: { ...common, expectedProjectFingerprint: status.projectFingerprint, planHash: planned.planHash, bindingHash: planned.bindingHash, confirm: true },
    }), "dry run");
    assert.equal(dry.state, "DRY_RUN");
    assert.deepEqual(treeState(gameRoot), before);

    const applied = body(await session.client.callTool({
      name: "asset_apply_import",
      arguments: { ...common, expectedProjectFingerprint: status.projectFingerprint, planHash: planned.planHash, bindingHash: planned.bindingHash, confirm: true, dryRun: false },
    }), "apply");
    assert.equal(applied.state, "APPLIED");
    assert.ok(existsSync(join(gameRoot, "sprites/spr_bridge_test_beacon/spr_bridge_test_beacon.yy")));

    const rolled = body(await session.client.callTool({
      name: "asset_rollback_import",
      arguments: { ...common, expectedProjectFingerprint: applied.projectFingerprint, planHash: planned.planHash, bindingHash: planned.bindingHash, confirm: true },
    }), "rollback");
    assert.equal(rolled.byteExact, true);
    assert.deepEqual(treeState(gameRoot), before);
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: writing is refused until the host opts in", { timeout: 60_000 }, async () => {
  const ws = workspace();
  const gameRoot = join(ws.projectsDir, "game");
  const before = treeState(gameRoot);
  const session = await connect(ws, { DEVLAB_GM_ASSET_WRITE: undefined });
  const common = {
    projectPath: "game", assetId: "bridge-test-beacon", assetVersion: "1.0.0",
    resourceName: "spr_bridge_test_beacon", transactionId: "mcp-denied-001",
  };
  try {
    const status = body(await session.client.callTool({
      name: "asset_status", arguments: { projectPath: "game", assetId: "bridge-test-beacon", assetVersion: "1.0.0" },
    }), "status");
    const planned = body(await session.client.callTool({
      name: "asset_plan_import", arguments: { ...common, expectedProjectFingerprint: status.projectFingerprint },
    }), "plan");
    for (const name of ["asset_apply_import", "asset_rollback_import"]) {
      const result = await session.client.callTool({
        name,
        arguments: { ...common, expectedProjectFingerprint: status.projectFingerprint, planHash: planned.planHash, bindingHash: planned.bindingHash, confirm: true, ...(name.includes("apply") ? { dryRun: false } : {}) },
      });
      assert.equal(result.isError, true, name);
      assert.equal(result.structuredContent.error.code, "GM_ASSET_WRITE_NOT_ENABLED");
    }
    assert.deepEqual(treeState(gameRoot), before);
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: a non-APPROVED asset never reaches a plan", { timeout: 60_000 }, async () => {
  const ws = workspace({ status: "DRAFT" });
  const gameRoot = join(ws.projectsDir, "game");
  const before = treeState(gameRoot);
  const session = await connect(ws, { DEVLAB_GM_ASSET_WRITE: "1" });
  try {
    const status = body(await session.client.callTool({
      name: "asset_status", arguments: { projectPath: "game", assetId: "bridge-test-beacon", assetVersion: "1.0.0" },
    }), "status");
    assert.equal(status.assetApproved, false);
    const result = await session.client.callTool({
      name: "asset_plan_import",
      arguments: {
        projectPath: "game", expectedProjectFingerprint: status.projectFingerprint,
        assetId: "bridge-test-beacon", assetVersion: "1.0.0",
        resourceName: "spr_bridge_test_beacon", transactionId: "mcp-draft-001",
      },
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "ASSET_NOT_APPROVED");
    assert.deepEqual(treeState(gameRoot), before);
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test("MCP E2E: unconfigured catalog and hostile inputs fail closed", { timeout: 60_000 }, async () => {
  const ws = workspace();
  const bare = await connect(ws, { DEVLAB_GM_ASSET_CATALOG: undefined });
  try {
    const missing = await bare.client.callTool({
      name: "asset_inspect", arguments: { assetId: "bridge-test-beacon", assetVersion: "1.0.0" },
    });
    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent.error.code, "GM_CONFIG_REQUIRED");
  } finally {
    await close(bare);
  }

  const session = await connect(ws, { DEVLAB_GM_ASSET_WRITE: "1" });
  try {
    for (const [label, args] of [
      ["traversal project path", { projectPath: "../escape", assetId: "bridge-test-beacon", assetVersion: "1.0.0" }],
      ["absolute project path", { projectPath: "C:/Windows", assetId: "bridge-test-beacon", assetVersion: "1.0.0" }],
    ]) {
      const result = await session.client.callTool({ name: "asset_status", arguments: args });
      assert.equal(result.isError, true, label);
      assert.equal(/[A-Za-z]:[\\/]/.test(JSON.stringify(result.structuredContent)), false, `${label} must not echo a path`);
    }

    // An unknown asset is a legitimate answer for a status query and an error
    // for an inspection. The two tools differ on purpose.
    const unknownStatus = body(await session.client.callTool({
      name: "asset_status", arguments: { projectPath: "game", assetId: "nope", assetVersion: "1.0.0" },
    }), "unknown status");
    assert.equal(unknownStatus.assetId, null);
    assert.equal(unknownStatus.assetApproved, false);

    const unknownInspect = await session.client.callTool({
      name: "asset_inspect", arguments: { assetId: "nope", assetVersion: "1.0.0" },
    });
    assert.equal(unknownInspect.isError, true);
    assert.equal(unknownInspect.structuredContent.error.code, "ASSET_NOT_FOUND");
    // The pilot instrumentation mode must be unreachable through the contract.
    const smuggled = await session.client.callTool({
      name: "asset_plan_import",
      arguments: {
        projectPath: "game", expectedProjectFingerprint: "0".repeat(64),
        assetId: "bridge-test-beacon", assetVersion: "1.0.0",
        resourceName: "spr_bridge_test_beacon", transactionId: "mcp-smuggle-001",
        instrumentation: "PILOT_BEACON_V1",
      },
    });
    assert.equal(smuggled.isError, true, "an unrecognised key must be rejected, not ignored");
    assert.equal(session.stderr.join("").includes(ws.root), false);
  } finally {
    await close(session);
    rmSync(ws.root, { recursive: true, force: true });
  }
});
