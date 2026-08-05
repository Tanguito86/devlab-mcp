# 13 — Igor compile verification

The adapter resolved a fresh invocation of Igor from runtime `2024.14.3.260`,
the GameMaker-LTS2026 user profile, and LTS2026 `ProjectTool.exe`. It records
executable, runtime version, arguments, command hash, PID/start token, timeout,
stdout/stderr, exit code, output artifacts, ownership and compiled fingerprint.

Positive result: project load PASS, Igor exit `0`, COMPILE_VALID PASS.
Negative result: project load PASS, Igor exit `1`, COMPILE_VALID FAIL.
No pre-existing log was used as compile evidence.
