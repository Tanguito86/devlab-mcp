import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = JSON.parse(readFileSync(new URL("../capabilities/hermes-capability-manifest.json", import.meta.url), "utf8"));
const kit = JSON.parse(readFileSync(new URL("../capabilities/topdown-shooter-kit-v1.json", import.meta.url), "utf8"));
const external = JSON.parse(readFileSync(new URL("../capabilities/external-candidate-status.json", import.meta.url), "utf8"));

test("capability registry has the exact governed capability set", () => {
  assert.equal(registry.capabilities.length, 7);
  assert.equal(new Set(registry.capabilities.map(({ id }) => id)).size, 7);
  for (const capability of registry.capabilities) {
    assert.ok(registry.allowedStatuses.includes(capability.status));
    for (const field of ["source", "sourcePin", "license", "evidencePath", "authority", "integrationMode", "runtimeStatus", "securityStatus", "nextPermittedAction"]) assert.equal(typeof capability[field], "string");
    assert.match(capability.evidenceSha256, /^[0-9a-f]{64}$/);
    const evidence = readFileSync(new URL("../" + capability.evidencePath, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    assert.equal(createHash("sha256").update(evidence).digest("hex"), capability.evidenceSha256);
    assert.ok(Array.isArray(capability.prohibitedActions));
  }
});

test("external candidates remain uninstalled and outside the kit", () => {
  assert.equal(external.r3f.installed, false); assert.equal(external.r3f.topdownKitDependency, false);
  assert.equal(external.img2threejs.installed, false); assert.equal(external.img2threejs.status, "HARDENED_PILOT_READY"); assert.equal(external.img2threejs.blockers.length, 0);
  assert.equal(external.img2threejs.upstreamCopiesModified, 0);
  assert.deepEqual(kit.runtimeDependencies, []);
});

test("kit manifest contains every mandatory module without game content", () => {
  for (const module of ["simulation", "input", "combat", "pooling", "encounters", "spawning", "checkpoints", "boss-fsm", "lifecycle", "capture", "testing", "contracts"]) assert.ok(kit.modules.includes(module));
  assert.ok(kit.contentExclusions.length >= 8);
});
