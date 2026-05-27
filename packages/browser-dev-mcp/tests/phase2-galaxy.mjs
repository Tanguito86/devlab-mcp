// Phase 2 — Galaxy Raiders real integration test
// Tests: smoke-menu, start-game, boss-jump workflows against live GR server
import { BrowserSession } from "../dist/browser/BrowserSession.js";
import { runWorkflow } from "../dist/workflows/WorkflowRunner.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const GR_URL = "http://localhost:5173";
const results = [];

// Ensure evidence dirs exist
await mkdir(path.join("evidence"), { recursive: true });
await mkdir(path.join("workflow-reports"), { recursive: true });

// ═══════════════════════════════════════════════
// Initial reconnaissance — check GR page
// ═══════════════════════════════════════════════
console.log("═".repeat(50));
console.log("RECON: Galaxy Raiders page inspection");
console.log("═".repeat(50));

const reconDir = path.join("evidence", "gr-recon");
await mkdir(reconDir, { recursive: true });
const reconSession = new BrowserSession(reconDir, { headless: true });

try {
  await reconSession.open();
  await reconSession.navigate(GR_URL);
  await reconSession.wait(3000); // Let JS initialize

  const state = await reconSession.getState();
  console.log("  Title:", state.title);
  console.log("  URL:", state.url);

  // Check canvas presence
  const canvasCount = await reconSession.evaluateJs(
    "document.querySelectorAll('canvas').length"
  );
  console.log("  Canvas elements:", canvasCount);

  // Check debug hooks
  const hooks = await reconSession.evaluateJs(`
    (() => {
      const result = {};
      result.__GR_DEBUG_JUMP_TO_LEVEL = typeof window.__GR_DEBUG_JUMP_TO_LEVEL;
      result.GALAXY_CONFIG = typeof window.GALAXY_CONFIG;
      if (window.GALAXY_CONFIG && window.GALAXY_CONFIG.debug) {
        result.debugKeys = Object.keys(window.GALAXY_CONFIG.debug);
      }
      result.currentLevel = window.currentLevel;
      result.gameState_keys = window.gameState ? Object.keys(window.gameState) : [];
      result.hasGameLoop = typeof window.gameLoop !== 'undefined' || typeof window.game !== 'undefined';
      return result;
    })
  `);
  console.log("  Debug hooks:", JSON.stringify(hooks, null, 2));

  // Console output
  const logs = await reconSession.getConsoleLogs();
  console.log("  Console entries:", logs.length);
  if (logs.length > 0) {
    console.log("  Sample logs:", logs.slice(0, 10).join("\n    "));
  }

  const errors = await reconSession.getPageErrors();
  console.log("  Page errors:", errors.length);
  if (errors.length > 0) {
    console.log("  Errors:", errors.slice(0, 5).join("\n    "));
  }

  // Screenshot
  const reconShot = await reconSession.screenshot("gr-recon");
  console.log("  Screenshot:", reconShot);

  results.push("✅ Recon: page loaded, canvas=" + canvasCount);
} catch (err) {
  console.log("  ⚠️ Recon error:", err.message);
  results.push("⚠️ Recon: " + err.message);
} finally {
  await reconSession.close();
}

// ═══════════════════════════════════════════════
// Workflow 1: smoke-menu
// ═══════════════════════════════════════════════
console.log("\n═".repeat(50));
console.log("WORKFLOW 1: smoke-menu");
console.log("═".repeat(50));

try {
  const wf1Session = new BrowserSession(path.join("evidence", "wf1-smoke-menu"), { headless: true });
  await wf1Session.open();
  
  const wf1Result = await runWorkflow(wf1Session, "galaxy-raiders", "smoke-menu");
  
  console.log("  Status:", wf1Result.ok ? "✅ PASS" : "❌ FAIL");
  console.log("  Duration:", (wf1Result.durationMs / 1000).toFixed(1) + "s");
  console.log("  Session:", wf1Result.sessionId);
  console.log("  Report:", wf1Result.reportDir);
  
  for (const step of wf1Result.steps) {
    const icon = step.ok ? "✅" : "❌";
    console.log(`  ${icon} ${step.tool} (${step.durationMs}ms): ${step.output.slice(0, 100)}`);
    if (step.screenshot) console.log(`     📸 ${step.screenshot}`);
  }
  
  results.push(wf1Result.ok ? "✅ WF1 smoke-menu PASS" : "❌ WF1 smoke-menu FAIL");

  await wf1Session.close();
} catch (err) {
  console.log("  ❌ WF1 crashed:", err.message);
  results.push("❌ WF1 crash: " + err.message);
}

