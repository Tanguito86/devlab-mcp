import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegisterTool } from "../types.js";
import { textResponse } from "../types.js";
import { BrowserSession } from "../browser/BrowserSession.js";
import { loadProfile, loadWorkflow, listProfiles, listWorkflows } from "../profiles/ProfileLoader.js";
import { createSession, appendEvidence, stopSession, listSessions, getSessionReport, timestampForPath } from "../evidence/EvidenceStore.js";
import { runWorkflow } from "../workflows/WorkflowRunner.js";
import path from "node:path";

// ── Global browser session instance ──

let browserSession: BrowserSession | null = null;

function getSession(): BrowserSession {
  if (!browserSession || !browserSession.isOpen) {
    throw new Error("No active browser session. Call browser_open first.");
  }
  return browserSession;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// ═══════════════════════════════════════════════
// Browser lifecycle
// ═══════════════════════════════════════════════

export const registerOpenBrowser: RegisterTool = (server) => {
  server.registerTool(
    "browser_open",
    {
      title: "Open browser",
      description: "Launch a Chromium browser (headless or headed) for testing.",
      inputSchema: {
        headless: z.boolean().optional().describe("Run in headless mode (default: false for visibility)"),
        profile: z.string().optional().describe("Profile name to load URL and viewport from")
      }
    },
    async ({ headless, profile }) => {
      try {
        const evidenceDir = path.join("evidence", timestampForPath());
        browserSession = new BrowserSession(evidenceDir, {
          headless: headless !== false
        });
        await browserSession.open({ headless: headless !== false });

        let info = `Browser opened (${headless !== false ? "headless" : "headed"}).`;
        if (profile) {
          const p = await loadProfile(profile);
          info += `\nProfile: ${p.name} (${p.type})`;
          info += `\nDefault URL: ${p.defaultUrl}`;
          if (p.canvasSelector) info += `\nCanvas: ${p.canvasSelector}`;
        }
        return textResponse(info);
      } catch (error) {
        return textResponse(`Failed to open browser:\n${formatError(error)}`);
      }
    }
  );
};

export const registerCloseBrowser: RegisterTool = (server) => {
  server.registerTool(
    "browser_close",
    {
      title: "Close browser",
      description: "Close the browser and cleanup resources."
    },
    async () => {
      try {
        if (browserSession) {
          await browserSession.close();
          browserSession = null;
        }
        return textResponse("Browser closed.");
      } catch (error) {
        return textResponse(`Failed to close browser:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════

export const registerOpenUrl: RegisterTool = (server) => {
  server.registerTool(
    "browser_open_url",
    {
      title: "Open URL",
      description: "Navigate browser to a URL.",
      inputSchema: {
        url: z.string().url().describe("The URL to navigate to")
      }
    },
    async ({ url }) => {
      try {
        const session = getSession();
        await session.navigate(url);
        const state = await session.getState();
        return textResponse(`Navigated to: ${url}\nTitle: ${state.title}`);
      } catch (error) {
        return textResponse(`Failed to open URL:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Screenshots
// ═══════════════════════════════════════════════

export const registerScreenshot: RegisterTool = (server) => {
  server.registerTool(
    "browser_screenshot",
    {
      title: "Take screenshot",
      description: "Capture a full-page or viewport screenshot.",
      inputSchema: {
        name: z.string().min(1).describe("Name for the screenshot file (without extension)")
      }
    },
    async ({ name }) => {
      try {
        const session = getSession();
        const filePath = await session.screenshot(name);
        return textResponse(`Screenshot saved: ${filePath}`);
      } catch (error) {
        return textResponse(`Failed to take screenshot:\n${formatError(error)}`);
      }
    }
  );
};

export const registerScreenshotCanvas: RegisterTool = (server) => {
  server.registerTool(
    "browser_screenshot_canvas",
    {
      title: "Screenshot canvas element",
      description: "Capture just a canvas element by selector. Useful for game evidence.",
      inputSchema: {
        selector: z.string().min(1).default("canvas").describe("CSS selector for the canvas element"),
        name: z.string().min(1).describe("Name for the screenshot file (without extension)")
      }
    },
    async ({ selector, name }) => {
      try {
        const session = getSession();
        const filePath = await session.screenshotElement(selector, name);
        return textResponse(`Canvas screenshot saved: ${filePath}`);
      } catch (error) {
        return textResponse(`Failed to screenshot canvas:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Interaction
// ═══════════════════════════════════════════════

export const registerClick: RegisterTool = (server) => {
  server.registerTool(
    "browser_click",
    {
      title: "Click at coordinates",
      description: "Click at absolute pixel coordinates.",
      inputSchema: {
        x: z.number().int().min(0).describe("X pixel coordinate"),
        y: z.number().int().min(0).describe("Y pixel coordinate")
      }
    },
    async ({ x, y }) => {
      try {
        const session = getSession();
        await session.click(x, y);
        return textResponse(`Clicked at (${x}, ${y}).`);
      } catch (error) {
        return textResponse(`Failed to click:\n${formatError(error)}`);
      }
    }
  );
};

export const registerClickText: RegisterTool = (server) => {
  server.registerTool(
    "browser_click_text",
    {
      title: "Click by text",
      description: "Click the first element containing the given text.",
      inputSchema: {
        text: z.string().min(1).describe("Text to find and click")
      }
    },
    async ({ text }) => {
      try {
        const session = getSession();
        await session.clickText(text);
        return textResponse(`Clicked text: "${text}".`);
      } catch (error) {
        return textResponse(`Failed to click text:\n${formatError(error)}`);
      }
    }
  );
};

export const registerClickPercent: RegisterTool = (server) => {
  server.registerTool(
    "browser_click_percent",
    {
      title: "Click by percentage",
      description: "Click using viewport-relative percentage coordinates. Ideal for canvas games.",
      inputSchema: {
        x: z.number().min(0).max(100).describe("X position as percentage (0-100)"),
        y: z.number().min(0).max(100).describe("Y position as percentage (0-100)")
      }
    },
    async ({ x, y }) => {
      try {
        const session = getSession();
        await session.clickPercent(x, y);
        return textResponse(`Clicked at ${x}%, ${y}%.`);
      } catch (error) {
        return textResponse(`Failed to click at percentage:\n${formatError(error)}`);
      }
    }
  );
};

export const registerPressKey: RegisterTool = (server) => {
  server.registerTool(
    "browser_press_key",
    {
      title: "Press keyboard key",
      description: "Send a keyboard key press to the page. Use Playwright key names (Enter, Space, ArrowUp, KeyA, etc.).",
      inputSchema: {
        key: z.string().min(1).describe("Key to press (e.g., 'Enter', 'Space', 'ArrowUp')")
      }
    },
    async ({ key }) => {
      try {
        const session = getSession();
        await session.pressKey(key);
        return textResponse(`Pressed key: ${key}.`);
      } catch (error) {
        return textResponse(`Failed to press key:\n${formatError(error)}`);
      }
    }
  );
};

export const registerTypeText: RegisterTool = (server) => {
  server.registerTool(
    "browser_type_text",
    {
      title: "Type text",
      description: "Type text into the currently focused element.",
      inputSchema: {
        text: z.string().describe("Text to type")
      }
    },
    async ({ text }) => {
      try {
        const session = getSession();
        await session.typeText(text);
        return textResponse(`Typed: "${text}".`);
      } catch (error) {
        return textResponse(`Failed to type text:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// JavaScript evaluation
// ═══════════════════════════════════════════════

export const registerEvaluateJs: RegisterTool = (server) => {
  server.registerTool(
    "browser_evaluate_js",
    {
      title: "Evaluate JavaScript",
      description: "Execute JavaScript in the page context and return the result. Use for game state inspection, debug hooks, etc.",
      inputSchema: {
        expression: z.string().min(1).describe("JavaScript expression to evaluate in page context")
      }
    },
    async ({ expression }) => {
      try {
        const session = getSession();
        const result = await session.evaluateJs(expression);
        const output = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
        return textResponse(`JS result:\n${output}`);
      } catch (error) {
        return textResponse(`JS evaluation failed:\n${formatError(error)}`);
      }
    }
  );
};

export const registerEvaluateGameState: RegisterTool = (server) => {
  server.registerTool(
    "browser_evaluate_game_state",
    {
      title: "Evaluate game state",
      description: "Evaluate a JavaScript expression to inspect game state (score, level, lives, etc.). Expression runs in page context.",
      inputSchema: {
        expression: z.string().min(1).describe("JS expression returning game state value (e.g., 'gameState.score')")
      }
    },
    async ({ expression }) => {
      try {
        const session = getSession();
        const result = await session.evaluateJs(expression);
        const output = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
        return textResponse(`Game state:\n${output}`);
      } catch (error) {
        return textResponse(`Game state evaluation failed:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Console & errors
// ═══════════════════════════════════════════════

export const registerGetConsoleLogs: RegisterTool = (server) => {
  server.registerTool(
    "browser_get_console_logs",
    {
      title: "Get console logs",
      description: "Retrieve all browser console messages collected since opening the page."
    },
    async () => {
      try {
        const session = getSession();
        const logs = await session.getConsoleLogs();
        if (logs.length === 0) return textResponse("No console logs collected.");
        return textResponse(`Console logs (${logs.length}):\n${logs.join("\n")}`);
      } catch (error) {
        return textResponse(`Failed to get console logs:\n${formatError(error)}`);
      }
    }
  );
};

export const registerGetPageErrors: RegisterTool = (server) => {
  server.registerTool(
    "browser_get_page_errors",
    {
      title: "Get page errors",
      description: "Retrieve uncaught JavaScript errors from the page."
    },
    async () => {
      try {
        const session = getSession();
        const errors = await session.getPageErrors();
        if (errors.length === 0) return textResponse("No page errors.");
        return textResponse(`Page errors (${errors.length}):\n${errors.join("\n")}`);
      } catch (error) {
        return textResponse(`Failed to get page errors:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Wait / timing
// ═══════════════════════════════════════════════

export const registerWait: RegisterTool = (server) => {
  server.registerTool(
    "browser_wait",
    {
      title: "Wait milliseconds",
      description: "Wait for a specified duration in milliseconds.",
      inputSchema: {
        ms: z.number().int().min(0).max(60000).describe("Milliseconds to wait")
      }
    },
    async ({ ms }) => {
      try {
        const session = getSession();
        await session.wait(ms);
        return textResponse(`Waited ${ms}ms.`);
      } catch (error) {
        return textResponse(`Wait failed:\n${formatError(error)}`);
      }
    }
  );
};

export const registerWaitForSelector: RegisterTool = (server) => {
  server.registerTool(
    "browser_wait_for_selector",
    {
      title: "Wait for selector",
      description: "Wait until an element matching the CSS selector appears in the page.",
      inputSchema: {
        selector: z.string().min(1).describe("CSS selector to wait for"),
        timeoutMs: z.number().int().min(1000).max(60000).default(10000).describe("Max wait time in ms")
      }
    },
    async ({ selector, timeoutMs }) => {
      try {
        const session = getSession();
        await session.waitForSelector(selector, timeoutMs);
        return textResponse(`Selector "${selector}" found.`);
      } catch (error) {
        return textResponse(`Wait for selector timed out:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Canvas-specific
// ═══════════════════════════════════════════════

export const registerWaitForCanvasChange: RegisterTool = (server) => {
  server.registerTool(
    "browser_wait_for_canvas_change",
    {
      title: "Wait for canvas change",
      description: "Poll the canvas element until its content changes (via toDataURL comparison). Useful for detecting frame updates in games.",
      inputSchema: {
        selector: z.string().default("canvas").describe("Canvas CSS selector"),
        timeoutMs: z.number().int().min(1000).max(30000).default(10000).describe("Max wait time in ms")
      }
    },
    async ({ selector, timeoutMs }) => {
      try {
        const session = getSession();
        await session.waitForCanvasChange(selector, timeoutMs);
        return textResponse(`Canvas "${selector}" content changed.`);
      } catch (error) {
        return textResponse(`Canvas change wait timed out:\n${formatError(error)}`);
      }
    }
  );
};

export const registerCaptureFps: RegisterTool = (server) => {
  server.registerTool(
    "browser_capture_fps",
    {
      title: "Capture FPS",
      description: "Try to read FPS counter from the page (looks for #fps-counter, .fps, window.__fps, window.fpsCounter). Returns null if unavailable."
    },
    async () => {
      try {
        const session = getSession();
        const fps = await session.captureFps();
        if (fps === null) {
          return textResponse("No FPS counter found on the page. Looked for: #fps-counter, .fps, window.__fps, window.fpsCounter.");
        }
        return textResponse(`FPS: ${fps}`);
      } catch (error) {
        return textResponse(`FPS capture failed:\n${formatError(error)}`);
      }
    }
  );
};

export const registerRecordTrace: RegisterTool = (server) => {
  server.registerTool(
    "browser_record_trace",
    {
      title: "Record short trace",
      description: "Capture screenshots at 100ms intervals for N seconds. Saves first frame + frame-count metadata.",
      inputSchema: {
        seconds: z.number().int().min(1).max(30).describe("Duration in seconds"),
        name: z.string().min(1).describe("Name for the trace")
      }
    },
    async ({ seconds, name }) => {
      try {
        const session = getSession();
        const filePath = await session.recordTrace(seconds, name);
        return textResponse(`Trace recorded: ${filePath} (${seconds}s, 100ms interval).`);
      } catch (error) {
        return textResponse(`Trace recording failed:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Session & evidence
// ═══════════════════════════════════════════════

export const registerStartSession: RegisterTool = (server) => {
  server.registerTool(
    "browser_start_session",
    {
      title: "Start evidence session",
      description: "Begin an evidence-gathering session for screenshots and structured reporting.",
      inputSchema: {
        name: z.string().min(1).describe("Session name"),
        profile: z.string().optional().describe("Profile name for metadata")
      }
    },
    async ({ name, profile }) => {
      try {
        const meta = await createSession(name, profile);
        return textResponse(`Session started: ${meta.sessionId}\nName: ${meta.name}`);
      } catch (error) {
        return textResponse(`Failed to start session:\n${formatError(error)}`);
      }
    }
  );
};

export const registerStopSession: RegisterTool = (server) => {
  server.registerTool(
    "browser_stop_session",
    {
      title: "Stop evidence session",
      description: "Finalize the evidence session and generate the final report.",
      inputSchema: {
        sessionId: z.string().min(1).describe("Session ID to stop")
      }
    },
    async ({ sessionId }) => {
      try {
        const meta = await stopSession(sessionId);
        return textResponse(
          `Session stopped: ${meta.sessionId}\n` +
          `Steps: ${meta.stepCount}\n` +
          `Status: ${meta.ok ? "PASS ✅" : "FAIL ❌"}\n` +
          `Report: sessions/${meta.sessionId}/final-report.md`
        );
      } catch (error) {
        return textResponse(`Failed to stop session:\n${formatError(error)}`);
      }
    }
  );
};

export const registerListSessions: RegisterTool = (server) => {
  server.registerTool(
    "browser_list_sessions",
    {
      title: "List sessions",
      description: "List recent evidence sessions.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).default(10).describe("Max sessions to list")
      }
    },
    async ({ limit }) => {
      try {
        const sessions = await listSessions(limit);
        if (sessions.length === 0) return textResponse("No sessions found.");
        const lines = sessions.map((s: { sessionId: string; name: string; stepCount: number; endedAt?: string; ok: boolean }) =>
          `- ${s.sessionId}: ${s.name} | ${s.stepCount} steps | ${s.endedAt ? "completed" : "active"} | ${s.ok ? "PASS" : "FAIL"}`
        );
        return textResponse(`Sessions (${sessions.length}):\n${lines.join("\n")}`);
      } catch (error) {
        return textResponse(`Failed to list sessions:\n${formatError(error)}`);
      }
    }
  );
};

export const registerGetSessionReport: RegisterTool = (server) => {
  server.registerTool(
    "browser_get_session_report",
    {
      title: "Get session report",
      description: "Read the final report for a completed session.",
      inputSchema: {
        sessionId: z.string().min(1).describe("Session ID")
      }
    },
    async ({ sessionId }) => {
      try {
        const report = await getSessionReport(sessionId);
        return textResponse(report);
      } catch (error) {
        return textResponse(`Failed to get report:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Profile & workflow
// ═══════════════════════════════════════════════

export const registerListProfiles: RegisterTool = (server) => {
  server.registerTool(
    "browser_list_profiles",
    {
      title: "List profiles",
      description: "List available project profiles (galaxy-raiders, etc.)."
    },
    async () => {
      try {
        const profiles = await listProfiles();
        if (profiles.length === 0) return textResponse("No profiles found.");
        return textResponse(`Profiles:\n${profiles.map(p => `- ${p}`).join("\n")}`);
      } catch (error) {
        return textResponse(`Failed to list profiles:\n${formatError(error)}`);
      }
    }
  );
};

export const registerListWorkflows: RegisterTool = (server) => {
  server.registerTool(
    "browser_list_workflows",
    {
      title: "List workflows",
      description: "List available workflows for a profile.",
      inputSchema: {
        profile: z.string().min(1).describe("Profile name (e.g., 'galaxy-raiders')")
      }
    },
    async ({ profile }) => {
      try {
        const workflows = await listWorkflows(profile);
        if (workflows.length === 0) return textResponse(`No workflows found for "${profile}".`);
        const lines = workflows.map(w => `- ${w.name}: ${w.description || "no description"}`);
        return textResponse(`Workflows for "${profile}":\n${lines.join("\n")}`);
      } catch (error) {
        return textResponse(`Failed to list workflows:\n${formatError(error)}`);
      }
    }
  );
};

export const registerRunWorkflow: RegisterTool = (server) => {
  server.registerTool(
    "browser_run_workflow",
    {
      title: "Run workflow",
      description: "Execute a predefined workflow from a profile (e.g., galaxy-raiders/smoke-menu).",
      inputSchema: {
        profile: z.string().min(1).describe("Profile name (e.g., 'galaxy-raiders')"),
        workflow: z.string().min(1).describe("Workflow name (e.g., 'smoke-menu')")
      }
    },
    async ({ profile, workflow }) => {
      try {
        if (!browserSession || !browserSession.isOpen) {
          return textResponse("No active browser session. Call browser_open first.");
        }
        const result = await runWorkflow(browserSession, profile, workflow);
        const status = result.ok ? "PASS ✅" : "FAIL ❌";
        const stepLines = result.steps.map(s =>
          `  ${s.ok ? "✅" : "❌"} ${s.tool} (${s.durationMs}ms): ${s.output.slice(0, 100)}`
        );
        return textResponse(
          `Workflow: ${profile}/${workflow}\n` +
          `Status: ${status}\n` +
          `Duration: ${(result.durationMs / 1000).toFixed(1)}s\n` +
          `Steps:\n${stepLines.join("\n")}\n` +
          `Report: ${result.reportDir}/execution-log.json`
        );
      } catch (error) {
        return textResponse(`Workflow failed:\n${formatError(error)}`);
      }
    }
  );
};
