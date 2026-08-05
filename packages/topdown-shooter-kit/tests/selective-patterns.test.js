import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DeviceHost,
  FixedStepAccumulator,
  FogSystem,
  FogTier,
  GameLifecycle,
  REUSABLE_QA_CONTRACTS,
  SeededRandom,
  VisibilityLifecycleAdapter,
  canonicalizeLocalAssetRegistry,
  createDocumentVisibilitySource,
  deterministicStateHash,
  renderFogSnapshotText,
  validateExperienceEntryCapability,
  validateExperienceV2,
  validateLocalAssetRegistry,
  verifyLocalAssetRegistry,
} from "../dist/index.js";

const packageRoot = new URL("../", import.meta.url);

class FakeVisibilitySource {
  hidden = false;
  listeners = new Set();
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  set(hidden) { this.hidden = hidden; for (const listener of this.listeners) listener(hidden); }
}

function lifecycleHarness() {
  const calls = { start: 0, stop: 0, restart: 0, restore: 0, clear: 0 };
  const lifecycle = new GameLifecycle({
    startLoop: () => calls.start += 1,
    stopLoop: () => calls.stop += 1,
    restartSimulation: () => calls.restart += 1,
    restoreCheckpoint: () => { calls.restore += 1; return true; },
    clearTransientInfrastructure: () => calls.clear += 1,
  });
  return { calls, lifecycle };
}

test("P-01 hides before ticks, preserves a partial accumulator, and discards resumed wall time", async () => {
  const source = new FakeVisibilitySource();
  const { lifecycle } = lifecycleHarness();
  const clock = new FixedStepAccumulator();
  const events = [];
  let now = 100;
  let ticks = 0;
  const adapter = new VisibilityLifecycleAdapter(lifecycle, source, { now: () => now++, simulationSeconds: () => clock.simulationSeconds, onEvent: (event) => events.push(event) });
  clock.resume(); adapter.start();
  adapter.advance(clock, 1 / 120, () => ticks += 1);
  assert.equal(clock.interpolationAlpha, 0.5);
  source.set(true);
  adapter.advance(clock, 8, () => ticks += 1);
  assert.equal(ticks, 0); assert.equal(clock.interpolationAlpha, 0.5);
  source.set(false);
  adapter.advance(clock, 8, () => ticks += 1);
  assert.equal(ticks, 0); assert.equal(clock.interpolationAlpha, 0.5);
  adapter.advance(clock, 1 / 120, () => ticks += 1);
  assert.equal(ticks, 1); assert.equal(clock.interpolationAlpha, 0);
  assert.deepEqual(events.map(({ kind }) => kind), ["VISIBILITY_HIDDEN", "VISIBILITY_VISIBLE"]);
  assert.ok(events[1].monotonicMilliseconds >= events[0].monotonicMilliseconds);
  await adapter.dispose();
});

test("P-01 consecutive visibility transitions preserve manual pause and restart isolation", async () => {
  const source = new FakeVisibilitySource();
  const { calls, lifecycle } = lifecycleHarness();
  const clock = new FixedStepAccumulator(); clock.resume();
  const adapter = new VisibilityLifecycleAdapter(lifecycle, source);
  adapter.start(); adapter.pauseManually();
  source.set(true); adapter.restartSession(); source.set(false);
  assert.equal(lifecycle.paused, true); assert.equal(lifecycle.activeLoopCount, 0); assert.equal(calls.restart, 1);
  source.set(true); source.set(false);
  adapter.resumeManually();
  assert.equal(lifecycle.paused, false); assert.equal(lifecycle.activeLoopCount, 1);
  assert.equal(adapter.advance(clock, 10, () => assert.fail("discarded elapsed advanced simulation")).steps, 0);
  await adapter.dispose();
});

test("P-01 document source owns exactly one visibilitychange listener and removes it", async () => {
  const listeners = new Set();
  const document = {
    hidden: false,
    addEventListener: (type, listener) => { assert.equal(type, "visibilitychange"); listeners.add(listener); },
    removeEventListener: (type, listener) => { assert.equal(type, "visibilitychange"); listeners.delete(listener); },
  };
  const { lifecycle } = lifecycleHarness();
  const adapter = new VisibilityLifecycleAdapter(lifecycle, createDocumentVisibilitySource(document));
  adapter.start(); adapter.start(); assert.equal(listeners.size, 1);
  document.hidden = true; for (const listener of listeners) listener();
  assert.equal(adapter.hidden, true); assert.equal(lifecycle.activeLoopCount, 0);
  await adapter.dispose(); assert.equal(listeners.size, 0);
});

