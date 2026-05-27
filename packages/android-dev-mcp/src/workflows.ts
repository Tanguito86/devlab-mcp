import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentActivity } from "./activity.js";
import { adb, formatOutput, type AdbOptions } from "./adb.js";
import { getAppProfile, getAppWorkflow, type WorkflowStep } from "./appProfiles.js";
import { captureScreenshot, captureUiDump, getDeviceMetadata, timestampForPath, writeMetadata } from "./inspection.js";
import { createSession, appendAction, stopSession, sanitizeName } from "./sessionManager.js";
import { dumpAndFindUiNodes } from "./tools/findUi.js";
import { validateWorkflowStepShape } from "./validation.js";

export type SessionOptions = {
  enabled: boolean;
  name?: string;
  captureSteps?: boolean;
  captureUiDumps?: boolean;
  clearLogcat?: boolean;
};

type WorkflowContext = {
  app: string;
  workflow: string;
  deviceId?: string;
  reportDir: string;
  session?: {
    sessionId: string;
    captureSteps: boolean;
    captureUiDumps: boolean;
  };
};

type StepExecution = {
  index: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  durationMs: number;
  output: string;
  paths: string[];
};

export type WorkflowExecution = {
  app: string;
  workflow: string;
  reportDir: string;
  sessionId?: string;
  sessionReport?: string;
  ok: boolean;
  start: string;
  end: string;
  durationMs: number;
  steps: StepExecution[];
};

type ExecutorResult = {
  output: string;
  paths?: string[];
};

type StepExecutor = (args: Record<string, unknown>, context: WorkflowContext, index: number) => Promise<ExecutorResult>;

function readString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" ? value : undefined;
}

function appendExtra(args: Array<string | number>, key: string, value: unknown): void {
  if (typeof value === "boolean") {
    args.push("--ez", key, value ? "true" : "false");
    return;
  }

  if (typeof value === "number") {
    args.push(Number.isInteger(value) ? "--ei" : "--ef", key, value);
    return;
  }

  if (typeof value === "string") {
    args.push("--es", key, value);
    return;
  }

  throw new Error(`Unsupported extra value for "${key}". Use string, number, or boolean.`);
}

function mergeStepArgs(step: WorkflowStep, context: WorkflowContext, index: number): Record<string, unknown> {
  validateWorkflowStepShape(step, index);

  return {
    app: context.app,
    deviceId: context.deviceId,
    ...(step.args ?? {})
  };
}

async function runLaunchApp(args: Record<string, unknown>, context: WorkflowContext): Promise<ExecutorResult> {
  const app = readString(args, "app") ?? context.app;
  const profile = await getAppProfile(app);
  const component = `${profile.package}/${profile.activity}`;
  const result = await adb(["shell", "am", "start", "-n", component], { deviceId: readString(args, "deviceId") });
  return { output: formatOutput(`Launched ${app} (${component})`, result) };
}

