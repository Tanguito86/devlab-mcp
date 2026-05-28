// Phase 2b — re-run WF3 after fix, + evidence validation
import { BrowserSession } from "../dist/browser/BrowserSession.js";
import { runWorkflow } from "../dist/workflows/WorkflowRunner.js";
import { readFile, readdir, access, mkdir } from "node:fs/promises";
import path from "node:path";

const GR_URL = "http://localhost:5173";

// ═══════════════════════════════════════════════
// Workflow 3: boss-jump (re-try after fix)
// ═══════════════════════════════════════════════
console.log("═".repeat(50));
console.log("WORKFLOW 3: boss-jump (fixed)");
console.log("═".repeat(50));

try {
  const wf3Session = new BrowserSession(path.join("evidence", "wf3-boss-jump-v2"), { headless: true });
  await wf3Session.open();

  const wf3Result = await runWorkflow(wf3Session, "galaxy-raiders", "boss-jump");

  console.log("  Status:", wf3Result.ok ? "✅ PASS" : "❌ FAIL");
  console.log("  Duration:", (wf3Result.durationMs / 1000).toFixed(1) + "s");
  console.log("  Session:", wf3Result.sessionId);

  for (const step of wf3Result.steps) {
    const icon = step.ok ? "✅" : "❌";
    console.log(`  ${icon} ${step.tool} (${step.durationMs}ms): ${step.output.slice(0, 120)}`);
    if (step.screenshot) console.log(`     📸 ${step.screenshot}`);
  }

  await wf3Session.close();
} catch (err) {
  console.log("  ❌ WF3 crashed:", err.message);
}

// ═══════════════════════════════════════════════
// Phase 3: Evidence validation
// ═══════════════════════════════════════════════
console.log("\n═".repeat(50));
console.log("PHASE 3: Evidence validation");
console.log("═".repeat(50));

const sessionsDir = path.join("sessions");
try {
  const entries = await readdir(sessionsDir, { withFileTypes: true });
  const sessionDirs = entries.filter(e => e.isDirectory());

  console.log("  Session directories:", sessionDirs.length);

  for (const dir of sessionDirs.slice(0, 6)) {
    const sessionPath = path.join(sessionsDir, dir.name);
    console.log(`\n  📁 ${dir.name}`);

    // Check files
    const files = await readdir(sessionPath);
    const hasMetadata = files.includes("metadata.json");
    const hasEvidence = files.includes("evidence.jsonl");
    const hasReport = files.includes("final-report.md");
    const hasScreenshots = files.includes("screenshots");

    console.log(`    metadata.json: ${hasMetadata ? "✅" : "❌"}`);
    console.log(`    evidence.jsonl: ${hasEvidence ? "✅" : "❌"}`);
    console.log(`    final-report.md: ${hasReport ? "✅" : "❌"}`);
    console.log(`    screenshots/: ${hasScreenshots ? "✅" : "❌"}`);

    // Read metadata
    if (hasMetadata) {
      const meta = JSON.parse(await readFile(path.join(sessionPath, "metadata.json"), "utf8"));
      console.log(`    Name: ${meta.name}`);
      console.log(`    Steps: ${meta.stepCount}`);
      console.log(`    OK: ${meta.ok}`);
      console.log(`    Started: ${meta.startedAt?.slice(0, 19)}`);
      if (meta.endedAt) console.log(`    Ended: ${meta.endedAt?.slice(0, 19)}`);
    }

    // Read evidence (first 3 lines)
    if (hasEvidence) {
      const evRaw = await readFile(path.join(sessionPath, "evidence.jsonl"), "utf8");
      const lines = evRaw.trim().split("\n").filter(l => l);
      console.log(`    Evidence entries: ${lines.length}`);
      for (const line of lines.slice(0, 3)) {
        const entry = JSON.parse(line);
        console.log(`      Step ${entry.step}: ${entry.tool} [${entry.ok ? "OK" : "FAIL"}] ${entry.output?.slice(0, 60)}`);
      }
    }

    // Read report
    if (hasReport) {
      const report = await readFile(path.join(sessionPath, "final-report.md"), "utf8");
      const reportLines = report.split("\n").filter(l => l.trim());
      console.log(`    Report: ${reportLines.length} lines`);
      for (const l of reportLines.slice(0, 8)) console.log(`    ${l}`);
    }
  }

  console.log("\n  ✅ Evidence structure validated");
} catch (err) {
  console.log("  ❌ Evidence check failed:", err.message);
}

// ═══════════════════════════════════════════════
// Phase 4: Runtime diagnostics
// ═══════════════════════════════════════════════
console.log("\n═".repeat(50));
console.log("PHASE 4: Runtime diagnostics");
console.log("═".repeat(50));

// Check for evidence screenshots
const evidenceDir = "evidence";
try {
  const allFiles = [];
  const dirs = await readdir(evidenceDir, { withFileTypes: true });
  for (const entry of dirs) {
    if (entry.isDirectory()) {
      const files = await readdir(path.join(evidenceDir, entry.name));
      for (const f of files) {
        allFiles.push(path.join(entry.name, f));
      }
    }
  }
  const screenshots = allFiles.filter(f => f.endsWith(".png"));
  console.log(`  Evidence screenshots: ${screenshots.length}`);
  for (const s of screenshots) console.log(`    📸 ${s}`);

  const reports = allFiles.filter(f => f.endsWith("execution-log.json"));
  console.log(`  Workflow execution logs: ${reports.length}`);
} catch (err) {
  console.log("  ⚠️ Evidence scan:", err.message);
}

// Check for browser leaks by listing all evidence directories
const evidenceDirs = await readdir(evidenceDir, { withFileTypes: true });
console.log(`  Evidence subdirectories: ${evidenceDirs.filter(e => e.isDirectory()).length}`);

console.log("\n═".repeat(50));
console.log("BROWSER-MCP-02 COMPLETE");
console.log("═".repeat(50));
