import assert from "node:assert/strict";
import test from "node:test";

import { ResourceOwner } from "../src/core/resource-owner.js";

test("resources shut down once in reverse ownership order", async () => {
  const owner = new ResourceOwner();
  const calls: string[] = [];
  owner.defer(() => {
    calls.push("first");
  });
  owner.own({
    dispose() {
      calls.push("second");
    },
  });
  owner.defer(async () => {
    await Promise.resolve();
    calls.push("third");
  });

  await owner.shutdown();
  await owner.shutdown();
  assert.deepEqual(calls, ["third", "second", "first"]);
});

test("registration after shutdown is rejected", async () => {
  const owner = new ResourceOwner();
  await owner.shutdown();
  assert.throws(() => owner.defer(() => {}), /after shutdown/);
});
