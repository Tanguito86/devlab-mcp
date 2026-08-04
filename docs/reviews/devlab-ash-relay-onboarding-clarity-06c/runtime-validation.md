# Runtime validation

The definitive runtime gauntlet is stored outside Git under the 06C heavy-evidence root in `runtime-gauntlet-r5-input-direction-final` and is bound to final dist tree `0e7a533837dffc12930da3b340471a70d85d189c6762bd9a3d05452d9244344d`.

| Gate | Result |
| --- | --- |
| Contractual Chromium | 148.0.7778.96 |
| Executable SHA-256 | `290fa7018fda22c52ada5eddb0113baf3ebc41fd0fde6085eddb19793606c635` |
| Native WebGPU | PASS |
| Adapter | NVIDIA / Turing / hardware; no fallback |
| Desktop controls | PASS |
| Touch controls | PASS |
| Input direction | PASS: W screen-up `0.178`; desktop aim right/up `0.635/0.772`; touch aim right/up `0.707/0.707`; projectile alignment `1.0` in both modes |
| Performance | PASS |
| Lifecycle | 10/10 PASS |
| Sensitivity | PASS |
| Resource stability | PASS |
| Console/page/blocked requests | 0 / 0 / 0 |

Final matrix `onboarding-capture-matrix-r4-input-direction-final` covers all eight required 06C viewpoints at 1280x720, 412x915, and 390x844 with two repetitions each. PNG, RGBA, metrics, viewpoint order, file sets, diagnostics, browser attestation, and hardware adapter gates all pass exactly. Visual inspection confirmed distinct desktop/mobile copy, non-overlapping mobile controls, a single amber objective hierarchy, readable counters, and no live prompt or action control behind HELP.

Device-loss reconstruction in `device-loss-r3-input-direction-final` passes 9/9 states: four inherited (`tutorial`, `encounter-1`, `checkpoint`, `boss-phase-2`) and five 06C states (`tutorial-identify-player`, `tutorial-objective`, `tutorial-interact`, `objective-combat-counter`, `mobile-interact`). Every run proves detected loss, renderer/resource reconstruction, exact state coherence, one canvas/loop, restored trusted input/audio/capture, restored projected W/cursor/projectile direction, and zero runtime errors.

Superseded r1/r2/r3 capture evidence, the initial new-state device-loss precondition failure, and the aborted short-wrapper runtime directory remain preserved. They document earlier review and orchestration history; none is used as final PASS evidence.

No human discoverability or timing conclusion is inferred from these runtime checks.
