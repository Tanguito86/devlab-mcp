# PILOT-A and selective-pattern test matrix

| Area | Case | Required invariant |
|---|---|---|
| P-01 | hide before tick | zero simulation updates |
| P-01 | hide at partial accumulator | interpolation fraction preserved exactly |
| P-01 | repeated hide/show | idempotent transitions and one loop |
| P-01 | synchronously hidden startup | zero loop starts |
| P-01 | manual pause before startup | zero loop starts until manual resume |
| P-01 | manual pause + visibility | manual pause remains authoritative |
| P-01 | visibility + restart | restart occurs without hidden loop restart |
| P-01 | visibility + device loss | simulation hash unchanged |
| P-01 | control comparison | state, RNG position, clock and accumulator hash equal |
| P-02 | valid local registry | actual size and SHA-256 pass offline |
| P-02 | duplicate ID/path | readable validation error |
| P-02 | remote/data path | rejected before loading |
| P-02 | encoded traversal/network provenance | rejected before loading |
| P-02 | whitespace-padded URI schemes | rejected before loading |
| P-02 | missing file | `MISSING_FILE` |
| P-02 | tampered bytes/hash | `HASH_MISMATCH` |
| P-02 | canonical serialization | repeated output byte-identical |
| P-03 | schema files | parse as JSON Schema draft 2020-12 |
| P-03 | minimum/complete examples | runtime validator pass |
| P-03 | explicit distribution root | registry and provenance resolve locally |
| P-03 | registry relationship | `entryCapability` exists |
| P-03 | future/invalid values | readable path-based errors |
| PILOT-A | small synthetic grid | tiers 0, 1, 2 and 3 observable |
| PILOT-A | bounded sweep | evaluations per call respect configured budget |
| PILOT-A | partial sweep | committed renderer view remains stable until atomic commit |
| PILOT-A | fixed-seed replay | canonical snapshots and text output equal |
| PILOT-A | fixed-step driver | fog updates occur only inside accumulator callbacks |
| PILOT-A | mid-sweep snapshot/restore | serialized bytes equal |
| PILOT-A | adversarial restore | invalid cells, ordering and pending state rejected |
| PILOT-A | restart | all cells return to unknown |
| PILOT-A | device loss | fog snapshot hash unchanged |

The focused suite is `packages/topdown-shooter-kit/tests/selective-patterns.test.js`. Global regression must remain at or above the published 189-test baseline.
