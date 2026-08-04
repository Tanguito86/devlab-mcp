# World markers

The active world objective uses one amber/orange hierarchy: vertical beacon, ground ring, emissive pulse, and local light. Inactive nodes remain secondary and do not emit the primary signal.

The player retains a cyan/white halo, an opening chevron, a short aim line, a contrast reticle, muzzle feedback, and impact feedback. The differing color and shape hierarchy separates player identity from the active objective.

`computeObjectiveIndicator` produces a normalized, viewport-aware off-screen arrow and suppresses it when the objective is already on screen. The marker is rebuilt from the current objective snapshot after resize, checkpoint restore, pause, capture restore, and GPU recovery.
