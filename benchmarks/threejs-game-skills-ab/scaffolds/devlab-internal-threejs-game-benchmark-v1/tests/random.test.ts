import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSeed, SeededRandom } from "../src/core/random.js";

function sample(seed: number): number[] {
  const random = new SeededRandom(seed);
  return Array.from({ length: 8 }, () => random.next());
}

test("equal seeds produce equal streams", () => {
  assert.deepEqual(sample(424_242), sample(424_242));
});

test("different seeds produce different streams", () => {
  assert.notDeepEqual(sample(424_242), sample(424_243));
});

test("seed normalization is explicit unsigned 32-bit conversion", () => {
  assert.equal(normalizeSeed(-1), 0xffff_ffff);
  assert.equal(normalizeSeed(4_294_967_297), 1);
  assert.throws(() => normalizeSeed(Number.NaN), /finite/);
});

test("range values stay inside the requested interval", () => {
  const random = new SeededRandom(7);
  for (let index = 0; index < 100; index += 1) {
    const value = random.range(-3, 9);
    assert.ok(value >= -3 && value < 9);
  }
});
