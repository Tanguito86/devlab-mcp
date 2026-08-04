# Ash Relay reference migration

The canonical 06C build was not modified. A copy was created at the governed external run root and linked to the local kit package.

Ash Relay directly consumes kit implementations for fixed step, seeded RNG, resource ownership, viewport normalization, and camera-direction conversion. Its game-specific adapter configures kit pools, hatches/spawn queue, encounters, checkpoint provider, and 540 HP causal boss FSM. Existing proven simulation remains the gameplay authority where a wholesale replacement would add risk without changing the reusable contract.

This is an incremental V1 reference consumer, not a claim that every Ash Relay hot-path subsystem was rewritten. Consumer typecheck, tests, build, bot, adversarial lifecycle, frozen parity, browser/device-loss, hardware WebGPU, console, and network results are recorded separately.
