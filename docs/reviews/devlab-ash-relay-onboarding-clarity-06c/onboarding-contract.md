# Onboarding contract

The hotfix preserves the 06B gameplay-v2 values and changes only communication and the minimum input semantics needed to make interaction unambiguous.

The public sequence is action-gated:

`IDENTIFY_PLAYER -> LEARN_MOVE -> LEARN_AIM_AND_FIRE -> LOCATE_OBJECTIVE -> LEARN_INTERACT -> TUTORIAL_COMPLETE`

- Identification remains until real movement begins.
- Movement requires accumulated displacement, not a timer or a stray key event.
- Aim and fire require a valid aim input plus a fired shot.
- Objective location advances only through spatial progress toward Node 01.
- Interaction is unlocked by the real two-Scrapper onboarding beat and completes only through INTERACT.
- Completion is a brief, non-blocking banner.

No timer alone advances a tutorial state. Restart before completion reconstructs `IDENTIFY_PLAYER`; after completion, manual HELP remains available within the session.

Preserved values: player speed 8.5, checkpoint health 100, boss health 540, hostile pool capacity 24, boss FSM, hatches, encounter budgets, seeded RNG, fixed timestep, pooling, and the 75% relay floor.
