# AB-04A materializer security

## Publication model

The stdlib-only materializer verifies the complete contract snapshot before it
copies anything. It authenticates the exact 22-file internal scaffold, copies
to a fresh hidden `.partial-*` directory, reinventories canonical and raw
bytes, writes the three baseline metadata files and only then renames staging
to `leg-a` or `leg-b`. Failure removes staging and never merges or overwrites a
destination.

The run root must be an absolute direct child of
`H:/UserData/Deposito/Documents/devlab-runs`, with either the production name
or the authorized validation prefix. Unsafe relative paths, BOM/malformed
UTF-8, links, junctions, irregular files, committed `node_modules`, `dist`,
`.git`, React/R3F, remote URLs and unexpected file types fail closed.

`compare-baselines` authenticates each materialized copy against its own
manifest and the current contract before comparison. It checks both canonical
and raw-byte trees, so equal tampering or newline normalization cannot create a
false A/B match.

## Immutable verification inputs

Contract, prompt, gates, policies, result schema, rubric, source policy and
guidance manifest are one-read, hash-checked, deep-frozen snapshots. The
materializer, guidance broker and result verifier reuse those snapshots rather
than reopening authenticated control files.

The source verifier additionally requires the external checkout to be clean,
detached at `7221c1f4a6d2ae189a4d85d058d24f3228499d46`, and to match all
25 allowlisted canonical hashes.

## Authenticated guidance broker

The command requires all three identities:

```text
benchmark:ab04:read-guidance -- --path <manifest-path> --pair-id <pair-id> --run-id <run-id>
```

It also requires `DEVLAB_AB04_BROKER_HMAC_KEY`, exactly 32 bytes encoded as 64
hex characters. The key belongs only to the coordinator/executor. Every read
appends a canonical JSONL record at
`coordinator/guidance-broker/<pairId>/<runId>.jsonl`, signed with HMAC-SHA256
over sequence, pair, run, LEG_B, contract, source HEAD, manifest, path and
content hash.

`verify-result` reads the trusted coordinator ledger outside the leg result,
checks its HMAC and sequence, requires the evidence artifact to be an exact
copy, requires every declared receipt in the same order, and rechecks each path
against the frozen allowlist. Forgery, replay into another pair/run, reordered
or missing receipts, a wrong leg and ledger substitution are rejected.

## Result hardening

The result verifier rejects intermediate junction escapes, rebinds all fixed
control artifacts to canonical bytes, validates real PNG structure and CRC,
checks RGBA dimensions/length, parses bot and performance JSON, requires three
repetitions of each of the five exact scenarios, authenticates browser/GPU and
determinism fields, rejects failed gates and recomputes weighted scores. The
pair comparator requires matching controlled environment and only compares two
eligible results.

## Evidence and tests

Final materialization evidence:

```text
CONTRACT_SHA256: 852676a9255dc01c32828100b8b327bab9337579a43bc4e226be9e8de3f43482
SCAFFOLD_TREE_SHA256: c085bed4d3b3c52fc6d87eab44e0a9ee54cdf3891d5ba59154a57d16cf363908
SCAFFOLD_FILES_PER_LEG: 22
INITIAL_COMPLETE_FILES_PER_LEG: 25
INITIAL_COMPLETE_TREE_SHA256_CANONICAL_AND_RAW: 913da32c44b66502cf44ec2641dd3fee4583b6680b00efd8464efafda481ea9b
FINAL_MATERIALIZER_REPRODUCTION: R12 PASS
FINAL_MATERIALIZER_SHA256_CANONICAL_LF: e3c3052fc1e434c417c18c1d2410e35e8d461c7dfaaeffd80074609c67891c87
TARGETED_POLICY_AND_MATERIALIZER_TESTS: 43/43 PASS
```

R12 is the final materializer and native-smoke reproduction at
`H:\UserData\Deposito\Documents\devlab-runs\ab04a-scaffold-validation-20260803T201832-r12`.
It materialized both 22-file scaffolds with the final script, compared the two
complete 25-file trees at the canonical/raw hash above, and then validated both
legs through the final authenticated smoke runner. R11 proved the Playwright
package trees but still reduced the browser distribution to `chrome.exe`; R12
adds the complete 308-file Chromium tree. All earlier rounds are superseded and
are not acceptance evidence.

The targeted suite covers traversal, link/junction containment, atomic cleanup,
symmetric tampering, snapshot reuse, exact evidence types, ineligible gates,
scenario completeness, forged broker receipts, PNG/RGBA equivalence, trusted
containment evidence, metric aggregation and pair-root independence.

## Executor boundary

Source-level controls do not turn sibling directories into an OS sandbox. The
future AB-04 executor must apply leg-only ACLs, keep the HMAC key and trusted
ledger outside builder visibility, deny direct checkout access and enforce
global process/lifecycle-script egress. AB-04A proves the fail-closed protocol,
offline Corepack/pnpm resolution and browser network blocking; it does not
claim kernel-level containment for a benchmark that was not run.
