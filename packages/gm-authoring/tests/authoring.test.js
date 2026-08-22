import assert from "node:assert/strict";
import test from "node:test";

import {
  assertResourceName,
  authorObject,
  authorScript,
  EVENT_NAMES,
  insertIntoGmArray,
  MAX_EVENTS_PER_OBJECT,
  nextResourceOrder,
  parseGmJson,
  renderObjectYy,
  renderScriptYy,
  resolveEvent,
  resolveEvents,
} from "../dist/index.js";

const IDENTITY = Object.freeze({ projectName: "Demo", projectFile: "Demo.yyp" });

const YYP = [
  "{",
  '  "$GMProject":"v1",',
  '  "%Name":"Demo",',
  '  "resources":[',
  '    {"id":{"name":"obj_existing","path":"objects/obj_existing/obj_existing.yy",},}',
  "  ],",
  '  "ResourceOrderSettings":[',
  '    {"name":"obj_existing","order":0,"path":"objects/obj_existing/obj_existing.yy",}',
  "  ],",
  '  "resourceType":"GMProject"',
  "}",
].join("\n");

const ORDER = [
  "{",
  '  "FolderOrderSettings":[],',
  '  "ResourceOrderSettings":[',
  '    {"name":"obj_existing","order":0,"path":"objects/obj_existing/obj_existing.yy",}',
  "  ]",
  "}",
].join("\n");

const project = (overrides = {}) => ({
  identity: IDENTITY,
  yyp: YYP,
  resourceOrder: ORDER,
  existingFiles: ["Demo.yyp", "Demo.resource_order", "objects/obj_existing/obj_existing.yy"],
  existingReferences: ["objects/obj_existing/obj_existing.yy"],
  ...overrides,
});

test("NAMES: only valid GML identifiers are accepted", () => {
  for (const good of ["obj_player", "_private", "scr_a1", "A"]) {
    assert.equal(assertResourceName(good, "object"), good);
  }
  for (const bad of ["1obj", "obj-player", "obj player", "obj.player", "", "obj/player", "ñandu", "a".repeat(65)]) {
    assert.throws(() => assertResourceName(bad, "object"), (error) => error.code === "INVALID_RESOURCE_NAME", bad);
  }
});

test("EVENTS: filenames follow the compiler's stem and number", () => {
  assert.equal(resolveEvent({ event: "create", gml: "x" }).fileName, "Create_0.gml");
  assert.equal(resolveEvent({ event: "step", eventNum: 2, gml: "x" }).fileName, "Step_2.gml");
  assert.equal(resolveEvent({ event: "draw", eventNum: 64, gml: "x" }).fileName, "Draw_64.gml");
  assert.equal(resolveEvent({ event: "alarm", eventNum: 11, gml: "x" }).fileName, "Alarm_11.gml");
  assert.equal(resolveEvent({ event: "cleanup", gml: "x" }).fileName, "CleanUp_0.gml");
});

test("EVENTS: an unsupported event or number is refused rather than guessed", () => {
  assert.throws(() => resolveEvent({ event: "collision", gml: "x" }), (error) => error.code === "INVALID_EVENT");
  assert.throws(() => resolveEvent({ event: "create", eventNum: 1, gml: "x" }), (error) => error.code === "INVALID_EVENT");
  assert.throws(() => resolveEvent({ event: "alarm", eventNum: 12, gml: "x" }), (error) => error.code === "INVALID_EVENT");
  assert.throws(() => resolveEvent({ event: "draw", eventNum: 5, gml: "x" }), (error) => error.code === "INVALID_EVENT");
  assert.throws(() => resolveEvent({ event: "step", eventNum: -1, gml: "x" }), (error) => error.code === "INVALID_EVENT");
});

test("EVENTS: duplicates are refused and output order is stable", () => {
  assert.throws(
    () => resolveEvents([{ event: "create", gml: "a" }, { event: "create", gml: "b" }]),
    (error) => error.code === "INVALID_EVENT",
  );
  const resolved = resolveEvents([
    { event: "draw", eventNum: 64, gml: "d" },
    { event: "create", gml: "c" },
    { event: "step", gml: "s" },
  ]);
  assert.deepEqual(resolved.map(({ fileName }) => fileName), ["Create_0.gml", "Step_0.gml", "Draw_64.gml"]);
  assert.equal(EVENT_NAMES.includes("create"), true);
});

test("EVENTS: an object needs at least one and at most the cap", () => {
  assert.throws(() => resolveEvents([]), (error) => error.code === "INVALID_EVENT");
  const many = Array.from({ length: MAX_EVENTS_PER_OBJECT + 1 }, (_, index) => ({ event: "alarm", eventNum: index % 12, gml: "x" }));
  assert.throws(() => resolveEvents(many), (error) => error.code === "LIMIT_EXCEEDED");
});

test("SCRIPT RECORD: matches the compiler-verified shape", () => {
  const yy = renderScriptYy("scr_a", IDENTITY);
  const parsed = parseGmJson(yy);
  assert.equal(parsed.$GMScript, "v1");
  assert.equal(parsed.resourceType, "GMScript");
  assert.equal(parsed.resourceVersion, "2.0");
  assert.equal(parsed["%Name"], "scr_a");
  assert.equal(parsed.name, "scr_a");
  assert.equal(parsed.isCompatibility, false);
  assert.deepEqual(parsed.parent, { name: "Demo", path: "Demo.yyp" });
});

