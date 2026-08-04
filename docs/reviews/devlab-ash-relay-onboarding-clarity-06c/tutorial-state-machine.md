# Tutorial state machine

The state machine lives in the deterministic simulation and is included in the deterministic state hash.

| State | Required public evidence | Primary copy |
| --- | --- | --- |
| `IDENTIFY_PLAYER` | first real displacement | `YOU` |
| `LEARN_MOVE` | accumulated movement >= 1.1 world units | `WASD — MOVE` |
| `LEARN_AIM_AND_FIRE` | observed aim plus at least one shot | `MOUSE — AIM / LEFT CLICK — FIRE` |
| `LOCATE_OBJECTIVE` | reach Node 01 onboarding radius | `REACH NODE 01` |
| `LEARN_INTERACT` | two Scrappers resolved, then real interaction | `HOLD E TO ACTIVATE` or `HOLD ACTIVATE` |
| `TUTORIAL_COMPLETE` | Node 01 activation | brief completion banner |

Frozen capture states expose every step without altering the live progression contract.
