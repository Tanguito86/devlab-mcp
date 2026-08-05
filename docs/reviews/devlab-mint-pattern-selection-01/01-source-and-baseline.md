# Source and baseline

The external corpus is a read-only reference:

```text
SOURCE: mintdotgg/mint-playground
PATH: mint-playground-intake/source/ (external read-only checkout resolved locally)
PIN: dbce43c045d69cdf78cbfc4f0c4aec0c3e9fd0c8
TREE: 181618f5852f620eff6b51880130ef1723c22879
WORKTREE: CLEAN
INSTALL/BUILD/MODIFICATION: NONE
INTAKE_HASHES: 23/23 PASS
```

The authoritative review is `24-codex-review-brief.md` from
`OPS-MINT-PLAYGROUND-INTAKE-01H`, whose final state is
`COMPLETED / SELECTIVE_PATTERN_INTAKE_READY`.

## Identifier reconciliation

The intake used P-01 for the product capsule and P-03 for visibility. This sprint is the authority for implementation identifiers and intentionally uses:

| Sprint ID | Intake candidate | Meaning |
|---|---|---|
| P-01 | P-03 | visibility lifecycle adapter |
| P-02 | P-02 | local hashed asset registry |
| P-03 | P-01 | `experience.json` v2 product capsule |
| PILOT-A | P-06 | fog-of-war tiers |

This mapping prevents historical evidence from being misread as an implementation contract.
