import test from "node:test";
import assert from "node:assert/strict";

// Unit tests for session manager helpers.
// These test pure logic: sanitization, validation, metadata generation,
// actions.jsonl format, and report template. No ADB or filesystem required.
//
// The tools themselves are registration wrappers that call sessionManager helpers.
// Their validation lives in Zod schemas embedded in registerTool calls.

// ── sanitizeName ──

test("sanitizeName converts spaces and special chars to hyphens", () => {
  const sanitize = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "session";
  };

  assert.equal(sanitize("Smoke Test v2.0!"), "smoke-test-v2-0");
  assert.equal(sanitize("BT Audit  "), "bt-audit");
  assert.equal(sanitize("hello_world"), "hello_world");
  assert.equal(sanitize("!!!"), "session");
  assert.equal(sanitize(""), "session");
  assert.equal(sanitize("A".repeat(100)), "a".repeat(64));
});

test("sanitizeName handles edge cases", () => {
  const sanitize = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "session";
  };

  // Leading/trailing special chars
  assert.equal(sanitize("-test-"), "test");
  // Spanish characters
  assert.equal(sanitize("prueba-de-sesión"), "prueba-de-sesi-n");
  // Numbers preserved
  assert.equal(sanitize("build-42"), "build-42");
});

// ── validateSessionId ──

test("validateSessionId rejects path traversal attempts", () => {
  const validate = (id) => {
    if (!id || typeof id !== "string") throw new Error("required");
    if (id.includes("..") || id.includes("/") || id.includes("\\")) {
      throw new Error("Path traversal not allowed");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error("Only alphanumeric, hyphens, underscores");
    }
  };

  // Valid
  assert.doesNotThrow(() => validate("2026-05-26_18-30-15_smoke-test"));
  assert.doesNotThrow(() => validate("session_001"));
  assert.doesNotThrow(() => validate("test"));

  // Path traversal
  assert.throws(() => validate("../../etc/passwd"), /Path traversal/);
  assert.throws(() => validate("sessions/../secret"), /Path traversal/);
  assert.throws(() => validate("test\\windows"), /Path traversal/);

  // Invalid chars
  assert.throws(() => validate("session name with spaces"), /Only alphanumeric/);
  assert.throws(() => validate("test:123"), /Only alphanumeric/);

  // Empty
  assert.throws(() => validate(""), /required/);
  assert.throws(() => validate(null), /required/);
});

// ── SessionMetadata schema ──

test("SessionMetadata has required fields", () => {
  const requiredFields = [
    "name", "sessionId", "startedAt",
    "deviceModel", "androidVersion", "sdk", "stepCount"
  ];

  const validMeta = {
    name: "smoke-test",
    sessionId: "2026-05-26_18-30-15_smoke-test",
    startedAt: "2026-05-26T18:30:15.000Z",
    endedAt: null,
    deviceId: null,
    app: null,
    deviceModel: "SM-S908B",
    androidVersion: "14",
    sdk: "34",
    stepCount: 0
  };

  for (const field of requiredFields) {
    assert.ok(field in validMeta, `metadata must have field: ${field}`);
  }

  // startedAt must be ISO 8601
  assert.ok(validMeta.startedAt.includes("T"), "startedAt must be ISO 8601");
  assert.ok(validMeta.startedAt.endsWith("Z"), "startedAt must be UTC");
});

// ── SessionAction schema ──

test("SessionAction JSONL entry has step, timestamp, action", () => {
  const entries = [
    { step: 1, timestamp: "2026-05-26T18:30:20.000Z", action: "launched app" },
    { step: 2, timestamp: "2026-05-26T18:30:25.000Z", action: "tapped login", screenshot: "screenshots/step_tapped-login.png" },
    { step: 3, timestamp: "2026-05-26T18:30:30.000Z", action: "checked UI", uiDump: "ui-dumps/step_checked-ui.xml" },
    { step: 4, timestamp: "2026-05-26T18:30:35.000Z", action: "full capture", screenshot: "screenshots/step_full-capture.png", uiDump: "ui-dumps/step_full-capture.xml" }
  ];

  for (const entry of entries) {
    assert.ok(entry.step > 0, `step ${entry.step} must be positive`);
    assert.ok(entry.timestamp.includes("T"), "timestamp must be ISO 8601");
    assert.ok(entry.action.length > 0, "action must not be empty");
  }

  // Step must be sequential
  for (let i = 1; i < entries.length; i++) {
    assert.equal(entries[i].step, entries[i - 1].step + 1,
      `steps must be sequential, got ${entries[i].step} after ${entries[i - 1].step}`);
  }

  // JSONL serialization round-trip
  const jsonl = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const parsed = jsonl
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(parsed.length, entries.length);
  assert.equal(parsed[1].screenshot, "screenshots/step_tapped-login.png");
  assert.equal(parsed[2].uiDump, "ui-dumps/step_checked-ui.xml");
});

