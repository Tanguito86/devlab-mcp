# DevLab img2threejs asset-forge boundary

This library is an independent DevLab implementation of security, lifecycle,
determinism, review, and artifact contracts for a future bounded asset pilot. It does
not contain or execute upstream img2threejs code and does not depend on Three.js.

The package deliberately stops before visual generation. Its public API provides a safe
TypeScript emitter, a bounded canonical PNG decoder, separated builder/critic/resolver
contracts, ownership-aware disposal, deterministic capture adapters, and secure artifact
manifests.
