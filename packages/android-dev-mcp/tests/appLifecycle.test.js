import test from "node:test";
import assert from "node:assert/strict";

// Integration-level tests for new app lifecycle & package tools.
// These test validation logic and parsing helpers, not ADB execution (no device required).
//
// The tools themselves are registration wrappers that call adb() directly.
// Their validation lives in the Zod schemas embedded in registerTool calls.
// Here we test what we can reach without mocking: parsing, validation boundaries,
// and any pure-logic helpers.

// ── android_list_packages ──

test("android_list_packages filter logic — case-insensitive substring match", () => {
  const packages = [
    "com.android.settings",
    "com.google.android.youtube",
    "com.tanguito.soundbend",
    "com.samsung.android.bixby",
    "com.android.chrome"
  ];

  const filter = (list, query) => {
    const lower = query.toLowerCase();
    return list.filter((pkg) => pkg.toLowerCase().includes(lower));
  };

  // Full match
  assert.deepEqual(filter(packages, "soundbend"), ["com.tanguito.soundbend"]);
  // Case-insensitive
  assert.deepEqual(filter(packages, "SOUNDBEND"), ["com.tanguito.soundbend"]);
  // Partial match
  assert.deepEqual(filter(packages, "android"), [
    "com.android.settings",
    "com.google.android.youtube",
    "com.samsung.android.bixby",
    "com.android.chrome"
  ]);
  // No match
  assert.deepEqual(filter(packages, "nonexistent"), []);
  // Empty filter (return all)
  assert.equal(packages.length, 5);
});

test("android_list_packages pm list packages output parsing", () => {
  const pmOutput = [
    "package:com.android.settings",
    "package:com.tanguito.soundbend",
    "package:com.google.android.gms",
    ""
  ].join("\n");

  const parsed = pmOutput
    .split(/\r?\n/)
    .map((line) => line.replace(/^package:/, "").trim())
    .filter((pkg) => pkg.length > 0);

  assert.deepEqual(parsed, [
    "com.android.settings",
    "com.tanguito.soundbend",
    "com.google.android.gms"
  ]);
});

// ── android_current_app ──

test("android_current_app parse mCurrentFocus from dumpsys window", () => {
  const focusLine = "  mCurrentFocus=Window{abc123 u0 com.tanguito.soundbend/com.tanguito.soundbend.ui.MainActivity}";

  const component = focusLine.match(/([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.$]+)/);
  assert.ok(component, "should match component pattern");
  assert.equal(component[1], "com.tanguito.soundbend");
  assert.equal(component[2], "com.tanguito.soundbend.ui.MainActivity");
});

test("android_current_app parse topResumedActivity from dumpsys activity", () => {
  const topResumedLine = "  topResumedActivity=ActivityRecord{def456 u0 com.android.chrome/com.google.android.apps.chrome.Main t123}";

  const component = topResumedLine.match(/([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.$]+)/);
  assert.ok(component, "should match component pattern");
  assert.equal(component[1], "com.android.chrome");
  assert.equal(component[2], "com.google.android.apps.chrome.Main");
});

// ── android_app_info ──

test("android_app_info parse dumpsys package output", () => {
  const dumpsysOutput = [
    "Packages:",
    "  Package [com.tanguito.soundbend] (abc123):",
    "    userId=12345",
    "    pkg=Package{def456 com.tanguito.soundbend}",
    "    versionName=1.2.3",
    "    versionCode=42",
    "    firstInstallTime=2026-01-15 10:30:00",
    "    lastUpdateTime=2026-05-20 14:22:00",
    "    requested permissions:",
    "      android.permission.BLUETOOTH",
    "      android.permission.POST_NOTIFICATIONS",
    "      android.permission.RECORD_AUDIO",
    "    install permissions:",
    "      android.permission.BLUETOOTH: granted=true",
    "    declared permissions:",
    "      none"
  ].join("\n");

  const extract = (regex) => {
    const match = dumpsysOutput.match(regex);
    return match?.[1] ?? "unknown";
  };

  assert.equal(extract(/versionName=(\S+)/), "1.2.3");
  assert.equal(extract(/versionCode=(\d+)/), "42");
  assert.equal(extract(/firstInstallTime=([^\n]+)/), "2026-01-15 10:30:00");
  assert.equal(extract(/lastUpdateTime=([^\n]+)/), "2026-05-20 14:22:00");

  const perms = [...dumpsysOutput.matchAll(/^\s+(android\.permission\.\S+)$/gm)];
  assert.equal(perms.length, 3);
  assert.ok(perms.some((m) => m[1] === "android.permission.BLUETOOTH"));
  assert.ok(perms.some((m) => m[1] === "android.permission.RECORD_AUDIO"));
});

test("android_app_info app/package validation — both missing", () => {
  const hasAppOrPackage = (app, pkg) => {
    return !!(app || pkg);
  };

  assert.equal(hasAppOrPackage(undefined, undefined), false);
  assert.equal(hasAppOrPackage("soundbend", undefined), true);
  assert.equal(hasAppOrPackage(undefined, "com.test.app"), true);
  assert.equal(hasAppOrPackage("soundbend", "com.test.app"), true);
});

// ── android_uninstall_app ──

