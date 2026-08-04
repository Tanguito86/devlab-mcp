import assert from "node:assert/strict";
import test from "node:test";

import {
  BossStateMachine, BoundedQueue, CheckpointProvider, CueBus, DEFAULT_BOT_SEEDS,
  DeviceHost, FixedStepAccumulator, GameLifecycle, Pool, PublicInputAdapter,
  REUSABLE_QA_CONTRACTS, ResourceOwner, SeededRandom, SpawnDirector,
  assertLoopbackCaptureOrigin, deterministicStateHash, framesExactlyEqual, launchProjectile, runBot,
} from "../dist/index.js";

const identity = { screenToWorld: (right, up) => ({ x: right, z: up }), worldToScreen: ({ x, z }) => ({ right: x, up: z }) };

test("fixed step bounds catch-up, freezes, and exposes interpolation", () => {
  const clock = new FixedStepAccumulator(); let updates = 0;
  clock.resume(); const result = clock.advance(1, () => updates += 1);
  assert.equal(updates, 8); assert.equal(result.steps, 8); assert.ok(result.droppedSeconds > 0.8);
  clock.pause(); assert.equal(clock.advance(1, () => updates += 1).steps, 0);
  clock.freezeAt(2500); assert.equal(clock.simulationSeconds, 2.5);
});

test("seeded random is reproducible and exposes restorable stream position", () => {
  const left = new SeededRandom(42); const right = new SeededRandom(42);
  assert.deepEqual([left.next(), left.next(), left.next()], [right.next(), right.next(), right.next()]);
  const position = left.position; const expected = left.next(); left.restorePosition(position); assert.equal(left.next(), expected);
});

test("desktop directions and FIRE/INTERACT remain canonical and separate", () => {
  const input = new PublicInputAdapter(identity);
  for (const [key, expected] of [["KeyW", [0, 1]], ["KeyS", [0, -1]], ["KeyA", [-1, 0]], ["KeyD", [1, 0]]]) {
    input.keyDown(key); const frame = input.frame(); input.keyUp(key); assert.deepEqual([frame.moveX, frame.moveZ], expected);
  }
  input.keyDown("Space"); let frame = input.frame(); assert.equal(frame.attack, true); assert.equal(frame.activate, false); input.keyUp("Space");
  input.keyDown("KeyE"); frame = input.frame(); assert.equal(frame.attack, false); assert.equal(frame.activate, true);
});

test("touch direction matches desktop and pointer cancel clears only its intent", () => {
  const input = new PublicInputAdapter(identity); input.beginMove(1); input.move(1, 0, 1); input.beginAction("attack", 2, 1, 0);
  let frame = input.frame(); assert.deepEqual([frame.moveX, frame.moveZ, frame.aimX, frame.aimZ], [0, 1, 1, 0]); assert.equal(frame.attack, true);
  input.cancel(2); frame = input.frame(); assert.equal(frame.attack, false); assert.deepEqual([frame.moveX, frame.moveZ], [0, 1]);
  input.cancel(1); frame = input.frame(); assert.deepEqual([frame.moveX, frame.moveZ], [0, 0]);
});

test("projectile launch direction is exactly aligned with canonical aim", () => {
  const shot = launchProjectile({ x: 3, z: 4 }, { x: 10, z: 0 }, 12);
  assert.deepEqual(shot.direction, { x: 1, z: 0 });
  assert.deepEqual(shot.velocity, { x: 12, z: 0 });
  assert.deepEqual(shot.position, { x: 3, z: 4 });
});

test("pool is fixed-capacity and accounts overflow without growth", () => {
  const pool = new Pool(2, (id) => ({ id })); const a = pool.acquire(); const b = pool.acquire();
  assert.ok(a && b); assert.equal(pool.acquire(), null); assert.deepEqual(pool.snapshot, { active: 2, capacity: 2, highWater: 2, dropped: 1 });
  pool.release(a); assert.ok(pool.acquire()); pool.clear(); assert.equal(pool.snapshot.active, 0);
});

test("bounded queue rejects deterministically and clears restart transients", () => {
  const queue = new BoundedQueue(2); assert.equal(queue.enqueue("a"), true); assert.equal(queue.enqueue("b"), true); assert.equal(queue.enqueue("c"), false);
  assert.deepEqual([queue.dequeue(), queue.dequeue()], ["a", "b"]); queue.enqueue("d"); queue.clear(); assert.equal(queue.pending, 0); assert.equal(queue.diagnostics.rejected, 1);
});

test("spawn director telegraphs through two channels and never commits near player", () => {
  const director = new SpawnDirector([{ id: "left", position: { x: 0, z: 0 }, telegraphSeconds: 0.65, channels: 2 }, { id: "right", position: { x: 5, z: 0 }, telegraphSeconds: 0.65, channels: 2 }], 2, 2);
  assert.equal(director.request("basic", "left"), true); assert.deepEqual(director.update(0, { x: 0, z: 0 }), []); assert.equal(director.hatchState, "TELEGRAPH");
  assert.deepEqual(director.update(0.65, { x: 0, z: 0 }), []); const commits = director.update(0, { x: 0, z: 0 }); assert.equal(commits[0].hatchId, "right");
});

