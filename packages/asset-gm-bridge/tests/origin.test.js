import assert from "node:assert/strict";
import test from "node:test";

import { originIndexFor, parseGmJson, renderSpriteYy } from "../dist/index.js";
import { baseRequest, makeWorkspace, SPEC_V1 } from "./helpers.js";
import { GovernedAssetGmBridge } from "../dist/index.js";

const context = (origin, width = 16, height = 24) => ({
  projectName: "P", projectFile: "P.yyp", ideVersion: "2026.0.0.16",
  resourceName: "spr_x", width, height, frameCount: 1, origin,
  boundingBox: { left: 0, top: 0, right: width - 1, bottom: height - 1 },
});

/**
 * The engine reads the sequence pivot, not the origin index. Measured against
 * the installed runtime: a sprite with origin index 1 and a sequence pivot of
 * (0,0) reports sprite_get_xoffset() == 0, while origin index 0 with a pivot of
 * (8,24) reports 8. The index is IDE metadata.
 */
test("PIVOT: the sequence carries the origin the engine actually uses", () => {
  const yy = parseGmJson(renderSpriteYy(context({ x: 8, y: 24 })));
  assert.equal(yy.sequence.xorigin, 8);
  assert.equal(yy.sequence.yorigin, 24);
});

test("PIVOT: a top-left origin is still written explicitly, not left at a default", () => {
  const yy = parseGmJson(renderSpriteYy(context({ x: 0, y: 0 })));
  assert.equal(yy.sequence.xorigin, 0);
  assert.equal(yy.sequence.yorigin, 0);
  assert.equal(yy.origin, 0, "top-left is preset 0, not the old hard-coded 1");
});

test("INDEX: every preset position maps to GameMaker's own numbering", () => {
  const cases = [
    [{ x: 0, y: 0 }, 0], [{ x: 8, y: 0 }, 1], [{ x: 16, y: 0 }, 2],
    [{ x: 0, y: 12 }, 3], [{ x: 8, y: 12 }, 4], [{ x: 16, y: 12 }, 5],
    [{ x: 0, y: 24 }, 6], [{ x: 8, y: 24 }, 7], [{ x: 16, y: 24 }, 8],
  ];
  for (const [origin, expected] of cases) {
    assert.equal(originIndexFor(origin, 16, 24), expected, JSON.stringify(origin));
  }
});

test("INDEX: an off-preset pivot is reported as custom", () => {
  assert.equal(originIndexFor({ x: 3, y: 7 }, 16, 24), 9);
  assert.equal(originIndexFor({ x: 8, y: 7 }, 16, 24), 9);
});

test("INDEX: odd dimensions use the same floor as the spec presets", () => {
  assert.equal(originIndexFor({ x: 7, y: 0 }, 15, 25), 1);
  assert.equal(originIndexFor({ x: 7, y: 12 }, 15, 25), 4);
});

test("IMPORT: the planned sprite .yy carries the spec origin end to end", async () => {
  const workspace = makeWorkspace({ spec: { ...SPEC_V1, origin: { x: 64, y: 64 } } });
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, {
    catalogPath: workspace.catalogPath, repoRoot: workspace.root,
  });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const plan = await bridge.planImport({ ...baseRequest(workspace), expectedProjectFingerprint: target.fingerprint });
  const file = plan.plan.files.find(({ path }) => path.endsWith("spr_bridge_test_beacon.yy"));
  const yy = parseGmJson(Buffer.from(file.afterContentBase64, "base64").toString("utf8"));
  assert.equal(yy.sequence.xorigin, 64);
  assert.equal(yy.sequence.yorigin, 64);
  assert.equal(yy.origin, 8, "(64,64) on a 64x64 sprite is bottom-right");
  assert.deepEqual(plan.manifest.origin, { x: 64, y: 64 });
});
