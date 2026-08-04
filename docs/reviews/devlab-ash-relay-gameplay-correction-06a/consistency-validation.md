# Contract v2 consistency validation

## Baseline and scope

- DevLab base: `9ef8b08bd8a643fc74776a5ce56814d47c4efe9d`.
- Isolated branch: `devlab-ash-relay-contract-reconciliation-06a`.
- Game repository initialized: no.
- Game source or runtime files modified: no.
- External critic reports other than the rubric and correction brief modified:
  no. They remain historical 01B evidence.

## Automated checks

Command:

```powershell
$env:ASH_RELAY_CRITIC_ROOT = 'H:\UserData\Deposito\Documents\ash-relay-critic'
node --test tests\ash-relay-contract-v2.test.mjs
```

Result: `8/8 PASS`, `0 FAIL`, `0 SKIP`.

The suite proves:

1. canonical `8.5 / 100 / 540 / 24` values are retained;
2. the 75% activation floor and legitimate reset are defined;
3. Relay A ordering and lower difficulty are explicit;
4. encounter-local budgets and bounded queues replace the stale global cap;
5. the boss FSM, sweep, fan gaps, and attack-linked vulnerability agree;
6. stale values are isolated in a non-normative invalidation section;
7. the historical-score boundary is explicit; and
8. external critic rubric and brief are content-identical to their versioned
   sources after line-ending normalization.

`package.json` parses and `git diff --check` passes.

The convenience `pnpm run contract:ash-relay:v2:verify` did not reach the test
because a fresh-worktree install stopped at the repository's existing
`ERR_PNPM_IGNORED_BUILDS` policy for `esbuild@0.28.0`. No build was approved and
no policy was changed. The test has no package dependencies and passed directly
with Node as recorded above.

## LF-normalized SHA-256

These hashes normalize CRLF to LF before hashing. This makes the Git working
tree and external critic copies comparable without bypassing the repository's
line-ending policy.

| Artifact | SHA-256 |
| --- | --- |
| `core-loop-contract.md` v2 | `7F7A843C1443ECF9908E49905D3ECABB867269A10E599B4D80D13A9AFC91CFC8` |
| `encounter-plan.md` v2 | `523FC1AB826032DCDB20BA91FC086AD0CF5F580B652A3BCF4B8BECE23C9B30CA` |
| versioned `gameplay-rubric-v2.md` | `7C71B665244F1E9D9974A0A7D2AA8D10C7E11815CCEF814B89F4B04D288BE28B` |
| external `gameplay-rubric.md` | `7C71B665244F1E9D9974A0A7D2AA8D10C7E11815CCEF814B89F4B04D288BE28B` |
| versioned `codex-correction-brief-v2.md` | `FECE2BF026636E260109B6B64CFBD80E64BE25F6DAB90096B4248F2A77DA08AF` |
| external `codex-correction-brief.md` | `FECE2BF026636E260109B6B64CFBD80E64BE25F6DAB90096B4248F2A77DA08AF` |
