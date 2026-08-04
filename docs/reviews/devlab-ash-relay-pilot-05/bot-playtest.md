# ASH RELAY bot playtest

## Result

```text
RUNS: 10/10 PASS
SEEDS: 424242..424251
MAIN_PATH_REACHABLE: YES
BOSS_PHASE_1_REACHABLE: YES
BOSS_PHASE_2_REACHABLE: YES
VICTORY_REACHABLE: YES
SOFTLOCKS: 0
RESTART_SUCCESS: 10/10 (100%)
CHECKPOINT_RESTORE: 10/10
POOL_DROPS: 0
```

The runner executes the real fixed-step simulation at 60 Hz. Every seed visits
title, tutorial, Node 01 encounter, checkpoint, Node 02 encounter, both
Guardian phases, evacuation, and victory. A separate route per seed forces a
post-checkpoint defeat and verifies restoration; another clean instance verifies
full restart.

Automated victory duration ranged from 165.850 to 167.300 seconds, averaging
166.602 seconds. Final health ranged from 51 to 74. This is a
perfect-information bot without reading or exploration delay: it supports, but
does not prove by itself, the 3-5 minute target for a new competent player.

## Definitive evidence

```text
REPORT:
bot-playtest-r2-final/report.json

REPORT_SHA256:
4a76f2edabab1c73df8a3271f1b9a5f75aaafa58c3fe0d5406da0eaa6a2ae1de
```

The report contains every transition, duration, final health, diagnostics
counter, deterministic state hash, failure list, restart result, and checkpoint
restore result for all ten seeds. Earlier `bot-playtest*` directories remain
preserved as non-final attempts.
