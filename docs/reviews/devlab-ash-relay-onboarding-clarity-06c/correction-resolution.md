# Correction resolution

The implementation resolves the code-level causes of `CONTROLS_AND_OBJECTIVE_DISCOVERABILITY`:

- Public intents are separated, including independent INTERACT and HELP.
- The tutorial advances through real player actions.
- A single simulation-owned objective drives HUD, counters, prompts, and markers.
- Player and objective visual hierarchies are distinct.
- Context state is range- and beat-derived, with same-tick stale removal.
- Mobile interaction has its own visible, range-gated surface and pointer owner.
- HELP is recoverable without resetting gameplay.
- Camera-relative movement uses one shared landscape/portrait ground basis: W/S are visual up/down and A/D visual left/right.
- Mouse aim now intersects the camera ray with the gameplay ground plane and subtracts the player position; touch aim uses the same screen-to-world basis.
- FIRE no longer substitutes hidden nearest-enemy auto-aim, and projectile velocity is checked against the public aim vector.

The reported `INPUT_AXIS_INVERTED` P1 is technically resolved and passes behavioral, native-WebGPU, desktop/touch, restart/checkpoint, lifecycle, and device-loss gates. The product owner accepted the corrected result while explicitly waiving replacement formal new-user, timing, and Hermes evidence. This is product acceptance with an evidence waiver, not a claim that those human gates ran.
