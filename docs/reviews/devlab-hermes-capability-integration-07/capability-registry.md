# Capability registry

`capabilities/hermes-capability-manifest.json` is the canonical registry. It records source and pin, license, evidence and its SHA-256, authority, integration mode, runtime/security state, next permitted action, and prohibited actions.

The registry accepts only `INTEGRATED`, `IMPLEMENTING`, `DESIGN_READY`, `PILOT_REQUIRED`, `REFERENCE_ONLY`, and `REJECTED`. A contract test rejects missing fields, unknown status values, duplicate identifiers, dependency drift, or accidental installation of external candidates.
