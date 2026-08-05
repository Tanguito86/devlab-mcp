# 12 - TOCTOU and concurrency

The adapter re-inspects the target and hashes every destination immediately
before apply. A changed snapshot, file, HEAD, plan, or allowlist blocks before
promotion. The project lock is exclusive. Tests cover external edit between
plan/apply and edit after apply before rollback.

Rollback accepts only the exact expected before/after states. An unrelated
post-apply change returns `ROLLBACK_BLOCKED_CONCURRENT_CHANGE` and preserves
the external bytes. A foreign Runner blocks safe apply and remains alive.
