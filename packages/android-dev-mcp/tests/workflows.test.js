import test from "node:test";
import assert from "node:assert/strict";
import { validateWorkflowSteps } from "../dist/workflows.js";

test("validateWorkflowSteps accepts supported linear workflow steps", () => {
  assert.doesNotThrow(() =>
    validateWorkflowSteps([
      { tool: "android_launch_app", args: {} },
      { tool: "android_capture_state", args: { outputDir: "captures/sample" } }
    ])
  );
});

test("validateWorkflowSteps rejects unsupported tools and malformed args", () => {
  assert.throws(() => validateWorkflowSteps([{ tool: "android_unknown", args: {} }]), /unsupported tool/);
  assert.throws(() => validateWorkflowSteps([{ tool: "android_launch_app", args: [] }]), /args must be an object/);
});
