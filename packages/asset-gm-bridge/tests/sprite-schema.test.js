import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { GovernedAssetGmBridge, renderSpriteYy, spriteCompositeImagePath, spriteImagePath, parseGmJson } from "../dist/index.js";
import { baseRequest, makeWorkspace } from "./helpers.js";

/**
 * Authoritative local-GameMaker schema regression (DEVLAB-ASSET-BRIDGE-01).
 *
 * These bindings come from the installed GameMaker LTS 2024 (project format
 * 225) compiler itself: the decompiled WriteExact serialisers in
 * SerialisationCompiledCode/Code.cs and the strict ReadExact deserialisers in
 * GMSCJsonLibrary (the adapter never passes the `sdlm=` leniency flag).
 *
 * Tag-and-version grammar: `"v<N>"` with a whole number 1..1000, or `""` for
 * version 0. Igor rejects any other value (e.g. "v1.1") with
 * "Failed to parse tag-and-version field." (GMSCJsonReader.cs:153).
 *
 * Bindings asserted here:
 *   "$GMSprite":        "v2"   (GMSCVersion 2, GMSprite.cs)
 *   "$GMSpriteFrame":   "v1"   (GMSCVersion 1)
 *   "$GMSequence":      "v1"   (GMSCVersion 1)
 *   "$GMImageLayer":    ""     (unversioned record, version 0)
 *   "$GMNineSliceData": ""     (unversioned record, version 0)
 *   frame images:       sprites/<name>/layers/<frame>/default.png
 *                       (GMSpriteFrame.cs GetLayerRelPath)
 */

const spriteContext = Object.freeze({
  projectName: "AssetBridgePilot",
  projectFile: "AssetBridgePilot.yyp",
  ideVersion: "2024.14.3.260",
  resourceName: "spr_bridge_test_beacon",
  width: 64,
  height: 64,
  frameCount: 2,
  originIndex: 1,
  boundingBox: Object.freeze({ left: 0, top: 0, right: 63, bottom: 63 }),
});

/** Ordering the compiler's WriteExact demands for the GMSprite record (Code.cs WriteExact(GMSprite)). */
const SPRITE_FIELD_ORDER = [
  "$GMSprite", "%Name", "bboxMode", "bbox_bottom", "bbox_left", "bbox_right",
  "bbox_top", "collisionKind", "collisionTolerance", "DynamicTexturePage",
  "edgeFiltering", "For3D", "frames", "gridX", "gridY", "height", "HTile",
  "layers", "name", "nineSlice", "origin", "parent", "preMultiplyAlpha",
  "resourceType", "resourceVersion", "sequence", "swatchColours", "swfPrecision",
  "textureGroupId", "type", "VTile", "width",
];

/** Ordering the compiler's WriteExact demands for the GMSequence record (Code.cs WriteExact(GMSequence)). */
const SEQUENCE_FIELD_ORDER = [
  "$GMSequence", "%Name", "autoRecord", "backdropHeight", "backdropImageOpacity",
  "backdropImagePath", "backdropWidth", "backdropXOffset", "backdropYOffset",
  "events", "eventStubScript", "eventToFunction", "length", "lockOrigin",
  "moments", "name", "playback", "playbackSpeed", "playbackSpeedType",
  "resourceType", "resourceVersion", "showBackdrop", "showBackdropImage",
  "timeUnits", "tracks", "visibleRange", "volume", "xorigin", "yorigin",
];

const keysOf = (record) => Object.keys(parseGmJson(record));

