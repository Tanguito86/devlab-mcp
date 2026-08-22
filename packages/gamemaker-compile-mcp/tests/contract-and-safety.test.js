import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILD_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  TOOL_NAMES,
  verifyBuildInputSchema,
} from "../dist/contracts.js";
import {
  ALLOW_IGOR_ENV,
  DEFAULT_EVIDENCE_ROOT,
  DEFAULT_TIMEOUT_MS,
  EVIDENCE_ROOT_ENV,
  GmBuildError,
  IGOR_ENV,
  igorEnabled,
  isPlatformSupported,
  mapToolError,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  PROJECT_TOOL_ENV,
  PROJECTS_DIR_ENV,
  resolveEvidenceRoot,
  resolveProjectsDir,
  resolveTimeoutMs,
  resolveToolchain,
  runtimeLabel,
  RUNTIME_ENV,
  TIMEOUT_ENV,
  USER_DIR_ENV,
} from "../dist/core.js";
import { GmAdapterError } from "@tanguito/devlab-gm-ide-adapter";

const digest = (character) => character.repeat(64);
const WIN = process.platform === "win32";
const abs = (tail) => (WIN ? `C:\\gm\\${tail}` : `/gm/${tail}`);

const fullToolchain = () => ({
  [IGOR_ENV]: abs("Igor.exe"),
  [RUNTIME_ENV]: abs("runtime-2024.14.3.260"),
  [PROJECT_TOOL_ENV]: abs("ProjectTool.exe"),
  [USER_DIR_ENV]: abs("user"),
});

test("TOOL SET: exactly two tools are declared", () => {
  assert.deepEqual([...TOOL_NAMES], ["gamemaker_toolchain_status", "gamemaker_verify_build"]);
});

test("ANNOTATIONS: the build tool does not claim to be read-only", () => {
  assert.equal(READ_ONLY_ANNOTATIONS.readOnlyHint, true);
  assert.equal(BUILD_ANNOTATIONS.readOnlyHint, false, "starting Igor and a Runner is not a read-only act");
  assert.equal(BUILD_ANNOTATIONS.openWorldHint, false);
});

test("INPUT CONTRACT: no toolchain can be supplied through a tool argument", () => {
  const valid = { projectPath: "Demo", expectedProjectFingerprint: digest("a") };
  assert.equal(verifyBuildInputSchema.safeParse(valid).success, true);
  for (const smuggled of [
    { igor: abs("Evil.exe") },
    { executable: abs("Evil.exe") },
    { runtimePath: abs("runtime") },
    { userDirectory: abs("user") },
    { projectTool: abs("ProjectTool.exe") },
    { runtime: "YYC" },
    { worker: "linux" },
    { timeoutMs: 999_999_999 },
    { levels: ["RUNTIME_VALID"] },
  ]) {
    assert.equal(
      verifyBuildInputSchema.safeParse({ ...valid, ...smuggled }).success,
      false,
      `${Object.keys(smuggled)[0]} must be rejected by the tool contract`,
    );
  }
});

test("INPUT CONTRACT: fingerprint is mandatory and shaped", () => {
  assert.equal(verifyBuildInputSchema.safeParse({ projectPath: "Demo" }).success, false);
  assert.equal(verifyBuildInputSchema.safeParse({ projectPath: "Demo", expectedProjectFingerprint: "short" }).success, false);
});

test("OPT-IN: Igor stays disabled unless explicitly enabled", () => {
  assert.equal(igorEnabled({}), false);
  assert.equal(igorEnabled({ [ALLOW_IGOR_ENV]: "" }), false);
  assert.equal(igorEnabled({ [ALLOW_IGOR_ENV]: "0" }), false);
  assert.equal(igorEnabled({ [ALLOW_IGOR_ENV]: "yes" }), false);
  assert.equal(igorEnabled({ [ALLOW_IGOR_ENV]: "1" }), true);
  assert.equal(igorEnabled({ [ALLOW_IGOR_ENV]: "true" }), true);
  assert.equal(igorEnabled({ [ALLOW_IGOR_ENV]: "TRUE" }), true);
});

test("PLATFORM: Igor ownership is Windows-only by declaration", () => {
  assert.equal(isPlatformSupported("win32"), true);
  assert.equal(isPlatformSupported("linux"), false);
  assert.equal(isPlatformSupported("darwin"), false);
});