test("P-01 a synchronously hidden source never starts the lifecycle loop", async () => {
  const source = { hidden: true, subscribe: (listener) => { listener(true); return () => undefined; } };
  const { calls, lifecycle } = lifecycleHarness();
  const adapter = new VisibilityLifecycleAdapter(lifecycle, source);
  adapter.start();
  assert.equal(adapter.hidden, true); assert.equal(lifecycle.paused, true); assert.equal(lifecycle.activeLoopCount, 0); assert.equal(calls.start, 0);
  await adapter.dispose();
});

test("P-01 manual pause requested before start keeps the lifecycle loop stopped", async () => {
  const source = new FakeVisibilitySource(); const { calls, lifecycle } = lifecycleHarness();
  const adapter = new VisibilityLifecycleAdapter(lifecycle, source);
  adapter.pauseManually(); adapter.start();
  assert.equal(lifecycle.paused, true); assert.equal(lifecycle.activeLoopCount, 0); assert.equal(calls.start, 0);
  adapter.resumeManually(); assert.equal(lifecycle.activeLoopCount, 1);
  await adapter.dispose();
});

test("P-01 visibility and device recovery preserve the simulation hash", async () => {
  const source = new FakeVisibilitySource();
  const { lifecycle } = lifecycleHarness();
  const adapter = new VisibilityLifecycleAdapter(lifecycle, source);
  const simulation = { tick: 7, rng: 1234 };
  const host = new DeviceHost({ create: async (generation) => ({ device: { generation, hardware: true }, dispose: () => undefined }), isHardware: (device) => device.hardware }, () => deterministicStateHash(simulation));
  adapter.start(); source.set(true); const before = deterministicStateHash(simulation);
  await host.initialize(); await host.recover({ reason: "controlled-test", message: "visibility-device-loss", controlled: true });
  assert.equal(deterministicStateHash(simulation), before); assert.equal(host.generation, 2); assert.equal(adapter.hidden, true);
  await host.dispose(); await adapter.dispose();
});

test("P-01 hidden execution matches a control hash including RNG stream position", async () => {
  const run = async (withVisibility) => {
    const source = new FakeVisibilitySource(); const { lifecycle } = lifecycleHarness();
    const adapter = new VisibilityLifecycleAdapter(lifecycle, source); const clock = new FixedStepAccumulator(); const rng = new SeededRandom(77);
    const state = { ticks: 0, values: [] }; clock.resume(); adapter.start();
    const update = () => { state.ticks += 1; state.values.push(rng.next()); };
    adapter.advance(clock, 1 / 120, update);
    if (withVisibility) { source.set(true); adapter.advance(clock, 4, update); source.set(false); adapter.advance(clock, 4, update); }
    else adapter.advance(clock, 0, update);
    adapter.advance(clock, 1 / 120, update);
    const hash = deterministicStateHash({ state, rng: rng.position, alpha: clock.interpolationAlpha, time: clock.simulationSeconds });
    await adapter.dispose(); return hash;
  };
  assert.equal(await run(true), await run(false));
});

test("P-02 local registry verifies canonical order, bytes, hashes, and provenance offline", async () => {
  const registry = JSON.parse(await readFile(new URL("fixtures/local-asset-registry-v1.json", packageRoot), "utf8"));
  assert.deepEqual(validateLocalAssetRegistry(registry), { ok: true, errors: [] });
  const result = await verifyLocalAssetRegistry(registry, { load: (runtimePath) => readFile(new URL(runtimePath, packageRoot)) });
  assert.deepEqual(result, { ok: true, errors: [] });
  assert.equal(canonicalizeLocalAssetRegistry(registry), canonicalizeLocalAssetRegistry(JSON.parse(canonicalizeLocalAssetRegistry(registry))));
});

