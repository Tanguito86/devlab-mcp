import { access, mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentActivity } from "./activity.js";
import { adb, type AdbOptions } from "./adb.js";
import { captureScreenshot, captureUiDump, fileSize, timestampForPath } from "./inspection.js";
import { sanitizeName, validateSessionId } from "@tanguito/devlab-shared";

// ── Types ──

export type SessionMetadata = {
  name: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  deviceId?: string;
  app?: string;
  deviceModel: string;
  androidVersion: string;
  sdk: string;
  stepCount: number;
  logcatPath?: string;
  reportPath?: string;
};

export type SessionAction = {
  step: number;
  timestamp: string;
  action: string;
  screenshot?: string;
  uiDump?: string;
};

// ── Path helpers ──

const SESSIONS_DIR = "sessions";

export { sanitizeName, validateSessionId };

function sessionDir(sessionId: string): string {
  return path.resolve(process.cwd(), SESSIONS_DIR, sessionId);
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

// ── Core session operations ──

export async function createSession(
  name: string,
  clearLogcat: boolean,
  options: AdbOptions = {},
  app?: string
): Promise<SessionMetadata> {
  const safeName = sanitizeName(name || "session");
  const ts = timestampForPath();
  const sessionId = name ? `${ts}_${safeName}` : ts;
  const dir = sessionDir(sessionId);

  validateSessionId(sessionId);

  if (await dirExists(dir)) {
    throw new Error(`Session "${sessionId}" already exists. Use a different name or delete it first.`);
  }

  await mkdir(dir, { recursive: true });
  await mkdir(path.join(dir, "screenshots"), { recursive: true });
  await mkdir(path.join(dir, "ui-dumps"), { recursive: true });

  // Capture device info
  const [model, sdk, androidVersion] = await Promise.all([
    adb(["shell", "getprop", "ro.product.model"], options),
    adb(["shell", "getprop", "ro.build.version.sdk"], options),
    adb(["shell", "getprop", "ro.build.version.release"], options)
  ]);

  const metadata: SessionMetadata = {
    name: safeName,
    sessionId,
    startedAt: new Date().toISOString(),
    deviceId: options.deviceId,
    app,
    deviceModel: model.stdout.trim(),
    androidVersion: androidVersion.stdout.trim(),
    sdk: sdk.stdout.trim(),
    stepCount: 0
  };

  await writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    "utf8"
  );

  // Device info snapshot
  const deviceInfo = await adb(["shell", "getprop"], options);
  const filtered = deviceInfo.stdout
    .split(/\r?\n/)
    .filter((line) =>
      /ro\.(product\.(manufacturer|model|device|name)|build\.(version\.(release|sdk)|fingerprint|type|tags)|hardware)/i.test(line)
    )
    .join("\n");

  await writeFile(path.join(dir, "device-info.json"), JSON.stringify({ raw: filtered }, null, 2) + "\n", "utf8");

  // Clear logcat if requested
  if (clearLogcat) {
    await adb(["logcat", "-c"], options);
  }

  return metadata;
}

export async function readMetadata(sessionId: string): Promise<SessionMetadata> {
  validateSessionId(sessionId);
  const dir = sessionDir(sessionId);

  if (!(await dirExists(dir))) {
    throw new Error(`Session "${sessionId}" not found.`);
  }

  const raw = await readFile(path.join(dir, "metadata.json"), "utf8");
  return JSON.parse(raw) as SessionMetadata;
}

export async function appendAction(
  sessionId: string,
  action: string,
  screenshotPath?: string,
  uiDumpPath?: string
): Promise<SessionAction> {
  validateSessionId(sessionId);
  const dir = sessionDir(sessionId);

  if (!(await dirExists(dir))) {
    throw new Error(`Session "${sessionId}" not found.`);
  }

  // Read metadata to get current step count
  const meta = await readMetadata(sessionId);
  const step = meta.stepCount + 1;

  const entry: SessionAction = {
    step,
    timestamp: new Date().toISOString(),
    action,
    ...(screenshotPath ? { screenshot: screenshotPath } : {}),
    ...(uiDumpPath ? { uiDump: uiDumpPath } : {})
  };

  const actionsPath = path.join(dir, "actions.jsonl");
  await appendFile(actionsPath, JSON.stringify(entry) + "\n", "utf8");

  // Update step count in metadata
  meta.stepCount = step;
  await writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8"
  );

  return entry;
}

