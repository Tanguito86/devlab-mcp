# PILOT-A design — deterministic fog tiers

Verdict: `AUTHORIZED / BOUNDED_IMPLEMENTATION`

## Original scenario

The pilot is a synthetic rectangular grid called **Signal Grid**. It has neutral blockers and one or two visibility emitters. It uses no external art, names, layouts, shaders, or assets.

## Simulation model

```text
TIER_0 UNKNOWN
TIER_1 DETECTED
TIER_2 REVEALED
TIER_3 CURRENTLY_VISIBLE
```

`FogSystem` owns only tactical state. Each cell stores persistent knowledge (0–2) and current visibility. Visibility sources have stable IDs, integer cells, a reveal radius, and a detection radius. Integer Bresenham line-of-sight blocks through configured obstacle cells.

Updates are deterministic sweeps driven by the caller's fixed timestep. `updateBudgetCells` bounds visibility evaluations per call. A sweep snapshots and canonically sorts sources; if it spans several ticks, later input is accepted only by the next sweep. Work is accumulated in a pending buffer and becomes visible atomically only when the complete sweep commits, preventing partial-tier flicker. The seed defines deterministic scan ordering and is serialized. No random API is used.

## Snapshot contract

Snapshots contain dimensions, seed, scan state, committed and pending cell state, pending transitions, obstacles, and any in-progress source set. Restore enforces cell invariants, canonical source ordering, and the exact processed-cell prefix before reproducing canonical serialized bytes. Restart restores the initial all-unknown state while preserving immutable configuration.

## Renderer boundary

The pilot renderer is textual. It consumes `FogSnapshot` only and cannot mutate or own tactical state. A future Canvas, WebGPU, or TSL renderer can replace it without changing simulation.

## Device loss

Fog state is simulation state. `DeviceHost` may rebuild renderer resources while the fog snapshot hash remains unchanged. The pilot has no WebGL/WebGPU dependency, so it neither weakens nor bypasses device-loss recovery.
