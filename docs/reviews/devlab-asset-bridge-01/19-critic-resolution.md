# 19 - Codex resolution

Codex accepted all five mandatory findings and resolved them rather than
downgrading them. Functional resolution commit:
`ac6d545` (`DEVLAB-ASSET-BRIDGE-04 bind apply verify and canonicalize adapter plans`).

- `F1`: apply and verify now require `request.planHash === record.adapterPlanHash`.
  A same-transaction forged-content test covers both operations. GM Adapter now
  stores canonical `allowedExtensions` in the hashed plan and revalidates paths,
  extensions, file count, duplicate identities, content size and content hash at
  apply. Result: 66/66 adapter and 62/62 bridge tests.
- `F2`: `.gitattributes` pins bridge source, fixture and textual evidence to LF;
  PNGs are binary. `SHA256SUMS.txt` is regenerated from staged Git blobs and is
  verified independently rather than from checkout line endings.
- `F3`: `faultAt` was removed from bridge TypeScript and JSON Schema; only the
  adapter test lane can inject faults.
- `F4`: the real pilot gates the exact GameMaker PID set, records that non-GM
  population is not compared, and points to the concrete foreign-Runner test.
- `F5`: transaction IDs are lowercase canonical ASCII in implementation and both
  schemas, with a mixed-case rejection test.

All optionals were also addressed: all eight Forge operations are declared; the
synthetic review authority is documented as fixture-only; process inventory uses
the documented internal subpath and summary paths are sanitized; parent-directory
fsync was added; exported frame dimensions/channels are cross-checked and decoded
bytes derive from parsed frames.

Real post-resolution pilot:
`COMPLETED / ASSET_GM_BRIDGE_V1_PILOT_VERIFIED`; v1 APPLIED, identical reapply
NO_CHANGE, v2 APPLIED, both rollbacks byte-exact, negative compile exit 1, runtime
initial/v1/v2/post-rollback PASS, initial/final GM PID sets empty.

Independent re-review: `PENDING`.
