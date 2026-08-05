# Independent technical critic

`cinder-independent-technical-critic-v1` runs in a separate Node process with
network proxy variables disabled. It receives the immutable technical critic
bundle, not a builder approval instruction. Its output is bound and authenticated
through the existing builder/critic/resolver roles.

Contracts, strict geometry, absolute/target budgets, run determinism, 100-cycle
lifecycle, controlled device loss, loopback network isolation, no-copy, path
safety, TypeScript security, PNG hardening, and real WebGL all pass.

Open findings: one `OPTIONAL`, `WEBGPU_PENDING`. There are zero `BLOCKER` and zero
`REQUIRED` findings. WebGPU is not claimed as validated because the bounded
stable probe exposed no adapter.
