# 17 — Negative test results

Resolved package suite: `64/64 PASS`. Covered path traversal, absolute, UNC,
drive/ADS, mixed separators, NUL, encoded traversal, reserved devices,
trailing-space aliases, symlink/junction escape, file-tree limits,
evidence-root nesting, capability-gate violations, missing confirm, stale
fingerprint, plan/manifest mismatch, allowlist change, concurrent edits,
all four injected atomicity faults, durable WRITE_AHEAD recovery, foreign
Igor/Runner, PID reuse, timeout, cancellation and missing mutation.

Real invalid GML: TEXT_VALID FAIL, PROJECT_LOAD_VALID PASS, Igor exit `1`,
COMPILE_VALID FAIL, rollbackRequired true, no Runner, byte-exact restore PASS.
The current negative evidence is `evidence/pilot-negative-v1/`.