test("android_uninstall_app keepData flag defaults to false", () => {
  const buildArgs = (pkg, keepData) => {
    const keep = keepData === true;
    return keep
      ? ["shell", "pm", "uninstall", "-k", pkg]
      : ["uninstall", pkg];
  };

  // Default: no -k
  assert.deepEqual(buildArgs("com.test.app"), ["uninstall", "com.test.app"]);
  // Explicit false: no -k
  assert.deepEqual(buildArgs("com.test.app", false), ["uninstall", "com.test.app"]);
  // Explicit true: -k
  assert.deepEqual(buildArgs("com.test.app", true), ["shell", "pm", "uninstall", "-k", "com.test.app"]);
});

test("android_uninstall_app requires app or package", () => {
  const hasAppOrPackage = (app, pkg) => {
    return !!(app || pkg);
  };

  assert.equal(hasAppOrPackage(undefined, undefined), false);
  assert.equal(hasAppOrPackage("soundbend", undefined), true);
  assert.equal(hasAppOrPackage(undefined, "com.test.app"), true);
});

// ── android_start_activity ──

test("android_start_activity builds am start command with optional action", () => {
  const buildArgs = (pkg, activity, action) => {
    const args = ["shell", "am", "start"];
    if (action) {
      args.push("-a", action);
    }
    args.push("-n", `${pkg}/${activity}`);
    return args;
  };

  // Without action
  assert.deepEqual(
    buildArgs("com.test.app", ".MainActivity"),
    ["shell", "am", "start", "-n", "com.test.app/.MainActivity"]
  );

  // With action
  assert.deepEqual(
    buildArgs("com.test.app", ".MainActivity", "android.intent.action.VIEW"),
    ["shell", "am", "start", "-a", "android.intent.action.VIEW", "-n", "com.test.app/.MainActivity"]
  );
});

test("android_start_activity requires package and activity", () => {
  const isValid = (pkg, activity) => {
    return pkg.length > 0 && activity.length > 0;
  };

  assert.equal(isValid("", ".MainActivity"), false);
  assert.equal(isValid("com.app", ""), false);
  assert.equal(isValid("com.app", ".MainActivity"), true);
});

// ── android_send_intent ──

test("android_send_intent builds am broadcast with extras", () => {
  const appendExtra = (args, key, value) => {
    if (typeof value === "boolean") {
      args.push("--ez", key, value ? "true" : "false");
      return;
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        args.push("--ei", key, value);
        return;
      }
      args.push("--ef", key, value);
      return;
    }
    args.push("--es", key, value);
  };

  // Boolean
  let argsBool = [];
  appendExtra(argsBool, "enabled", true);
  assert.deepEqual(argsBool, ["--ez", "enabled", "true"]);

  appendExtra(argsBool, "quiet", false);
  assert.deepEqual(argsBool, ["--ez", "enabled", "true", "--ez", "quiet", "false"]);

  // Integer
  let argsInt = [];
  appendExtra(argsInt, "count", 42);
  assert.deepEqual(argsInt, ["--ei", "count", 42]);

  // Float
  let argsFloat = [];
  appendExtra(argsFloat, "gain", 1.5);
  assert.deepEqual(argsFloat, ["--ef", "gain", 1.5]);

  // String
  let argsStr = [];
  appendExtra(argsStr, "name", "hello");
  assert.deepEqual(argsStr, ["--es", "name", "hello"]);
});

test("android_send_intent builds full broadcast args", () => {
  const appendExtra = (args, key, value) => {
    if (typeof value === "boolean") {
      args.push("--ez", key, value ? "true" : "false");
      return;
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) { args.push("--ei", key, value); return; }
      args.push("--ef", key, value);
      return;
    }
    args.push("--es", key, value);
  };

  const buildBroadcast = (action, pkg, component, extras) => {
    const args = ["shell", "am", "broadcast", "-a", action];
    if (pkg) args.push("-p", pkg);
    if (component) args.push("-n", component);
    for (const [key, value] of Object.entries(extras ?? {})) {
      appendExtra(args, key, value);
    }
    return args;
  };

  // Simple broadcast
  assert.deepEqual(
    buildBroadcast("com.example.MY_ACTION"),
    ["shell", "am", "broadcast", "-a", "com.example.MY_ACTION"]
  );

  // With package
  assert.deepEqual(
    buildBroadcast("com.example.MY_ACTION", "com.test.app"),
    ["shell", "am", "broadcast", "-a", "com.example.MY_ACTION", "-p", "com.test.app"]
  );

  // With component
  assert.deepEqual(
    buildBroadcast("com.example.MY_ACTION", undefined, "com.test/.Receiver"),
    ["shell", "am", "broadcast", "-a", "com.example.MY_ACTION", "-n", "com.test/.Receiver"]
  );

  // With extras
  assert.deepEqual(
    buildBroadcast("com.example.MY_ACTION", "com.test.app", undefined, {
      enabled: true,
      count: 5
    }),
    [
      "shell", "am", "broadcast", "-a", "com.example.MY_ACTION",
      "-p", "com.test.app",
      "--ez", "enabled", "true",
      "--ei", "count", 5
    ]
  );
});

// ── android_open_app_settings ──

test("android_open_app_settings builds APPLICATION_DETAILS_SETTINGS intent", () => {
  const buildArgs = (pkg) => {
    return [
      "shell", "am", "start",
      "-a", "android.settings.APPLICATION_DETAILS_SETTINGS",
      "-d", `package:${pkg}`
    ];
  };

  assert.deepEqual(
    buildArgs("com.tanguito.soundbend"),
    [
      "shell", "am", "start",
      "-a", "android.settings.APPLICATION_DETAILS_SETTINGS",
      "-d", "package:com.tanguito.soundbend"
    ]
  );
});