test("OBJECT RECORD: event list carries the right type and number pairs", () => {
  const events = resolveEvents([
    { event: "create", gml: "c" },
    { event: "draw", eventNum: 64, gml: "d" },
  ]);
  const parsed = parseGmJson(renderObjectYy("obj_a", IDENTITY, events));
  assert.equal(parsed.$GMObject, "");
  assert.equal(parsed.resourceType, "GMObject");
  assert.equal(parsed.eventList.length, 2);
  assert.deepEqual(
    parsed.eventList.map(({ eventType, eventNum }) => [eventType, eventNum]),
    [[0, 0], [8, 64]],
  );
  assert.equal(parsed.spriteId, null);
  assert.equal(parsed.visible, true);
});

test("OBJECT RECORD: an attached sprite becomes a resource reference", () => {
  const events = resolveEvents([{ event: "create", gml: "c" }]);
  const parsed = parseGmJson(renderObjectYy("obj_a", IDENTITY, events, { spriteName: "spr_hero", persistent: true }));
  assert.deepEqual(parsed.spriteId, { name: "spr_hero", path: "sprites/spr_hero/spr_hero.yy" });
  assert.equal(parsed.persistent, true);
});

test("SCRIPT PLAN: creates the resource and registers it in both project files", () => {
  const authored = authorScript(project(), { name: "scr_new", gml: "function scr_new() {}\n" });
  assert.equal(authored.resourceKind, "script");
  assert.deepEqual(authored.files.map(({ path }) => path), [
    "scripts/scr_new/scr_new.yy",
    "scripts/scr_new/scr_new.gml",
    "Demo.yyp",
    "Demo.resource_order",
  ]);
  assert.deepEqual(authored.files.map(({ action }) => action), ["create", "create", "modify", "modify"]);
  const yyp = authored.files.find(({ path }) => path === "Demo.yyp").content;
  assert.ok(yyp.includes('"path":"scripts/scr_new/scr_new.yy"'));
  assert.ok(yyp.includes("obj_existing"), "the existing resource must survive the splice");
  assert.deepEqual(authored.allowlist, authored.files.map(({ path }) => path));
});

test("OBJECT PLAN: one file per event plus the record and the project files", () => {
  const authored = authorObject(project(), {
    name: "obj_new",
    events: [{ event: "create", gml: "a = 0;\n" }, { event: "step", gml: "a += 1;\n" }],
  });
  assert.deepEqual(authored.files.map(({ path }) => path), [
    "objects/obj_new/obj_new.yy",
    "objects/obj_new/Create_0.gml",
    "objects/obj_new/Step_0.gml",
    "Demo.yyp",
    "Demo.resource_order",
  ]);
});

test("COLLISIONS: an existing name, or a case variant of one, is refused", () => {
  assert.throws(
    () => authorObject(project(), { name: "obj_existing", events: [{ event: "create", gml: "x" }] }),
    (error) => error.code === "RESOURCE_EXISTS",
  );
  assert.throws(
    () => authorObject(project(), { name: "OBJ_Existing", events: [{ event: "create", gml: "x" }] }),
    (error) => error.code === "RESOURCE_EXISTS",
    "a case variant would merge with the existing folder on Windows",
  );
});

test("SPRITE: attaching a sprite the project does not have is refused", () => {
  assert.throws(
    () => authorObject(project(), {
      name: "obj_new",
      events: [{ event: "create", gml: "x" }],
      options: { spriteName: "spr_missing" },
    }),
    (error) => error.code === "INVALID_RESOURCE_NAME",
  );
});

test("RESOURCE ORDER: a project without one is patched only in the .yyp", () => {
  const authored = authorScript(project({ resourceOrder: undefined }), { name: "scr_new", gml: "x" });
  assert.deepEqual(authored.files.map(({ path }) => path), [
    "scripts/scr_new/scr_new.yy",
    "scripts/scr_new/scr_new.gml",
    "Demo.yyp",
  ]);
});

test("SPLICE: insertion is idempotent and preserves surrounding bytes", () => {
  const once = insertIntoGmArray(YYP, '"resources":[', "scripts/a/a.yy", '{"id":{"name":"a","path":"scripts/a/a.yy",},}');
  const twice = insertIntoGmArray(once, '"resources":[', "scripts/a/a.yy", '{"id":{"name":"a","path":"scripts/a/a.yy",},}');
  assert.equal(once, twice);
  assert.ok(once.includes('"$GMProject":"v1"'));
  assert.ok(once.includes("obj_existing"));
  assert.doesNotThrow(() => parseGmJson(once));
});

test("SPLICE: a project file missing the target array fails closed", () => {
  assert.throws(
    () => insertIntoGmArray("{}", '"resources":[', "a", "b"),
    (error) => error.code === "INVALID_PROJECT_TEXT",
  );
});

test("ORDER: the next index follows the highest existing one", () => {
  assert.equal(nextResourceOrder(YYP), 1);
  assert.equal(nextResourceOrder('{"ResourceOrderSettings":[]}'), 0);
});
