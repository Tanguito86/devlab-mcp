# Resource and lifecycle review

| Area | Finding | Decision |
|---|---|---|
| animation loop | `Loop.stop()` cancels its rAF | confirmed |
| keyboard/touch listeners | `InputController.dispose()` removes them | confirmed |
| audio unlock listeners | not removed if disposed before first interaction | adaptation required |
| audio context | close requested during dispose | partial; async completion not awaited |
| player/pickups | explicit disposal present | confirmed |
| arena geometry/materials | never explicitly disposed | leak on HMR/recreate |
| floor CanvasTexture | never explicitly disposed | leak on HMR/recreate |
| `dispose.ts` | never imported | dead code |
| renderer | renderer disposed | insufficient for scene-owned resources |
| repeated restart | resets entities in place | bounded for this minimal run |

The scaffold has no user pause, game over, checkpoint, save, restart flow or
victory screen. `complete` is a pickup-completion flag and a test state, not the
vertical slice lifecycle. Mobile movement exists, but the scaffold has no
combat, threats, boss, checkpoint restoration or full audio state management.

The benchmark must implement lifecycle ownership in the internal scaffold and
measure repeated restart/resource growth. No upstream disposal code is adopted.
