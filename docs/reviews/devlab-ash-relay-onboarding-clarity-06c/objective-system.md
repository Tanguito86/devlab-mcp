# Objective system

The simulation is the sole authority for the visible objective. `ObjectiveSnapshot` contains:

`id`, `action`, `target`, `label`, `progress`, `counter`, `worldPosition`, and `status`.

Only one primary objective snapshot is emitted per tick. UI, overlay, world beacon, contextual prompt, and off-screen indicator consume that same snapshot.

Copy is action-first: reach, activate, defeat, or extract. Combat counters derive from active committed enemies; queued hatches, inactive pool objects, released enemies, and projectiles are excluded. Checkpoint restore rebuilds the correct objective from restored simulation state.
