# Gameplay rubric v2 - ASH RELAY

Sprint source: `DEVLAB-ASH-RELAY-CONTRACT-RECONCILIATION-06A`

Future review: `OPS-ASH-RELAY-GAMEPLAY-CRITIC-01C`

Normative contracts: `core-loop-contract.md` v2 and `encounter-plan.md` v2

This rubric replaces the stale tuning assumptions in the 01B rubric. The
historical 70/100 score is not a baseline for direct score comparison.

## Functional gates

All eight gates must pass before gameplay scoring.

| Gate | Version 2 criterion |
| --- | --- |
| `TITLE_TO_VICTORY` | The complete title-to-victory route is reachable without debug intervention |
| `SOFTLOCKS` | Zero softlocks in ten bot runs and all adversarial cases; the activation floor, local active budgets, and bounded queues pass their dedicated cases |
| `RESTART_SUCCESS` | Restart restores seed 424242, 100 health, relays off, activation progress zero, floor flags clear, empty pending queues, and no duplicated handlers or loops |
| `CHECKPOINT_RESTORE` | Core attached; Relay A active; Relay B inactive; health 100; current RNG stream position retained; no residual enemy, projectile, telegraph, effect, hatch request, or armed Relay B floor; player at the bridge marker |
| `BOSS_REACHABLE` | Custodian is inaccessible and invulnerable before both relays, then reachable with the correct initial state |
| `VICTORY_REACHABLE` | Defeat of the boss enables the 1.50-second extraction hold; victory does not auto-restart |
| `TOUCH_MAIN_PATH` | The main route is completable using touch and remains readable in the contractual portrait sizes |
| `PAUSE_RESUME` | Pause freezes fixed-step combat and procedural events; resume adds no extra step, loop, input binding, or audio source |

## CONTROL - 20 points

- Movement is responsive at the canonical maximum speed of 8.5 world
  units/second, without unintended drift.
- Directional aim is accurate on desktop and touch.
- The canonical pulse cooldown is 0.145 seconds and pulse damage is 18.
- Player damage is readable and respects 0.58 seconds of post-hit
  invulnerability.
- No dash is required or scored.

## CLARITY - 15 points

- The objective, two-node HUD rail, conduit state, and route remain legible.
- Cinder Scrappers and Arc Sentries are identifiable before damage.
- Every standard-enemy spawn has a visible hatch telegraph using at least shape
  or motion plus color.
- Relay floor armed, boss committed attack, boss recovery, vulnerability, and
  phase transition are distinguishable states.

## PACING - 15 points

- Relay A begins with exactly two Scrappers, enables activation only after they
  are defeated, and has a two-enemy bounded response.
- Relay A is measurably less demanding than Relay B in active pressure, total
  hostiles, and composition complexity.
- The mission lasts 3-5 minutes for the target play path.
- The boss lasts 70-100 seconds, and no phase runs longer than 55 seconds
  without a meaningful pattern or state change.
- Timing is not extended through slower player movement, passive waits,
  infinite reinforcements, or unmeasured HP inflation.

## ENEMIES - 15 points

- Cinder Scrapper retains the implemented 30/42 health and close-pursuit role.
- Arc Sentry retains the implemented 44/56 health and ranged-lane role.
- Relay A uses local budgets `2 active / 2 queued` for onboarding and
  `2 active / 2 queued` for its bounded response.
- Relay B uses `5 active / 5 queued` and a finite deterministic schedule.
- Pool capacity remains 24 and is never scored as simultaneous pressure.
- No enemy commits inside the player; queues cannot grow indefinitely; every
  commit follows `HATCH_IDLE -> HATCH_TELEGRAPH -> SPAWN_COMMIT -> ENEMY_ACTIVE`.

## BOSS - 15 points

- Relay Custodian starts at 540 HP. HP is reconsidered only from measured
  mission and boss duration.
- Each phase uses `TELEGRAPH -> COMMITTED_ATTACK -> RECOVERY -> VULNERABLE`.
- Phase 1 includes a legible sweep with advance warning and a reachable safe
  zone.
- Phase 2 includes a projectile fan with stable, recognizable, reachable gaps.
- Vulnerability follows completion of the committed attack, never an unrelated
  global clock.
- Phase 2 permits at most two simultaneous secondary enemies and three total
  reinforcement requests, all through telegraphed hatches.
- No damage is unavoidable and no vulnerability or invulnerability state can
  persist forever.

## FEEDBACK - 10 points

- Spawn telegraph, floor armed, relay completion, boss vulnerability, confirmed
  hit, player damage, phase change, checkpoint restore, defeat, and victory each
  use at least two channels among shape, color, movement, audio, and text.
- Feedback derives from deterministic simulation events and does not alter
  combat timing or frozen-state capture.

## MOBILE - 10 points

- Touch completes the main path with pointer-cancel and multi-touch safety.
- Controls do not obscure the activation ring, player, nearest telegraph, boss
  gap, or objective at 412x915 and 390x844.
- Activation intent and pulse intent are unambiguous; a fused control cannot
  cause an unintended shot or activation.
- Portrait/desktop resize changes layout and camera only.

## Verdict

- `PASS`: all 8 gates pass and score is at least 80.
- `GAMEPLAY_ACCEPTED_POLISH_PENDING`: all 8 gates pass, no P0/P1 remains, and
  score is 75-79.9.
- `FAIL`: any gate fails, any P0/P1 remains, or score is below 75.
