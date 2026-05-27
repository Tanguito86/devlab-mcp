import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCoordinates,
  validateDeviceIdFormat,
  validateOutputPath,
  validateTimeoutSec,
  validateWorkflowStepShape
} from "../dist/validation.js";
import { AndroidDevMcpError, formatContractError } from "../dist/errors.js";

test("validation helpers accept valid contract values", () => {
  assert.equal(validateTimeoutSec(undefined, 10, 180), 10);
  assert.equal(validateTimeoutSec(30, 10, 180), 30);
  assert.equal(validateDeviceIdFormat("SERIAL123"), "SERIAL123");
  assert.equal(validateOutputPath("captures/state.png"), "captures/state.png");
  assert.doesNotThrow(() => validateCoordinates({ x: 1, y: 2 }, ["x", "y"]));
  assert.equal(validateWorkflowStepShape({ tool: "android_screenshot", args: {} }, 0).tool, "android_screenshot");
});

test("validation helpers reject invalid values with categorized errors", () => {
  assert.throws(() => validateTimeoutSec(181, 10, 180), AndroidDevMcpError);
  assert.throws(() => validateOutputPath("../outside.png"), /parent directory/);
  assert.throws(() => validateCoordinates({ x: -1 }, ["x"]), /non-negative/);
  assert.match(formatContractError(new AndroidDevMcpError("validation", "bad input")), /^\[validation\]/);
});
