# Scoring rubric

Scores are normalized to 100 and weighted as follows: gameplay 30%, visual
quality 20%, correctness and QA 20%, performance 15%, mobile and UI 10%, and
process efficiency 5%.

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

LEG_B wins only with at least an 8 percentage-point total improvement and no
P0/P1 regression in correctness, security, native performance, frozen-state
determinism or mobile. A result from -3 through less than +8 points is
`INCONCLUSIVE / SECOND_PAIR_REQUIRED`. Any invalid or unequal pair is not
scored.
