# ASH RELAY correction resolution

The sprint allowed at most two bounded correction cycles after independent
review. Both were used; no rewrite and no third product cycle occurred.

## Cycle 1 - functional and technical closure

The first complete builder pass was corrected within the following bounded
scope:

| Finding | Resolution |
| --- | --- |
| pause modal primary action did not resume | primary action resumes when the engine pause overlay is active |
| renderer disposal treated a synchronous method as a Promise | guarded synchronous cleanup always reaches host cleanup |
| Ward wind-up lacked a strong read | the orange aperture grows and pulses during telegraph |
| camera-relative controls used raw world axes | keyboard, pointer, and touch share the camera basis |
| encounter began before node activation | both sections activate the node before spawning combat |
| failed audio unlock could remain cached | rejected unlock clears its Promise and can be retried |
| renderer counters accumulated across frames | renderer info resets exactly once per rendered frame |
| evacuation was not a held objective | the lift requires a 1.5 second hold after the Guardian |
| held attack could restart defeat | recovery requires a fresh explicit restart edge |
| generic scaffold README remained | README now describes ASH RELAY and its contracts |

Encounter damage and phase minimums were also tuned so the deterministic
autopilot could complete the route without removing health risk. Earlier
evidence was retained as non-final.

## Cycle 2 - final determinism, boss clarity, and validator correctness

Cross-process native-WebGPU capture exposed intermittent one-channel,
one-least-significant-bit differences. The bounded resolution was:

- replace the translucent title composition with an opaque, pixel-aligned
  procedural industrial card;
- mark the renderer dirty when seed, time, viewpoint, resize, or device recovery
  changes;
- on the first frozen render after a dirty change, submit four identical
  frames; later frozen renders submit two;
- before final capture, perform one decoded warm-up readback, submit two
  identical renders, await the GPU queue fence, then read the evidence frame;
- keep simulation state and capture time frozen throughout settlement.

The same final cycle resolved these functional and validation findings:

- Guardian phase 1 now has a 20-second invulnerable armor lock at 50% health;
- Guardian phase 2 has a 25-second armor lock at 10% health;
- HUD, prompt, and overlay explicitly say `ARMOR SEALED — SURVIVE Ns`, so the
  survival gate cannot be mistaken for ignored damage;
- pause/resume validation now polls synchronous metrics from Node instead of
  passing an async Promise to `page.waitForFunction`;
- seed sensitivity is declared only for the five states demonstrated to change:
  `encounter-1`, `encounter-2`, `defeat`, `victory`, and `mobile-active`;
- objective wording, Guardian capture health, and checkpoint retry layout were
  corrected before the definitive matrix.

The full final matrices are `determinism-desktop-r11-final` and
`determinism-mobile-r10-final`. The definitive runtime gauntlet is
`runtime-gauntlet-r3-final`. Failed and superseded directories, including the
superseded but passing `determinism-desktop-r10-final` and the one-LSB failing
`determinism-mobile-r9-final`, remain intact.

No third correction cycle is available. A later P0/P1 requiring product changes
blocks integration instead of reopening implementation.
