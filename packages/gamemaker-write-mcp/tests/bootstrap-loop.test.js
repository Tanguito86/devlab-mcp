// The loop that was impossible before: create a project, read it back, plan
// against what it actually says, apply, and read the result. Every step is an
// MCP tool call -- nothing here touches the filesystem except to check the
// servers' work.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const READ_SERVER = fileURLToPath(new URL("../../gamemaker-dev-mcp/dist/index.js", import.meta.url));
const WRITE_SERVER = fileURLToPath(new URL("../dist/index.js", import.meta.url));

async function connect(entry, root, extraEnv) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    cwd: root,
    env: { ...process.env, DEVLAB_GM_PROJECTS_DIR: root, ...extraEnv },
    stderr: "pipe",
  });
  const client = new Client({ name: "bootstrap-loop", version: "1.0.0" });
  await client.connect(transport);
  return {
    client,
    // A schema-level rejection never reaches the server and comes back as a
    // protocol error rather than a structured one. It is still a refusal, so it
    // is normalised into the same shape the tools return.
    call: async (name, args) => {
      try {
        const result = await client.callTool({ name, arguments: args });
        return result.structuredContent
          ?? { ok: false, error: { code: "GM_PROTOCOL_REJECTED", message: JSON.stringify(result.content), recoverable: true } };
      } catch (error) {
        return { ok: false, error: { code: "GM_PROTOCOL_REJECTED", message: String(error.message), recoverable: true } };
      }
    },
  };
}

