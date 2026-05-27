import test from "node:test";
import assert from "node:assert/strict";
import { parseCurrentActivityFromText } from "../dist/activity.js";

test("parseCurrentActivityFromText extracts package and activity", () => {
  const parsed = parseCurrentActivityFromText("mCurrentFocus=Window{abc u0 com.example/.MainActivity}");

  assert.deepEqual(parsed, {
    packageName: "com.example",
    activityName: ".MainActivity",
    rawSource: "mCurrentFocus=Window{abc u0 com.example/.MainActivity}"
  });
});

test("parseCurrentActivityFromText returns undefined when no component exists", () => {
  assert.equal(parseCurrentActivityFromText("mCurrentFocus=null"), undefined);
});
