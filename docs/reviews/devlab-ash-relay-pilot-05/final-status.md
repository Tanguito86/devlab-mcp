# DEVLAB-ASH-RELAY-PILOT-05 final status

## Disposition

```text
DEVLAB-ASH-RELAY-PILOT-05:
COMPLETED / VERTICAL_SLICE_VERIFIED

QUALITY_CLAIM:
FUNCTIONAL PRODUCTION PILOT
NOT PREMIUM
```

ASH RELAY is a complete original 3D arcade vertical slice built from the single
canonical DevLab scaffold materialization. All mandatory product and validation
gates pass.

| Mandatory gate | Final result |
| --- | --- |
| build | PASS |
| typecheck | PASS |
| tests | 25/25 PASS |
| native hardware WebGPU | PASS |
| visible TSL | PASS |
| title-to-victory | PASS |
| desktop controls | PASS |
| touch controls | PASS |
| checkpoint restore | 10/10 PASS |
| clean restart | 10/10 PASS |
| bot softlocks | 0 |
| frozen determinism | 10/10 states PASS |
| resource growth | BOUNDED |
| lifecycle | 10/10 PASS |
| device loss and live recovery | PASS |
| console/page errors | 0 |
| external network requests | 0 |

Independent critic results:

| Critic | P0 | P1 | P2 | Verdict |
| --- | ---: | ---: | ---: | --- |
| gameplay | 0 | 0 | 3 | PASS |
| visual | 0 | 0 | 4 | PASS |
| technical re-review | 0 | 0 | 3 | PASS |

The technical critic's initial device-loss P1 block is preserved in the record
and was closed with new runtime evidence, not a product change. Both authorized
product correction cycles are exhausted; no third cycle was opened.

## Canonical evidence

```text
EVIDENCE_ROOT:
C:/Users/Deposito/AppData/Local/DevLab/pilot-runs/DEVLAB-ASH-RELAY-PILOT-05-20260804T092006

CANONICAL_DIRS:
bot-playtest-r2-final
determinism-desktop-r11-final
determinism-mobile-r10-final
runtime-gauntlet-r3-final
device-loss-r3-final
resize-final

EVIDENCE_MANIFEST_SHA256:
e9dee1a2af713e171c9208929e09c6f8a04d2802eae648c5b30bf451ad4dbaea

TOOLING_MANIFEST_SHA256:
8f20b95b435387e7b9882b3e30f5fbc0794cd0c2a8423b8c415e6ae8240d714d

EVIDENCE_FILES: 761
EVIDENCE_AGGREGATE_SHA256:
57ba755b066b77bb071fc28a1ac04281b522bd0c37a7607fb93c1069d5aabd9f

GAME_FILES_EXCLUDING_DIST_AND_NODE_MODULES: 34
GAME_AGGREGATE_SHA256:
50f8d4410e0af347b94c5b8e5878535150119c65b32af0f77245c06a8a566841
```

All other run directories are historical, failed, probing, or superseded and
remain preserved. The aggregate includes `tooling-manifest.json`, which binds
the three final validation-runner hashes.

## Git integration gate

Immediately before the final Git step, authoritative `master` must still be
clean at
`787748cc0927315e5372af5929b5dfc0ca8714cb`. The authorized integration is one
commit on `devlab-ash-relay-pilot-05` followed by `merge --ff-only`. Push, tag,
merge commit, squash, and rebase remain prohibited. The resulting commit ID is
reported in the external handoff rather than self-referentially embedded here.

Residual gameplay/visual P2 items are polish opportunities: a distinct
tutorial aim check, human timing/feel validation, small-enemy readability,
dark-component separation, richer VFX, and mobile localization margins.

The final technical re-review's three P2s are also explicit:

- post-loss movement may include some prior inertia, while the new shot and its
  procedural voice are the stronger causal input proof;
- the device report evaluates but does not serialize the positive
  geometry/program counts behind `resourcesRebuilt`; and
- the runner SHA is outside that report and is instead bound by
  `tooling-manifest.json` plus the final evidence aggregate.

Additional measurement limitations retained from the initial review are the
lack of GPU timestamp profiling, indirect `AudioContext` instance counting, and
weaker per-report provenance in older standalone capture flows.