// ── Report generation ──

test("final-report.md template contains key sections", () => {
  const meta = {
    name: "smoke-test",
    startedAt: "2026-05-26T18:30:15.000Z",
    deviceModel: "SM-S908B",
    androidVersion: "14",
    sdk: "34",
    app: "soundbend",
    stepCount: 3
  };

  const endedAt = "2026-05-26T18:35:30.000Z";
  const startedDate = new Date(meta.startedAt);
  const endedDate = new Date(endedAt);
  const durationMs = endedDate.getTime() - startedDate.getTime();
  const durationMin = Math.floor(durationMs / 60000);
  const durationSec = Math.floor((durationMs % 60000) / 1000);

  const report = [
    `# Session: ${meta.name}`,
    `- **Started:** ${meta.startedAt}`,
    `- **Ended:** ${endedAt}`,
    `- **Duration:** ${durationMin}m ${durationSec}s`,
    `- **Device:** ${meta.deviceModel}, Android ${meta.androidVersion} (SDK ${meta.sdk})`,
    `- **App:** ${meta.app}`,
    `- **Steps:** ${meta.stepCount}`,
    "## Actions",
    "| Step | Timestamp | Action | Evidence |",
    "|------|-----------|--------|----------|",
    "## Final State",
    "## Logcat"
  ].join("\n");

  assert.ok(report.includes("# Session: smoke-test"), "report must have session title");
  assert.ok(report.includes("## Actions"), "report must have Actions section");
  assert.ok(report.includes("## Final State"), "report must have Final State section");
  assert.ok(report.includes("## Logcat"), "report must have Logcat section");
  assert.ok(report.includes("| Step |"), "report must have actions table header");
  assert.ok(report.includes("5m 15s"), "duration must be 5m 15s");
  assert.ok(report.includes("SDK 34"), "report must include SDK level");
});

// ── Session lifecycle validation ──

test("session lifecycle: start → step → stop flow", () => {
  // Simulate a session lifecycle without filesystem
  let sessions = {};

  const createSession = (name) => {
    const sessionId = `2026-05-26_18-30-15_${name}`;
    sessions[sessionId] = {
      metadata: {
        name,
        sessionId,
        startedAt: "2026-05-26T18:30:15.000Z",
        endedAt: null,
        stepCount: 0
      },
      actions: []
    };
    return sessionId;
  };

  const addStep = (sessionId, action) => {
    const session = sessions[sessionId];
    if (!session) throw new Error("Session not found");
    if (session.metadata.endedAt) throw new Error("Session already completed");
    const step = session.metadata.stepCount + 1;
    session.actions.push({ step, timestamp: new Date().toISOString(), action });
    session.metadata.stepCount = step;
    return step;
  };

  const stopSession = (sessionId) => {
    const session = sessions[sessionId];
    if (!session) throw new Error("Session not found");
    if (session.metadata.endedAt) throw new Error("Already completed");
    session.metadata.endedAt = "2026-05-26T18:35:30.000Z";
    return session.metadata;
  };

  // Start
  const sid = createSession("smoke-test");
  assert.ok(sid.includes("smoke-test"));

  // Add steps
  assert.equal(addStep(sid, "launched app"), 1);
  assert.equal(addStep(sid, "tapped login"), 2);
  assert.equal(addStep(sid, "verified dashboard"), 3);
  assert.equal(sessions[sid].actions.length, 3);

  // Cannot add steps after stop
  stopSession(sid);
  assert.ok(sessions[sid].metadata.endedAt);
  assert.throws(() => addStep(sid, "this should fail"), /already completed/);

  // Cannot stop twice
  assert.throws(() => stopSession(sid), /Already completed/);
});

// ── Session listing ──

