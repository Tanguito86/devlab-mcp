import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Cross-tier composition test.
 *
 * The three GameMaker servers are deliberately separate packages, which makes
 * it easy for their contracts to drift apart unnoticed. This test drives all of
 * them over real stdio in the order an agent would:
 *
 *   read.plan_new_object -> write.apply -> write.verify_text -> write.rollback
 *
 * It reaches sibling packages by path rather than by dependency on purpose:
 * depending on the write tier from the read tier is exactly the coupling the
 * split exists to prevent.
 */
const READ_SERVER = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const WRITE_SERVER = fileURLToPath(new URL("../../gamemaker-write-mcp/dist/index.js", import.meta.url));
const COMPILE_SERVER = fileURLToPath(new URL("../../gamemaker-compile-mcp/dist/index.js", import.meta.url));
const fixture = new URL("../../../fixtures/gamemaker/hermes-bridge-pilot/", import.meta.url);
const projectPath = "Demo";

const IGOR_KEYS = ["DEVLAB_GM_IGOR", "DEVLAB_GM_RUNTIME", "DEVLAB_GM_PROJECT_TOOL", "DEVLAB_GM_USER_DIR"];
const igorReady = process.platform === "win32" && IGOR_KEYS.every((key) => Boolean(process.env[key]));
const realIgor = igorReady ? {} : { skip: "requires a configured Windows GameMaker toolchain" };

async function connect(entry, root, env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    cwd: root,
    env: { ...process.env, DEVLAB_GM_PROJECTS_DIR: root, ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "gm-chain", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function close(session) {
  await session.client.close().catch(() => undefined);
  await session.transport.close().catch(() => undefined);
}

const structured = (result, label) => {
  assert.notEqual(result.isError, true, `${label}: ${JSON.stringify(result.structuredContent ?? result)}`);
  return result.structuredContent;
};

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), "gm-chain-"));
  await cp(fixture, join(root, projectPath), { recursive: true });
  return root;
}

test("CHAIN: an authored object is planned, applied, verified and rolled back across three servers", { timeout: 120_000 }, async () => {
  const root = await sandbox();
  const readSide = await connect(READ_SERVER, root, {});
  const writeSide = await connect(WRITE_SERVER, root, { DEVLAB_GM_WRITE_ALLOW: "*" });
  try {
    const tools = (await readSide.client.listTools()).tools.map(({ name }) => name);
    assert.deepEqual(tools, [
      "gamemaker_status",
      "gamemaker_inspect",
      "gamemaker_plan",
      "gamemaker_plan_new_script",
      "gamemaker_plan_new_object",
    ]);

    const before = structured(await readSide.client.callTool({ name: "gamemaker_inspect", arguments: { projectPath } }), "inspect");

    const planned = structured(await readSide.client.callTool({
      name: "gamemaker_plan_new_object",
      arguments: {
        projectPath,
        expectedProjectFingerprint: before.fingerprint,
        name: "obj_chain_probe",
        events: [
          { event: "create", gml: "chain_hits = 0;\n" },
          { event: "step", gml: "chain_hits += 1;\n" },
        ],
      },
    }), "plan_new_object");

    assert.equal(planned.resourceKind, "object");
    assert.equal(planned.resourcePath, "objects/obj_chain_probe/obj_chain_probe.yy");
    assert.deepEqual(planned.changes.map(({ path }) => path).sort(), [
      "HermesBridgePilot.resource_order",
      "HermesBridgePilot.yyp",
      "objects/obj_chain_probe/Create_0.gml",
      "objects/obj_chain_probe/Step_0.gml",
      "objects/obj_chain_probe/obj_chain_probe.yy",
    ]);
    // Planning writes nothing.
    assert.equal(await stat(join(root, projectPath, "objects/obj_chain_probe")).catch(() => null), null);

    // The plan the read tier emits must be directly applicable by the write tier.
    const applied = structured(await writeSide.client.callTool({
      name: "gamemaker_apply",
      arguments: { projectPath, plan: planned.plan, planHash: planned.planHash, confirm: true, dryRun: false },
    }), "apply");
    assert.equal(applied.state, "APPLIED");
    assert.equal(applied.changedFiles.length, 5);

    const objectYy = await readFile(join(root, projectPath, "objects/obj_chain_probe/obj_chain_probe.yy"), "utf8");
    assert.ok(objectYy.includes('"$GMObject":""'));
    assert.ok(objectYy.includes('"eventType":3'));
    const yyp = await readFile(join(root, projectPath, "HermesBridgePilot.yyp"), "utf8");
    assert.ok(yyp.includes("objects/obj_chain_probe/obj_chain_probe.yy"));
    assert.ok(yyp.includes("obj_gm_bridge_pilot"), "the pre-existing resource must survive");

    const verified = structured(await writeSide.client.callTool({
      name: "gamemaker_verify_text",
      arguments: { projectPath, expectedProjectFingerprint: applied.projectFingerprint },
    }), "verify_text");
    assert.equal(verified.textValid.passed, true, "generated .yy and .gml must parse");

    const rolled = structured(await writeSide.client.callTool({
      name: "gamemaker_rollback",
      arguments: {
        projectPath,
        transactionId: planned.plan.transactionId,
        planHash: planned.planHash,
        expectedProjectFingerprint: applied.projectFingerprint,
        confirm: true,
      },
    }), "rollback");
    assert.equal(rolled.byteExact, true);

    const after = structured(await readSide.client.callTool({ name: "gamemaker_inspect", arguments: { projectPath } }), "inspect after");
    assert.equal(after.fingerprint, before.fingerprint);
  } finally {
    await close(writeSide);
    await close(readSide);
    await rm(root, { recursive: true, force: true });
  }
});

