# ASH RELAY technical critic

## Initial independent verdict

```text
TECHNICAL_CRITIC: BLOCK
P0: 0
P1: 1
P2: 3
```

The initial read-only review confirmed fixed timestep, interpolation, seeded
RNG, pools, native WebGPU/TSL, exact captures, resize, controls, performance,
lifecycle, and zero runtime/network errors. It correctly blocked because the
generic frozen device-loss flow did not directly prove exact gameplay state,
live-loop restart, trusted input, and audio after recovery on the same page.

Its original documentary P2 observations were also retained: standalone
capture reports did not all embed a dist-tree hash; performance is a CPU/rAF
proxy rather than GPU timestamping; and lifecycle voice counts do not directly
count `AudioContext` instances.

## Evidence-only resolution

No game source changed. The dedicated
`ash-relay-device-loss-postrecovery.mjs` runner exercised the same final dist
and produced `device-loss-r3-final/report.json`. It proved exact snapshot and
deterministic hash through generation 1 -> 2, restarted one live loop, then
observed trusted movement, a new shot, a procedural voice, 17 stable listeners,
one canvas, a valid capture, and zero errors or external requests.

## Final re-review verdict

```text
TECHNICAL_CRITIC: PASS
DEVICE_LOSS: PASS
P0: 0
P1: 0
P2: 3
MODIFIED_CODE: NO
```

The critic independently confirmed:

- report SHA-256
  `b3f5fbe79ddee8b0e6d5746fb83bfadfc047b69f0243b4c7f796e25da0134c57`;
- runner SHA-256
  `665676a3ba83add885fdd26cbbacd440d178d1b92cd4201f857624595a7c902a`;
- final dist tree
  `0528cd921e83a8ceca22e08d024abb77cf0a75368dc3079ad8033ecf3950746b`
  and all four file hashes;
- fail-closed paths, browser attestation, loopback-only routing, timeouts,
  failure artifact, and cleanup in the supplemental runner;
- 60 Hz fixed-step accumulator, maximum eight catch-up steps, interpolation,
  pause/freeze, seeded RNG with zero runtime `Math.random`, and preallocated
  24/96/48/192 pools;
- hardware NVIDIA/Turing WebGPU, visible TSL, exact desktop/mobile captures,
  resize matrix, desktop/touch controls, performance, 10/10 lifecycle, and zero
  page/network errors.

The final three device-flow P2s are non-blocking:

1. post-loss movement does not separately measure zero-input drift, although
   the new shot and its audio voice are causally post-recovery;
2. the report's `resourcesRebuilt` gate does not serialize the positive
   geometry/program counters, while generation 2 and valid native capture
   demonstrate reconstruction operationally;
3. the runner SHA is recorded outside the report. The final
   `tooling-manifest.json` and evidence aggregate bind that hash.

The original performance, provenance, and indirect-audio caveats remain
documented in their dedicated reports but do not reopen a mandatory gate.
