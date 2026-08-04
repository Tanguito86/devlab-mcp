# Validation

Validation ran from the reconciled worktree after the bridge:

```text
INSTALL_FROZEN: PASS
LOCKFILE_DIFF: 0
BUILD: PASS 5/5
TYPECHECK: PASS 5/5
TESTS: PASS 189/189
CAPABILITY_REGISTRY: PASS 3/3
DIFF_CHECK: PASS
WORKTREE: CLEAN
```

Build precedes tests because the package test suites explicitly import compiled `dist/` modules. Topdown Shooter Kit and Ash Relay parity documentation are present; R3F and img2threejs remain uninstalled; no Kimi artifacts or heavy evidence are tracked.
