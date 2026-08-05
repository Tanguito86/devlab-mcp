# 17 — Negative test results

Package suite: `57/57 PASS` before critic. Covered path traversal, absolute,
UNC, drive/ADS, mixed separators, NUL, encoded traversal, reserved devices,
symlink/junction escape, file-tree limits, evidence-root nesting, wrong
capability, missing confirm, stale fingerprint, plan/manifest tamper,
allowlist change, concurrent edits, all four injected atomicity faults,
foreign Runner, PID reuse, timeout, cancellation and missing mutation.

Real invalid GML: TEXT_VALID FAIL, PROJECT_LOAD_VALID PASS, Igor exit `1`,
COMPILE_VALID FAIL, rollbackRequired true, no Runner, byte-exact restore PASS.
