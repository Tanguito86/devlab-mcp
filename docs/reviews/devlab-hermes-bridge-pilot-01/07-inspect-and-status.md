# 07 — Inspect and status

Inspect returns a canonically ordered relative file tree with SHA-256/size/kind,
project format, Git HEAD/status, objects, rooms, scripts, references, related
processes and warnings. Deterministic content has no timestamp or absolute path.

Status distinguishes READY, DIRTY, PROJECT_OPEN, COMPILE_RUNNING,
RUNNER_RUNNING_OWNED, RUNNER_RUNNING_FOREIGN, TRANSACTION_PENDING,
ROLLBACK_AVAILABLE, and BLOCKED. The foreign Runner test used a live Node child
represented as Runner and proved it remained alive after status.
