# Codex correction brief v2 - ASH RELAY 06B

This is the reconciled implementation input for
`DEVLAB-ASH-RELAY-GAMEPLAY-CORRECTION-06B`. It is not authorization to change
gameplay during 06A.

## Required corrections

### 1. Relay activation floor - P1

Track whether each pending relay has reached 75%. Once armed, interruption may
drain progress at the canonical 0.7 units/second only to 75%. It must not
auto-complete. A full restart clears progress and the floor flag; checkpoint
restore recreates only the contractual relay state.

### 2. Relay A onboarding and response - P1

Spawn exactly two normal Cinder Scrappers from opposite telegraphed hatches
before Node 01 enables. After activation, spawn exactly one normal Scrapper and
one normal Arc Sentry, without later reinforcements. Relay A must remain less
demanding than Relay B and must not softlock if an enemy reaches an arena edge.

### 3. Relay Custodian attack causality - P1

Keep 540 initial HP. Implement the explicit per-phase sequence
`TELEGRAPH -> COMMITTED_ATTACK -> RECOVERY -> VULNERABLE`. Phase 1 needs a
readable sweep and reachable safe zone. Phase 2 needs a projectile fan with
stable, reachable gaps. Vulnerability opens because the committed attack
finished, never from a detached global timer.

Record phase time, attacks executed, windows opened, player damage during a
telegraph, player damage in a signaled safe zone, boss duration, and mission
duration. Change HP only if repeatable metrics miss the 70-100-second boss or
3-5-minute mission budget, and record the measured rationale.

### 4. Spawn lifecycle and encounter budgets - P1

Keep enemy pool capacity 24. Do not add a global active cap of six. Implement
the hatch lifecycle and exact local budgets in `encounter-plan.md` v2. Each
telegraph lasts at least 0.65 seconds, remains legible in portrait, and uses
motion or shape plus color. Reject or defer unsafe commits deterministically;
never spawn inside the player or grow a queue without bound.

### 5. Related verified P2 work

- Preserve player speed 8.5 and checkpoint health 100.
- Bound boss phase-2 reinforcement requests to three total and two active.
- Make activation and pulse intent unambiguous on touch.
- Improve contrast for the player, Scrapper, Sentry, Custodian, hatches, and
  attack safe zones without replacing models.
- Give floor armed, spawn, vulnerability, damage, phase, and checkpoint events
  at least two feedback channels.
- Extend pacing through onboarding, telegraphs, recovery, and real patterns;
  do not slow movement or add passive waits.

## Explicitly obsolete; do not implement

- player speed 6.0;
- checkpoint health 75;
- mandatory boss health 360;
- global active-hostile cap 6; and
- exact checkpoint RNG rewind (the contract retains the current stream
  position).

## 06B validation boundary

- Run the v2 consistency test before implementation.
- Preserve WebGPU, fixed-step, seeded RNG, pooling, lifecycle, capture,
  device-loss, desktop, touch, audio, and network-isolation guarantees.
- Re-run the bot, adversarial, determinism, lifecycle, device-loss, desktop,
  portrait, and independent gameplay review suites.
- Score only with `gameplay-rubric-v2.md`; do not compare the new score directly
  with the historical 70/100 result.
