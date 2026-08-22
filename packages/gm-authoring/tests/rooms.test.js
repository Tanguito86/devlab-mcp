import assert from "node:assert/strict";
import test from "node:test";

import {
  authorPlaceInstance,
  authorRoom,
  deriveInstanceName,
  existingInstanceNames,
  MAX_INSTANCES_PER_ROOM,
  MAX_ROOM_DIMENSION,
  parseGmJson,
  renderRoomYy,
  resolveInstances,
  roomResourcePath,
  spliceInstancesIntoRoom,
} from "../dist/index.js";

const IDENTITY = Object.freeze({ projectName: "Demo", projectFile: "Demo.yyp" });

const YYP = [
  "{",
  '  "$GMProject":"v1",',
  '  "%Name":"Demo",',
  '  "resources":[',
  '    {"id":{"name":"obj_hero","path":"objects/obj_hero/obj_hero.yy",},},',
  '    {"id":{"name":"rm_start","path":"rooms/rm_start/rm_start.yy",},}',
  "  ],",
  '  "ResourceOrderSettings":[',
  '    {"name":"obj_hero","order":0,"path":"objects/obj_hero/obj_hero.yy",}',
  "  ],",
  '  "RoomOrderNodes":[',
  '    {"roomId":{"name":"rm_start","path":"rooms/rm_start/rm_start.yy",},}',
  "  ],",
  '  "resourceType":"GMProject"',
  "}",
].join("\n");

const ORDER = [
  "{",
  '  "FolderOrderSettings":[],',
  '  "ResourceOrderSettings":[',
  '    {"name":"obj_hero","order":0,"path":"objects/obj_hero/obj_hero.yy",}',
  "  ]",
  "}",
].join("\n");

const ROOM_TEXT = renderRoomYy("rm_start", IDENTITY, resolveInstances([{ objectName: "obj_hero", x: 5, y: 6 }]));

const project = (overrides = {}) => ({
  identity: IDENTITY,
  yyp: YYP,
  resourceOrder: ORDER,
  existingFiles: ["Demo.yyp", "objects/obj_hero/obj_hero.yy", "rooms/rm_start/rm_start.yy"],
  existingReferences: ["objects/obj_hero/obj_hero.yy", "rooms/rm_start/rm_start.yy"],
  ...overrides,
});

test("ROOM RECORD: mirrors the compiler-accepted layer stack", () => {
  const yy = parseGmJson(renderRoomYy("rm_new", IDENTITY, [], { width: 320, height: 240 }));
  assert.equal(yy.$GMRoom, "v1");
  assert.equal(yy.resourceType, "GMRoom");
  assert.deepEqual(yy.layers.map(({ name }) => name), ["Instances", "Background"]);
  assert.equal(yy.layers[0].$GMRInstanceLayer, "");
  assert.equal(yy.layers[1].$GMRBackgroundLayer, "");
  assert.equal(yy.roomSettings.Width, 320);
  assert.equal(yy.roomSettings.Height, 240);
  assert.equal(yy.views[0].wview, 320);
  assert.equal(yy.views[0].hview, 240);
  assert.deepEqual(yy.instanceCreationOrder, []);
});

test("ROOM RECORD: instances land in the layer and the creation order together", () => {
  const instances = resolveInstances([
    { objectName: "obj_hero", x: 10, y: 20 },
    { objectName: "obj_hero", x: 30, y: 40 },
  ]);
  const yy = parseGmJson(renderRoomYy("rm_new", IDENTITY, instances));
  assert.equal(yy.layers[0].instances.length, 2);
  assert.equal(yy.instanceCreationOrder.length, 2);
  assert.deepEqual(
    yy.instanceCreationOrder.map(({ name }) => name),
    yy.layers[0].instances.map(({ name }) => name),
  );
  // The creation-order path points at the room, not at the object.
  assert.equal(yy.instanceCreationOrder[0].path, roomResourcePath("rm_new"));
  assert.deepEqual(yy.layers[0].instances[0].objectId, { name: "obj_hero", path: "objects/obj_hero/obj_hero.yy" });
  assert.equal(yy.layers[0].instances[1].x, 30);
  assert.equal(yy.layers[0].instances[1].y, 40);
});

test("ROOM RECORD: dimensions are bounded", () => {
  for (const bad of [0, -1, 1.5, MAX_ROOM_DIMENSION + 1]) {
    assert.throws(() => renderRoomYy("rm_new", IDENTITY, [], { width: bad }), (error) => error.code === "INVALID_ROOM", String(bad));
    assert.throws(() => renderRoomYy("rm_new", IDENTITY, [], { height: bad }), (error) => error.code === "INVALID_ROOM", String(bad));
  }
});

test("INSTANCE NAMES: derived deterministically and never collide", () => {
  assert.equal(deriveInstanceName("obj_hero", new Set()), "inst_obj_hero");
  assert.equal(deriveInstanceName("obj_hero", new Set(["inst_obj_hero"])), "inst_obj_hero_2");
  assert.equal(deriveInstanceName("obj_hero", new Set(["inst_obj_hero", "inst_obj_hero_2"])), "inst_obj_hero_3");
  const twice = resolveInstances([{ objectName: "obj_hero", x: 0, y: 0 }, { objectName: "obj_hero", x: 1, y: 1 }]);
  assert.deepEqual(twice.map(({ instanceName }) => instanceName), ["inst_obj_hero", "inst_obj_hero_2"]);
});

test("INSTANCE NAMES: an explicit duplicate is refused", () => {
  assert.throws(
    () => resolveInstances([
      { objectName: "obj_hero", x: 0, y: 0, instanceName: "inst_a" },
      { objectName: "obj_hero", x: 1, y: 1, instanceName: "inst_a" },
    ]),
    (error) => error.code === "INVALID_ROOM",
  );
});

