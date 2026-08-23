# DevLab GameMaker IDE Adapter

This package exposes only six governed operations: `GM_STATUS`, `GM_INSPECT`,
`GM_PLAN`, `GM_APPLY_SAFE`, `GM_VERIFY`, and `GM_ROLLBACK`. Compile, Runner,
backup, staging, and GML details remain private implementation concerns.

The status/plan/apply/verify/rollback concepts are independently implemented
from the contract documented by `hermes-gamemaker-ide-mcp` (MIT, Tanguito
studio). No Hermes source, Python runtime, content pack, asset, or MCP handler
is copied or imported. The adapter invokes an explicitly configured Igor CLI
directly and remains dry-run/fail-closed unless the caller supplies the full
authorization contract.

All request paths are relative to an explicit `projectsDir`; there is no
current-working-directory fallback. Deterministic snapshots, plans, and
manifests contain no absolute paths or timestamps. Operational process records
are isolated in evidence ledgers.

Git inspection never resolves an executable through `PATH`. Set `DEVLAB_GIT`
to an absolute `git`/`git.exe` path when Git is not installed in a conventional
system location. The configured executable is resolved to its real file before
use; repository metadata, local includes, executable filters, and external
object stores are inspected fail-closed before `status` runs.

Transaction containment is revalidated against physical project identity and
symlink/junction checks immediately around each feasible filesystem mutation.
Node does not expose portable directory-handle-relative `openat`/no-follow
operations, so this is detection and fail-closed hardening rather than a claim
that a hostile local actor cannot win the final path-check/use race. Complete
elimination of that race requires a native handle-based filesystem backend.
