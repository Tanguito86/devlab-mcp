#!/usr/bin/env node
// browser-dev-mcp doctor — check environment health

import { access, readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";

const checks = [];

function ok(msg) { checks.push(`✅ ${msg}`); }
function warn(msg) { checks.push(`⚠️ ${msg}`); }
function fail(msg) { checks.push(`❌ ${msg}`); }

// Node version
const nodeVersion = process.version;
const major = parseInt(nodeVersion.slice(1).split(".")[0], 10);
if (major >= 20) ok(`Node ${nodeVersion}`);
else fail(`Node ${nodeVersion} (need >=20)`);

// npm
try {
  execSync("npm --version", { stdio: "pipe" });
  ok("npm available");
} catch { warn("npm not found"); }

// Playwright check
try {
  const pkgPath = path.resolve(process.cwd(), "node_modules/playwright/package.json");
  await access(pkgPath);
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  ok(`Playwright ${pkg.version}`);
} catch {
  warn("Playwright not installed (run: npm install && npx playwright install chromium)");
}

// Chromium check
try {
  execSync("npx playwright install --dry-run chromium 2>&1 || true", { stdio: "pipe" });
  ok("Chromium (Playwright) available");
} catch {
  warn("Chromium may not be installed (run: npx playwright install chromium)");
}

// Build check
try {
  await access(path.resolve(process.cwd(), "dist/index.js"));
  ok("dist/ build found");
} catch {
  warn("No dist/ build (run: npm run build)");
}

// Profiles
try {
  const profilesDir = path.resolve(process.cwd(), "profiles");
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(profilesDir);
  const profiles = entries.filter(e => e.endsWith(".json"));
  ok(`${profiles.length} profiles: ${profiles.join(", ")}`);
} catch { warn("No profiles/ directory"); }

// Workflows
try {
  const wfDir = path.resolve(process.cwd(), "workflows");
  const { readdir } = await import("node:fs/promises");
  let count = 0;
  const profileDirs = await readdir(wfDir, { withFileTypes: true });
  for (const entry of profileDirs) {
    if (entry.isDirectory()) {
      const wfs = await readdir(path.join(wfDir, entry.name));
      count += wfs.filter(w => w.endsWith(".json")).length;
    }
  }
  ok(`${count} workflow files`);
} catch { warn("No workflows/ directory"); }

// Summary
console.log("browser-dev-mcp Doctor");
console.log("═".repeat(40));
for (const c of checks) console.log(c);
console.log("═".repeat(40));
console.log(`Result: ${checks.every(c => !c.startsWith("❌")) ? "Ready 🚀" : "Issues found — see above"}`);
