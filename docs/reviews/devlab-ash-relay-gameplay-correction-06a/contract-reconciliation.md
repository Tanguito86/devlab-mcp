# DEVLAB-ASH-RELAY-CONTRACT-RECONCILIATION-06A

## Decision

The versioned contracts remain authoritative. This reconciliation adopts the
gameplay problems demonstrated in the live critique without importing stale
tuning from its earlier specification.

No game source, runtime asset, build output, or generated evidence was changed
by 06A. Implementation belongs to
`DEVLAB-ASH-RELAY-GAMEPLAY-CORRECTION-06B`.

## Reconciled decisions

| Topic | Version 2 decision | Evidence or rationale |
| --- | --- | --- |
| Relay activation | Arm an irreversible 75% floor when pending activation first reaches 75%; interruption can drain only to that floor; a legitimate restart clears it | Live release from 89% demonstrated the gameplay failure |
| Relay A onboarding | Two Cinder Scrappers must be defeated before Node 01 enables; its post-activation response is exactly one Scrapper plus one Arc Sentry | The original build front-loaded its largest difficulty spike after an unopposed activation |
| Relay Custodian | Start at 540 HP; use `TELEGRAPH -> COMMITTED_ATTACK -> RECOVERY -> VULNERABLE`; add a readable sweep and a fan with reachable gaps; vulnerability follows the committed attack | The pattern and causality findings were demonstrated; the 360 HP claim was not |
| Spawns | Keep pool capacity 24; use visible hatches, local active budgets, and bounded queues | The critique conflated storage capacity with simultaneous pressure |

## Preserved canonical values

| Value | Version 2 |
| --- | ---: |
| Player maximum speed | 8.5 world units/second |
| Checkpoint health | 100 |
| Initial boss health | 540 |
| Enemy pool capacity | 24 |

Initial boss health can change only after repeatable 06B metrics show that the
mission misses 3-5 minutes or the boss misses 70-100 seconds. Any such change
requires a recorded measurement, resolved value, and rationale.

## Invalidated stale requirements

The following values are historical specification drift and are not acceptance
criteria for 06B:

- player speed 6.0;
- checkpoint health 75;
- mandatory boss health 360; and
- a global active-hostile cap of 6.

The 70/100 result remains valid evidence for the build and rubric that produced
it. It must not be compared directly with a v2 score. The independent critic
must evaluate 06B from the reconciled rubric before scoring the new build.

## Source order after reconciliation

1. `core-loop-contract.md` v2;
2. `encounter-plan.md` v2;
3. versioned `gameplay-rubric-v2.md`;
4. versioned `codex-correction-brief-v2.md`;
5. the original 01B reports as historical observations.
