import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const pilot = join(root, "docs", "reviews", "devlab-ash-relay-pilot-05");
const review = join(root, "docs", "reviews", "devlab-ash-relay-gameplay-correction-06a");

const paths = {
  core: join(pilot, "core-loop-contract.md"),
  encounter: join(pilot, "encounter-plan.md"),
  rubric: join(review, "gameplay-rubric-v2.md"),
  brief: join(review, "codex-correction-brief-v2.md"),
  reconciliation: join(review, "contract-reconciliation.md"),
};

const read = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");
const docs = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, read(path)]));

test("core contract preserves canonical tuning and defines the activation floor", () => {
  assert.match(docs.core, /Player maximum speed \| 8\.5 world units\/second/);
  assert.match(docs.core, /full checkpoint health at 100/);
  assert.match(docs.core, /Enemy pool capacity \| 24/);
  assert.match(docs.core, /Reaching 75% arms an irreversible floor/);
  assert.match(docs.core, /clears both\s+activation values and their armed-floor flags/);
});

test("encounter contract defines local budgets without a global cap", () => {
  assert.match(docs.encounter, /Relay A onboarding \| 2 \| 2/);
  assert.match(docs.encounter, /Relay A post-activation response \| 2 \| 2/);
  assert.match(docs.encounter, /Relay B mixed encounter \| 5 \| 5/);
  assert.match(docs.encounter, /Guardian phase 2 \| 2 \| 3/);
  assert.match(docs.encounter, /not a global active-hostile cap/);
  assert.match(docs.encounter, /HATCH_IDLE -> HATCH_TELEGRAPH -> SPAWN_COMMIT -> ENEMY_ACTIVE/);
});

test("Relay A ordering and difficulty are explicit", () => {
  assert.match(docs.encounter, /Node 01 begins disabled/);
  assert.match(docs.encounter, /Two normal Cinder Scrappers/);
  assert.match(docs.encounter, /exactly one[\s\S]*Cinder Scrapper and one normal Arc Sentry/);
  assert.match(docs.encounter, /Relay A must remain measurably less demanding than Relay B/);
});

test("boss contract preserves 540 HP and attack-linked vulnerability", () => {
  assert.match(docs.encounter, /starts with 540 health/);
  assert.match(docs.encounter, /TELEGRAPH -> COMMITTED_ATTACK -> RECOVERY -> VULNERABLE -> TELEGRAPH/);
  assert.match(docs.encounter, /legible sweep/);
  assert.match(docs.encounter, /projectile fan with stable, recognizable gaps/);
  assert.match(docs.encounter, /cannot be\s+opened by an unrelated global clock/);
  assert.match(docs.encounter, /boss outside its 70-100[\s\S]*second budget/);
});

test("v2 rubric uses reconciled values and gates", () => {
  assert.match(docs.rubric, /all 8 gates pass and score is at least 80/);
  assert.match(docs.rubric, /maximum speed of 8\.5/);
  assert.match(docs.rubric, /health 100/);
  assert.match(docs.rubric, /starts at 540 HP/);
  assert.match(docs.rubric, /Pool capacity remains 24/);
  assert.doesNotMatch(docs.rubric, /speed 6\.0|health 75|360 HP|cap of six/i);
});

test("correction brief separates required work from stale values", () => {
  const [required, obsolete] = docs.brief.split("## Explicitly obsolete; do not implement");
  assert.ok(obsolete, "brief must include an explicit obsolete-values section");
  assert.match(required, /Keep 540 initial HP/);
  assert.match(required, /Do not add a global active cap of six/);
  assert.doesNotMatch(required, /player speed 6\.0|checkpoint health 75|mandatory boss health 360/);
  assert.match(obsolete, /player speed 6\.0/);
  assert.match(obsolete, /checkpoint health 75/);
  assert.match(obsolete, /mandatory boss health 360/);
  assert.match(obsolete, /global active-hostile cap 6/);
});

test("reconciliation makes the historical-score boundary explicit", () => {
  assert.match(docs.reconciliation, /70\/100 result remains valid evidence/);
  assert.match(docs.reconciliation, /must not be compared directly with a v2 score/);
  assert.match(docs.reconciliation, /No game source, runtime asset, build output, or generated evidence was changed/);
});

test("external critic copies match the versioned rubric and brief", {
  skip: !process.env.ASH_RELAY_CRITIC_ROOT,
}, () => {
  const critic = resolve(process.env.ASH_RELAY_CRITIC_ROOT);
  assert.equal(read(join(critic, "gameplay-rubric.md")), docs.rubric);
  assert.equal(read(join(critic, "codex-correction-brief.md")), docs.brief);
});
