import assert from "node:assert/strict";
import test from "node:test";

import {
  applyInputSchema,
  EVIDENCE_ONLY_ANNOTATIONS,
  MUTATING_ANNOTATIONS,
  ROLLBACK_ANNOTATIONS,
  rollbackInputSchema,
  TOOL_NAMES,
  verifyTextInputSchema,
} from "../dist/contracts.js";
import {
  assertWriteAllowed,
  DEFAULT_EVIDENCE_ROOT,
  EVIDENCE_ROOT_ENV,
  GmWriteError,
  mapToolError,
  PROJECTS_DIR_ENV,
  resolveEvidenceRoot,
  resolveProjectsDir,
  resolveWriteAllowlist,
  UNRESTRICTED_WRITE_ALLOW,
  WRITE_ALLOW_ENV,
} from "../dist/core.js";
import { GmAdapterError } from "@tanguito/devlab-gm-ide-adapter";

const digest = (character) => character.repeat(64);

test("TOOL SET: exactly four write-tier tools are declared", () => {
  assert.deepEqual([...TOOL_NAMES], ["gamemaker_apply", "gamemaker_verify_text", "gamemaker_rollback", "gamemaker_create_project"]);
});

test("ANNOTATIONS: no tool claims to be read-only or open-world", () => {
  for (const annotations of [MUTATING_ANNOTATIONS, EVIDENCE_ONLY_ANNOTATIONS, ROLLBACK_ANNOTATIONS]) {
    assert.equal(annotations.readOnlyHint, false);
    assert.equal(annotations.openWorldHint, false);
  }
  assert.equal(MUTATING_ANNOTATIONS.destructiveHint, true);
  assert.equal(ROLLBACK_ANNOTATIONS.destructiveHint, true);
  assert.equal(ROLLBACK_ANNOTATIONS.idempotentHint, false);
});

test("INPUT CONTRACT: apply requires confirm=true and rejects unknown keys", () => {
  const plan = {
    schemaVersion: 1, transactionId: "tx-001", operation: "apply-safe", capability: "GM_APPLY_SAFE_V1",
    gate: "PLAN_ONLY", projectRoot: "Demo", snapshotHash: digest("a"), projectFingerprint: digest("b"),
    expectedHead: null, allowlist: ["a.gml"], allowedExtensions: ["gml"],
    files: [{ path: "a.gml", action: "modify", beforeSha256: digest("c"), afterSha256: digest("d"), afterContentBase64: "eA==" }],
    verification: { projectLoad: false, compile: false, runtime: "forbidden" },
    rollback: { required: true },
  };
  assert.equal(applyInputSchema.safeParse({ projectPath: "Demo", plan, planHash: digest("e"), confirm: true }).success, true);
  assert.equal(applyInputSchema.safeParse({ projectPath: "Demo", plan, planHash: digest("e"), confirm: false }).success, false);
  assert.equal(applyInputSchema.safeParse({ projectPath: "Demo", plan, planHash: digest("e") }).success, false);
  assert.equal(
    applyInputSchema.safeParse({ projectPath: "Demo", plan, planHash: digest("e"), confirm: true, faultAt: "before-staging" }).success,
    false,
    "the adapter's fault-injection hook must not be reachable through the tool contract",
  );
  assert.equal(
    applyInputSchema.safeParse({ projectPath: "Demo", plan, planHash: digest("e"), confirm: true, igor: "C:/Igor.exe" }).success,
    false,
    "no toolchain may be supplied through the tool contract",
  );
});

test("INPUT CONTRACT: verify and rollback reject compile, runtime and toolchain arguments", () => {
  assert.equal(verifyTextInputSchema.safeParse({ projectPath: "Demo", expectedProjectFingerprint: digest("a") }).success, true);
  assert.equal(verifyTextInputSchema.safeParse({ projectPath: "Demo", expectedProjectFingerprint: digest("a"), levels: ["COMPILE_VALID"] }).success, false);
  assert.equal(verifyTextInputSchema.safeParse({ projectPath: "Demo", expectedProjectFingerprint: digest("a"), igor: {} }).success, false);
  assert.equal(rollbackInputSchema.safeParse({ projectPath: "Demo", transactionId: "tx-1", planHash: digest("a"), expectedProjectFingerprint: digest("b"), confirm: true }).success, true);
  assert.equal(rollbackInputSchema.safeParse({ projectPath: "Demo", transactionId: "../bad", planHash: digest("a"), expectedProjectFingerprint: digest("b"), confirm: true }).success, false);
});

test("CONFIG: projects directory must be configured and absolute", async () => {
  await assert.rejects(() => resolveProjectsDir({}), (error) => error.code === "GM_CONFIG_REQUIRED");
  await assert.rejects(() => resolveProjectsDir({ [PROJECTS_DIR_ENV]: "relative/path" }), (error) => error.code === "GM_CONFIG_INVALID");
});