// ═══════════════════════════════════════════════
// Workflow 2: start-game
// ═══════════════════════════════════════════════
console.log("\n═".repeat(50));
console.log("WORKFLOW 2: start-game");
console.log("═".repeat(50));

try {
  const wf2Session = new BrowserSession(path.join("evidence", "wf2-start-game"), { headless: true });
  await wf2Session.open();
  
  const wf2Result = await runWorkflow(wf2Session, "galaxy-raiders", "start-game");
  
  console.log("  Status:", wf2Result.ok ? "✅ PASS" : "❌ FAIL");
  console.log("  Duration:", (wf2Result.durationMs / 1000).toFixed(1) + "s");
  console.log("  Session:", wf2Result.sessionId);
  console.log("  Report:", wf2Result.reportDir);
  
  for (const step of wf2Result.steps) {
    const icon = step.ok ? "✅" : "❌";
    console.log(`  ${icon} ${step.tool} (${step.durationMs}ms): ${step.output.slice(0, 100)}`);
    if (step.screenshot) console.log(`     📸 ${step.screenshot}`);
  }
  
  results.push(wf2Result.ok ? "✅ WF2 start-game PASS" : "❌ WF2 start-game FAIL");
  
  await wf2Session.close();
} catch (err) {
  console.log("  ❌ WF2 crashed:", err.message);
  results.push("❌ WF2 crash: " + err.message);
}

// ═══════════════════════════════════════════════
// Workflow 3: boss-jump
// ═══════════════════════════════════════════════
console.log("\n═".repeat(50));
console.log("WORKFLOW 3: boss-jump");
console.log("═".repeat(50));

try {
  const wf3Session = new BrowserSession(path.join("evidence", "wf3-boss-jump"), { headless: true });
  await wf3Session.open();
  
  const wf3Result = await runWorkflow(wf3Session, "galaxy-raiders", "boss-jump");
  
  console.log("  Status:", wf3Result.ok ? "✅ PASS" : "❌ FAIL");
  console.log("  Duration:", (wf3Result.durationMs / 1000).toFixed(1) + "s");
  console.log("  Session:", wf3Result.sessionId);
  console.log("  Report:", wf3Result.reportDir);
  
  for (const step of wf3Result.steps) {
    const icon = step.ok ? "✅" : "❌";
    console.log(`  ${icon} ${step.tool} (${step.durationMs}ms): ${step.output.slice(0, 100)}`);
    if (step.screenshot) console.log(`     📸 ${step.screenshot}`);
  }
  
  results.push(wf3Result.ok ? "✅ WF3 boss-jump PASS" : "❌ WF3 boss-jump FAIL");
  
  await wf3Session.close();
} catch (err) {
  console.log("  ❌ WF3 crashed:", err.message);
  results.push("❌ WF3 crash: " + err.message);
}

// ═══════════════════════════════════════════════
// Consecutive runs test (Phase 4 prep)
// ═══════════════════════════════════════════════
console.log("\n═".repeat(50));
console.log("CONSECUTIVE: Multiple rapid open/close cycles");
console.log("═".repeat(50));

for (let i = 0; i < 3; i++) {
  try {
    const s = new BrowserSession(path.join("evidence", "consecutive-" + i), { headless: true });
    await s.open();
    await s.navigate(GR_URL);
    await s.wait(1000);
    await s.screenshot("cycle-" + i);
    await s.close();
    console.log("  Cycle", i + 1, "✅");
    results.push("✅ Consecutive cycle " + (i + 1) + " OK");
  } catch (err) {
    console.log("  Cycle", i + 1, "❌", err.message);
    results.push("❌ Consecutive cycle " + (i + 1) + " FAIL: " + err.message);
  }
}

// ═══════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════
console.log("\n═".repeat(50));
console.log("SUMMARY");
console.log("═".repeat(50));
for (const r of results) console.log(r);

const passed = results.filter(r => r.includes("✅")).length;
const failed = results.filter(r => r.includes("❌") || r.includes("⚠️")).length;
console.log(`\nPass: ${passed}, Fail/Warn: ${failed}`);