test("CONFIG: projects directory must be configured and absolute", async () => {
  await assert.rejects(() => resolveProjectsDir({}), (error) => error.code === "GM_CONFIG_REQUIRED");
  await assert.rejects(() => resolveProjectsDir({ [PROJECTS_DIR_ENV]: "relative" }), (error) => error.code === "GM_CONFIG_INVALID");
});

test("CONFIG: an incomplete toolchain fails closed and names the missing variables", () => {
  let error = null;
  try { resolveToolchain({}); } catch (caught) { error = caught; }
  assert.ok(error, "an empty environment must be refused");
  assert.equal(error.code, "GM_CONFIG_REQUIRED");
  for (const variable of [IGOR_ENV, RUNTIME_ENV, PROJECT_TOOL_ENV, USER_DIR_ENV]) {
    assert.ok(error.message.includes(variable), `${variable} should be reported as missing`);
  }
  const partial = fullToolchain();
  delete partial[USER_DIR_ENV];
  assert.throws(() => resolveToolchain(partial), (caught) => caught.code === "GM_CONFIG_REQUIRED");
});

test("CONFIG: toolchain paths must be absolute and correctly named", () => {
  assert.throws(() => resolveToolchain({ ...fullToolchain(), [IGOR_ENV]: "Igor.exe" }), (error) => error.code === "GM_CONFIG_INVALID");
  assert.throws(() => resolveToolchain({ ...fullToolchain(), [IGOR_ENV]: abs("NotIgor.exe") }), (error) => error.code === "GM_CONFIG_INVALID");
  assert.throws(() => resolveToolchain({ ...fullToolchain(), [PROJECT_TOOL_ENV]: abs("Other.exe") }), (error) => error.code === "GM_CONFIG_INVALID");
  const toolchain = resolveToolchain(fullToolchain());
  assert.equal(toolchain.runtime, "VM");
  assert.equal(runtimeLabel(toolchain.runtimePath), "runtime-2024.14.3.260");
});

test("CONFIG: the runtime label never carries a directory path", () => {
  const label = runtimeLabel(abs("runtime-2024.14.3.260"));
  assert.equal(label.includes("/"), false);
  assert.equal(label.includes("\\"), false);
});

test("CONFIG: the timeout is bounded on both ends", () => {
  assert.equal(resolveTimeoutMs({}), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs({ [TIMEOUT_ENV]: String(MIN_TIMEOUT_MS) }), MIN_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs({ [TIMEOUT_ENV]: String(MAX_TIMEOUT_MS) }), MAX_TIMEOUT_MS);
  for (const bad of ["0", "-1", "abc", String(MIN_TIMEOUT_MS - 1), String(MAX_TIMEOUT_MS + 1)]) {
    assert.throws(() => resolveTimeoutMs({ [TIMEOUT_ENV]: bad }), (error) => error.code === "GM_CONFIG_INVALID");
  }
});

test("CONFIG: the evidence root defaults outside the project and rejects unsafe values", () => {
  assert.equal(resolveEvidenceRoot({}), DEFAULT_EVIDENCE_ROOT);
  assert.equal(resolveEvidenceRoot({ [EVIDENCE_ROOT_ENV]: "build-evidence" }), "build-evidence");
  for (const unsafe of ["../outside", "C:/evidence", "\\\\server\\share", "a/../b"]) {
    assert.throws(() => resolveEvidenceRoot({ [EVIDENCE_ROOT_ENV]: unsafe }), (error) => error.code === "GM_CONFIG_INVALID");
  }
});

test("ERROR MAPPING: a foreign Runner is reported without leaking internals", () => {
  const mapped = mapToolError(new GmAdapterError("RUN_BLOCKED_EXTERNAL_RUNNER", "pids 1234 at H:/secret", true), 3);
  assert.equal(mapped.error.code, "RUN_BLOCKED_EXTERNAL_RUNNER");
  assert.equal(mapped.error.message, "A GameMaker Runner is already running; close it before building.");
  assert.equal(JSON.stringify(mapped).includes("secret"), false);
});

test("ERROR MAPPING: unknown failures are sanitized", () => {
  const mapped = mapToolError(new Error("ENOENT open 'C:/Users/someone/.env'"), "req");
  assert.equal(mapped.error.code, "GM_INTERNAL_ERROR");
  assert.equal(JSON.stringify(mapped).includes("Users"), false);
});

test("ERROR MAPPING: server codes keep their recoverability", () => {
  const mapped = mapToolError(new GmBuildError("GM_IGOR_NOT_ENABLED", "not enabled", true), 1);
  assert.equal(mapped.error.code, "GM_IGOR_NOT_ENABLED");
  assert.equal(mapped.error.recoverable, true);
});
