# 05 — Action gate

The vocabulary is `READ_ONLY -> PLAN_ONLY -> SAFE_WRITE -> COMPILE -> RUN ->
DESTRUCTIVE`. Public methods require their exact capability; SAFE_WRITE and
rollback require `confirm=true`; apply is dry-run by default.

Compile/runtime remain internal to `GM_VERIFY_V1`. Runtime cannot run when the
policy says `forbidden`, and a foreign GameMaker, Igor or Runner blocks apply
and compile/run verification without being terminated. Rollback remains an
explicitly confirmed recovery lane: it validates transaction bindings and
concurrent hashes under the project lock and does not terminate foreign
processes. DESTRUCTIVE is represented for classification but disabled.

An unknown capability, open IDE, stale binding, missing confirmation, or
uncertain process identity fails closed without category escalation.
