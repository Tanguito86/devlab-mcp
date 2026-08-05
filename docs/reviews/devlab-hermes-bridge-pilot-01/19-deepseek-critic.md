# 19 — DeepSeek independent critic

```text
MODEL: deepseek/deepseek-v4-flash
RELEASE IDENTIFIED: 2026-07-31 (V4 Flash 0731)
MODE: read-only plan agent; edit permission denied
REVIEWED HEAD: 480c003
DETACHED CLONE: clean
EDITS MADE: NO
SESSION: ses_02d524871ffeeUf0TKxlg4ymLD
VERDICT: NOT ACCEPTED BEFORE RESOLUTION
COUNTS: BLOCKER 1 / REQUIRED 8 / OPTIONAL 7
```

The critic returned these findings in the required structured review:

| ID | Severity | Category | Claim / required resolution |
| --- | --- | --- | --- |
| GM-01 | BLOCKER | Evidence | Commit current pilot summary, invocation, logs, process ledger and verification evidence. |
| GM-02 | REQUIRED | Atomicity | Recover durably from process death after a partial promotion and a `WRITE_AHEAD` manifest. |
| GM-03 | REQUIRED | TOCTOU | Acquire the project lock before rollback hash checks. |
| GM-04 | REQUIRED | Ownership | Never substitute a random nonce when the OS start token cannot be observed. |
| GM-05 | REQUIRED | Action gate | Enforce gate metadata and block writes when foreign GameMaker processes exist. |
| GM-06 | REQUIRED | Determinism | Exclude volatile process/status data from the deterministic snapshot binding. |
| GM-07 | REQUIRED | Boundary | Do not export internal transaction/process primitives from the public barrel. |
| GM-08 | REQUIRED | Reproduction | Make the pilot build itself and require explicit machine/toolchain paths. |
| GM-09 | REQUIRED | Runtime evidence | Preserve direct evidence for the claimed runtime signal and owned Runner. |
| GM-10 | OPTIONAL | Paths/TOCTOU | Harden trailing-space aliases and the final pre-rename check. |
| GM-11 | OPTIONAL | Determinism | Replace locale-sensitive ordering with bytewise ordering. |
| GM-12 | OPTIONAL | Verification | Bind verification to the applied manifest's plan hash. |
| GM-13 | OPTIONAL | Contract | Publish the complete adapter error taxonomy. |
| GM-14 | OPTIONAL | Durability | Remove stale `.next` files and fsync durable transaction writes. |
| GM-15 | OPTIONAL | Documentation | Replace stale builder HEAD/test counts. |
| GM-16 | OPTIONAL | Packaging | Add the missing adapter dry-run packaging gate. |

DeepSeek was restricted to inspection and critique. Codex remained the only
builder and integrator.

## Post-resolution recheck

The same model independently reviewed clean detached commit `44a7b03`, again
with edit permission denied. It cryptographically recomputed both STATE-A/B
fingerprints, plan/content hashes, invocation command hashes, manifest-ledger
bindings and the capability evidence pin. Its verdict was `ACCEPTED AFTER
RESOLUTION`: all prior findings closed, no new BLOCKER or REQUIRED, and four
new OPTIONAL precision/hardening notes (`OPT-1` through `OPT-4`). Those four
notes are resolved in the final Codex integration and listed in
`20-critic-resolution.md`. Edits made by DeepSeek: none.
