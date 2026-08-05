import assert from "node:assert/strict";
import test from "node:test";
import { AssetGmBridgeError, publicErrorShape } from "../dist/index.js";

test("public error shape never leaks stacks, secrets or private paths", () => {
  const error = new AssetGmBridgeError("STALE_OR_TAMPERED_PLAN", "binding mismatch at C:\\Users\\secret\\project", true, { internal: "do-not-leak" });
  const shape = publicErrorShape(error);
  assert.equal(shape.code, "STALE_OR_TAMPERED_PLAN");
  assert.equal(typeof shape.message, "string");
  assert.equal(shape.recoverable, true);
  assert.equal(JSON.stringify(shape).includes("do-not-leak"), false);
  assert.equal(shape.message.includes("C:\\Users"), true, "messages may describe paths but never carry stack or details");
  assert.equal(JSON.stringify(shape).includes("\n    at "), false, "public error shape must not carry stack frames");
});

test("unknown errors are reported as INTERNAL_FAILURE without raw stacks", () => {
  const shape = publicErrorShape(new Error("boom with stack details"));
  assert.equal(shape.code, "INTERNAL_FAILURE");
  assert.ok(!JSON.stringify(shape).includes("\n    at "));
});

test("all sixteen public error codes are constructible and deterministic", () => {
  const codes = [
    "ASSET_NOT_APPROVED", "ASSET_NOT_FOUND", "ASSET_HASH_MISMATCH", "ASSET_BUDGET_EXCEEDED",
    "INVALID_ASSET_MANIFEST", "TARGET_PROJECT_MISMATCH", "TARGET_SNAPSHOT_CHANGED",
    "STALE_OR_TAMPERED_PLAN", "PATH_NOT_ALLOWED", "RESOURCE_COLLISION", "CASE_COLLISION",
    "APPLY_FAILED_RECOVERED", "APPLY_FAILED_RECOVERY_REQUIRED", "ROLLBACK_BLOCKED_CONCURRENT_CHANGE",
    "VERIFY_COMPILE_FAILED", "VERIFY_RUNTIME_FAILED",
  ];
  for (const code of codes) {
    const error = new AssetGmBridgeError(code, "message", false);
    assert.equal(publicErrorShape(error).code, code);
  }
});
