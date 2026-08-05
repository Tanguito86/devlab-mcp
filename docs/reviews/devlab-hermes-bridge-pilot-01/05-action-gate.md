# 05 — Action gate

The vocabulary is `READ_ONLY → PLAN_ONLY → SAFE_WRITE → COMPILE → RUN →
DESTRUCTIVE`. Public methods require their exact capability; SAFE_WRITE and
rollback require `confirm=true`; apply is dry-run by default.

Compile/runtime remain internal to `GM_VERIFY_V1`. Runtime cannot run when the
policy says `forbidden`, and a foreign Runner blocks the operation. DESTRUCTIVE
is represented for classification but disabled by the pilot capability.

An unknown capability, open IDE, stale binding, missing confirmation, or
uncertain process identity fails closed without category escalation.
