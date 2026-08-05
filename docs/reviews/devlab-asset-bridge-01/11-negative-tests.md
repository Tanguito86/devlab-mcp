# 11 - Negative tests

The 61-test bridge suite covers all six lifecycle states, missing assets,
spec/export/manifest/lifecycle/plan/HEAD/allowlist/target tampering, case and
Unicode collisions, traversal, absolute/UNC/ADS/NUL/mixed/reserved paths,
symlink escape, resource collision, width/height/frame/file/resource/byte
budgets, public error redaction, and stale v1 use against v2.

The real intentional negative project contains valid GameMaker metadata and a
GML syntax error. Igor exited 1; the bridge returned
`VERIFY_COMPILE_FAILED`, `COMPILE_VALID.passed=false`, required rollback, and
rollback was byte-exact. Evidence: `evidence/compile-negative.log` and the
`negative-compile` case in `evidence/pilot-summary.json`.
