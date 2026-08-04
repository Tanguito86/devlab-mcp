# Spawn hatches

All standard enemies follow `HATCH_IDLE -> HATCH_TELEGRAPH -> SPAWN_COMMIT -> ENEMY_ACTIVE`. Five request slots are preallocated; queue high-water was 5 and rejected requests were 0.

Telegraphs last 0.65s and combine ring shape, directional ground marker, motion, emissive color, and prompt feedback. Commit checks arena bounds, 2.25 player clearance, and 1.5 enemy clearance; unsafe requests retry another authored hatch. Restart, checkpoint, and boss defeat clear requests and residual hostiles.