test("INSTANCES: coordinates must be finite and bounded, counts capped", () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 2_000_000]) {
    assert.throws(() => resolveInstances([{ objectName: "obj_hero", x: bad, y: 0 }]), (error) => error.code === "INVALID_ROOM");
  }
  const many = Array.from({ length: MAX_INSTANCES_PER_ROOM + 1 }, () => ({ objectName: "obj_hero", x: 0, y: 0 }));
  assert.throws(() => resolveInstances(many), (error) => error.code === "LIMIT_EXCEEDED");
});

test("NEW ROOM: registers in resources, room order and the resource order", () => {
  const authored = authorRoom(project(), { name: "rm_level2", instances: [{ objectName: "obj_hero", x: 8, y: 9 }] });
  assert.equal(authored.resourceKind, "room");
  assert.deepEqual(authored.files.map(({ path }) => path), [
    "rooms/rm_level2/rm_level2.yy",
    "Demo.yyp",
    "Demo.resource_order",
  ]);
  const yyp = authored.files.find(({ path }) => path === "Demo.yyp").content;
  assert.ok(yyp.includes('"resources":['));
  assert.ok(/"RoomOrderNodes":\[[\s\S]*rm_level2/.test(yyp), "a new room must join the room order");
  assert.ok(yyp.includes("rm_start"), "the existing room must survive the splice");
  assert.doesNotThrow(() => parseGmJson(yyp));
});

test("NEW ROOM: an object the project lacks is refused", () => {
  assert.throws(
    () => authorRoom(project(), { name: "rm_level2", instances: [{ objectName: "obj_missing", x: 0, y: 0 }] }),
    (error) => error.code === "INVALID_ROOM",
  );
});

test("NEW ROOM: an existing name, or a case variant, is refused", () => {
  assert.throws(() => authorRoom(project(), { name: "rm_start" }), (error) => error.code === "RESOURCE_EXISTS");
  assert.throws(() => authorRoom(project(), { name: "RM_Start" }), (error) => error.code === "RESOURCE_EXISTS");
});

test("PLACE INSTANCE: patches the room as text and preserves every other byte", () => {
  const authored = authorPlaceInstance(project({ roomText: ROOM_TEXT }), {
    roomName: "rm_start",
    instances: [{ objectName: "obj_hero", x: 40, y: 60 }],
  });
  assert.equal(authored.resourceKind, "instance");
  assert.deepEqual(authored.files.map(({ path, action }) => [path, action]), [["rooms/rm_start/rm_start.yy", "modify"]]);

  const patched = parseGmJson(authored.files[0].content);
  assert.equal(patched.layers[0].instances.length, 2, "the pre-existing instance must survive");
  assert.equal(patched.instanceCreationOrder.length, 2);
  const added = patched.layers[0].instances.find(({ x }) => x === 40);
  assert.equal(added.y, 60);
  assert.equal(added.name, "inst_obj_hero_2", "the derived name must avoid the existing instance");
  // Untouched structure survives verbatim.
  assert.deepEqual(patched.layers.map(({ name }) => name), ["Instances", "Background"]);
  assert.equal(patched.roomSettings.Width, 640);
});

test("PLACE INSTANCE: existing instance names are read out of the room body", () => {
  const names = existingInstanceNames(ROOM_TEXT);
  assert.equal(names.has("inst_obj_hero"), true);
  assert.equal(names.size, 1);
});

test("PLACE INSTANCE: a room with more than one instance layer is refused, not guessed", () => {
  const twoLayers = ROOM_TEXT.replace('"instances":[', '"instances":[],"instances":[');
  assert.throws(
    () => spliceInstancesIntoRoom(twoLayers, "rm_start", resolveInstances([{ objectName: "obj_hero", x: 0, y: 0 }])),
    (error) => error.code === "INVALID_ROOM" && /ambiguous/.test(error.message),
  );
});

test("PLACE INSTANCE: a room with no instance layer is refused", () => {
  assert.throws(
    () => spliceInstancesIntoRoom('{"instanceCreationOrder":[]}', "rm_start", resolveInstances([{ objectName: "obj_hero", x: 0, y: 0 }])),
    (error) => error.code === "INVALID_ROOM",
  );
});

test("PLACE INSTANCE: the room must exist and its body must be supplied", () => {
  assert.throws(
    () => authorPlaceInstance(project({ roomText: ROOM_TEXT }), { roomName: "rm_missing", instances: [{ objectName: "obj_hero", x: 0, y: 0 }] }),
    (error) => error.code === "INVALID_ROOM",
  );
  assert.throws(
    () => authorPlaceInstance(project(), { roomName: "rm_start", instances: [{ objectName: "obj_hero", x: 0, y: 0 }] }),
    (error) => error.code === "INVALID_ROOM",
  );
  assert.throws(
    () => authorPlaceInstance(project({ roomText: ROOM_TEXT }), { roomName: "rm_start", instances: [] }),
    (error) => error.code === "INVALID_ROOM",
  );
});

test("PLACE INSTANCE: placing the same instance twice is idempotent in text", () => {
  const once = spliceInstancesIntoRoom(ROOM_TEXT, "rm_start", resolveInstances([{ objectName: "obj_hero", x: 1, y: 2, instanceName: "inst_fixed" }]));
  const twice = spliceInstancesIntoRoom(once, "rm_start", resolveInstances([{ objectName: "obj_hero", x: 1, y: 2, instanceName: "inst_fixed" }]));
  assert.equal(once, twice);
});
