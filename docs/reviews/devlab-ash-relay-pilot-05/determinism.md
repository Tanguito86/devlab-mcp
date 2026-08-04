# ASH RELAY determinism

## Frozen-state gate

The final cross-process matrices passed exact PNG bytes, decoded RGBA bytes,
normalized metrics, viewpoint order, and output-file-set equality.

| Matrix | States | Result | Summary SHA-256 |
| --- | ---: | --- | --- |
| `determinism-desktop-r11-final` | 9 | PASS | `f27e5d01a4ac4dfcf950920a4841595eabeffee4b5312a4a91b938e2b04f3f09` |
| `determinism-mobile-r10-final` | 1 | PASS | `128108c31748347cb0c9095444162b67098c78c98e219113920c0ec5fb932970` |

Desktop covers `title`, `tutorial`, `encounter-1`, `checkpoint`,
`encounter-2`, `boss-phase-1`, `boss-phase-2`, `defeat`, and `victory` at
1280x720. Mobile covers `mobile-active` at 390x844. Every state was captured in
two separate browser processes with seed 424242, the same frozen time,
viewpoint, viewport, contractual Chromium, and NVIDIA/Turing adapter.

The final matrices used the same final JS, CSS, and index artifact hashes.
Their older standalone harness summaries do not embed the dist-tree hash; this
provenance limitation is recorded as technical P2. The runtime sensitivity
suite and post-loss suite independently bind the current dist tree
`0528cd921e83a8ceca22e08d024abb77cf0a75368dc3079ad8033ecf3950746b`.

## Controlled-change gate

Changing only the seed from 424242 to 424243 changed exactly the five declared
seed-sensitive recipes:

| State | Changed pixels |
| --- | ---: |
| `encounter-1` | 115 |
| `encounter-2` | 85 |
| `defeat` | 117 |
| `victory` | 48 |
| `mobile-active` | 57 |

Unrelated changed viewpoints and unrelated pixel differences were both zero.
Evidence:
`runtime-gauntlet-r3-final/sensitivity/sensitivity.json`, SHA-256
`99a9870ffb7b4eb83d8d420290c1aed83ad782f1e4c1cdb4e847a4a1d7044742`.
The prior R2 probe used the same JS and demonstrated zero seed-dependent pixels
for checkpoint and both boss captures, justifying their exclusion.

Simulation uses its seeded generator and the source/test scan found zero
runtime `Math.random` calls. Superseded and failed attempts remain preserved;
only desktop R11 and mobile R10 are canonical.
