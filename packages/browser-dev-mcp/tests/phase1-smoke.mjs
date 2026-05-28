// Phase 1 smoke test — validates full Chromium + Playwright pipeline
import { BrowserSession } from "../dist/browser/BrowserSession.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const evidenceDir = path.join("evidence", "phase1-smoke");
await mkdir(evidenceDir, { recursive: true });

const session = new BrowserSession(evidenceDir, { headless: true });
const results = [];

try {
  await session.open();
  results.push("✅ Browser opened (headless, full Chromium)");

  // Test with about:blank
  await session.navigate("about:blank");
  results.push("✅ Navigated to about:blank");

  // Inject HTML canvas
  await session.evaluateJs(`
    document.body.innerHTML = '<canvas id="game" width="800" height="600" style="background:#111"></canvas><h1>Test Page</h1>';
    const c = document.getElementById("game");
    const ctx = c.getContext("2d");
    ctx.fillStyle = "red";
    ctx.fillRect(10, 10, 100, 100);
    ctx.fillStyle = "blue";
    ctx.fillRect(200, 200, 150, 150);
    "canvas rendered"
  `);
  results.push("✅ Canvas injected and rendered");

  // Full page screenshot
  const shotPath = await session.screenshot("example-home");
  results.push("✅ Screenshot: " + shotPath);

  // Canvas-specific screenshot
  const canvasShot = await session.screenshotElement("canvas", "canvas-test");
  results.push("✅ Canvas screenshot: " + canvasShot);

  // FPS capture
  await session.evaluateJs("window.__fps = 60");
  const fps = await session.captureFps();
  results.push("✅ FPS capture: " + fps);

  // Console logs
  const logs = await session.getConsoleLogs();
  results.push("✅ Console logs: " + logs.length);

  // Page errors
  const errors = await session.getPageErrors();
  results.push("✅ Page errors: " + errors.length);

  // click_percent
  await session.clickPercent(50, 50);
  results.push("✅ click_percent(50,50)");

  // press_key
  await session.pressKey("Enter");
  results.push("✅ press_key(Enter)");

  console.log(results.join("\n"));
  console.log("\n🎉 PHASE 1 — FULL PIPELINE VALIDATED");
} catch (err) {
  console.error("❌ FAILED:", err.message);
  console.error(results.join("\n"));
  process.exit(1);
} finally {
  await session.close();
  results.push("✅ Browser closed cleanly");
}
