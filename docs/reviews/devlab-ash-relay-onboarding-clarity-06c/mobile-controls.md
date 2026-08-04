# Mobile controls

Mobile keeps the existing left MOVE control and right FIRE/aim control, and adds an independent ACTIVATE button visible only inside the real interaction range.

Each surface owns its active pointer id. MOVE, FIRE, and INTERACT therefore support simultaneous pointers without intent crossover. `pointerup` and `pointercancel` clear only the matching owner. Pointer capture is best-effort because synthetic and browser-cancelled pointers may no longer be capturable; ownership does not depend on capture succeeding.

The MOVE and FIRE sticks now expose explicit screen-direction vectors and share the desktop camera conversion. Moving either control toward screen-right or screen-top therefore produces the same logical direction as keyboard movement or cursor aim; portrait does not add a second inversion. Hidden nearest-enemy auto-aim is not used.

The button is outside the FIRE surface, disappears out of range or after the beat transition, and is suppressed while paused or HELP is open. Both contracted portrait sizes are covered by exact frozen captures; human touch discoverability remains pending.
