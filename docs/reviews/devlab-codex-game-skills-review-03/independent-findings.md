# Independent findings

## Confirmed

- The repository's strongest value is process guidance: compact design briefs,
  core-loop/encounter planning, phase evidence, visual review and playtest QA.
- The external scaffold is WebGL-only and cannot replace DevLab's verified
  WebGPU stack.
- Generator credentials are optional but their scripts perform real paid API
  operations. They are irrelevant and prohibited for this benchmark.
- The scaffold exposes useful seed/state/screenshot hooks, but exposes them in
  every build without a production guard.
- Live motion uses a clamped variable delta. Seeded RNG does not make a live
  replay byte deterministic.
- Pause, game over, checkpoint, save, restart, victory and complete audio
  lifecycle are instructions for generated games, not implemented scaffold
  systems.

## Corrected or narrowed

- Frozen-state pixel equality is eligible only after the DevLab capture adapter
  verifies seed, state, time, readiness and render completion. The upstream
  template's 1.5% screenshot tolerance is not proof of byte equality.
- Entropy, edges, contrast and nonblank output detect certain failures and
  relative changes. They cannot automatically establish composition,
  readability or artistic quality.
- Softlock windows are diagnostic. Legitimate waiting, collision or arena-edge
  behavior can produce false positives; objective context and human review are
  required.
- DevLab owns browser selection, software-adapter rejection, WebGPU probing,
  capture decoding, A/B comparison, evidence integrity and release decisions.

## Decision

Use selected text as `ADAPT` or `REFERENCE_ONLY` guidance under a hashed,
read-only allowlist. Reject installation, scripts, generators and scaffold use.
The value must be demonstrated by the separately authorized A/B benchmark.
