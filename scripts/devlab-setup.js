#!/usr/bin/env node
// DevLab MCP Suite — Environment Setup
// Detects, reports, and optionally installs prerequisites.

import { execSync } from "node:child_process";
import { platform, release } from "node:os";
import { existsSync } from "node:fs";

const ok = [];
const warn = [];
const fail = [];
const fixes = [];

function check(label, pass, detail = "") {
  if (pass) ok.push(label);
  else fail.push(`${label}  ${detail ? "→ " + detail : ""}`);
}

function header(text) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  ${text}`);
  console.log("=".repeat(50));
}

function section(text) {
  console.log(`\n  ── ${text} ──`);
}

function sh(cmd) {
  try { return execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim(); }
  catch { return null; }
}

// ═══════════════════════════════════════════
// 1. OS & Environment
// ═══════════════════════════════════════════
header("SYSTEM");

const os = platform();
const isWSL = os === "linux" && sh("uname -r")?.includes("microsoft");
const osLabel = isWSL ? "WSL (Windows Subsystem for Linux)" : `${os} ${release()}`;
console.log(`  OS:       ${osLabel}`);
console.log(`  Arch:     ${process.arch}`);

// ═══════════════════════════════════════════
// 2. Node.js
// ═══════════════════════════════════════════
section("Node.js");
const nodeVersion = process.version;
const nodeMajor = parseInt(nodeVersion.slice(1).split(".")[0]);
console.log(`  Node:     ${nodeVersion}`);
check("Node >= 20", nodeMajor >= 20, `current: ${nodeVersion}`);
if (nodeMajor < 20) fixes.push("Install Node.js >= 20: https://nodejs.org");

// ═══════════════════════════════════════════
// 3. Package Manager
// ═══════════════════════════════════════════
section("Package Manager");
const npmVersion = sh("npm --version");
const pnpmVersion = sh("pnpm --version");
console.log(`  npm:      ${npmVersion || "not found"}`);
console.log(`  pnpm:     ${pnpmVersion || "not found"}`);

check("npm available", !!npmVersion);
check("pnpm available", !!pnpmVersion, "required — install: npm install -g pnpm");
if (!pnpmVersion) fixes.push("npm install -g pnpm");

// ═══════════════════════════════════════════
// 4. Playwright & Chromium
// ═══════════════════════════════════════════
section("Playwright (browser-dev-mcp)");

const npxCmd = isWSL ? "npx" : "npx"; // works same
let playwrightVersion = null;
let chromiumPath = null;

try {
  // Check if Playwright is installed — try workspace root, then fallback to global
  const pwRoot = sh("node -e \"try { require(process.cwd()+'/node_modules/playwright/package.json'); console.log(require(process.cwd()+'/node_modules/playwright/package.json').version) } catch(e) {}\" 2>/dev/null");
  const pwBrowser = sh("node -e \"try { require(process.cwd()+'/packages/browser-dev-mcp/node_modules/playwright/package.json'); console.log(require(process.cwd()+'/packages/browser-dev-mcp/node_modules/playwright/package.json').version) } catch(e) {}\" 2>/dev/null");
  const pwGlobal = sh("node -e \"console.log(require('playwright/package.json').version)\" 2>/dev/null");
  if (pwRoot) playwrightVersion = pwRoot;
  else if (pwBrowser) playwrightVersion = pwBrowser;
  else if (pwGlobal) playwrightVersion = pwGlobal;
} catch {}

if (playwrightVersion) {
  console.log(`  Playwright: ${playwrightVersion}`);
  check("Playwright installed", true);
} else {
  console.log("  Playwright: not installed");
  warn.push("Playwright not installed — run: npm install playwright");
  fixes.push("npm install playwright");
}

// Check Chromium browser binary
const chromiumSearchPaths = [
  `${process.env.HOME}/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`,
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
  `${process.env.HOME}/AppData/Local/ms-playwright/chromium-*/chrome-win/chrome.exe`
];

let chromiumFound = false;
for (const pattern of chromiumSearchPaths) {
  try {
    const found = sh(`ls -d ${pattern} 2>/dev/null | head -1`);
    if (found) { chromiumPath = found; chromiumFound = true; break; }
  } catch {}
}

if (chromiumFound) {
  console.log(`  Chromium:  ${chromiumPath}`);
  check("Chromium browser installed", true);
} else {
  console.log("  Chromium:  not found");
  warn.push("Chromium not installed — run: npx playwright install chromium");
  fixes.push("npx playwright install chromium");
}

// WSL headless shell workaround
if (isWSL && chromiumFound) {
  const headlessShell = chromiumPath.replace(/\/chrome$/, "");
  const hasLibs = sh(`ldd ${headlessShell}/chrome 2>/dev/null | grep "not found" | wc -l`) || "?";
  if (hasLibs !== "0") {
    warn.push("WSL: headless Chromium shell missing shared libs — browser-dev-mcp auto-applies full binary workaround");
  }
}

// ═══════════════════════════════════════════
// 5. ADB (android-dev-mcp optional)
// ═══════════════════════════════════════════
section("ADB (android-dev-mcp — optional)");
const adbVersion = sh("adb version 2>&1 | head -1");
if (adbVersion) {
  console.log(`  ADB:      ${adbVersion}`);
  check("ADB available", true);
} else {
  console.log("  ADB:      not found (optional — needed for android-dev-mcp)");
  warn.push("ADB not found — optional, needed for android-dev-mcp. Install Android SDK Platform Tools.");
}

// ═══════════════════════════════════════════
// 6. DevLab Packages
// ═══════════════════════════════════════════
section("DevLab Packages");
const packagesDir = `${process.cwd()}/packages`;
const hasShared = existsSync(`${packagesDir}/shared/dist/index.js`);
const hasBrowser = existsSync(`${packagesDir}/browser-dev-mcp/dist/index.js`);
const hasAndroid = existsSync(`${packagesDir}/android-dev-mcp/dist/index.js`);

check("Shared built", hasShared, "run: pnpm build");
check("Browser MCP built", hasBrowser, "run: pnpm build");
check("Android MCP built", hasAndroid, "run: pnpm build");

if (!hasShared || !hasBrowser || !hasAndroid) {
  fixes.push("pnpm install && pnpm build");
}

// ═══════════════════════════════════════════
// 7. Summary
// ═══════════════════════════════════════════
header("SUMMARY");

console.log(`  ✅ ${ok.length} checks passed`);
if (warn.length) console.log(`  ⚠️  ${warn.length} warnings`);
if (fail.length) console.log(`  ❌ ${fail.length} failures`);

if (ok.length > 0) {
  console.log("\n  Passed:");
  for (const o of ok.slice(-8)) console.log(`    ✅ ${o}`);
}

if (warn.length > 0) {
  console.log("\n  Warnings:");
  for (const w of warn) console.log(`    ⚠️  ${w}`);
}

if (fail.length > 0) {
  console.log("\n  Failures:");
  for (const f of fail) console.log(`    ❌ ${f}`);
}

if (fixes.length > 0) {
  console.log("\n  Recommended fixes:");
  for (const f of fixes) console.log(`    $ ${f}`);
}

// ═══════════════════════════════════════════
// 8. Auto-fix: install Chromium (safe operation)
// ═══════════════════════════════════════════
if (!chromiumFound && playwrightVersion) {
  console.log("\n  Auto-installing Chromium browser...");
  try {
    execSync("npx playwright install chromium", { stdio: "inherit", timeout: 120000 });
    console.log("  ✅ Chromium installed successfully.");
  } catch (e) {
    console.log(`  ⚠️  Could not auto-install Chromium: ${e.message}`);
    console.log("     Run manually: npx playwright install chromium");
  }
}

// Final status
const finalOk = fail.length === 0;
if (finalOk) {
  console.log(`\n${"=".repeat(50)}`);
  console.log("  ✅ DevLab MCP Suite is ready!\n");
  console.log("  Quick start:");
  console.log("    pnpm test                    # 59 tests");
  console.log("    pnpm --filter @tanguito/browser-dev-mcp run doctor");
  console.log("    cd examples/browser-hello-world");
  console.log("    node run-hello-world.js      # Your first workflow");
  console.log("=".repeat(50));
} else {
  console.log(`\n${"=".repeat(50)}`);
  console.log("  ⚠️  Some checks failed. Fix the issues above and re-run:");
  console.log("    pnpm setup");
  console.log("=".repeat(50));
}

process.exit(fail.length > 0 ? 1 : 0);
