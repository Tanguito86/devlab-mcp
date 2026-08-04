# Topdown Shooter Kit architecture

`@tanguito/devlab-topdown-shooter-kit` is a TypeScript ESM workspace package with zero runtime dependencies. It is renderer-agnostic and keeps camera conversion behind `DirectionTransform`.

The package supplies simulation timing and seeded randomness, input and player control, fixed-capacity projectile/effect pools, bounded spawn queues and hatches, local encounter budgets, checkpoint projection/restore, causal boss FSM, lifecycle/resource/device ownership, audio cues, exact capture contracts, bot objectives, and QA contract names.

Game names, map coordinates, tuning, palette, story, concrete HUD/audio, and tutorial copy remain consumer-owned.