test("renderSpriteYy emits the authoritative tag-and-version values", () => {
  const yy = renderSpriteYy(spriteContext);
  assert.match(yy, /^\{\n  "\$GMSprite":"v2",/);
  assert.match(yy, /"\$GMSpriteFrame":"v1"/);
  assert.match(yy, /"\$GMSequence":"v1"/);
  assert.match(yy, /"\$GMImageLayer":""/);
  assert.match(yy, /"\$GMNineSliceData":""/);
  // Tag-and-version grammar is closed: no "v1.1"-style values anywhere.
  assert.ok(!/"v\d+\.\d+"/.test(yy), "no fractional tag-and-version values");
});

test("renderSpriteYy field order matches the compiler WriteExact order", () => {
  const parsed = parseGmJson(renderSpriteYy(spriteContext));
  assert.deepEqual(Object.keys(parsed), SPRITE_FIELD_ORDER);
  const frame = parsed.frames[0];
  assert.deepEqual(Object.keys(frame), ["$GMSpriteFrame", "%Name", "name", "resourceType", "resourceVersion"]);
  const layer = parsed.layers[0];
  assert.deepEqual(Object.keys(layer), ["$GMImageLayer", "%Name", "blendMode", "displayName", "isLocked", "name", "opacity", "resourceType", "resourceVersion", "visible"]);
  assert.equal(layer.name, "default", "bitmap layer must be named default so the image path resolves");
  const nineSlice = parsed.nineSlice;
  assert.deepEqual(Object.keys(nineSlice), ["$GMNineSliceData", "bottom", "enabled", "guideColour", "highlightColour", "highlightStyle", "left", "resourceType", "resourceVersion", "right", "tileMode", "top"]);
  // The nine-slice record carries no %Name field in the compiler's WriteExact.
  assert.ok(!("%Name" in nineSlice));
  // GMAssetCompiler.GMNineSliceData.SetFromResource indexes all five entries
  // even when nine-slice rendering is disabled. These values mirror the
  // installed GameMaker resource constructor defaults.
  assert.deepEqual(nineSlice.guideColour, [4294902015, 4294902015, 4294902015, 4294902015]);
  assert.equal(nineSlice.highlightColour, 1728023040);
  assert.deepEqual(nineSlice.tileMode, [0, 0, 0, 0, 0]);
  const sequence = parsed.sequence;
  assert.deepEqual(Object.keys(sequence), SEQUENCE_FIELD_ORDER);
  assert.equal(sequence.resourceVersion, "2.0");
  assert.equal(frame.resourceVersion, "2.0");
  // KeyframeStore<T> records: Keyframes / resourceType / resourceVersion only.
  assert.deepEqual(Object.keys(sequence.events), ["$KeyframeStore<MessageEventKeyframe>", "Keyframes", "resourceType", "resourceVersion"]);
  assert.deepEqual(Object.keys(sequence.moments), ["$KeyframeStore<MomentsEventKeyframe>", "Keyframes", "resourceType", "resourceVersion"]);
  assert.deepEqual(sequence.events.Keyframes, []);
  assert.deepEqual(sequence.tracks, []);
  // No UUIDs anywhere: identity is name/path based in the GM2024 format.
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(renderSpriteYy(spriteContext)));
});

test("renderSpriteYy swatchColours is the authoritative ResourceList<uint> (plain uint array)", () => {
  // GMSprite v2 declares `swatchColours` as ResourceList<uint> (GMSprite.cs:68;
  // Code.cs ReadExact(GMSprite) 14026-14029 reads it via ReadExact(ResourceList<uint>),
  // WriteExact(GMSprite) 31039-31041 writes it as a plain uint list). The legacy
  // GM2022 `swatchColors` object shape ({colour,name}) made Igor's strict ReadExact
  // throw "Unsigned 32-bit number expected." (GMSCJsonReader.ExpectUint32) right
  // after the sequence's KeyframeStore records. Regression: values must be plain
  // numbers in the IDE's default palette order, never records.
  const parsed = parseGmJson(renderSpriteYy(spriteContext));
  assert.deepEqual(parsed.swatchColours, [
    4278190080, 4294967295, 4278190335, 4286611584,
    4283215696, 4294901760, 4286611456, 4278255615,
  ]);
  assert.ok(parsed.swatchColours.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 4294967295), "every swatch colour is a uint32 value");
  assert.ok(parsed.swatchColours.every((entry) => typeof entry === "number"), "swatchColours contains no records");
  // And the raw text never emits the legacy object shape.
  const yy = renderSpriteYy(spriteContext);
  assert.ok(!/swatchColours":\[\s*\{/.test(yy), "swatchColours renders as a plain array, not objects");
});

