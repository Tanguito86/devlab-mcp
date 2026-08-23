#!/usr/bin/env node
// browser-dev-mcp doctor — check environment health

import { access, readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolve against the package, not the caller's working directory: this doctor
// reports on THIS package's build output, and cwd-relative paths would make the
// answer depend on where it was launched from.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inPackage = (...parts) => path.join(packageRoot, ...parts);

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
  const pkgPath = inPackage("node_modules/playwright/package.json");
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

// Build check. Structural: the server cannot run without it, so this is fatal
// rather than advisory.
try {
  await access(inPackage("dist/index.js"));
  ok("dist/ build found");
} catch {
  fail("No dist/ build (run: pnpm --filter @tanguito/browser-dev-mcp build)");
}

// Profiles. Shipped with the package; absence means a packaging fault, not an
// environment quirk.
try {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(inPackage("profiles"));
  const profiles = entries.filter(e => e.endsWith(".json"));
  if (profiles.length === 0) fail("profiles/ contains no profile");
  else ok(`${profiles.length} profiles: ${profiles.join(", ")}`);
} catch { fail("No profiles/ directory"); }

// Workflows. Shipped likewise.
try {
  const { readdir } = await import("node:fs/promises");
  let count = 0;
  const profileDirs = await readdir(inPackage("workflows"), { withFileTypes: true });
  for (const entry of profileDirs) {
    if (entry.isDirectory()) {
      const wfs = await readdir(inPackage("workflows", entry.name));
      count += wfs.filter(w => w.endsWith(".json")).length;
    }
  }
  if (count === 0) fail("workflows/ contains no workflow");
  else ok(`${count} workflow files`);
} catch { fail("No workflows/ directory"); }

// Summary
console.log("browser-dev-mcp Doctor");
console.log("═".repeat(40));
for (const c of checks) console.log(c);
console.log("═".repeat(40));

// This doctor previously printed "Issues found" and exited 0 regardless, so a
// green CI step said nothing about the package. Structural faults now fail.
// Environment-dependent checks -- npm, Playwright, the Chromium binary -- stay
// advisory: CI does not install browsers for this job, and their absence does
// not make the package broken.
const failures = checks.filter((line) => line.startsWith("❌"));
if (failures.length > 0) {
  console.log(`Result: 🔴 ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("Result: Ready 🚀");