test("P-02 byte-exact fixtures declare LF checkout and retain canonical bytes", async () => {
  const rules = [
    "/packages/topdown-shooter-kit/fixtures/provenance.json text eol=lf",
    "/packages/topdown-shooter-kit/fixtures/signal-grid.txt text eol=lf",
  ];
  const attributes = await readFile(new URL("../../.gitattributes", packageRoot), "utf8");
  const declaredRules = new Set(attributes.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean));
  for (const rule of rules) assert.ok(declaredRules.has(rule), `missing checkout contract: ${rule}`);

  const registry = JSON.parse(await readFile(new URL("fixtures/local-asset-registry-v1.json", packageRoot), "utf8"));
  for (const asset of registry.assets) {
    const bytes = await readFile(new URL(asset.runtimePath, packageRoot));
    assert.equal(bytes.byteLength, asset.byteSize, `${asset.runtimePath} byte size`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, `${asset.runtimePath} SHA-256`);
    assert.equal(bytes.includes(Buffer.from("\r\n")), false, `${asset.runtimePath} contains CRLF`);
  }
});

test("P-02 rejects duplicates, remote paths, missing files, and incorrect hashes", async () => {
  const registry = JSON.parse(await readFile(new URL("fixtures/local-asset-registry-v1.json", packageRoot), "utf8"));
  const duplicate = structuredClone(registry); duplicate.assets[1].assetId = duplicate.assets[0].assetId;
  const structural = validateLocalAssetRegistry(duplicate);
  assert.equal(structural.ok, false); assert.ok(structural.errors.some(({ code }) => code === "DUPLICATE_ASSET_ID"));
  const remote = structuredClone(registry); remote.assets[1].runtimePath = "https://cdn.invalid/asset.bin";
  assert.ok(validateLocalAssetRegistry(remote).errors.some(({ path }) => path.endsWith("runtimePath")));
  const dataUrl = structuredClone(registry); dataUrl.assets[1].runtimePath = "data:text/plain,escape";
  assert.ok(validateLocalAssetRegistry(dataUrl).errors.some(({ path }) => path.endsWith("runtimePath")));
  const paddedUrl = structuredClone(registry); paddedUrl.assets[1].runtimePath = " http:cdn.mint.gg/escape";
  assert.ok(validateLocalAssetRegistry(paddedUrl).errors.some(({ path }) => path.endsWith("runtimePath")));
  const encodedTraversal = structuredClone(registry); encodedTraversal.assets[1].runtimePath = "fixtures/%2e%2e/escape.bin";
  assert.ok(validateLocalAssetRegistry(encodedTraversal).errors.some(({ path }) => path.endsWith("runtimePath")));
  const duplicatePath = structuredClone(registry); duplicatePath.assets[1].runtimePath = duplicatePath.assets[0].runtimePath;
  assert.ok(validateLocalAssetRegistry(duplicatePath).errors.some(({ code }) => code === "DUPLICATE_RUNTIME_PATH"));
  const remoteProvenance = structuredClone(registry); remoteProvenance.assets[0].source.reference = "https://invalid.example/source";
  assert.ok(validateLocalAssetRegistry(remoteProvenance).errors.some(({ path }) => path.endsWith("source.reference")));
  const networkPath = structuredClone(registry); networkPath.assets[0].source.reference = "//invalid.example/source";
  assert.ok(validateLocalAssetRegistry(networkPath).errors.some(({ path }) => path.endsWith("source.reference")));
  const paddedReference = structuredClone(registry); paddedReference.assets[0].source.reference = " file:remote-source";
  assert.ok(validateLocalAssetRegistry(paddedReference).errors.some(({ path }) => path.endsWith("source.reference")));
  const missing = await verifyLocalAssetRegistry(registry, { load: () => { throw new Error("missing"); } });
  assert.equal(missing.errors.filter(({ code }) => code === "MISSING_FILE").length, 2);
  const tampered = structuredClone(registry); tampered.assets[0].sha256 = "0".repeat(64);
  const mismatch = await verifyLocalAssetRegistry(tampered, { load: (runtimePath) => readFile(new URL(runtimePath, packageRoot)) });
  assert.ok(mismatch.errors.some(({ code }) => code === "HASH_MISMATCH"));
});

