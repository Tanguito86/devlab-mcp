import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserSession } from "../browser/BrowserSession.js";
import { loadProfile, loadWorkflow } from "../profiles/ProfileLoader.js";
import { createSession, appendEvidence, stopSession, timestampForPath } from "../evidence/EvidenceStore.js";
import type { WorkflowExecution, StepResult, WorkflowStep } from "../types.js";

type StepExecutor = (
  session: BrowserSession,
  args: Record<string, unknown>,
  context: WorkflowContext,
  index: number
) => Promise<StepExecutorResult>;

type StepExecutorResult = {
  output: string;
  screenshot?: string;
};

type WorkflowContext = {
  profile: string;
  workflow: string;
  reportDir: string;
  sessionId?: string;
  defaultUrl: string;
};

function readString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

function readNumber(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === "number" ? v : undefined;
}

function readBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === "boolean" ? v : undefined;
}

async function execOpenUrl(
  session: BrowserSession,
  args: Record<string, unknown>,
  context: WorkflowContext
): Promise<StepExecutorResult> {
  const url = readString(args, "url") ?? context.defaultUrl;
  await session.navigate(url);
  const state = await session.getState();
  return { output: `Navigated to ${url} (title: ${state.title})` };
}

async function execScreenshot(
  session: BrowserSession,
  args: Record<string, unknown>,
  context: WorkflowContext,
  index: number
): Promise<StepExecutorResult> {
  const name = readString(args, "name") ?? `step-${index}`;
  const filePath = await session.screenshot(name);
  return { output: `Screenshot: ${filePath}`, screenshot: filePath };
}

async function execScreenshotCanvas(
  session: BrowserSession,
  args: Record<string, unknown>,
  context: WorkflowContext,
  index: number
): Promise<StepExecutorResult> {
  const selector = readString(args, "selector") ?? "canvas";
  const name = readString(args, "name") ?? `canvas-step-${index}`;
  const filePath = await session.screenshotElement(selector, name);
  return { output: `Canvas screenshot: ${filePath}`, screenshot: filePath };
}

async function execClick(
  session: BrowserSession,
  args: Record<string, unknown>
): Promise<StepExecutorResult> {
  const x = readNumber(args, "x");
  const y = readNumber(args, "y");
  if (x === undefined || y === undefined) throw new Error("click requires x and y");
  await session.click(x, y);
  return { output: `Clicked at (${x}, ${y})` };
}

async function execClickText(
  session: BrowserSession,
  args: Record<string, unknown>
): Promise<StepExecutorResult> {
  const text = readString(args, "text");
  if (!text) throw new Error("click_text requires text");
  await session.clickText(text);
  return { output: `Clicked text: "${text}"` };
}

async function execClickPercent(
  session: BrowserSession,
  args: Record<string, unknown>
): Promise<StepExecutorResult> {
  const x = readNumber(args, "x");
  const y = readNumber(args, "y");
  if (x === undefined || y === undefined) throw new Error("click_percent requires x and y");
  await session.clickPercent(x, y);
  return { output: `Clicked at ${x}%, ${y}%` };
}

async function execPressKey(
  session: BrowserSession,
  args: Record<string, unknown>
): Promise<StepExecutorResult> {
  const key = readString(args, "key");
  if (!key) throw new Error("press_key requires key");
  await session.pressKey(key);
  return { output: `Pressed: ${key}` };
}

async function execTypeText(
  session: BrowserSession,
  args: Record<string, unknown>
): Promise<StepExecutorResult> {
  const text = readString(args, "text");
  if (text === undefined) throw new Error("type_text requires text");
  await session.typeText(text);
  return { output: `Typed: "${text.slice(0, 80)}"` };
}

async function execWait(
  session: BrowserSession,
  args: Record<string, unknown>
): Promise<StepExecutorResult> {
  const ms = readNumber(args, "ms") ?? 1000;
  await session.wait(ms);
  return { output: `Waited ${ms}ms` };
}

async function execWaitForSelector(
  session: BrowserSession,
  args: Record<string, unknown>
): Promise<StepExecutorResult> {
  const selector = readString(args, "selector");
  if (!selector) throw new Error("wait_for_selector requires selector");
  const timeoutMs = readNumber(args, "timeoutMs") ?? 10000;
  await session.waitForSelector(selector, timeoutMs);
  return { output: `Selector "${selector}" found` };
}

async function execEvaluateJs(
  session: BrowserSession,
  args: Record<string, unknown>
): Promise<StepExecutorResult> {
  const expression = readString(args, "expression");
  if (!expression) throw new Error("evaluate_js requires expression");
  const result = await session.evaluateJs(expression);
  const output = typeof result === "object" ? JSON.stringify(result) : String(result);
  return { output: `JS: ${output.slice(0, 200)}` };
}

