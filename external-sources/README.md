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

Offline validation requires only Node.js:

```powershell
node scripts/validate-external-source.mjs
node --test tests/external-source-registry.test.mjs
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
