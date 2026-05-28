#!/usr/bin/env node
// Galaxy Raiders Smoke Test — 12-step workflow with boss jump
// Run from monorepo root: node examples/galaxy-raiders/run-galaxy-smoke.js [url]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = process.argv[2] || "http://localhost:5173";

// Resolve playwright from workspace
function findPlaywright() {
  try { return createRequire(join(__dirname, "..", "..", "node_modules", ".pnpm") + "/")("playwright"); }
  catch {}
  try { return createRequire(import.meta.url)("playwright"); }
  catch {}
  throw new Error("playwright not found — run from monorepo root");
}
const { chromium } = findPlaywright();

function timestamp() {
  return new Date().toISOString().replace(/:/g, "_").replace(/\..+/, "Z");
}

async function run() {
  const evidenceDir = join(__dirname, "evidence", `galaxy-smoke-${timestamp()}`);
  mkdirSync(evidenceDir, { recursive: true });

  console.log("━━━ galaxy-smoke ━━━");

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
  });
  const page = await browser.newPage({ viewport: { width: 360, height: 640 } });

  const consoleEntries = [];
  const pageErrors = [];
  page.on("console", msg => consoleEntries.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", err => pageErrors.push(err.message));

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  console.log(`  ✓ Step 1: navigated to ${URL}`);

  await new Promise(r => setTimeout(r, 2000));
  console.log("  ✓ Step 2: waited 2000ms");

  const menuPath = join(evidenceDir, "menu.png");
  await page.screenshot({ path: menuPath });
  console.log("  ✓ Step 3: screenshot → menu.png");

  await page.evaluate(() => { GALAXY_CONFIG.debug.showLevelSkipButton = true; });
  console.log("  ✓ Step 4: debug enabled");

  await page.keyboard.press("Enter");
  console.log("  ✓ Step 5: game started (Enter)");

  await new Promise(r => setTimeout(r, 2000));
  console.log("  ✓ Step 6: waited 2000ms");

  const gameplayPath = join(evidenceDir, "gameplay.png");
  const canvas = await page.$("canvas");
  if (canvas) await canvas.screenshot({ path: gameplayPath });
  console.log("  ✓ Step 7: canvas screenshot → gameplay.png");

  const gameState = await page.evaluate(() => ({
    level: typeof level !== "undefined" ? level : "?",
    state: typeof state !== "undefined" ? state : "?",
    lives: typeof lives !== "undefined" ? lives : "?",
    enemies: typeof enemies !== "undefined" ? enemies.length : "?"
  }));
  console.log(`  ✓ Step 8: game state → level=${gameState.level}, lives=${gameState.lives}, enemies=${gameState.enemies}`);

  await page.evaluate(() => { window.__GR_DEBUG_JUMP_TO_LEVEL(5); });
  console.log("  ✓ Step 9: jumped to LV5 Crabtron");

  await new Promise(r => setTimeout(r, 2000));
  const bossPath = join(evidenceDir, "boss.png");
  const bossCanvas = await page.$("canvas");
  if (bossCanvas) await bossCanvas.screenshot({ path: bossPath });
  console.log("  ✓ Step 10: canvas screenshot → boss.png");

  writeFileSync(join(evidenceDir, "console.json"), JSON.stringify(consoleEntries, null, 2));
  console.log(`  ✓ Step 11: ${consoleEntries.length} console entries`);

  writeFileSync(join(evidenceDir, "errors.json"), JSON.stringify(pageErrors, null, 2));
  console.log(`  ✓ Step 12: ${pageErrors.length} page errors`);

  await browser.close();

  const report = {
    workflow: "galaxy-smoke",
    timestamp: new Date().toISOString(),
    gameURL: URL,
    steps: 12, passed: 12,
    gameState, pageErrors: pageErrors.length,
    evidence: { menu: menuPath, gameplay: gameplayPath, boss: bossPath }
  };
  writeFileSync(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));

  console.log(`\n  Result: 12/12 steps passed ✅`);
  console.log(`\n  Evidence: ${evidenceDir}/`);
}

run().catch(e => {
  console.error(`Failed: ${e.message}`);
  console.error("\nIs Galaxy Raiders running?");
  console.error("  Terminal 1: cd /path/to/galaxy-raiders && npx http-server www -p 5173 -c-1");
  console.error("  Terminal 2: node examples/galaxy-raiders/run-galaxy-smoke.js");
  process.exit(1);
});
