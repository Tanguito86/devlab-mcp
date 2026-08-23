// The loop that was impossible before: create a project, read it back, plan
// against what it actually says, apply, and read the result. Every step is an
// MCP tool call -- nothing here touches the filesystem except to check the
// servers' work.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { authorProject } from "@tanguito/devlab-gm-authoring";
import { GovernedGameMakerWriteService } from "../dist/core.js";

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

test("BOOTSTRAP: creation recognizes its receipt and refuses a conflicting used directory", { timeout: 60_000 }, async () => {
  await harness(async ({ root, write }) => {
    await write("gamemaker_create_project", { projectPath: "Taken", name: "Taken", confirm: true, dryRun: false });

    const retried = await write("gamemaker_create_project", {
      projectPath: "Taken", name: "Taken", confirm: true, dryRun: false,
    });
    assert.equal(retried.ok, true, "a completed request with an external receipt is idempotent");

    const occupied = await write("gamemaker_create_project", {
      projectPath: "Taken", name: "Different", confirm: true, dryRun: false,
    });
    assert.equal(occupied.ok, false, "a conflicting request for a used directory must be refused");
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

test("BOOTSTRAP: a durable claim resumes after failure following the first file", async () => {
  const root = await mkdtemp(join(tmpdir(), "gm-create-atomic-"));
  try {
    const service = new GovernedGameMakerWriteService({ DEVLAB_GM_PROJECTS_DIR: root, DEVLAB_GM_WRITE_ALLOW: "*" });
    await assert.rejects(
      () => service.createProject({ projectPath: "Atomic", name: "Atomic", confirm: true, dryRun: false, faultAt: "after-first-staged-file" }, "atomic-fault", new AbortController().signal),
      (error) => error.code === "GM_INTERNAL_ERROR",
    );
    const pending = await readdir(join(root, "Atomic"));
    assert.ok(pending.includes(".devlab-create-claim.json"), "the durable claim must survive the failure");
    assert.ok(pending.includes(".devlab-create-phase-0000.json"), "WRITING must be durable before the authored file");
    assert.ok(pending.includes("Atomic.yyp"), "the first exact file remains attached to its durable phase");

    const resumed = await service.createProject(
      { projectPath: "Atomic", name: "Atomic", confirm: true, dryRun: false },
      "atomic-resume",
      new AbortController().signal,
    );
    assert.equal(resumed.created, true);
    assert.deepEqual((await readdir(join(root, "Atomic"))).sort(), ["Atomic.resource_order", "Atomic.yyp"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BOOTSTRAP: external authority recreates a missing secondary marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "gm-create-authority-"));
  try {
    const service = new GovernedGameMakerWriteService({ DEVLAB_GM_PROJECTS_DIR: root, DEVLAB_GM_WRITE_ALLOW: "*" });
    await assert.rejects(
      () => service.createProject({ projectPath: "Authority", name: "Authority", confirm: true, dryRun: false, faultAt: "after-external-authority" }, "authority-fault", new AbortController().signal),
      (error) => error.code === "GM_INTERNAL_ERROR",
    );
    assert.deepEqual(await readdir(join(root, "Authority")), []);
    const resumed = await service.createProject(
      { projectPath: "Authority", name: "Authority", confirm: true, dryRun: false },
      "authority-resume",
      new AbortController().signal,
    );
    assert.equal(resumed.created, true);
    assert.deepEqual((await readdir(join(root, "Authority"))).sort(), ["Authority.resource_order", "Authority.yyp"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BOOTSTRAP: an external receipt resumes after the final target marker was removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "gm-create-receipt-"));
  try {
    const service = new GovernedGameMakerWriteService({ DEVLAB_GM_PROJECTS_DIR: root, DEVLAB_GM_WRITE_ALLOW: "*" });
    await assert.rejects(
      () => service.createProject({ projectPath: "Receipt", name: "Receipt", confirm: true, dryRun: false, faultAt: "after-final-marker-removal" }, "receipt-fault", new AbortController().signal),
      (error) => error.code === "GM_INTERNAL_ERROR",
    );
    assert.deepEqual((await readdir(join(root, "Receipt"))).sort(), ["Receipt.resource_order", "Receipt.yyp"]);
    const resumed = await service.createProject(
      { projectPath: "Receipt", name: "Receipt", confirm: true, dryRun: false },
      "receipt-resume",
      new AbortController().signal,
    );
    assert.equal(resumed.created, true);
    assert.deepEqual((await readdir(join(root, "Receipt"))).sort(), ["Receipt.resource_order", "Receipt.yyp"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BOOTSTRAP: a completed receipt never reopens an emptied project", async () => {
  const root = await mkdtemp(join(tmpdir(), "gm-create-completed-"));
  try {
    const service = new GovernedGameMakerWriteService({ DEVLAB_GM_PROJECTS_DIR: root, DEVLAB_GM_WRITE_ALLOW: "*" });
    const request = { projectPath: "Completed", name: "Completed", confirm: true, dryRun: false };
    await service.createProject(request, "completed-first", new AbortController().signal);
    await unlink(join(root, "Completed", "Completed.yyp"));
    await unlink(join(root, "Completed", "Completed.resource_order"));
    await assert.rejects(
      () => service.createProject(request, "completed-retry", new AbortController().signal),
      (error) => error.code === "GM_INVALID_REQUEST",
    );
    assert.deepEqual(await readdir(join(root, "Completed")), [], "terminal authority must never authorize a new write");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BOOTSTRAP: a forged in-project claim has no authority and is preserved", async () => {
  const root = await mkdtemp(join(tmpdir(), "gm-create-forged-"));
  try {
    const target = join(root, "Forged");
    const ledgerDir = join(root, ".devlab-gamemaker-mcp-write", "create-projects");
    await mkdir(target);
    await mkdir(ledgerDir, { recursive: true });
    const identity = async (path) => {
      const canonical = await realpath(path);
      const info = await lstat(canonical, { bigint: true });
      const physical = canonical.replace(/\\/g, "/").replace(/\/+$/, "");
      return `${process.platform}:${info.dev}:${info.ino}:${process.platform === "win32" ? physical.toLowerCase() : physical}`;
    };
    const files = authorProject("Forged").files.map(({ path, content }) => ({
      path,
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
      size: Buffer.byteLength(content, "utf8"),
    }));
    const forged = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: "DEVLAB_GM_CREATE_CLAIM",
      nonce: randomUUID(),
      request: { projectPath: "Forged", name: "Forged", confirm: true, dryRun: false },
      parentIdentity: await identity(root),
      targetIdentity: await identity(target),
      ledgerIdentity: await identity(ledgerDir),
      files,
    }), "utf8");
    const marker = join(target, ".devlab-create-claim.json");
    await writeFile(marker, forged, { flag: "wx" });
    const service = new GovernedGameMakerWriteService({ DEVLAB_GM_PROJECTS_DIR: root, DEVLAB_GM_WRITE_ALLOW: "*" });
    await assert.rejects(
      () => service.createProject({ projectPath: "Forged", name: "Forged", confirm: true, dryRun: false }, "forged", new AbortController().signal),
      (error) => error.code === "GM_INVALID_REQUEST",
    );
    assert.deepEqual(await readdir(target), [".devlab-create-claim.json"]);
    assert.deepEqual(await readFile(marker), forged);
    assert.deepEqual(await readdir(ledgerDir), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BOOTSTRAP: an expected-hash foreign file without a durable phase is refused and preserved", async () => {
  const root = await mkdtemp(join(tmpdir(), "gm-create-foreign-"));
  try {
    const service = new GovernedGameMakerWriteService({ DEVLAB_GM_PROJECTS_DIR: root, DEVLAB_GM_WRITE_ALLOW: "*" });
    const request = { projectPath: "ForeignClaim", name: "ForeignClaim", confirm: true, dryRun: false };
    await assert.rejects(
      () => service.createProject({ ...request, faultAt: "after-first-staged-file" }, "foreign-fault", new AbortController().signal),
      (error) => error.code === "GM_INTERNAL_ERROR",
    );

    const unauthorized = authorProject("ForeignClaim").files[1];
    assert.equal(unauthorized.path, "ForeignClaim.resource_order");
    const unauthorizedPath = join(root, "ForeignClaim", unauthorized.path);
    await writeFile(unauthorizedPath, unauthorized.content, { encoding: "utf8", flag: "wx" });
    const entriesBefore = (await readdir(join(root, "ForeignClaim"))).sort();
    const bytesBefore = await readFile(unauthorizedPath);

    await assert.rejects(
      () => service.createProject(request, "foreign-retry", new AbortController().signal),
      (error) => error.code === "GM_INVALID_REQUEST",
    );
    assert.deepEqual((await readdir(join(root, "ForeignClaim"))).sort(), entriesBefore, "a refused retry must not remove any entry");
    assert.deepEqual(await readFile(unauthorizedPath), bytesBefore, "even expected bytes are foreign without their durable WRITING record");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BOOTSTRAP: an existing empty directory is never replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "gm-create-empty-"));
  try {
    await mkdir(join(root, "Empty"));
    const service = new GovernedGameMakerWriteService({ DEVLAB_GM_PROJECTS_DIR: root, DEVLAB_GM_WRITE_ALLOW: "*" });
    await assert.rejects(
      () => service.createProject({ projectPath: "Empty", name: "Empty", confirm: true, dryRun: false }, "empty-target", new AbortController().signal),
      (error) => error.code === "GM_INVALID_REQUEST",
    );
    assert.deepEqual(await readdir(join(root, "Empty")), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BOOTSTRAP: an empty directory appearing after preflight is never replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "gm-create-race-"));
  try {
    const service = new GovernedGameMakerWriteService({ DEVLAB_GM_PROJECTS_DIR: root, DEVLAB_GM_WRITE_ALLOW: "*" });
    await assert.rejects(
      () => service.createProject({ projectPath: "Raced", name: "Raced", confirm: true, dryRun: false, beforeClaim: async () => mkdir(join(root, "Raced")) }, "raced-target", new AbortController().signal),
      (error) => error.code === "GM_INVALID_REQUEST",
    );
    assert.deepEqual(await readdir(join(root, "Raced")), [], "the foreign empty directory must remain byte-for-byte untouched");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BOOTSTRAP: project creation never creates missing parent directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "gm-create-parent-"));
  try {
    const service = new GovernedGameMakerWriteService({ DEVLAB_GM_PROJECTS_DIR: root, DEVLAB_GM_WRITE_ALLOW: "*" });
    await assert.rejects(
      () => service.createProject({ projectPath: "Missing/Child", name: "Child", confirm: true, dryRun: false }, "missing-parent", new AbortController().signal),
      (error) => error.code === "AUTHZ_PROJECT_ROOT" || error.code === "GM_INVALID_REQUEST",
    );
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("BOOTSTRAP: evidence cannot overlap the target and direct calls still require confirmation", async () => {
  const root = await mkdtemp(join(tmpdir(), "gm-create-boundary-"));
  try {
    const overlapping = new GovernedGameMakerWriteService({
      DEVLAB_GM_PROJECTS_DIR: root,
      DEVLAB_GM_WRITE_ALLOW: "*",
      DEVLAB_GM_EVIDENCE_ROOT: "Overlap/evidence",
    });
    await assert.rejects(
      () => overlapping.createProject({ projectPath: "Overlap", name: "Overlap", confirm: true, dryRun: false }, "overlap", new AbortController().signal),
      (error) => error.code === "GM_CONFIG_INVALID",
    );
    const ordinary = new GovernedGameMakerWriteService({ DEVLAB_GM_PROJECTS_DIR: root, DEVLAB_GM_WRITE_ALLOW: "*" });
    await assert.rejects(
      () => ordinary.createProject({ projectPath: "Unconfirmed", name: "Unconfirmed", confirm: false, dryRun: false }, "unconfirmed", new AbortController().signal),
      (error) => error.code === "GM_INVALID_REQUEST",
    );
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
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
