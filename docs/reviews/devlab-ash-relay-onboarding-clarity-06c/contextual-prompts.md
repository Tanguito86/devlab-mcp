# Contextual prompts

The interaction prompt is computed from the current phase, node state, and real interaction radius.

- Out of range: hidden.
- In range: `HOLD E TO ACTIVATE` or the mobile ACTIVATE control.
- Activating: the objective's real progress is rendered.
- Interrupted: contractual retained progress is rendered.
- Completed or transitioned to combat: hidden in the same logical tick.

The input path does not mention or accept FIRE for activation. Automated tests assert range gating and same-tick stale-prompt removal.