test("CONFIG: evidence root defaults outside the project and rejects unsafe values", () => {
  assert.equal(resolveEvidenceRoot({}), DEFAULT_EVIDENCE_ROOT);
  assert.equal(resolveEvidenceRoot({ [EVIDENCE_ROOT_ENV]: "custom-evidence" }), "custom-evidence");
  for (const unsafe of ["../outside", "C:/evidence", "\\\\server\\share"]) {
    assert.throws(() => resolveEvidenceRoot({ [EVIDENCE_ROOT_ENV]: unsafe }), (error) => error.code === "GM_CONFIG_INVALID");
  }
});

test("WRITE ALLOWLIST: must be configured explicitly; opting out is deliberate", () => {
  assert.throws(() => resolveWriteAllowlist({}), (error) => error.code === "GM_CONFIG_REQUIRED");
  assert.throws(() => resolveWriteAllowlist({ [WRITE_ALLOW_ENV]: "   " }), (error) => error.code === "GM_CONFIG_REQUIRED");
  assert.equal(resolveWriteAllowlist({ [WRITE_ALLOW_ENV]: UNRESTRICTED_WRITE_ALLOW }), null);
  assert.deepEqual(resolveWriteAllowlist({ [WRITE_ALLOW_ENV]: "objects/; scripts/a.gml" }), ["objects/", "scripts/a.gml"]);
});

test("WRITE ALLOWLIST: entries themselves obey the path safety policy", () => {
  for (const unsafe of ["../escape", "C:/abs", "a/../b", "objects/x\0.gml", "\\\\server\\share"]) {
    assert.throws(() => resolveWriteAllowlist({ [WRITE_ALLOW_ENV]: unsafe }), (error) => error.code === "GM_CONFIG_INVALID");
  }
});

test("WRITE ALLOWLIST: exact entries match exactly and directory entries match by prefix", () => {
  const exact = resolveWriteAllowlist({ [WRITE_ALLOW_ENV]: "objects/a/Create_0.gml" });
  assert.doesNotThrow(() => assertWriteAllowed(["objects/a/Create_0.gml"], exact));
  for (const denied of ["objects/a/Step_0.gml", "objects/a/Create_0.gmlx", "rooms/r.yy"]) {
    assert.throws(() => assertWriteAllowed([denied], exact), (error) => error.code === "GM_WRITE_NOT_ALLOWED");
  }

  const prefix = resolveWriteAllowlist({ [WRITE_ALLOW_ENV]: "objects/" });
  assert.doesNotThrow(() => assertWriteAllowed(["objects/a/Create_0.gml", "objects/b/Step_0.gml"], prefix));
  assert.throws(() => assertWriteAllowed(["objectsX/a.gml"], prefix), (error) => error.code === "GM_WRITE_NOT_ALLOWED");
  assert.throws(() => assertWriteAllowed(["rooms/r.yy"], prefix), (error) => error.code === "GM_WRITE_NOT_ALLOWED");
});

test("WRITE ALLOWLIST: one denied path in a batch denies the whole batch", () => {
  const allowlist = resolveWriteAllowlist({ [WRITE_ALLOW_ENV]: "objects/" });
  assert.throws(
    () => assertWriteAllowed(["objects/a/Create_0.gml", "rooms/r.yy"], allowlist),
    (error) => error.code === "GM_WRITE_NOT_ALLOWED",
  );
});

test("WRITE ALLOWLIST: unrestricted mode still enforces path safety on the candidates", () => {
  assert.throws(() => assertWriteAllowed(["../escape"], resolveWriteAllowlist({ [WRITE_ALLOW_ENV]: "objects/" })));
  assert.throws(() => assertWriteAllowed(["../escape"], null), (error) => error.code === "PATH_ESCAPE");
});

test("ERROR MAPPING: adapter codes are surfaced with fixed public messages", () => {
  const mapped = mapToolError(new GmAdapterError("CONCURRENT_MODIFICATION", "internal detail H:/secret/path", true), 7);
  assert.equal(mapped.ok, false);
  assert.equal(mapped.error.code, "CONCURRENT_MODIFICATION");
  assert.equal(mapped.error.message, "The project changed concurrently.");
  assert.equal(mapped.error.recoverable, true);
  assert.equal(JSON.stringify(mapped).includes("secret"), false);
});

test("ERROR MAPPING: unknown failures are sanitized to a fail-closed envelope", () => {
  const mapped = mapToolError(new Error("ENOENT: open 'H:/Users/someone/.env'"), "req-1");
  assert.equal(mapped.error.code, "GM_INTERNAL_ERROR");
  assert.equal(mapped.error.message, "The GameMaker request failed closed.");
  assert.equal(mapped.error.recoverable, false);
  assert.equal(JSON.stringify(mapped).includes("Users"), false);
});

test("ERROR MAPPING: server configuration errors keep their own recoverable codes", () => {
  const mapped = mapToolError(new GmWriteError("GM_WRITE_NOT_ALLOWED", "denied by policy", false), 1);
  assert.equal(mapped.error.code, "GM_WRITE_NOT_ALLOWED");
  assert.equal(mapped.error.recoverable, false);
});
