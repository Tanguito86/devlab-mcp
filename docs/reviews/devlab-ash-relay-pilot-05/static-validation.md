# ASH RELAY static validation

## Final result

```text
FROZEN_OFFLINE_INSTALL_GAME: PASS
FROZEN_OFFLINE_INSTALL_DEVLAB: PASS
TYPECHECK: PASS
TESTS: 25/25 PASS
BUILD: PASS
AB04_VERIFY: PASS
RUNNER_SYNTAX: PASS
DIFF_CHECK: PASS
```

The definitive static rerun used `pnpm@9.15.4` and the final product source.
The game and DevLab worktree both completed `install --offline
--frozen-lockfile` without changing their lockfiles. The game then completed
`tsc --noEmit`, all 25 Node tests, and the Vite production build.

The test set covers the 60 Hz accumulator and bounded catch-up, frozen time,
seeded RNG, resource ownership, scaffold/capture contracts, full simulation
route, Guardian armor locks, defeat/restart/checkpoint restore, pools, and
viewport planning.

## Artifact identity

| Artifact | SHA-256 |
| --- | --- |
| game `pnpm-lock.yaml` | `34c3f2f1f78a990e59131adecbdc70a9ddac38443b8feaec7588580055a98688` |
| DevLab `pnpm-lock.yaml` | `cbca2644251bab68a706a8002a9864f475d4cd0a96936edd0ff5ebeeb9446b76` |
| final dist tree | `0528cd921e83a8ceca22e08d024abb77cf0a75368dc3079ad8033ecf3950746b` |
| `assets/index-BqaPfSnq.js` | `db28895258c6fcb96d9083e271bb80c0ed5d9faf7675c3ca72518452d05fcaec` |
| `assets/index-BP-KjUCp.css` | `be26ec8d7f690b715d5037d806cbf94311f26c8cf99c678256c3c8c2f2b926cf` |
| `capture-manifest.json` | `b9979b28095c1364035b5c37b2da17cb00c81f4b744d743046fa3a29bc2aeaa1` |
| `index.html` | `246e996ffd9ffe32ff4b62fc625d375270dc501d961631763971f770af35bc4f` |

The AB-04 verifier reconfirmed contract
`852676a9255dc01c32828100b8b327bab9337579a43bc4e226be9e8de3f43482`,
scaffold tree
`c085bed4d3b3c52fc6d87eab44e0a9ee54cdf3891d5ba59154a57d16cf363908`,
source head `7221c1f4a6d2ae189a4d85d058d24f3228499d46`, and 25 allowlisted
guidance paths.

## Validation tooling

`node --check` passed for all three versioned runners:

| Runner | SHA-256 |
| --- | --- |
| `ash-relay-runtime-gauntlet.mjs` | `b6e1322e14f9397d1ea93a0680bb6b1669ef7072c84ebbea1036221cc22994e1` |
| `ash-relay-device-loss-postrecovery.mjs` | `665676a3ba83add885fdd26cbbacd440d178d1b92cd4201f857624595a7c902a` |
| `ash-relay-hash-manifest.mjs` | `3763ac455a6de541d389a24f6712a0b363fc12916bb8f45e357b22c3e7b0a503` |

These runner hashes cover the UTF-8/LF bytes used to execute the evidence and
stored in the staged Git blobs. This repository has `core.autocrlf=true`, so a
later Windows checkout may expose CRLF working-tree bytes without changing the
canonical committed content.

Vite emitted a non-blocking large-chunk advisory for the 947.39 kB minified
bundle and Node emitted the upstream `url.parse` deprecation warning. Neither
was a build error. No lockfile drift or unexpected generated file is accepted
into Git.