test("checkpoint restore retains current RNG and rejects transient commits", () => {
  const contract = { allowedStates: ["safe"], rngPolicy: "retain-current-stream", healthPolicy: { restoreTo: 100 }, phase: (state) => state.phase, project: (state) => ({ marker: state.marker }), restore: (record, rng) => ({ phase: "restored", marker: record.marker, rng, transient: false }), hasForbiddenTransients: (state) => state.transient };
  const provider = new CheckpointProvider(contract); assert.equal(provider.commit({ phase: "safe", marker: 7, transient: true }), false); assert.equal(provider.commit({ phase: "safe", marker: 7, transient: false }), true);
  assert.deepEqual(provider.restore(1234), { phase: "restored", marker: 7, rng: 1234, transient: false });
});

test("boss vulnerability is attack-causal and phase transition is unique", () => {
  const phase = { patterns: ["sweep"], introSeconds: 0, telegraphSeconds: 0.65, committedSeconds: 0.1, recoverySeconds: 0.1, vulnerableSeconds: 1, maxSimultaneousReinforcements: 0, maxReinforcementRequests: 0 };
  const boss = new BossStateMachine(100, [phase, { ...phase, patterns: ["fan"] }]);
  boss.update(0); assert.equal(boss.state, "TELEGRAPH"); boss.update(0.65); assert.equal(boss.state, "COMMITTED_ATTACK"); assert.equal(boss.receiveDamage(50), false);
  boss.update(0.1); assert.equal(boss.state, "RECOVERY"); boss.update(0.1); assert.equal(boss.state, "VULNERABLE"); assert.equal(boss.receiveDamage(50), true);
  boss.update(0); assert.equal(boss.phase, 2); assert.equal(boss.metrics.transitionCount, 1);
});

test("lifecycle keeps one loop and restart/restore never rebind", async () => {
  const calls = { start: 0, stop: 0, restart: 0, restore: 0, clear: 0 };
  const lifecycle = new GameLifecycle({ startLoop: () => calls.start += 1, stopLoop: () => calls.stop += 1, restartSimulation: () => calls.restart += 1, restoreCheckpoint: () => { calls.restore += 1; return true }, clearTransientInfrastructure: () => calls.clear += 1 });
  lifecycle.start(); lifecycle.start(); assert.equal(lifecycle.activeLoopCount, 1); lifecycle.pause(); lifecycle.pause(); lifecycle.resume(); lifecycle.restart(); assert.equal(calls.start, 2); assert.equal(lifecycle.restore(), true); assert.equal(calls.clear, 2); await lifecycle.dispose(); await lifecycle.dispose(); assert.equal(lifecycle.activeLoopCount, 0);
});

test("resource owner is LIFO and idempotent", async () => {
  const order = []; const owner = new ResourceOwner(); owner.defer(() => order.push(1)); owner.defer(() => order.push(2)); await owner.shutdown(); await owner.shutdown(); assert.deepEqual(order, [2, 1]);
});

test("device recovery increments generation without mutating simulation", async () => {
  let state = { tick: 3 }; let disposed = 0;
  const host = new DeviceHost({ create: async (generation) => ({ device: { generation, hardware: true }, dispose: () => disposed += 1 }), isHardware: (device) => device.hardware }, () => deterministicStateHash(state));
  await host.initialize(); await host.recover({ reason: "test", message: "controlled", controlled: true }); assert.equal(host.generation, 2); assert.equal(host.recoveryCount, 1); assert.equal(disposed, 1); assert.equal(state.tick, 3);
});

test("cue bus emits nothing while locked or paused", () => {
  const bus = new CueBus(); const events = []; bus.subscribe((event) => events.push(event)); assert.equal(bus.cue("hit", 1), false); bus.unlock(); bus.pause(); assert.equal(bus.cue("hit", 1), false); bus.resume(); assert.equal(bus.cue("hit", 1), true); assert.equal(events.length, 1);
});

test("capture is loopback-only and exact comparison is byte-strict", () => {
  assert.doesNotThrow(() => assertLoopbackCaptureOrigin("http://127.0.0.1:1234")); assert.throws(() => assertLoopbackCaptureOrigin("https://example.com"));
  const frame = { png: new Uint8Array([1]), rgba: new Uint8Array([2, 3]), width: 1, height: 1 }; assert.equal(framesExactlyEqual(frame, structuredClone(frame)), true); assert.equal(framesExactlyEqual(frame, { ...frame, png: new Uint8Array([2]) }), false);
});

test("generic bot runner separates objective adapters from simulation content", () => {
  let snapshot = { progress: 0 }; const simulation = { seed: 1, step: () => snapshot = { progress: snapshot.progress + 1 }, getSnapshot: () => snapshot, getDiagnostics: () => ({}), setCaptureState: () => snapshot, restartRun: () => { snapshot = { progress: 0 } }, restoreCheckpoint: () => true };
  const result = runBot(simulation, { nextObjective: () => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 1, attack: false, activate: false, start: false, restart: false, pause: false }) }, [{ name: "complete", pass: (value) => value.progress >= 3 }], { maximumTicks: 10, softlockWindowTicks: 2, progressHash: (value) => String(value.progress) });
  assert.equal(result.result, "PASS"); assert.equal(result.finalSnapshot.progress, 3); assert.equal(DEFAULT_BOT_SEEDS.length, 10); assert.ok(REUSABLE_QA_CONTRACTS.includes("DEVICE_LOSS_RECOVERY"));
});