test("CHAIN: authoring refusals are reported without writing anything", { timeout: 60_000 }, async () => {
  const root = await sandbox();
  const readSide = await connect(READ_SERVER, root, {});
  try {
    const before = structured(await readSide.client.callTool({ name: "gamemaker_inspect", arguments: { projectPath } }), "inspect");
    const cases = [
      ["a name that is not a GML identifier", { name: "obj-bad", events: [{ event: "create", gml: "x" }] }],
      ["an existing resource name", { name: "obj_gm_bridge_pilot", events: [{ event: "create", gml: "x" }] }],
      ["a case variant of an existing name", { name: "OBJ_GM_Bridge_Pilot", events: [{ event: "create", gml: "x" }] }],
      ["a sprite the project lacks", { name: "obj_ok", events: [{ event: "create", gml: "x" }], spriteName: "spr_missing" }],
      ["an unsupported event number", { name: "obj_ok2", events: [{ event: "alarm", eventNum: 99, gml: "x" }] }],
    ];
    for (const [label, args] of cases) {
      const result = await readSide.client.callTool({
        name: "gamemaker_plan_new_object",
        arguments: { projectPath, expectedProjectFingerprint: before.fingerprint, ...args },
      });
      assert.equal(result.isError, true, `${label} must be refused`);
    }
    const after = structured(await readSide.client.callTool({ name: "gamemaker_inspect", arguments: { projectPath } }), "inspect after");
    assert.equal(after.fingerprint, before.fingerprint);
  } finally {
    await close(readSide);
    await rm(root, { recursive: true, force: true });
  }
});

test("CHAIN: an authored script and object compile with real Igor", { timeout: 600_000, ...realIgor }, async () => {
  const root = await sandbox();
  const readSide = await connect(READ_SERVER, root, {});
  const writeSide = await connect(WRITE_SERVER, root, { DEVLAB_GM_WRITE_ALLOW: "*" });
  const buildSide = await connect(COMPILE_SERVER, root, { DEVLAB_GM_ALLOW_IGOR: "1", DEVLAB_GM_TIMEOUT_MS: "300000" });
  try {
    let current = structured(await readSide.client.callTool({ name: "gamemaker_inspect", arguments: { projectPath } }), "inspect");

    const script = structured(await readSide.client.callTool({
      name: "gamemaker_plan_new_script",
      arguments: {
        projectPath,
        expectedProjectFingerprint: current.fingerprint,
        name: "scr_chain_double",
        gml: "function scr_chain_double(_v) {\n    return _v * 2;\n}\n",
      },
    }), "plan_new_script");
    const scriptApplied = structured(await writeSide.client.callTool({
      name: "gamemaker_apply",
      arguments: { projectPath, plan: script.plan, planHash: script.planHash, confirm: true, dryRun: false },
    }), "apply script");
    assert.equal(scriptApplied.state, "APPLIED");

    current = structured(await readSide.client.callTool({ name: "gamemaker_inspect", arguments: { projectPath } }), "inspect 2");
    const object = structured(await readSide.client.callTool({
      name: "gamemaker_plan_new_object",
      arguments: {
        projectPath,
        expectedProjectFingerprint: current.fingerprint,
        name: "obj_chain_runner",
        events: [
          { event: "create", gml: 'show_debug_message("CHAIN=" + string(scr_chain_double(21)));\n' },
        ],
      },
    }), "plan_new_object");
    const objectApplied = structured(await writeSide.client.callTool({
      name: "gamemaker_apply",
      arguments: { projectPath, plan: object.plan, planHash: object.planHash, confirm: true, dryRun: false },
    }), "apply object");
    assert.equal(objectApplied.state, "APPLIED");

    const built = structured(await buildSide.client.callTool({
      name: "gamemaker_verify_build",
      arguments: { projectPath, expectedProjectFingerprint: objectApplied.projectFingerprint },
    }), "verify_build");

    assert.equal(built.levels.COMPILE_VALID.passed, true, `diagnostics: ${JSON.stringify(built.diagnostics)}`);
    assert.equal(built.compileExitCode, 0);
    assert.deepEqual(built.diagnostics, [], "generated resources must produce no compiler diagnostics");
  } finally {
    await close(buildSide);
    await close(writeSide);
    await close(readSide);
    await rm(root, { recursive: true, force: true });
  }
});