async function runWaitForUi(args: Record<string, unknown>, context: WorkflowContext): Promise<ExecutorResult> {
  const timeoutSec = readNumber(args, "timeoutSec") ?? 10;
  const intervalMs = readNumber(args, "intervalMs") ?? 1000;
  const deadline = Date.now() + timeoutSec * 1000;
  let lastDumpPath = "";

  while (Date.now() <= deadline) {
    const result = await dumpAndFindUiNodes({
      text: readString(args, "text"),
      resourceId: readString(args, "resourceId"),
      className: readString(args, "className"),
      packageName: readString(args, "packageName"),
      clickable: typeof args.clickable === "boolean" ? args.clickable : undefined,
      enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
      deviceId: readString(args, "deviceId") ?? context.deviceId
    });
    lastDumpPath = result.dumpPath;

    if (result.matches.length > 0) {
      return { output: `UI match found (${result.matches.length} match(es)).\ndump: ${result.dumpPath}`, paths: [result.dumpPath] };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out after ${timeoutSec} seconds waiting for UI. Last dump: ${lastDumpPath}`);
}

async function runCaptureState(args: Record<string, unknown>, context: WorkflowContext, index: number): Promise<ExecutorResult> {
  const outputDir = readString(args, "outputDir") ?? path.join(context.reportDir, "captures", `step-${index}`);
  const screenshotPath = path.join(outputDir, "screenshot.png");
  const uiDumpPath = path.join(outputDir, "window_dump.xml");
  const metadataPath = path.join(outputDir, "metadata.json");
  const options: AdbOptions = { deviceId: readString(args, "deviceId") ?? context.deviceId };

  const screenshotSize = await captureScreenshot(screenshotPath, options);
  const uiDumpSize = await captureUiDump(uiDumpPath, options);
  await writeMetadata(metadataPath, await getDeviceMetadata(options, readString(args, "app") ?? context.app));

  return {
    output: `Capture state saved to ${outputDir}\nscreenshot: ${screenshotSize} bytes\nui dump: ${uiDumpSize} bytes`,
    paths: [screenshotPath, uiDumpPath, metadataPath]
  };
}

async function runGenerateReport(args: Record<string, unknown>, context: WorkflowContext, index: number): Promise<ExecutorResult> {
  const outputDir = readString(args, "outputDir") ?? path.join(context.reportDir, "reports", `step-${index}`);
  const screenshotPath = path.join(outputDir, "screenshot.png");
  const uiDumpPath = path.join(outputDir, "window_dump.xml");
  const logcatPath = path.join(outputDir, "logcat.txt");
  const metadataPath = path.join(outputDir, "metadata.json");
  const deviceInfoPath = path.join(outputDir, "device-info.txt");
  const options: AdbOptions = { deviceId: readString(args, "deviceId") ?? context.deviceId };

  await captureScreenshot(screenshotPath, options);
  await captureUiDump(uiDumpPath, options);
  const logcat = await adb(["logcat", "-d", "-t", readNumber(args, "lines") ?? 500], options);
  const deviceInfo = await adb(["shell", "getprop"], options);

  await writeFile(path.resolve(process.cwd(), logcatPath), logcat.stdout, "utf8");
  await writeFile(path.resolve(process.cwd(), deviceInfoPath), deviceInfo.stdout, "utf8");
  await writeMetadata(metadataPath, await getDeviceMetadata(options, readString(args, "app") ?? context.app));

  return {
    output: `Report saved to ${outputDir}`,
    paths: [screenshotPath, uiDumpPath, logcatPath, metadataPath, deviceInfoPath]
  };
}

async function runScreenshot(args: Record<string, unknown>, context: WorkflowContext, index: number): Promise<ExecutorResult> {
  const outputPath = readString(args, "outputPath") ?? path.join(context.reportDir, "screenshots", `step-${index}.png`);
  const size = await captureScreenshot(outputPath, { deviceId: readString(args, "deviceId") ?? context.deviceId });
  return { output: `Screenshot saved to ${outputPath} (${size} bytes)`, paths: [outputPath] };
}

async function runUiDump(args: Record<string, unknown>, context: WorkflowContext, index: number): Promise<ExecutorResult> {
  const outputPath = readString(args, "outputPath") ?? path.join(context.reportDir, "ui-dumps", `step-${index}.xml`);
  const size = await captureUiDump(outputPath, { deviceId: readString(args, "deviceId") ?? context.deviceId });
  return { output: `UI dump saved to ${outputPath} (${size} bytes)`, paths: [outputPath] };
}

async function runDebugIntent(args: Record<string, unknown>, context: WorkflowContext): Promise<ExecutorResult> {
  const app = readString(args, "app") ?? context.app;
  const intent = readString(args, "intent");
  if (!intent) {
    throw new Error("android_send_debug_intent requires intent.");
  }

  const profile = await getAppProfile(app);
  const action = profile.debugIntents?.[intent];
  if (!action) {
    const available = Object.keys(profile.debugIntents ?? {}).sort().join(", ") || "none";
    throw new Error(`Unknown debug intent "${intent}" for app "${app}". Available intents: ${available}.`);
  }

  const adbArgs: Array<string | number> = ["shell", "am", "broadcast", "-a", action];
  const extras = args.extras;
  if (extras !== undefined) {
    if (typeof extras !== "object" || extras === null || Array.isArray(extras)) {
      throw new Error("android_send_debug_intent extras must be an object.");
    }

    for (const [key, value] of Object.entries(extras)) {
      appendExtra(adbArgs, key, value);
    }
  }

  const result = await adb(adbArgs, { deviceId: readString(args, "deviceId") ?? context.deviceId });
  return { output: formatOutput(`Sent debug intent ${intent} for ${app}`, result) };
}

async function runShell(args: Record<string, unknown>, context: WorkflowContext): Promise<ExecutorResult> {
  const command = readString(args, "command");
  if (!command) {
    throw new Error("android_run_shell requires command.");
  }

  const result = await adb(["shell", command], { deviceId: readString(args, "deviceId") ?? context.deviceId });
  return { output: formatOutput(`Ran shell command: ${command}`, result) };
}

async function runInstallApk(args: Record<string, unknown>, context: WorkflowContext): Promise<ExecutorResult> {
  const apkPath = readString(args, "apkPath");
  if (!apkPath) {
    throw new Error("android_install_apk requires apkPath.");
  }

  await access(apkPath);
  const result = await adb(["install", "-r", apkPath], { deviceId: readString(args, "deviceId") ?? context.deviceId });
  return { output: formatOutput(`Installed APK: ${apkPath}`, result) };
}

async function runClearLogcat(args: Record<string, unknown>, context: WorkflowContext): Promise<ExecutorResult> {
  await adb(["logcat", "-c"], { deviceId: readString(args, "deviceId") ?? context.deviceId });
  return { output: "Logcat cleared." };
}

async function runReadLogcat(args: Record<string, unknown>, context: WorkflowContext, index: number): Promise<ExecutorResult> {
  const outputPath = readString(args, "outputPath") ?? path.join(context.reportDir, "logcat", `step-${index}.txt`);
  const result = await adb(["logcat", "-d", "-t", readNumber(args, "lines") ?? 300], {
    deviceId: readString(args, "deviceId") ?? context.deviceId
  });

  await mkdir(path.dirname(path.resolve(process.cwd(), outputPath)), { recursive: true });
  await writeFile(path.resolve(process.cwd(), outputPath), result.stdout, "utf8");
  return { output: `Logcat saved to ${outputPath}`, paths: [outputPath] };
}

const executors: Record<string, StepExecutor> = {
  android_launch_app: runLaunchApp,
  android_install_apk: runInstallApk,
  android_wait_for_ui: runWaitForUi,
  android_capture_state: runCaptureState,
  android_generate_report: runGenerateReport,
  android_screenshot: runScreenshot,
  android_ui_dump: runUiDump,
  android_clear_logcat: runClearLogcat,
  android_read_logcat: runReadLogcat,
  android_send_debug_intent: runDebugIntent,
  android_run_shell: runShell
};

export function validateWorkflowSteps(steps: WorkflowStep[]): void {
  steps.forEach((step, index) => {
    validateWorkflowStepShape(step, index);

    if (!executors[step.tool]) {
      const available = Object.keys(executors).sort().join(", ");
      throw new Error(`Workflow step ${index} uses unknown or unsupported tool "${step.tool}". Supported tools: ${available}.`);
    }
  });
}

export async function runWorkflow(
  app: string,
  workflow: string,
  deviceId?: string,
  session?: SessionOptions
): Promise<WorkflowExecution> {
  const startTime = Date.now();
  const start = new Date().toISOString();
  const steps = await getAppWorkflow(app, workflow);
  validateWorkflowSteps(steps);

  const reportDir = path.join("workflow-reports", `${timestampForPath()}-${app}-${workflow}`);
  const sessionEnabled = session?.enabled === true;
  const captureSteps = session?.captureSteps !== false; // default true when session enabled
  const captureUiDumps = session?.captureUiDumps === true; // default false
  const clearLogcat = session?.clearLogcat !== false; // default true when session enabled

  let sessionId: string | undefined;
  let sessionReport: string | undefined;

  // Start session if enabled
  if (sessionEnabled) {
    const sessionName = session?.name ?? `${app}-${workflow}`;
    const meta = await createSession(
      sessionName,
      clearLogcat,
      { deviceId },
      app
    );
    sessionId = meta.sessionId;
  }

  const context: WorkflowContext = {
    app,
    workflow,
    deviceId,
    reportDir,
    session: sessionEnabled && sessionId ? { sessionId, captureSteps, captureUiDumps } : undefined
  };

  const stepResults: StepExecution[] = [];

  await mkdir(path.resolve(process.cwd(), reportDir), { recursive: true });
  await writeFile(path.resolve(process.cwd(), reportDir, "workflow.json"), `${JSON.stringify(steps, null, 2)}\n`, "utf8");

  let ok = true;
  for (const [index, step] of steps.entries()) {
    const stepStart = Date.now();
    const args = mergeStepArgs(step, context, index);

    try {
      const result = await executors[step.tool](args, context, index);
      stepResults.push({
        index,
        tool: step.tool,
        args,
        ok: true,
        durationMs: Date.now() - stepStart,
        output: result.output,
        paths: result.paths ?? []
      });

      // Record session step
      if (sessionEnabled && sessionId) {
        let screenshotRel: string | undefined;
        let uiDumpRel: string | undefined;

        if (captureSteps) {
          const stepLabel = `step-${index + 1}`;
          screenshotRel = `screenshots/${stepLabel}.png`;
          await captureScreenshot(
            path.join("sessions", sessionId, screenshotRel),
            { deviceId }
          );
        }

        if (captureUiDumps) {
          const stepLabel = `step-${index + 1}`;
          uiDumpRel = `ui-dumps/${stepLabel}.xml`;
          await captureUiDump(
            path.join("sessions", sessionId, uiDumpRel),
            { deviceId }
          );
        }

        await appendAction(
          sessionId,
          `[${step.tool}] ${typeof step.args?.action === "string" ? step.args.action : "executed"}`,
          screenshotRel,
          uiDumpRel
        );
      }
    } catch (error) {
      ok = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      stepResults.push({
        index,
        tool: step.tool,
        args,
        ok: false,
        durationMs: Date.now() - stepStart,
        output: errorMessage,
        paths: []
      });

      // Record failure in session
      if (sessionEnabled && sessionId) {
        try {
          await appendAction(sessionId, `[FAIL] ${step.tool}: ${errorMessage}`);
        } catch {
          // Session recording failure should not mask the original error
        }
      }
      break;
    }
  }

  // Stop session if enabled
  if (sessionEnabled && sessionId) {
    try {
      const meta = await stopSession(sessionId, 2000, { deviceId });
      sessionReport = `sessions/${sessionId}/final-report.md`;
    } catch {
      // Session stop failure is non-fatal for the workflow
    }
  }

  const end = new Date().toISOString();
  const execution: WorkflowExecution = {
    app,
    workflow,
    reportDir,
    sessionId,
    sessionReport,
    ok,
    start,
    end,
    durationMs: Date.now() - startTime,
    steps: stepResults
  };

  const finalActivity = await getCurrentActivity({ deviceId });
  await writeFile(
    path.resolve(process.cwd(), reportDir, "execution-log.json"),
    `${JSON.stringify({ ...execution, finalActivity }, null, 2)}\n`,
    "utf8"
  );
  await writeMetadata(path.join(reportDir, "metadata.json"), {
    deviceId,
    timestamp: end,
    model: "",
    sdk: "",
    androidVersion: "",
    currentFocus: finalActivity.rawSource,
    currentActivity: finalActivity,
    app,
    details: {
      workflow,
      durationMs: execution.durationMs,
      ok
    }
  });

  return execution;
}
