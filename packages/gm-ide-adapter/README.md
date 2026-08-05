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