test("spriteImagePath resolves frame images at layers/<frame>/default.png", () => {
  assert.equal(spriteImagePath("spr_bridge_test_beacon", 0), "sprites/spr_bridge_test_beacon/layers/0/default.png");
  assert.equal(spriteImagePath("spr_bridge_test_beacon", 1), "sprites/spr_bridge_test_beacon/layers/1/default.png");
  assert.equal(spriteImagePath("spr_other_asset", 7), "sprites/spr_other_asset/layers/7/default.png");
});

test("spriteCompositeImagePath resolves compiler frame composites at <frame>.png", () => {
  assert.equal(spriteCompositeImagePath("spr_bridge_test_beacon", 0), "sprites/spr_bridge_test_beacon/0.png");
  assert.equal(spriteCompositeImagePath("spr_bridge_test_beacon", 1), "sprites/spr_bridge_test_beacon/1.png");
});

test("planImport plans compiler composites and editable layers (never <name>_<i>.png)", async () => {
  const workspace = makeWorkspace({});
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), expectedProjectFingerprint: target.fingerprint };
  const plan = await bridge.planImport(request);
  const pngPaths = plan.files.map((file) => file.path).filter((path) => path.endsWith(".png"));
  assert.deepEqual(pngPaths, [
    "sprites/spr_bridge_test_beacon/0.png",
    "sprites/spr_bridge_test_beacon/1.png",
    "sprites/spr_bridge_test_beacon/layers/0/default.png",
    "sprites/spr_bridge_test_beacon/layers/1/default.png",
  ]);
  // The sprite .yy is planned at the canonical resource path, and its planned
  // after-hash is reproducible from the authoritative renderer output.
  const yyEntry = plan.files.find((file) => file.path === "sprites/spr_bridge_test_beacon/spr_bridge_test_beacon.yy");
  assert.ok(yyEntry);
  assert.equal(yyEntry.action, "create");
  assert.equal(yyEntry.afterSha256.length, 64);
  assert.notEqual(yyEntry.afterSha256, "0".repeat(64));
});

test("applied import materializes compiler composites and editable layers on disk", async () => {
  const workspace = makeWorkspace({});
  const bridge = new GovernedAssetGmBridge(workspace.projectsDir, { catalogPath: workspace.catalogPath, repoRoot: workspace.root });
  const target = await bridge.inspectTarget(baseRequest(workspace));
  const request = { ...baseRequest(workspace), expectedProjectFingerprint: target.fingerprint };
  const plan = await bridge.planImport(request);
  const applied = await bridge.applyImport({ ...request, plan: plan.plan, planHash: plan.planHash, bindingHash: plan.bindingHash, confirm: true, dryRun: false });
  assert.equal(applied.state, "APPLIED");
  const base = join(bridge.projectsDir, "pilot-a/sprites/spr_bridge_test_beacon");
  assert.ok(readFileSync(join(base, "0.png")).byteLength > 0);
  assert.ok(readFileSync(join(base, "1.png")).byteLength > 0);
  assert.ok(readFileSync(join(base, "layers/0/default.png")).byteLength > 0);
  assert.ok(readFileSync(join(base, "layers/1/default.png")).byteLength > 0);
  // And the sprite .yy on disk parses with the authoritative shape.
  const onDisk = readFileSync(join(base, "spr_bridge_test_beacon.yy"), "utf8");
  const parsed = parseGmJson(onDisk);
  assert.deepEqual(Object.keys(parsed), SPRITE_FIELD_ORDER);
  assert.equal(parsed.$GMSprite, "v2");
});
