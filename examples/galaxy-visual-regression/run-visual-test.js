#!/usr/bin/env node
// Galaxy Raiders Visual Regression — compare boss screenshots against baselines
// Run from monorepo root: node examples/galaxy-visual-regression/run-visual-test.js

import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve visual-regression-mcp from workspace
const requireVR = createRequire(join(__dirname, "..", "..", "packages", "visual-regression-mcp") + "/");
const { compareImages } = requireVR("./dist/compare/ImageComparator.js");
const { generateMarkdownReport, saveResultsJson } = requireVR("./dist/evidence/VisualReport.js");

const baselineDir = join(__dirname, "baseline");
const actualDir = join(__dirname, "actual");
const diffDir = join(__dirname, "diffs");
const reportDir = join(__dirname, "reports");

mkdirSync(diffDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });

const threshold = 5;
const results = [];

async function run() {
  console.log("━━━ Galaxy Raiders Visual Regression ━━━\n");

  // If baseline dir is empty, suggest creating baselines
  if (!existsSync(baselineDir)) {
    console.log("No baseline/ directory found. Create baselines first:");
    console.log("  mkdir -p baseline");
    console.log("  cp evidence/galaxy-deep-test/boss-*.png baseline/");
    return;
  }

  const baselineFiles = readdirSync(baselineDir).filter(f => f.endsWith(".png"));

  if (baselineFiles.length === 0) {
    console.log("No .png files in baseline/. Add baseline images first.");
    return;
  }

  console.log(`Comparing ${baselineFiles.length} images...`);
  console.log(`Threshold: ${threshold} (per-channel delta, 0-255)\n`);

  for (const file of baselineFiles) {
    const baselinePath = join(baselineDir, file);
    const actualPath = join(actualDir, file);

    if (!existsSync(actualPath)) {
      console.log(`  ⚠️  ${file}: no actual image found`);
      results.push({
        name: file, baseline: baselinePath, actual: "(missing)",
        width: 0, height: 0, totalPixels: 0, changedPixels: 0,
        percentChanged: 100, passed: false, threshold
      });
      continue;
    }

    try {
      const diffPath = join(diffDir, `diff-${file}`);
      const result = await compareImages(baselinePath, actualPath, threshold, diffPath);

      const icon = result.passed ? "✅" : "❌";
      console.log(`  ${icon} ${file}: ${result.changedPixels.toLocaleString()} changed pixels (${result.percentChanged}%)`);

      results.push({
        name: file,
        baseline: baselinePath,
        actual: actualPath,
        diff: result.diffPath,
        width: result.width,
        height: result.height,
        totalPixels: result.totalPixels,
        changedPixels: result.changedPixels,
        percentChanged: result.percentChanged,
        passed: result.passed,
        threshold: result.threshold
      });
    } catch (e) {
      console.log(`  ❌ ${file}: error — ${e.message}`);
      results.push({
        name: file, baseline: baselinePath, actual: actualPath,
        width: 0, height: 0, totalPixels: 0, changedPixels: 0,
        percentChanged: 100, passed: false, threshold
      });
    }
  }

  // Save results + report
  const jsonPath = saveResultsJson(results, reportDir);
  const reportPath = generateMarkdownReport(results, reportDir, {
    title: "Galaxy Raiders — Visual Regression",
    threshold
  });

  const passed = results.filter(r => r.passed).length;
  console.log(`\n  Result: ${passed}/${results.length} passed`);
  console.log(`  Report: ${reportPath}`);
  console.log(`  JSON:   ${jsonPath}`);
}

run().catch(e => {
  console.error(`Failed: ${e.message}`);
  console.error("\nMake sure visual-regression-mcp is built: pnpm build");
  process.exit(1);
});
