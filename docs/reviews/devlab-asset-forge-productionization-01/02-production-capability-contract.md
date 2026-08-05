# Production capability contract

Capability `asset-forge` version `1.0.0` declares eight public operations: `validate_spec`, `build`, `build_batch`, `capture`, `critic`, `resolve`, `export`, and `inspect`. Each operation declares input/output schemas, effects, write roots, determinism, limits, typed errors, dependencies, offline support and rollback. The registry contract is `capabilities/asset-forge-v1.json`; renderer internals are explicitly not public API.
