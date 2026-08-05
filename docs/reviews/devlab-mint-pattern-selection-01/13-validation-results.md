# Final validation results

Validation date: 2026-08-04

| Gate | Result |
|---|---|
| Monorepo build | PASS, 5/5 |
| Monorepo typecheck | PASS, 5/5 |
| Monorepo tests | PASS, 205/205 |
| Selective-pattern focused build | PASS |
| Selective-pattern focused tests | PASS, 32/32 |
| Capability registry | PASS, 3/3 |
| Ash Relay v2 regression | PASS, 7 passed / 1 intentional skip / 0 failed |
| JSON Schema draft 2020-12 meta-validation | PASS, 2/2 |
| Valid schema instances | PASS, 3/3 |
| Schema/runtime adversarial parity | PASS, 7/7 |
| SemVer edge cases | PASS, 3/3 |
| Package dry-run | PASS, 123 entries, no bundled dependencies |
| Runtime Mint/CDN/R3F/SparkJS/splat scan | PASS, 0 matches |
| Uncontrolled `Math.random` scan in new runtime scope | PASS, 0 matches |
| Runtime network API scan in new runtime scope | PASS, 0 matches |
| Lockfile change | PASS, none |
| Exact new-blob match against the pinned Mint checkout | PASS, 0 matches |
| Secret fallback scan | PASS, 0 matches across the 38 prospective changed files; `gitleaks` was unavailable |
| Files larger than 10 MiB | PASS, 0 across 574 prospective repository files |
| External corpus pin and cleanliness | PASS, `dbce43c045d69cdf78cbfc4f0c4aec0c3e9fd0c8`, clean |

The global count exceeds the required 189-test baseline. Lifecycle hash comparisons, fixed-seed fog replay, mid-sweep byte-equivalent snapshot/restore, restart and device-loss preservation are covered by the focused suite.

`git diff --check` passes. Documentation hash verification and a staged diff check are performed after the documentation set is complete and before the authorized commit.
