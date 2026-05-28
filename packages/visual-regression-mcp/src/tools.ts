// Visual regression MCP tools
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegisterTool } from "@tanguito/devlab-shared";
import { textResponse } from "@tanguito/devlab-shared";
import { compareImages, computeHash } from "./compare/ImageComparator.js";
import { generateMarkdownReport, loadResultsJson, saveResultsJson, type ComparisonResult } from "./evidence/VisualReport.js";
import { readdirSync, existsSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isImageFile(name: string): boolean {
  const ext = extname(name).toLowerCase();
  return ext === ".png" || ext === ".jpg" || ext === ".jpeg";
}

// ═══════════════════════════════════════════════
// Tool 1: visual_compare_images
// ═══════════════════════════════════════════════

export const registerCompareImages: RegisterTool = (server) => {
  server.registerTool(
    "visual_compare_images",
    {
      title: "Compare two images",
      description: "Compare two PNG images pixel-by-pixel. Returns changed pixels count, percentage, pass/fail, and optionally generates a diff image highlighting differences in red.",
      inputSchema: {
        baselinePath: z.string().min(1).describe("Path to the baseline (expected) image"),
        actualPath: z.string().min(1).describe("Path to the actual (new) image"),
        threshold: z.number().min(0).max(255).default(5).describe("Per-channel delta threshold (0 = exact match, 255 = everything is different). Default: 5."),
        outputDiffPath: z.string().optional().describe("If provided, a diff PNG is written here. Changed pixels are red, unchanged are grayscale.")
      }
    },
    async ({ baselinePath, actualPath, threshold, outputDiffPath }) => {
      try {
        if (!existsSync(baselinePath)) return textResponse(`Baseline not found: ${baselinePath}`);
        if (!existsSync(actualPath)) return textResponse(`Actual not found: ${actualPath}`);

        const result = await compareImages(baselinePath, actualPath, threshold ?? 5, outputDiffPath);

        let output = `Comparison: ${result.baselinePath} vs ${result.actualPath}\n`;
        output += `Dimensions: ${result.width} × ${result.height}\n`;
        output += `Total pixels: ${result.totalPixels.toLocaleString()}\n`;
        output += `Changed pixels: ${result.changedPixels.toLocaleString()}\n`;
        output += `Percent changed: ${result.percentChanged}%\n`;
        output += `Status: ${result.passed ? "✅ PASS" : "❌ FAIL"} (threshold: ${result.threshold})\n`;
        if (result.diffPath) output += `Diff saved: ${result.diffPath}`;

        return textResponse(output);
      } catch (error) {
        return textResponse(`Compare failed:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Tool 2: visual_create_baseline
// ═══════════════════════════════════════════════

export const registerCreateBaseline: RegisterTool = (server) => {
  server.registerTool(
    "visual_create_baseline",
    {
      title: "Create baseline image",
      description: "Copy a source image to a baseline location for future comparisons.",
      inputSchema: {
        sourcePath: z.string().min(1).describe("Path to the source image to use as baseline"),
        baselinePath: z.string().min(1).describe("Where to save the baseline image")
      }
    },
    async ({ sourcePath, baselinePath }) => {
      try {
        if (!existsSync(sourcePath)) return textResponse(`Source not found: ${sourcePath}`);

        mkdirSync(join(baselinePath, ".."), { recursive: true });
        copyFileSync(sourcePath, baselinePath);

        const hash = computeHash(baselinePath);
        return textResponse(`Baseline created: ${baselinePath}\nSHA256: ${hash}`);
      } catch (error) {
        return textResponse(`Create baseline failed:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Tool 3: visual_compare_folder
// ═══════════════════════════════════════════════

export const registerCompareFolder: RegisterTool = (server) => {
  server.registerTool(
    "visual_compare_folder",
    {
      title: "Compare image folders",
      description: "Compare all images in baselineDir against matching filenames in actualDir. Generates a results JSON and optional report.",
      inputSchema: {
        baselineDir: z.string().min(1).describe("Directory containing baseline images"),
        actualDir: z.string().min(1).describe("Directory containing actual images"),
        outputDir: z.string().min(1).describe("Directory for diffs and report output"),
        threshold: z.number().min(0).max(255).default(5).describe("Per-channel delta threshold")
      }
    },
    async ({ baselineDir, actualDir, outputDir, threshold }) => {
      try {
        if (!existsSync(baselineDir)) return textResponse(`Baseline directory not found: ${baselineDir}`);
        if (!existsSync(actualDir)) return textResponse(`Actual directory not found: ${actualDir}`);

        mkdirSync(outputDir, { recursive: true });

        const baselineFiles = readdirSync(baselineDir).filter(isImageFile);
        const results: ComparisonResult[] = [];

        for (const file of baselineFiles) {
          const baselinePath = join(baselineDir, file);
          const actualPath = join(actualDir, file);

          if (!existsSync(actualPath)) {
            results.push({
              name: file, baseline: baselinePath, actual: "(missing)",
              width: 0, height: 0, totalPixels: 0, changedPixels: 0,
              percentChanged: 100, passed: false, threshold: threshold ?? 5
            });
            continue;
          }

          const diffPath = join(outputDir, `diff-${file}`);
          const cmp = await compareImages(baselinePath, actualPath, threshold ?? 5, diffPath);

          results.push({
            name: file,
            baseline: baselinePath,
            actual: actualPath,
            diff: cmp.diffPath,
            width: cmp.width,
            height: cmp.height,
            totalPixels: cmp.totalPixels,
            changedPixels: cmp.changedPixels,
            percentChanged: cmp.percentChanged,
            passed: cmp.passed,
            threshold: cmp.threshold
          });
        }

        saveResultsJson(results, outputDir);
        const reportPath = generateMarkdownReport(results, outputDir, {
          title: "Folder Visual Comparison",
          threshold: threshold ?? 5
        });

        const passed = results.filter(r => r.passed).length;
        let output = `Folder comparison complete.\n`;
        output += `Baseline: ${baselineDir}\n`;
        output += `Actual: ${actualDir}\n`;
        output += `Compared: ${results.length} images\n`;
        output += `Passed: ${passed}\n`;
        output += `Failed: ${results.length - passed}\n`;
        output += `Report: ${reportPath}`;

        return textResponse(output);
      } catch (error) {
        return textResponse(`Folder compare failed:\n${formatError(error)}`);
      }
    }
  );
};

// ═══════════════════════════════════════════════
// Tool 4: visual_generate_report
// ═══════════════════════════════════════════════

export const registerGenerateReport: RegisterTool = (server) => {
  server.registerTool(
    "visual_generate_report",
    {
      title: "Generate visual report",
      description: "Load a visual-results.json file and generate a markdown report with summary, failures, and diff image references.",
      inputSchema: {
        resultsPath: z.string().min(1).describe("Path to a visual-results.json file"),
        outputDir: z.string().min(1).describe("Directory for the generated report")
      }
    },
    async ({ resultsPath, outputDir }) => {
      try {
        const results = loadResultsJson(resultsPath);
        const reportPath = generateMarkdownReport(results, outputDir);

        const passed = results.filter(r => r.passed).length;
        let output = `Report generated from ${results.length} comparisons.\n`;
        output += `Passed: ${passed} / ${results.length}\n`;
        output += `Report: ${reportPath}`;

        return textResponse(output);
      } catch (error) {
        return textResponse(`Report generation failed:\n${formatError(error)}`);
      }
    }
  );
};
