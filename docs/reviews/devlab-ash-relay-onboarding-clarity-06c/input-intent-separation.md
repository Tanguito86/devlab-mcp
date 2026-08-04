# Input intent separation

The logical input snapshot now distinguishes `MOVE`, `AIM`, `FIRE`, `INTERACT`, `PAUSE`, and `HELP`.

Desktop mapping:

| Intent | Public input |
| --- | --- |
| MOVE | WASD |
| AIM | mouse position |
| FIRE | left mouse or Space |
| INTERACT | E |
| PAUSE | Escape or P |
| HELP | F1 or ? |

W/S/A/D are resolved through the same camera ground basis used by presentation, so their observed screen directions remain up/down/left/right in landscape and portrait. Mouse position is converted by ray-plane intersection rather than by treating canvas NDC as a world vector. The initial projectile is aligned to that public aim.

The engine passes `activate: live.interact`; FIRE is never inferred as INTERACT. Behavioral tests prove shots cannot activate Node 01 and E can.

HELP is a discrete intent. Its overlay pauses presentation without restarting or stepping the simulation and does not consume FIRE or INTERACT.
