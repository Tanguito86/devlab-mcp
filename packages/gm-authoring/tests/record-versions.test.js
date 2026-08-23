import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  parseGmJson,
  renderObjectYy,
  renderRoomYy,
  renderScriptYy,
  resolveEvents,
  resolveInstances,
} from "../dist/index.js";

/**
 * Authoritative record versions, emitted by the installed ProjectTool itself:
 *
 *   ProjectTool.exe SHOWVERSIONEDTYPES DESTINATION=<file>
 *
 * Every tag-and-version value this package writes is a claim about the project
 * format. They were originally derived by reading a fixture and by compiling
 * candidates, which worked but proved nothing about the ones we had not tried.
 * This pins them against the toolchain's own answer instead.
 *
 * The grammar, per the compiler's readers: `"v<N>"` for a whole number 1..1000,
 * and `""` for version 0.
 */
const TABLE = fileURLToPath(new URL("../../../fixtures/gamemaker/ide-versioned-types.json", import.meta.url));

function authoritativeVersions() {
  // The file is GameMaker JSON: trailing commas and all.
  const parsed = parseGmJson(readFileSync(TABLE, "utf8"));
  const versions = new Map();
  for (const entry of parsed.TypeVersionList) versions.set(entry.Type, entry.Version);
  return versions;
}

const tagFor = (version) => (version === 0 ? "" : `v${version}`);

const IDENTITY = Object.freeze({ projectName: "Demo", projectFile: "Demo.yyp" });

test("VERSION TABLE: the fixture parses and covers the records we emit", () => {
  const versions = authoritativeVersions();
  assert.ok(versions.size >= 100, `expected a full class list, got ${versions.size}`);
  for (const type of ["GMObject", "GMEvent", "GMScript", "GMRoom", "GMRInstance", "GMRInstanceLayer", "GMRBackgroundLayer"]) {
    assert.equal(typeof versions.get(type), "number", `${type} must appear in the authoritative table`);
  }
});

test("SCRIPT: the emitted tag matches the authoritative GMScript version", () => {
  const versions = authoritativeVersions();
  const yy = parseGmJson(renderScriptYy("scr_a", IDENTITY));
  assert.equal(yy.$GMScript, tagFor(versions.get("GMScript")));
});

test("OBJECT: the object and its event records match the authoritative versions", () => {
  const versions = authoritativeVersions();
  const events = resolveEvents([{ event: "create", gml: "x" }]);
  const yy = parseGmJson(renderObjectYy("obj_a", IDENTITY, events));
  assert.equal(yy.$GMObject, tagFor(versions.get("GMObject")));
  assert.equal(yy.eventList[0].$GMEvent, tagFor(versions.get("GMEvent")));
});

test("ROOM: the room and every layer and instance record match the authoritative versions", () => {
  const versions = authoritativeVersions();
  const instances = resolveInstances([{ objectName: "obj_a", x: 0, y: 0 }]);
  const yy = parseGmJson(renderRoomYy("rm_a", IDENTITY, instances));
  assert.equal(yy.$GMRoom, tagFor(versions.get("GMRoom")));

  const instanceLayer = yy.layers.find((layer) => layer.resourceType === "GMRInstanceLayer");
  const backgroundLayer = yy.layers.find((layer) => layer.resourceType === "GMRBackgroundLayer");
  assert.equal(instanceLayer.$GMRInstanceLayer, tagFor(versions.get("GMRInstanceLayer")));
  assert.equal(backgroundLayer.$GMRBackgroundLayer, tagFor(versions.get("GMRBackgroundLayer")));
  assert.equal(instanceLayer.instances[0].$GMRInstance, tagFor(versions.get("GMRInstance")));
});

test("GRAMMAR: version 0 is the empty string, never the literal v0", () => {
  // Measured the hard way: ProjectTool rejects "v0" with "Failed to parse
  // tag-and-version field", and asks for v0 when handed "v1".
  assert.equal(tagFor(0), "");
  assert.equal(tagFor(1), "v1");
  assert.equal(tagFor(2), "v2");
  const versions = authoritativeVersions();
  for (const [type, version] of versions) {
    assert.ok(Number.isInteger(version) && version >= 0 && version <= 1000, `${type} has an out-of-grammar version ${version}`);
  }
});

test("TILES: the records a future tile-layer sprint needs are catalogued", () => {
  const versions = authoritativeVersions();
  // Not emitted yet. Recorded so the next attempt starts from the answer
  // rather than rediscovering it: GMRTileLayer is version 0, so its tag is "".
  assert.equal(versions.get("GMRTileLayer"), 0);
  assert.equal(versions.get("GMTileSet"), 1);
  assert.equal(versions.get("GMTileAnimation"), 0);
  assert.equal(versions.get("GMAutoTileSet"), 0);
});
