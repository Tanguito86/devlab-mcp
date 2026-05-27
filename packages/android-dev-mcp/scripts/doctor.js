#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function color(text, code) {
  return useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function ok(message) {
  console.log(`${color("[OK]", "32")} ${message}`);
}

function warn(message) {
  console.log(`${color("[WARN]", "33")} ${message}`);
}

function fail(message) {
  console.log(`${color("[FAIL]", "31")} ${message}`);
}

async function run(command, args = []) {
  return execFileAsync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

let failures = 0;

const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) {
  ok(`Node.js ${process.versions.node} detected`);
} else {
  fail(`Node.js ${process.versions.node} detected; Node.js 20 or newer is required`);
  failures += 1;
}

try {
  const adbVersion = await run("adb", ["version"]);
  ok(`adb found (${adbVersion.stdout.split(/\r?\n/)[0]})`);

  const devicesOutput = await run("adb", ["devices"]);
  const devices = devicesOutput.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state = "unknown"] = line.split(/\s+/);
      return { serial, state };
    });
  const readyDevices = devices.filter((device) => device.state === "device");
  const unauthorized = devices.filter((device) => device.state === "unauthorized");

  if (readyDevices.length > 0) {
    ok(`${readyDevices.length} Android device(s) connected: ${readyDevices.map((device) => device.serial).join(", ")}`);
  } else if (unauthorized.length > 0) {
    warn(`Device unauthorized: ${unauthorized.map((device) => device.serial).join(", ")}. Accept the USB debugging prompt.`);
  } else {
    warn("No Android devices connected. Connect a device or start an emulator.");
  }
} catch (error) {
  fail("adb not found in PATH. Install Android SDK Platform Tools and add platform-tools to PATH.");
  failures += 1;
}

if (existsSync("config/apps.json")) {
  try {
    const config = JSON.parse(await readFile("config/apps.json", "utf8"));
    const apps = Object.keys(config.apps ?? {});
    if (apps.length > 0) {
      ok(`${apps.length} app profile(s) configured: ${apps.join(", ")}`);
    } else {
      warn("config/apps.json exists but has no app profiles.");
    }
  } catch (error) {
    fail(`config/apps.json could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    failures += 1;
  }
} else {
  warn("config/apps.json not found. Copy a template from templates/ or config/apps.example.json.");
}

if (existsSync("dist/index.js")) {
  ok("MCP build ready at dist/index.js");
} else {
  warn("dist/index.js not found. Run npm run build before configuring an MCP client.");
}

if (failures > 0) {
  console.log("");
  fail(`Doctor finished with ${failures} blocking issue(s).`);
  process.exitCode = 1;
} else {
  console.log("");
  ok("Doctor finished. android-dev-mcp is ready for local use.");
}