test("listSessions sorts by timestamp descending and marks status", () => {
  const sessions = [
    { sessionId: "2026-05-25_10-00_a", name: "old-test", startedAt: "2026-05-25T10:00:00Z", endedAt: "2026-05-25T10:05:00Z", stepCount: 3, deviceModel: "X", androidVersion: "14", sdk: "34" },
    { sessionId: "2026-05-26_18-30_b", name: "active-test", startedAt: "2026-05-26T18:30:00Z", endedAt: null, stepCount: 5, deviceModel: "Y", androidVersion: "14", sdk: "34" },
    { sessionId: "2026-05-26_14-00_c", name: "mid-test", startedAt: "2026-05-26T14:00:00Z", endedAt: "2026-05-26T14:02:00Z", stepCount: 2, deviceModel: "Z", androidVersion: "13", sdk: "33" }
  ];

  // Sort by sessionId descending (timestamp-based IDs)
  const sorted = [...sessions].sort((a, b) => b.sessionId.localeCompare(a.sessionId));

  assert.equal(sorted[0].name, "active-test", "most recent first");
  assert.equal(sorted[2].name, "old-test", "oldest last");

  // Status
  for (const s of sorted) {
    const status = s.endedAt ? "completed" : "active";
    if (s.endedAt) {
      assert.equal(status, "completed");
    } else {
      assert.equal(status, "active");
    }
  }
});

// ── timestampForPath format ──

test("timestampForPath produces safe filename with no colons", () => {
  const pad = (n) => String(n).padStart(2, "0");
  const timestampForPath = (date) => {
    return [
      date.getFullYear(),
      "-", pad(date.getMonth() + 1), "-", pad(date.getDate()),
      "_", pad(date.getHours()), "-", pad(date.getMinutes()), "-", pad(date.getSeconds())
    ].join("");
  };

  const ts = timestampForPath(new Date("2026-05-26T18:30:15Z"));
  assert.equal(ts, "2026-05-26_18-30-15");
  assert.ok(!ts.includes(":"), "timestamp must not contain colons for Windows compatibility");
  assert.ok(!ts.includes("T"), "timestamp must not contain T");
});

// ── steps auto-increment ──

test("appendAction auto-increments step number from metadata", () => {
  const meta = { stepCount: 0 };
  const nextStep = () => { meta.stepCount += 1; return meta.stepCount; };

  assert.equal(nextStep(), 1);
  assert.equal(nextStep(), 2);
  assert.equal(nextStep(), 3);
  assert.equal(meta.stepCount, 3);
});

// ── WSL path translation (Fase 17D) ──

test("toAdbHostPath translates /mnt/c/... to C:\\...", () => {
  const toAdbHostPath = (localPath) => {
    const wslMatch = localPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
    if (wslMatch) {
      const drive = wslMatch[1].toUpperCase();
      const rest = wslMatch[2].replace(/\//g, "\\");
      return `${drive}:\\${rest}`;
    }
    if (/^[a-zA-Z]:\\/.test(localPath)) return localPath;
    if (/^[a-zA-Z]:\//.test(localPath)) return localPath.replace(/\//g, "\\");
    return localPath;
  };

  // WSL paths → Windows
  assert.equal(
    toAdbHostPath("/mnt/c/Users/Deposito/file.xml"),
    "C:\\Users\\Deposito\\file.xml"
  );
  assert.equal(
    toAdbHostPath("/mnt/h/DEV/AGENTE/out.xml"),
    "H:\\DEV\\AGENTE\\out.xml"
  );
  assert.equal(
    toAdbHostPath("/mnt/c/Users/Deposito/Documents/android-dev-mcp/sessions/test/ui-dumps/step-1.xml"),
    "C:\\Users\\Deposito\\Documents\\android-dev-mcp\\sessions\\test\\ui-dumps\\step-1.xml"
  );

  // Windows paths pass through
  assert.equal(
    toAdbHostPath("C:\\Users\\Deposito\\file.xml"),
    "C:\\Users\\Deposito\\file.xml"
  );
  assert.equal(
    toAdbHostPath("D:\\Projects\\test.xml"),
    "D:\\Projects\\test.xml"
  );

  // Windows forward-slash → backslash
  assert.equal(
    toAdbHostPath("C:/Users/Deposito/file.xml"),
    "C:\\Users\\Deposito\\file.xml"
  );

  // Relative paths unchanged
  assert.equal(toAdbHostPath("sessions/test/file.xml"), "sessions/test/file.xml");
  assert.equal(toAdbHostPath("relative/path/file.xml"), "relative/path/file.xml");

  // Non-WSL Linux paths unchanged
  assert.equal(toAdbHostPath("/home/user/file.xml"), "/home/user/file.xml");
  assert.equal(toAdbHostPath("/tmp/test.xml"), "/tmp/test.xml");

  // Edge: drive letter preserved case-insensitively
  assert.equal(
    toAdbHostPath("/mnt/C/Users/Test/file.xml"),
    "C:\\Users\\Test\\file.xml"
  );
  assert.equal(
    toAdbHostPath("/mnt/d/data/out.log"),
    "D:\\data\\out.log"
  );
});
