#!/usr/bin/env node
// Browser Hello World — minimal 5-step workflow
// Run from monorepo root: node examples/browser-hello-world/run-hello-world.js

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve playwright from workspace node_modules (pnpm stores in .pnpm/)
function findPlaywright() {
  try { return createRequire(join(__dirname, "..", "..", "node_modules", ".pnpm") + "/")("playwright"); }
  catch {}
  try { return createRequire(import.meta.url)("playwright"); }
  catch {}
  throw new Error("playwright not found — run from monorepo root: pnpm install && pnpm build");
}
const { chromium } = findPlaywright();

function timestamp() {
  return new Date().toISOString().replace(/:/g, "_").replace(/\..+/, "Z");
}

async function run() {
  const evidenceDir = join(__dirname, "evidence", `${timestamp()}-hello-world`);
  mkdirSync(evidenceDir, { recursive: true });

  console.log("━━━ browser-hello-world ━━━");

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const consoleEntries = [];
  const pageErrors = [];
  page.on("console", msg => consoleEntries.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", err => pageErrors.push(err.message));

  // Step 1: Navigate to a simple HTML page (works offline, no DNS needed)
  await page.setContent("<html><body><h1>Hello World</h1><p>DevLab MCP Suite</p></body></html>");
  console.log("  ✓ Step 1: loaded test page");

  // Step 2: Wait for render
  await new Promise(r => setTimeout(r, 1500));
  console.log("  ✓ Step 2: waited 1500ms");

  // Step 3: Screenshot
  const screenshotPath = join(evidenceDir, "example.png");
  await page.screenshot({ path: screenshotPath });
  console.log(`  ✓ Step 3: screenshot → ${screenshotPath}`);

  // Step 4: Console logs
  writeFileSync(join(evidenceDir, "console.json"), JSON.stringify(consoleEntries, null, 2));
  console.log(`  ✓ Step 4: ${consoleEntries.length} console entries`);

  // Step 5: Page errors
  writeFileSync(join(evidenceDir, "errors.json"), JSON.stringify(pageErrors, null, 2));
  console.log(`  ✓ Step 5: ${pageErrors.length} page errors`);

  await browser.close();

  const report = {
    workflow: "browser-hello-world",
    timestamp: new Date().toISOString(),
    steps: 5, passed: 5,
    evidenceDir,
    consoleEntries: consoleEntries.length,
    pageErrors: pageErrors.length,
    screenshot: screenshotPath
  };
  writeFileSync(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));

  console.log(`\n  Result: 5/5 steps passed ✅`);
  console.log(`\n  Evidence: ${evidenceDir}/`);
  console.log(`    ├── example.png (screenshot)`);
  console.log(`    ├── console.json (${consoleEntries.length} entries)`);
  console.log(`    ├── errors.json (${pageErrors.length} errors)`);
  console.log(`    └── report.json (execution report)`);
}

run().catch(e => {
  console.error(`Failed: ${e.message}`);
  console.error("\nTroubleshooting:");
  console.error("  1. Run from monorepo root: cd devlab-mcp");
  console.error("  2. pnpm install && pnpm build && pnpm setup");
  console.error("  3. node examples/browser-hello-world/run-hello-world.js");
  process.exit(1);
});
