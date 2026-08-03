# Security review

## Final gates

- Bind: `127.0.0.1`, ephemeral port.
- Directory listing: disabled.
- Traversal and absolute CLI paths: rejected.
- Symlink/junction final targets and ancestors: rejected.
- External network: exact local origin only; a blocked request fails closed.
- Arbitrary JavaScript: no `eval`, `new Function`, or user-supplied script.
- Stale output: rejected.
- Missing/malformed PNG or RGBA and dimension mismatch: rejected.
- Missing/wrong contract, unknown viewpoint, ready/render timeout, invalid
  metrics, NaN/Infinity, duplicate filenames, and mid-capture context loss:
  rejected.
- Registry paths: safe registered IDs, structural short-circuit, realpath and
  per-segment containment, full SHA and hashes, detached/clean checkout.

The expanded browser package suite is 61/61 and the registry suite is 57/57.
A controlled CDP page crash caused page operations to stop completing; the
harness timeout provides fail-closed termination. A request after controlled
server shutdown failed as expected. All browser and server resources are
closed in `finally` paths.

External components installed: 0. External components enabled: 0. External
source code executed: 0.
