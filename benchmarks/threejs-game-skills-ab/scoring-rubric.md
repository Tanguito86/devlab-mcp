# Scoring rubric

Each leg records six evaluator domain scores in the closed interval 0 through
100: `gameplay`, `visualQuality`, `correctnessAndQa`, `performance`,
`mobileAndUi`, and `processEfficiency`. The weighted total is calculated, not
entered manually:

```text
weightedTotal = (
  gameplay * 30 +
  visualQuality * 20 +
  correctnessAndQa * 20 +
  performance * 15 +
  mobileAndUi * 10 +
  processEfficiency * 5
) / 100
```

The result verifier recomputes this value and rejects a mismatch greater than
`1e-9`. Scores and totals use percentage points on the 0–100 scale.

Automatic metrics establish correctness and measurement, not artistic merit.
Entropy, edge density, luminance contrast and nonblank share are comparative
signals only. Composition, readability, coherence, HUD clarity and gameplay
feel require a blinded human score with written reasons.

Gameplay covers objective completion, completion rate, softlocks, time to
objective, damage events, restart success, input responsiveness and human play
score. Correctness covers build, typecheck, errors, pause/restart, checkpoint
restore and victory. Performance covers native adapter/backend, p95/p99 frame
time, pacing, draw calls, triangles, textures, bounded resources, resize and
mobile viewport. Process covers first-playable time, total agent time, rework
cycles, files, complexity, tests and unresolved risks.

The pair comparator defines `delta = LEG_B.weightedTotal -
LEG_A.weightedTotal` and applies mutually exclusive limits:

- `LEG_B_WIN` when `delta >= 8`;
- `LEG_A_WIN` when `delta < -3`;
- `INCONCLUSIVE / SECOND_PAIR_REQUIRED` when `-3 <= delta < 8`.

This preserves the authorized rule that LEG_A must lead by more than three
percentage points; an exact three-point LEG_A lead is inconclusive.

No pair is scored if either result fails correctness, security, native runtime,
frozen determinism, lifecycle, mobile, evidence, provenance or pair-equality
gates. P0/P1 regression is never allowed, regardless of weighted total.
