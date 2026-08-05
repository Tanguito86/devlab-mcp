# Critic resolution ledger

Every `REQUIRED` finding was resolved before commit.

| Finding | Classification | Resolution |
|---|---|---|
| Fog exposed partially evaluated cells and could exceed its per-call budget | REQUIRED | Sweeps now build a pending result under the exact budget and publish tiers atomically only when complete. |
| Mid-sweep restore was not canonical | REQUIRED | Pending cells, cursor, transitions and canonical order are serialized and adversarially validated. |
| A document already hidden at startup could start the loop | REQUIRED | The central adapter synchronously arms hidden pause before lifecycle start. |
| Local path validation admitted traversal/remote edge cases | REQUIRED | Schemes, network roots, encoded traversal, query/fragment, control/whitespace, empty segments and trailing slash are rejected before loading. |
| Capability QA contracts drifted from the typed QA registry | REQUIRED | Capability and typed QA declarations now carry the same selective-pattern contracts. |
| Whitespace-padded schemes could bypass the local-only gate | REQUIRED | Raw whitespace/control characters are rejected and URI-like inputs cannot reach the loader. |
| Provenance wording could imply stronger verification than performed | REQUIRED | The registry verifies mandatory declared metadata, actual bytes, byte size and hash without asserting external authorship truth. |
| SemVer behavior drifted between schema and runtime | REQUIRED | Both use strict SemVer and accept standard alphanumeric prerelease identifiers. |
| Relative product paths lacked an explicit resolution root | REQUIRED | Validation requires a consumer-supplied distribution root and resolves registry/provenance paths beneath it. |
| Optional v2 fields conflicted with the stated versioning policy | REQUIRED | v2 is a closed product capsule; adding fields requires v3. |
| Valid alphanumeric prerelease identifiers were rejected | REQUIRED | Runtime and schema patterns now accept `1a`, `123abc`, and `01a`. |
| Schemas admitted empty path segments, trailing slash or unsafe integers | REQUIRED | Schema constraints now match runtime rejection and cap numeric fields at `9007199254740991`. |

Adopted hardening from the critic includes manual pause before startup, a fixed-step-only fog driver test, and explicit validation of transition/pending snapshot relationships. These additions remain bounded to the approved interfaces and do not add product scope.

No `REJECTED` item required a product change. The final critic recheck reports zero open observations.
