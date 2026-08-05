# 20 — Codex critic resolution

Every BLOCKER and REQUIRED finding was accepted and fixed. The optional set was
also resolved; none is deferred.

| ID | Disposition | Resolution and evidence |
| --- | --- | --- |
| GM-01 | ACCEPTED / FIXED | Versioned `evidence/pilot-summary.json` and both positive/negative invocation, log, process, verify, manifest and ledger sets. |
| GM-02 | ACCEPTED / FIXED | Durable `WRITE_AHEAD` recovery classifies before/after hashes and restores only promoted files; package test covers a simulated hard boundary. |
| GM-03 | ACCEPTED / FIXED | Rollback now locks the canonical project before inspection or hash checks. |
| GM-04 | ACCEPTED / FIXED | Ownership requires the real OS creation token; missing identity fails closed. |
| GM-05 | ACCEPTED / FIXED | Every public method enforces the declared capability/gate; foreign GameMaker, Igor or Runner blocks apply and compile/run verification without termination. Rollback remains an explicit, locked recovery path. |
| GM-06 | ACCEPTED / FIXED | Snapshot binding hashes only deterministic project content/metadata; volatile process, warning and dirty-status observations remain outside that hash. |
| GM-07 | ACCEPTED / FIXED | Root package exports only the six-method adapter contract, public types/capabilities and errors; internal modules require explicit package subpaths and are not public exports. |
| GM-08 | ACCEPTED / FIXED | Root `gm-bridge:pilot` builds first; the script requires explicit work root, Igor, ProjectTool, runtime and user-dir arguments. |
| GM-09 | ACCEPTED / FIXED | Current positive compile log records `GM_BRIDGE_PILOT_VALUE=2`; invocation, OS identities, Runner attribution and exit are versioned beside it. |
| GM-10 | ACCEPTED / FIXED | Trailing-space path segments are rejected and the destination after-hash is rechecked immediately before destructive rename. |
| GM-11 | ACCEPTED / FIXED | Deterministic file ordering uses UTF-8 byte comparison. |
| GM-12 | ACCEPTED / FIXED | Verify requires an `APPLIED` manifest whose plan hash equals the request plan hash. |
| GM-13 | ACCEPTED / FIXED | Capability contract declares the complete 23-code error taxonomy; 21 codes are currently emitted and two are reserved contract values. |
| GM-14 | ACCEPTED / FIXED | Canonical writes remove stale `.next`, fsync the file, rename atomically and fsync the directory where Windows supports it. |
| GM-15 | ACCEPTED / FIXED | Builder and result documents distinguish the reviewed commit and resolved 64-test suite. |
| GM-16 | ACCEPTED / FIXED | Adapter exposes `pack:dry-run`; workspace packaging validation includes it. |

The post-resolution DeepSeek recheck accepted the target with no BLOCKER or
REQUIRED and raised four OPTIONAL notes. Codex resolved all four:

| ID | Disposition | Resolution |
| --- | --- | --- |
| OPT-1 | ACCEPTED / FIXED | Action-gate documentation now states the intentional recovery exception: rollback does not terminate or depend on foreign-process termination. |
| OPT-2 | ACCEPTED / FIXED | Rollback documentation now cites the current versioned STATE-A fingerprint. |
| OPT-3 | ACCEPTED / FIXED | Error documentation distinguishes the 23-code declared taxonomy from the 21 codes currently emitted. |
| OPT-4 | ACCEPTED / FIXED | Project-root resolution now occurs inside the apply `try/finally`, guaranteeing lock release if that resolution races with filesystem removal. |

Post-resolution adapter result: `64/64 PASS`. The repeated real pilot reports
`COMPLETED / HERMES_BRIDGE_PILOT_VERIFIED`, positive Igor exit `0`, expected
negative exit `1`, runtime signal observed, two byte-exact restores and zero
remaining owned processes.

```text
OPEN BLOCKERS: 0
OPEN REQUIRED: 0
OPEN OPTIONAL: 0
CODEX DECISION: ACCEPTED AFTER RESOLUTION
```
