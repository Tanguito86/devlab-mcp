# External source registry

This directory records curated external references. A registry entry is
provenance and policy metadata, not an installation, dependency, endorsement,
or production approval.

External source code must remain outside this repository. Local operators can
use `.external-sources.local.json` (ignored) or pass an explicit checkout path
to the structural validator. The fallback `.external-cache/` location is also
ignored, but an OS-local cache is preferred.

Each component requires a separate audit and human approval before adaptation.
Automatic updates and execution of external code are prohibited.

## Registered sources

| Source | PIN | Integration mode | Registry status |
|---|---|---|---|
| `awesome-llm-apps` | `779e9f9bcf87fa8cd95870a438b70b84e47d3173` | external-curated-reference | REFERENCE_ONLY |
| `threejs-skills` | `b1c623076c661fc9b03dac19292e825a5d106823` | external-curated-reference | CURATED_REFERENCE / AUDIT_PENDING |
| `jungle-trail` | `073e6eb8efc6d6915efacc611a6e5ba91c89e34c` | reference-architecture | REFERENCE_ARCHITECTURE / EXECUTION_NOT_AUTHORIZED |

Per-source records:

- `awesome-llm-apps/` — manifest, intake, license review, validation report
- `threejs-skills/` — manifest, intake, license review (UNRESOLVED), risk register, validation report
- `jungle-trail/` — manifest, intake, architecture review, risk register, validation report

The central `registry.json` is the source of truth for source identity,
pinned commits, and allowlists. Manifests must match it exactly; the validator
rejects drift, duplicates, wildcards, unsafe paths, and any enablement of
execution or updates.

## Validation

Offline validation requires only Node.js:

```powershell
node scripts/validate-external-source.mjs                 # all sources, offline
node scripts/validate-external-source.mjs --source threejs-skills
node --test tests/external-source-registry.test.mjs
node --test tests/external-source-registry-multi.test.mjs
node --test tests/external-source-adversarial.test.mjs
```

After copying `external-sources/external-sources.local.example.json` to the
ignored `.external-sources.local.json` and setting its external cache root, a
separate checkout validation can be run without executing upstream code:

```powershell
node scripts/validate-external-source.mjs --configured-checkout --write-reports
```

The validator never fetches or advances upstream. Drift checks require an
operator to update refs in the external cache manually; the manifest pin does
not change until a separate reviewed commit changes it.

## Ground rules

```text
REGISTERED != INSTALLED
AUDITED != APPROVED
REFERENCE != DEPENDENCY
LICENSE_DECLARED != LICENSE_VERIFIED
```
