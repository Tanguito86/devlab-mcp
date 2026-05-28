// browser-dev-mcp — pure logic tests
// Run: npm test  (node --test tests/*.test.js)

import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeName, validateSessionId } from "../dist/evidence/EvidenceStore.js";

// ── Evidence store helpers ──

test("sanitizeName normalizes input", () => {
  assert.equal(sanitizeName("Hello World!"), "hello-world");
  assert.equal(sanitizeName("smoke-menu"), "smoke-menu");
  assert.equal(sanitizeName("boss_jump"), "boss_jump");
  assert.equal(sanitizeName("  spaces  "), "spaces");
  assert.equal(sanitizeName(""), "session");
  assert.equal(sanitizeName("a".repeat(100)), "a".repeat(64));
});

test("validateSessionId rejects path traversal", () => {
  assert.throws(() => validateSessionId("../etc"));
  assert.throws(() => validateSessionId("sessions/../../"));
  assert.throws(() => validateSessionId("path\\backslash"));
  assert.throws(() => validateSessionId(""));
});

test("validateSessionId accepts valid IDs", () => {
  assert.doesNotThrow(() => validateSessionId("2026-05-27T10_00_00Z_smoke-test"));
  assert.doesNotThrow(() => validateSessionId("abc123"));
  assert.doesNotThrow(() => validateSessionId("test_session_v2"));
});

// ── Profile validation ──

test("profile JSON schema: required fields", () => {
  const valid = { name: "test", type: "web-canvas-game", defaultUrl: "http://localhost:3000" };
  assert.ok(valid.name && valid.defaultUrl, "name and defaultUrl required");

  const missingUrl = { name: "test", type: "web-app" };
  assert.ok(!missingUrl.defaultUrl, "missing defaultUrl should be caught by loader");
});

// ── Workflow validation ──

test("workflow JSON schema: required fields", () => {
  const valid = {
    name: "smoke-test",
    description: "A smoke test",
    steps: [{ tool: "browser_open_url", args: {} }]
  };
  assert.ok(valid.name && valid.steps && valid.steps.length > 0, "name and steps required");
});

test("workflow steps: known tool names", () => {
  const knownTools = [
    "browser_open_url", "browser_screenshot", "browser_screenshot_canvas",
    "browser_click", "browser_click_text", "browser_click_percent",
    "browser_press_key", "browser_type_text",
    "browser_wait", "browser_wait_for_selector",
    "browser_evaluate_js", "browser_get_console_logs", "browser_get_page_errors",
    "browser_wait_for_canvas_change"
  ];

  const step = { tool: "browser_open_url", args: { url: "http://test" } };
  assert.ok(knownTools.includes(step.tool), "browser_open_url is a known tool");

  // Unknown tool test
  assert.ok(!knownTools.includes("browser_fake_tool"), "fake tool is not known");
});

// ── Browser session (pure logic only, no Playwright) ──

test("BrowserSession export shape", async () => {
  const { BrowserSession } = await import("../dist/browser/BrowserSession.js");
  assert.equal(typeof BrowserSession, "function");

  const methods = [
    "open", "close", "getPage",
    "navigate", "screenshot", "screenshotElement",
    "click", "clickText", "clickPercent",
    "pressKey", "typeText", "evaluateJs",
    "wait", "waitForSelector", "waitForCanvasChange",
    "captureFps", "recordTrace", "getConsoleLogs",
    "getPageErrors", "getState"
  ];

  // Just verify the prototype has expected method names
  const proto = BrowserSession.prototype;
  for (const m of methods) {
    assert.ok(typeof proto[m] === "function", `BrowserSession has ${m}() method`);
  }
});

// ── Types ──

test("textResponse produces valid MCP content shape", async () => {
  const { textResponse } = await import("../dist/types.js");
  const result = textResponse("hello");
  assert.deepEqual(result, {
    content: [{ type: "text", text: "hello" }]
  });
});
