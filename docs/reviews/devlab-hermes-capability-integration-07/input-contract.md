# Input contract

Canonical logical space is screen-right/screen-up projected into consumer world space by an injected `DirectionTransform`.

Tests assert W/up, S/down, A/left, D/right; cursor right/right; cursor top/up; projectile/player facing alignment; touch parity; FIRE distinct from INTERACT; MOVE independent from FIRE; and pointer cancellation scoped to the cancelled pointer. Camera and ray-plane details remain in the renderer consumer.
