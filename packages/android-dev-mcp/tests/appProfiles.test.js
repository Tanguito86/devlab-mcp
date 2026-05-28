import test from "node:test";
import assert from "node:assert/strict";
import { getAppProfile, getAppWorkflow, listAppProfiles } from "../dist/appProfiles.js";

test("app profile loader exposes generic examples and SoundBend example", async () => {
  const profiles = await listAppProfiles();

  assert.ok(profiles.sampleApp);
  assert.ok(profiles.system);
  assert.ok(profiles.soundbend);
  assert.equal(profiles.soundbend.package, "com.tanguitostudio.soundbend");
});

test("getAppProfile validates required profile fields", async () => {
  const profile = await getAppProfile("sampleApp");

  assert.equal(profile.package, "com.example.myapp");
  assert.equal(profile.activity, ".MainActivity");
});

test("getAppWorkflow returns configured workflow steps", async () => {
  const steps = await getAppWorkflow("sampleApp", "appSmoke");

  assert.ok(Array.isArray(steps));
  assert.equal(steps[0].tool, "android_launch_app");
});