test("P-03 schemas parse and both experience v2 examples validate against registered capability IDs", async () => {
  const schema = JSON.parse(await readFile(new URL("schemas/experience-v2.schema.json", packageRoot), "utf8"));
  const assetSchema = JSON.parse(await readFile(new URL("schemas/local-asset-registry-v1.schema.json", packageRoot), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema"); assert.equal(assetSchema.$schema, schema.$schema);
  const manifest = JSON.parse(await readFile(new URL("../../capabilities/hermes-capability-manifest.json", packageRoot), "utf8"));
  const ids = new Set(manifest.capabilities.map(({ id }) => id));
  const distributionRoot = packageRoot;
  for (const name of ["experience-v2-minimal.json", "experience-v2-complete.json"]) {
    const experience = JSON.parse(await readFile(new URL(`examples/${name}`, packageRoot), "utf8"));
    assert.deepEqual(validateExperienceV2(experience), { ok: true, errors: [] });
    assert.deepEqual(validateExperienceEntryCapability(experience, ids), { ok: true, errors: [] });
    await assert.doesNotReject(() => readFile(new URL(experience.assetsRegistry, distributionRoot)));
    await assert.doesNotReject(() => readFile(new URL(experience.provenance.manifest, distributionRoot)));
  }
});

test("selective QA contracts exactly match the kit capability manifest", async () => {
  const kit = JSON.parse(await readFile(new URL("../../capabilities/topdown-shooter-kit-v1.json", packageRoot), "utf8"));
  assert.deepEqual(kit.qaContracts, [...REUSABLE_QA_CONTRACTS]);
});

test("P-03 rejects future versions, non-determinism, remote registries, and unknown capabilities readably", () => {
  const invalid = { schemaVersion: 3, experienceId: "pilot", title: "Pilot", version: "1.0.0", entryCapability: "UNKNOWN", session: { targetDurationSeconds: 60, restartable: true }, input: { primaryGesture: "move" }, simulation: { fixedTimestepHz: 60, deterministic: false, seedPolicy: "fixed" }, lifecycle: { visibilityPolicy: "freeze" }, assetsRegistry: "https://cdn.invalid/assets.json", offline: true, provenance: { manifest: "provenance.json" } };
  const result = validateExperienceV2(invalid);
  assert.equal(result.ok, false); assert.ok(result.errors.some((error) => error.includes("schemaVersion"))); assert.ok(result.errors.some((error) => error.includes("deterministic"))); assert.ok(result.errors.some((error) => error.includes("assetsRegistry")));
  assert.equal(validateExperienceEntryCapability({ ...invalid, schemaVersion: 2, simulation: { ...invalid.simulation, deterministic: true }, assetsRegistry: "assets.json" }, new Set()).errors[0], "$.entryCapability: unknown capability UNKNOWN");
  assert.equal(validateExperienceV2({ ...invalid, schemaVersion: 2, title: "Valid", version: "1.0.0-..", simulation: { ...invalid.simulation, deterministic: true }, assetsRegistry: "assets.json" }).ok, false);
  for (const version of ["1.0.0-1a", "1.0.0-123abc", "1.0.0-01a"]) assert.equal(validateExperienceV2({ ...invalid, schemaVersion: 2, title: "Valid", version, simulation: { ...invalid.simulation, deterministic: true }, assetsRegistry: "assets.json" }).errors.some((error) => error.includes("$.version")), false);
  assert.equal(validateExperienceV2({ ...invalid, schemaVersion: 2, title: " ", version: "1.0.0", input: { primaryGesture: " " }, simulation: { ...invalid.simulation, deterministic: true }, assetsRegistry: "assets.json" }).ok, false);
  assert.equal(validateExperienceV2({ ...invalid, schemaVersion: 2, title: "Valid", version: "1.0.0", simulation: { ...invalid.simulation, deterministic: true }, assetsRegistry: " http:cdn.mint.gg/assets" }).ok, false);
  for (const assetsRegistry of ["foo//bar.json", "foo/"]) assert.equal(validateExperienceV2({ ...invalid, schemaVersion: 2, title: "Valid", version: "1.0.0", simulation: { ...invalid.simulation, deterministic: true }, assetsRegistry }).ok, false);
});

async function loadFogFixture() { return JSON.parse(await readFile(new URL("fixtures/fog-pilot-a.json", packageRoot), "utf8")); }
function completeSweep(system, sources) { let result; do result = system.update(sources); while (!result.sweepComplete); return result; }

test("PILOT-A produces explicit fog tiers with a bounded deterministic sweep", async () => {
  const fixture = await loadFogFixture(); const system = new FogSystem(fixture);
  const transitions = [];
  for (const sources of fixture.frames) {
    let result;
    do { result = system.update(sources); assert.ok(result.evaluatedCells <= fixture.updateBudgetCells); transitions.push(...result.transitions); } while (!result.sweepComplete);
  }
  const tiers = new Set(system.getSnapshot().cells.map((cell) => cell.currentVisible ? FogTier.TIER_3 : cell.knowledgeTier));
  assert.deepEqual([...tiers].sort(), [0, 1, 2, 3]);
  assert.ok(transitions.some(({ to }) => to === FogTier.TIER_1)); assert.ok(transitions.some(({ to }) => to === FogTier.TIER_3)); assert.ok(transitions.some(({ to }) => to === FogTier.TIER_2));
  assert.match(renderFogSnapshotText(system.getSnapshot()), /^tiers\n[0-3]+/);
  assert.equal(system.updateBudgetCells, 6);
});

test("PILOT-A replay, mid-sweep snapshot restore, restart, and device recovery are equivalent", async () => {
  const fixture = await loadFogFixture();
  const left = new FogSystem(fixture); const right = new FogSystem(fixture);
  left.update(fixture.frames[0]); right.restore(JSON.parse(left.serialize()));
  assert.equal(right.serialize(), left.serialize());
  completeSweep(left, fixture.frames[0]); completeSweep(right, fixture.frames[0]);
  completeSweep(left, fixture.frames[1]); completeSweep(right, fixture.frames[1]);
  assert.equal(right.serialize(), left.serialize()); assert.equal(renderFogSnapshotText(right.getSnapshot()), renderFogSnapshotText(left.getSnapshot()));
  const before = createHash("sha256").update(left.serialize()).digest("hex");
  const host = new DeviceHost({ create: async (generation) => ({ device: { generation, hardware: true }, dispose: () => undefined }), isHardware: (device) => device.hardware }, () => createHash("sha256").update(left.serialize()).digest("hex"));
  await host.initialize(); await host.recover({ reason: "controlled-test", message: "fog-device-loss", controlled: true });
  assert.equal(createHash("sha256").update(left.serialize()).digest("hex"), before);
  left.restart(); assert.ok(left.getSnapshot().cells.every((cell) => cell.knowledgeTier === 0 && !cell.currentVisible));
  await host.dispose();
});

test("PILOT-A keeps the committed view stable during a partial sweep and rejects non-canonical restore", async () => {
  const fixture = await loadFogFixture(); const system = new FogSystem(fixture);
  completeSweep(system, fixture.frames[0]);
  const committed = system.getSnapshot().cells;
  const partial = system.update(fixture.frames[1]);
  assert.equal(partial.sweepComplete, false); assert.deepEqual(system.getSnapshot().cells, committed); assert.deepEqual(partial.transitions, []);
  const invalidCell = structuredClone(system.getSnapshot()); invalidCell.cells[0] = { knowledgeTier: 0, currentVisible: true };
  assert.throws(() => new FogSystem(fixture).restore(invalidCell), /invalid cells/);
  const unorderedSources = structuredClone(system.getSnapshot()); unorderedSources.activeSources.reverse();
  assert.throws(() => new FogSystem(fixture).restore(unorderedSources), /canonical ID order/);
  const nonCanonicalPending = structuredClone(system.getSnapshot());
  const unexpected = nonCanonicalPending.pendingCells.findIndex((cell) => cell === null); nonCanonicalPending.pendingCells[unexpected] = { knowledgeTier: 0, currentVisible: false };
  assert.throws(() => new FogSystem(fixture).restore(nonCanonicalPending), /canonical pending cells/);
  const forgedTransitions = structuredClone(system.getSnapshot());
  if (forgedTransitions.pendingTransitions.length > 0) forgedTransitions.pendingTransitions = [];
  else forgedTransitions.pendingTransitions.push({ x: 0, y: 0, from: 0, to: 1 });
  assert.throws(() => new FogSystem(fixture).restore(forgedTransitions), /transitions do not match/);
});

test("PILOT-A updates only from fixed-step callbacks", async () => {
  const fixture = await loadFogFixture(); const system = new FogSystem(fixture); const clock = new FixedStepAccumulator();
  clock.resume(); let complete = false; let fixedUpdates = 0;
  while (!complete) {
    clock.advance(1 / 60, () => { fixedUpdates += 1; complete = system.update(fixture.frames[0]).sweepComplete; });
  }
  assert.equal(fixedUpdates, Math.ceil((fixture.width * fixture.height) / fixture.updateBudgetCells));
  assert.ok(Math.abs(clock.simulationSeconds - fixedUpdates / 60) < 1e-12);
});