async function harness(run) {
  const root = await mkdtemp(join(tmpdir(), "gm-bootstrap-"));
  const read = await connect(READ_SERVER, root, {});
  const write = await connect(WRITE_SERVER, root, { DEVLAB_GM_WRITE_ALLOW: "*" });
  try {
    await run({ root, read: read.call, write: write.call });
  } finally {
    await read.client.close().catch(() => {});
    await write.client.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

test("BOOTSTRAP: an empty project is created, inspected, read, edited and re-read", { timeout: 60_000 }, async () => {
  await harness(async ({ root, read, write }) => {
    const projectPath = "MyGame";

    // 1. A dry run reports the files without creating anything.
    const rehearsal = await write("gamemaker_create_project", {
      projectPath, name: "MyGame", confirm: true, dryRun: true,
    });
    assert.equal(rehearsal.ok, true, JSON.stringify(rehearsal.error));
    assert.equal(rehearsal.created, false);
    assert.equal(rehearsal.dryRun, true);
    assert.deepEqual(rehearsal.files.map(({ path }) => path).sort(), ["MyGame.resource_order", "MyGame.yyp"]);
    assert.deepEqual(await readdir(root), [], "a dry run must create nothing");

    // 2. The real thing.
    const created = await write("gamemaker_create_project", {
      projectPath, name: "MyGame", confirm: true, dryRun: false,
    });
    assert.equal(created.ok, true, JSON.stringify(created.error));
    assert.equal(created.created, true);
    assert.equal(created.projectFile, "MyGame.yyp");
    assert.deepEqual((await readdir(join(root, projectPath))).sort(), ["MyGame.resource_order", "MyGame.yyp"]);

    // 3. The read tier recognises it as a project.
    const inspected = await read("gamemaker_inspect", { projectPath });
    assert.equal(inspected.ok, true, JSON.stringify(inspected.error));
    assert.equal(inspected.projectFile, "MyGame.yyp");
    assert.equal(inspected.fileCount, 2);
    assert.deepEqual(inspected.references, []);

    // 4. A room can be planned straight against it -- the empty-array case that
    //    used to emit `[,` and produce a project GameMaker could not load.
    const planned = await read("gamemaker_plan_new_room", {
      projectPath, expectedProjectFingerprint: inspected.fingerprint, name: "rm_start",
    });
    assert.equal(planned.ok, true, JSON.stringify(planned.error));

    const applied = await write("gamemaker_apply", {
      projectPath, plan: planned.plan, planHash: planned.planHash, confirm: true, dryRun: false,
    });
    assert.equal(applied.ok, true, JSON.stringify(applied.error));
    assert.equal(applied.applied, true);

    // 5. Read the project file back through the MCP and prove it parses.
    const after = await read("gamemaker_inspect", { projectPath });
    const readBack = await read("gamemaker_read_text", {
      projectPath,
      expectedProjectFingerprint: after.fingerprint,
      paths: ["MyGame.yyp", "rooms/rm_start/rm_start.yy"],
    });
    assert.equal(readBack.ok, true, JSON.stringify(readBack.error));
    assert.deepEqual(readBack.files.map(({ path }) => path), ["MyGame.yyp", "rooms/rm_start/rm_start.yy"]);
    for (const file of readBack.files) {
      assert.ok(!/\[\s*,/.test(file.text), `${file.path} has a leading comma in an array`);
      assert.doesNotThrow(() => JSON.parse(file.text.replace(/,(\s*[}\]])/g, "$1")), file.path);
      // The digest describes the bytes actually on disk.
      const onDisk = await readFile(join(root, projectPath, file.path), "utf8");
      assert.equal(file.text, onDisk);
      assert.equal(file.size, Buffer.byteLength(onDisk, "utf8"));
    }
    assert.equal(readBack.totalBytes, readBack.files.reduce((sum, f) => sum + f.size, 0));
  });
});

test("BOOTSTRAP: creation refuses a used directory, a bad name and a missing confirm", { timeout: 60_000 }, async () => {
  await harness(async ({ root, write }) => {
    await write("gamemaker_create_project", { projectPath: "Taken", name: "Taken", confirm: true, dryRun: false });

    const occupied = await write("gamemaker_create_project", {
      projectPath: "Taken", name: "Taken", confirm: true, dryRun: false,
    });
    assert.equal(occupied.ok, false, "a directory that already holds a project must be refused");
    assert.equal(occupied.error.recoverable, true);

    // A directory holding something unrelated is refused too.
    await mkdtemp(join(root, "x-"));
    await writeFile(join(root, "Occupied.txt"), "x", "utf8");
    const notEmpty = await write("gamemaker_create_project", {
      projectPath: ".", name: "Root", confirm: true, dryRun: false,
    });
    assert.equal(notEmpty.ok, false, "a non-empty directory must be refused");

    for (const name of ["1bad", "has space", "has-dash", "", "x".repeat(65)]) {
      const result = await write("gamemaker_create_project", {
        projectPath: `P${Math.random().toString(36).slice(2, 8)}`, name, confirm: true, dryRun: false,
      });
      assert.equal(result.ok, false, `name ${JSON.stringify(name)} should have been refused`);
    }

    for (const hostile of ["../escape", "C:/abs", "a/../../b"]) {
      const result = await write("gamemaker_create_project", {
        projectPath: hostile, name: "Esc", confirm: true, dryRun: false,
      });
      assert.equal(result.ok, false, `path ${hostile} should have been refused`);
      assert.ok(!/[A-Za-z]:\\/.test(result.error.message ?? ""), "a refusal must not leak a path");
    }
  });
});

test("BOOTSTRAP: read_text refuses unreadable extensions, unknown paths and escapes", { timeout: 60_000 }, async () => {
  await harness(async ({ root, read, write }) => {
    const projectPath = "Readable";
    await write("gamemaker_create_project", { projectPath, name: "Readable", confirm: true, dryRun: false });
    await writeFile(join(root, projectPath, "notes.png"), "not really a png", "utf8");
    const inspected = await read("gamemaker_inspect", { projectPath });

    const refusals = [
      ["a binary extension", ["notes.png"]],
      ["a path that is not in the project", ["nope.yy"]],
      ["an escape", ["../escape.yy"]],
      ["an absolute path", ["C:/Windows/win.ini"]],
    ];
    for (const [why, paths] of refusals) {
      const result = await read("gamemaker_read_text", {
        projectPath, expectedProjectFingerprint: inspected.fingerprint, paths,
      });
      assert.equal(result.ok, false, `${why} should have been refused`);
      assert.ok(!/[A-Za-z]:\\/.test(result.error.message ?? ""), `${why} leaked a path`);
    }

    // A stale fingerprint fails closed, exactly as it does for planning.
    const stale = await read("gamemaker_read_text", {
      projectPath, expectedProjectFingerprint: "0".repeat(64), paths: ["Readable.yyp"],
    });
    assert.equal(stale.ok, false, "a stale fingerprint must fail closed");

    // Repeats collapse rather than being read twice.
    const repeated = await read("gamemaker_read_text", {
      projectPath, expectedProjectFingerprint: inspected.fingerprint,
      paths: ["Readable.yyp", "Readable.yyp"],
    });
    assert.equal(repeated.ok, true, JSON.stringify(repeated.error));
    assert.equal(repeated.files.length, 1);
  });
});
