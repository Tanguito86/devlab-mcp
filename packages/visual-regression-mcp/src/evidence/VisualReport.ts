// Visual regression report — markdown generation

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

export interface ComparisonResult {
  name: string;
  baseline: string;
  actual: string;
  diff?: string;
  width: number;
  height: number;
  totalPixels: number;
  changedPixels: number;
  percentChanged: number;
  passed: boolean;
  threshold: number;
}

export interface VisualReportOptions {
  title?: string;
  timestamp?: string;
  threshold?: number;
}

export function generateMarkdownReport(
  results: ComparisonResult[],
  outputDir: string,
  options: VisualReportOptions = {}
): string {
  const title = options.title || "Visual Regression Report";
  const ts = options.timestamp || new Date().toISOString();
  const threshold = options.threshold ?? 5;
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  let md = `# ${title}\n\n`;
  md += `**Generated:** ${ts}\n`;
  md += `**Threshold:** ${threshold} (per-channel delta, 0-255)\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Comparisons | ${total} |\n`;
  md += `| Passed | ${passed} |\n`;
  md += `| Failed | ${failed} |\n`;
  md += `| Pass rate | ${total > 0 ? Math.round(passed / total * 100) : 0}% |\n\n`;

  if (failed > 0) {
    md += `## Failures\n\n`;
    for (const r of results) {
      if (!r.passed) {
        md += `### ❌ ${r.name}\n\n`;
        md += `- **Changed:** ${r.changedPixels.toLocaleString()} / ${r.totalPixels.toLocaleString()} pixels (${r.percentChanged}%)\n`;
        md += `- **Dimensions:** ${r.width} × ${r.height}\n`;
        if (r.diff) md += `- **Diff:** \`${basename(r.diff)}\`\n`;
        md += `\n`;
      }
    }
  }

  md += `## All Results\n\n`;
  md += `| Name | Dimensions | Changed | % | Status |\n`;
  md += `|------|-----------|---------|---|--------|\n`;
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    md += `| ${r.name} | ${r.width}×${r.height} | ${r.changedPixels.toLocaleString()} | ${r.percentChanged}% | ${icon} |\n`;
  }

  if (results.some(r => r.diff)) {
    md += `\n## Diff Images\n\n`;
    for (const r of results) {
      if (r.diff) {
        md += `- **${r.name}:** \`${basename(r.diff)}\` — ${r.changedPixels.toLocaleString()} changed pixels\n`;
      }
    }
  }

  const reportPath = join(outputDir, "visual-report.md");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(reportPath, md, "utf8");
  return reportPath;
}

export function loadResultsJson(filePath: string): ComparisonResult[] {
  if (!existsSync(filePath)) throw new Error(`Results file not found: ${filePath}`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function saveResultsJson(results: ComparisonResult[], outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });
  const path = join(outputDir, "visual-results.json");
  writeFileSync(path, JSON.stringify(results, null, 2), "utf8");
  return path;
}
