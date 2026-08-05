import { AssetForgeError } from "@tanguito/devlab-img2threejs-asset-forge";

/**
 * Explicit 2D sprite budget profile for the bridge (`bridge-sprite-v1`).
 * Limits are justified in the import plan (05-fixture.md / 06-asset-forge-export.md):
 * the pilot beacon is 64x64 RGBA, 2 frames, ~16-17 KB per PNG (stored deflate),
 * 10 planned files (including compiler composites and editable layers) and
 * exactly 1 GameMaker resource. All limits are evaluated
 * against real bytes BEFORE any write (parsePng + file hashes).
 */
export const BRIDGE_SPRITE_BUDGET = Object.freeze({
  profileId: "bridge-sprite-v1",
  version: 1,
  immutable: true,
  maxWidth: 128,
  maxHeight: 128,
  maxFrames: 4,
  maxCompressedBytes: 262144,
  maxDecodedBytes: 1048576,
  maxFiles: 12,
  maxGmResources: 1,
});

export interface SpriteBudgetMetrics {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly compressedBytes: number;
  readonly decodedBytes: number;
  readonly fileCount: number;
  readonly gmResourceCount: number;
}

export interface BudgetFinding { readonly severity: "BLOCKER"; readonly code: string; readonly metric: string; readonly actual: number; readonly limit: number }
export interface SpriteBudgetResult { readonly status: "SUCCESS" | "BLOCKED"; readonly findings: readonly BudgetFinding[] }

export function evaluateSpriteBudget(metrics: SpriteBudgetMetrics): SpriteBudgetResult {
  const findings: BudgetFinding[] = [];
  const checks: Readonly<Array<Readonly<{ code: string; metric: keyof SpriteBudgetMetrics; limit: number }>>> = Object.freeze([
    { code: "BUDGET_MAX_WIDTH", metric: "width", limit: BRIDGE_SPRITE_BUDGET.maxWidth },
    { code: "BUDGET_MAX_HEIGHT", metric: "height", limit: BRIDGE_SPRITE_BUDGET.maxHeight },
    { code: "BUDGET_MAX_FRAMES", metric: "frameCount", limit: BRIDGE_SPRITE_BUDGET.maxFrames },
    { code: "BUDGET_MAX_COMPRESSED_BYTES", metric: "compressedBytes", limit: BRIDGE_SPRITE_BUDGET.maxCompressedBytes },
    { code: "BUDGET_MAX_DECODED_BYTES", metric: "decodedBytes", limit: BRIDGE_SPRITE_BUDGET.maxDecodedBytes },
    { code: "BUDGET_MAX_FILES", metric: "fileCount", limit: BRIDGE_SPRITE_BUDGET.maxFiles },
    { code: "BUDGET_MAX_GM_RESOURCES", metric: "gmResourceCount", limit: BRIDGE_SPRITE_BUDGET.maxGmResources },
  ]);
  for (const check of checks) {
    const actual = metrics[check.metric];
    if (actual > check.limit) findings.push(Object.freeze({ severity: "BLOCKER" as const, code: check.code, metric: check.metric, actual, limit: check.limit }));
  }
  const blocked = findings.some(({ severity }) => severity === "BLOCKER");
  return Object.freeze({ status: blocked ? "BLOCKED" : "SUCCESS", findings: Object.freeze(findings) });
}

export function assertBudgetPasses(result: SpriteBudgetResult): void {
  if (result.status !== "SUCCESS") {
    throw new AssetForgeError("BUDGET_MAX", result.findings.map(({ code, actual, limit }) => `${code} (${actual} > ${limit})`).join("; "), Object.freeze({ findings: result.findings }));
  }
}