export async function stopSession(
  sessionId: string,
  logcatLines: number,
  options: AdbOptions = {}
): Promise<SessionMetadata> {
  validateSessionId(sessionId);
  const dir = sessionDir(sessionId);

  if (!(await dirExists(dir))) {
    throw new Error(`Session "${sessionId}" not found.`);
  }

  const meta = await readMetadata(sessionId);

  if (meta.endedAt) {
    throw new Error(`Session "${sessionId}" is already completed (ended at ${meta.endedAt}).`);
  }

  // Capture logcat
  const logcat = await adb(["logcat", "-d", "-t", String(logcatLines)], options);
  const logcatPath = path.join(dir, "logcat.txt");
  await writeFile(logcatPath, logcat.stdout, "utf8");

  // Capture current activity
  const currentActivity = await getCurrentActivity(options);

  // Capture updated device info (battery, etc.)
  const battery = await adb(["shell", "dumpsys", "battery"], options);
  const batteryLevel = battery.stdout.match(/level:\s*(\d+)/)?.[1] ?? "unknown";

  // Generate final report
  const endedAt = new Date().toISOString();
  const startedDate = new Date(meta.startedAt);
  const endedDate = new Date(endedAt);
  const durationMs = endedDate.getTime() - startedDate.getTime();
  const durationMin = Math.floor(durationMs / 60000);
  const durationSec = Math.floor((durationMs % 60000) / 1000);

  // Read actions
  let actions: SessionAction[] = [];
  try {
    const actionsRaw = await readFile(path.join(dir, "actions.jsonl"), "utf8");
    actions = actionsRaw
      .trim()
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as SessionAction);
  } catch {
    // No actions recorded
  }

  const actionRows = actions.length > 0
    ? actions.map((a) => {
        const evidence = [a.screenshot ? "📸" : "", a.uiDump ? "📋" : ""].filter(Boolean).join(" ") || "—";
        return `| ${a.step} | ${a.timestamp.replace("T", " ").slice(0, 19)} | ${a.action} | ${evidence} |`;
      }).join("\n")
    : "| — | — | No actions recorded | — |";

  const report = [
    `# Session: ${meta.name}`,
    "",
    `- **Started:** ${meta.startedAt.replace("T", " ").slice(0, 19)}`,
    `- **Ended:** ${endedAt.replace("T", " ").slice(0, 19)}`,
    `- **Duration:** ${durationMin}m ${durationSec}s`,
    `- **Device:** ${meta.deviceModel}, Android ${meta.androidVersion} (SDK ${meta.sdk})`,
    meta.app ? `- **App:** ${meta.app}` : "",
    `- **Steps:** ${actions.length}`,
    "",
    "## Actions",
    "",
    "| Step | Timestamp | Action | Evidence |",
    "|------|-----------|--------|----------|",
    actionRows,
    "",
    "## Final State",
    "",
    `- **Current app:** ${currentActivity.packageName ?? "unknown"}/${currentActivity.activityName ?? "unknown"}`,
    `- **Battery:** ${batteryLevel}%`,
    `- **Device:** ${meta.deviceModel}, Android ${meta.androidVersion}`,
    "",
    "## Logcat",
    "",
    `Captured ${logcatLines} lines → [logcat.txt](logcat.txt)`,
    ""
  ].filter((line) => line !== "").join("\n");

  const reportPath = path.join(dir, "final-report.md");
  await writeFile(reportPath, report, "utf8");

  // Update metadata
  meta.endedAt = endedAt;
  meta.logcatPath = "logcat.txt";
  meta.reportPath = "final-report.md";
  await writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8"
  );

  return meta;
}

export async function listSessions(limit: number): Promise<SessionMetadata[]> {
  const sessionsDir = path.resolve(process.cwd(), SESSIONS_DIR);

  if (!(await dirExists(sessionsDir))) {
    return [];
  }

  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(sessionsDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();

  const sessions: SessionMetadata[] = [];
  for (const dirName of dirs.slice(0, limit)) {
    try {
      const meta = await readMetadata(dirName);
      sessions.push(meta);
    } catch {
      // Skip malformed sessions
    }
  }

  return sessions;
}

export async function getSessionReport(sessionId: string): Promise<string> {
  validateSessionId(sessionId);
  const dir = sessionDir(sessionId);

  if (!(await dirExists(dir))) {
    throw new Error(`Session "${sessionId}" not found.`);
  }

  const meta = await readMetadata(sessionId);

  if (!meta.endedAt) {
    throw new Error(
      `Session "${sessionId}" is still active (started at ${meta.startedAt}). ` +
      `Run android_stop_session to finalize it before reading the report.`
    );
  }

  try {
    return await readFile(path.join(dir, "final-report.md"), "utf8");
  } catch {
    throw new Error(`Report not found for session "${sessionId}". The session may be corrupted.`);
  }
}
