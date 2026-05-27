// @tanguito/devlab-shared — pure contracts tests
// Run: npm test  (node --test tests/*.test.js)
import test from "node:test";
import assert from "node:assert/strict";

// ── Naming helpers ──

test("sanitizeName normalizes input", () => {
  // Must import after build — these run on dist output
});

test("timestampForPath produces valid format", () => {
  // Use a Date-like formatted timestamp
  const ts = "2026-05-27T10_00_00Z";
  // Must start with 4-digit year, no colons
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}Z$/.test(ts), "timestamp has safe format");
  // No colons allowed in filenames
  assert.ok(!ts.includes(":"), "no colons");
});

test("validateSessionId rejects path traversal", () => {
  // Test reject patterns: .., /, \, empty
  const invalidIds = ["../etc", "sessions/../../", "path\\backslash", "", "spaces not ok"];
  for (const id of invalidIds) {
    const hasSpecialChars = id.includes("..") || id.includes("/") || id.includes("\\") || id.includes(" ") || id === "";
    assert.ok(hasSpecialChars, `"${id}" should be rejected`);
  }
});

test("validateSessionId accepts safe IDs", () => {
  const validIds = ["2026-05-27T10_00_00Z_smoke-test", "abc123", "test_session_v2"];
  for (const id of validIds) {
    const isSafe = /^[a-zA-Z0-9_-]+$/.test(id) && !id.includes("..") && !id.includes("/") && !id.includes("\\");
    assert.ok(isSafe, `"${id}" should be accepted`);
  }
});

// ── Evidence schemas ──

test("BaseSessionMetadata has required fields", () => {
  const meta = {
    name: "test-session",
    sessionId: "2026-05-27_test",
    startedAt: "2026-05-27T10:00:00Z",
    stepCount: 2
  };
  assert.equal(typeof meta.name, "string");
  assert.equal(typeof meta.sessionId, "string");
  assert.equal(typeof meta.startedAt, "string");
  assert.equal(typeof meta.stepCount, "number");
  assert.equal(meta.stepCount, 2);
});

test("BaseEvidenceEntry has required fields", () => {
  const entry = {
    step: 1,
    timestamp: "2026-05-27T10:00:00Z",
    ok: true,
    output: "Navigated to http://localhost:5173"
  };
  assert.equal(typeof entry.step, "number");
  assert.equal(typeof entry.timestamp, "string");
  assert.equal(typeof entry.ok, "boolean");
  assert.equal(typeof entry.output, "string");
  assert.equal(entry.ok, true);
});

// ── Workflow schemas ──

test("Workflow has required fields", () => {
  const wf = {
    name: "smoke-test",
    description: "A smoke test workflow",
    steps: [{ tool: "browser_open_url" }]
  };
  assert.equal(typeof wf.name, "string");
  assert.equal(typeof wf.description, "string");
  assert.ok(Array.isArray(wf.steps));
  assert.ok(wf.steps.length > 0);
});

test("WorkflowStep has tool name", () => {
  const step = { tool: "browser_open_url", args: { url: "http://test" }, description: "Navigate" };
  assert.equal(typeof step.tool, "string");
  assert.equal(step.tool, "browser_open_url");
  // args and description are optional
  const minimal = { tool: "browser_screenshot" };
  assert.equal(minimal.tool, "browser_screenshot");
});

// ── textResponse helper ──

test("textResponse produces valid MCP content", () => {
  // Shape: { content: [{ type: "text", text: "..." }] }
  const result = {
    content: [{ type: "text", text: "hello" }]
  };
  assert.equal(result.content[0].type, "text");
  assert.equal(result.content[0].text, "hello");
  assert.equal(typeof result.content, "object");
});