async function execGetConsoleLogs(
  session: BrowserSession
): Promise<StepExecutorResult> {
  const logs = await session.getConsoleLogs();
  return { output: `${logs.length} console logs collected` };
}

async function execGetPageErrors(
  session: BrowserSession
): Promise<StepExecutorResult> {
  const errors = await session.getPageErrors();
  return { output: `${errors.length} page errors` };
}

async function execWaitForCanvasChange(
  session: BrowserSession,
  args: Record<string, unknown>
): Promise<StepExecutorResult> {
  const selector = readString(args, "selector") ?? "canvas";
  const timeoutMs = readNumber(args, "timeoutMs") ?? 10000;
  await session.waitForCanvasChange(selector, timeoutMs);
  return { output: `Canvas "${selector}" content changed` };
}

const executors: Record<string, StepExecutor> = {
  browser_open_url: execOpenUrl,
  browser_screenshot: execScreenshot,
  browser_screenshot_canvas: execScreenshotCanvas,
  browser_click: execClick,
  browser_click_text: execClickText,
  browser_click_percent: execClickPercent,
  browser_press_key: execPressKey,
  browser_type_text: execTypeText,
  browser_wait: execWait,
  browser_wait_for_selector: execWaitForSelector,
  browser_evaluate_js: execEvaluateJs,
  browser_evaluate_game_state: execEvaluateJs,
  browser_get_console_logs: execGetConsoleLogs,
  browser_get_page_errors: execGetPageErrors,
  browser_wait_for_canvas_change: execWaitForCanvasChange
};

export async function runWorkflow(
  session: BrowserSession,
  profile: string,
  workflow: string
): Promise<WorkflowExecution> {
  const startTime = Date.now();
  const start = new Date().toISOString();
  const profileData = await loadProfile(profile);
  const workflowData = await loadWorkflow(profile, workflow);

  const reportDir = path.join("workflow-reports", `${timestampForPath()}-${profile}-${workflow}`);

  // Start evidence session
  const sessionMeta = await createSession(
    `${profile}-${workflow}`,
    profile,
    profileData.defaultUrl
  );

  const context: WorkflowContext = {
    profile,
    workflow,
    reportDir,
    sessionId: sessionMeta.sessionId,
    defaultUrl: profileData.defaultUrl
  };

  await mkdir(path.resolve(process.cwd(), reportDir), { recursive: true });
  await writeFile(
    path.resolve(process.cwd(), reportDir, "workflow.json"),
    JSON.stringify(workflowData, null, 2) + "\n",
    "utf8"
  );

  const stepResults: StepResult[] = [];
  let ok = true;

  for (const [index, step] of workflowData.steps.entries()) {
    const stepStart = Date.now();
    const args = step.args ?? {};

    const executor = executors[step.tool];
    if (!executor) {
      const available = Object.keys(executors).sort().join(", ");
      throw new Error(
        `Step ${index}: unknown tool "${step.tool}". Supported in workflows: ${available}.`
      );
    }

    try {
      const result = await executor(session, args, context, index);
      stepResults.push({
        index,
        tool: step.tool,
        args,
        ok: true,
        durationMs: Date.now() - stepStart,
        output: result.output,
        screenshot: result.screenshot
      });

      // Record evidence
      await appendEvidence(sessionMeta.sessionId, {
        step: index + 1,
        timestamp: new Date().toISOString(),
        tool: step.tool,
        screenshot: result.screenshot,
        ok: true,
        output: result.output
      });
    } catch (error) {
      ok = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      stepResults.push({
        index,
        tool: step.tool,
        args,
        ok: false,
        durationMs: Date.now() - stepStart,
        output: errorMessage
      });

      await appendEvidence(sessionMeta.sessionId, {
        step: index + 1,
        timestamp: new Date().toISOString(),
        tool: step.tool,
        ok: false,
        output: errorMessage
      });
      break;
    }
  }

  // Stop session
  await stopSession(sessionMeta.sessionId);

  const end = new Date().toISOString();
  const execution: WorkflowExecution = {
    profile,
    workflow,
    reportDir,
    sessionId: sessionMeta.sessionId,
    ok,
    start,
    end,
    durationMs: Date.now() - startTime,
    steps: stepResults
  };

  await writeFile(
    path.resolve(process.cwd(), reportDir, "execution-log.json"),
    JSON.stringify(execution, null, 2) + "\n",
    "utf8"
  );

  return execution;
}
