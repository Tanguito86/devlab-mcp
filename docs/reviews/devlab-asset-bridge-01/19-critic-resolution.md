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

Independent re-review: `ACCEPTED AFTER RESOLUTION` on clean detached clone
`4a06a72b875517bf2ccc0db1db726d489233bcb1`; open BLOCKER 0, REQUIRED 0,
OPTIONAL 2.

Open optional observations, accepted as non-blocking:

- `O6`: the JSON Schema `allOf` composition is syntactically valid but a strict
  draft-2020-12 validator could reject derived apply/verify/rollback properties
  because the referenced request base is closed. Runtime TypeScript gates are
  unaffected; a future schema-only maintenance sprint can flatten the composed
  request definitions and add a real validator dependency if authorized.
- `O7`: tracked QA contains the exact Forge summary and hashes, while the full
  synthetic catalog/build tree is intentionally external and disposable. The
  clean-clone gate reproduces it fresh offline, so no original untracked state or
  consumer asset is required.
