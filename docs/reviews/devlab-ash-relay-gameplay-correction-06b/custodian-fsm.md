# Custodian FSM

The Relay Custodian remains at 540 HP. Its explicit observable sequence is `INTRO -> TELEGRAPH -> COMMITTED_ATTACK -> RECOVERY -> VULNERABLE`, with `TRANSITION` and `DEFEATED` terminal branches.

The perfect-information reference run observed 22 state transitions, 2 directed attacks, 1 sweep, 2 fan attacks, 5 attack-caused vulnerability windows, and exactly 540 damage during windows. Telegraph, committed, recovery, and vulnerable time totaled 5.75s, 13.083s, 4.2s, and 4.65s. Phase times were 14.733s and 16.867s for the perfect bot lower bound.

Sweep uses an authored reachable safe marker and 11 sequential lanes. Overload emits three fan passes with stable three-lane gaps. Phase transition clears incompatible hostile projectiles. Phase 2 queues only three total reinforcements with at most two active.
