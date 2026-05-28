import { access, mkdir, readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { EvidenceEntry, SessionMetadata } from "../types.js";
import { sanitizeName, validateSessionId } from "@tanguito/devlab-shared";

const SESSIONS_DIR = "sessions";

export { sanitizeName, validateSessionId };

export function timestampForPath(): string {
  return new Date().toISOString().replace(/:/g, "_").replace(/\..+/, "");
}

function sessionDir(sessionId: string): string {
  return path.resolve(process.cwd(), SESSIONS_DIR, sessionId);
}

async function dirExists(dirPath: string): Promise<boolean> {
  try { await access(dirPath); return true; } catch { return false; }
}

export async function createSession(
  name: string,
  profile?: string,
  url?: string
): Promise<SessionMetadata> {
  const safeName = sanitizeName(name || "session");
  const ts = timestampForPath();
  const sessionId = `${ts}_${safeName}`;
  const dir = sessionDir(sessionId);

  validateSessionId(sessionId);
  if (await dirExists(dir)) {
    throw new Error(`Session "${sessionId}" already exists.`);
  }

  await mkdir(dir, { recursive: true });
  await mkdir(path.join(dir, "screenshots"), { recursive: true });

  const metadata: SessionMetadata = {
    name: safeName,
    sessionId,
    startedAt: new Date().toISOString(),
    profile,
    url,
    stepCount: 0,
    ok: true
  };

  await writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    "utf8"
  );

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

export async function appendEvidence(
  sessionId: string,
  entry: EvidenceEntry
): Promise<void> {
  validateSessionId(sessionId);
  const dir = sessionDir(sessionId);
  if (!(await dirExists(dir))) {
    throw new Error(`Session "${sessionId}" not found.`);
  }

  const meta = await readMetadata(sessionId);
  meta.stepCount = entry.step;
  meta.ok = meta.ok && entry.ok;

  await writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8"
  );

  const evidencePath = path.join(dir, "evidence.jsonl");
  await appendFile(evidencePath, JSON.stringify(entry) + "\n", "utf8");
}

export async function stopSession(sessionId: string): Promise<SessionMetadata> {
  validateSessionId(sessionId);
  const dir = sessionDir(sessionId);
  if (!(await dirExists(dir))) {
    throw new Error(`Session "${sessionId}" not found.`);
  }

  const meta = await readMetadata(sessionId);
  if (meta.endedAt) {
    throw new Error(`Session "${sessionId}" is already completed.`);
  }

  const endedAt = new Date().toISOString();
  meta.endedAt = endedAt;

  await writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8"
  );

  // Generate report
  let evidenceEntries: EvidenceEntry[] = [];
  try {
    const raw = await readFile(path.join(dir, "evidence.jsonl"), "utf8");
    evidenceEntries = raw
      .trim()
      .split("\n")
      .filter(l => l.trim())
      .map(l => JSON.parse(l) as EvidenceEntry);
  } catch { /* no evidence */ }

  const startedDate = new Date(meta.startedAt);
  const endedDate = new Date(endedAt);
  const durationMs = endedDate.getTime() - startedDate.getTime();
  const durationMin = Math.floor(durationMs / 60000);
  const durationSec = Math.floor((durationMs % 60000) / 1000);

  const stepRows = evidenceEntries.length > 0
    ? evidenceEntries.map(e => {
        const status = e.ok ? "✅" : "❌";
        const shot = e.screenshot ? "📸" : "";
        return `| ${e.step} | ${e.timestamp.replace("T", " ").slice(0, 19)} | ${e.tool} | ${status} ${shot} | ${e.output.slice(0, 80)} |`;
      }).join("\n")
    : "| — | — | No steps recorded | — |";

  const report = [
    `# Session: ${meta.name}`,
    "",
    `- **Started:** ${meta.startedAt.replace("T", " ").slice(0, 19)}`,
    `- **Ended:** ${endedAt.replace("T", " ").slice(0, 19)}`,
    `- **Duration:** ${durationMin}m ${durationSec}s`,
    meta.profile ? `- **Profile:** ${meta.profile}` : "",
    meta.url ? `- **URL:** ${meta.url}` : "",
    `- **Steps:** ${evidenceEntries.length}`,
    `- **Status:** ${meta.ok ? "PASS ✅" : "FAIL ❌"}`,
    "",
    "## Steps",
    "",
    "| Step | Timestamp | Tool | Result |",
    "|------|-----------|------|--------|",
    stepRows,
    ""
  ].filter(l => l !== "").join("\n");

  await writeFile(path.join(dir, "final-report.md"), report, "utf8");

  return meta;
}

export async function listSessions(limit: number): Promise<SessionMetadata[]> {
  const sessionsDir = path.resolve(process.cwd(), SESSIONS_DIR);
  if (!(await dirExists(sessionsDir))) return [];

  const entries = await readdir(sessionsDir, { withFileTypes: true });
  const dirs = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
    .reverse();

  const sessions: SessionMetadata[] = [];
  for (const dirName of dirs.slice(0, limit)) {
    try {
      const meta = await readMetadata(dirName);
      sessions.push(meta);
    } catch { /* skip malformed */ }
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
    throw new Error(`Session "${sessionId}" is still active. Run browser_stop_session first.`);
  }
  return readFile(path.join(dir, "final-report.md"), "utf8");
}
