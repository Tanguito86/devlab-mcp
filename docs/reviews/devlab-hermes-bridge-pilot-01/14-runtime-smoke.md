# 14 — Runtime smoke

Runtime was available and verified, so the compile-only fallback status is not
used. The positive Igor Run created a unique new Runner, the process ledger
bound it to `pilot-positive-v1`, stdout contained
`GM_BRIDGE_PILOT_VALUE=2`, and the Runner exited normally after the fixture's
bounded loop. Final owned Runner count: zero.

No foreign GameMaker/Igor/Runner existed at start. The separate foreign Runner
test proved a non-owned process remains alive and changes status to
RUNNER_RUNNING_FOREIGN.
