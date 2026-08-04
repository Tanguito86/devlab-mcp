# Isolation checklist

- [ ] Separate contained workdir for each leg
- [ ] Same frozen DevLab commit and clean starting tree
- [ ] Same model/version, effort, prompt hash, seed, budgets and time
- [ ] Same internal scaffold, native WebGPU backend, browser and adapter
- [ ] Same viewports, local assets, tests and evaluator
- [ ] Fresh independent model context per leg
- [ ] No LEG_A outcome or artifacts visible to LEG_B
- [ ] LEG_A cannot read the external checkout
- [ ] LEG_B reads only exact hashed allowlist files through the broker
- [ ] Broker HMAC key is executor-only and absent from both builder contexts
- [ ] Coordinator ledger is ACL-protected and outside leg-writable roots
- [ ] External checkout detached, clean and unchanged
- [ ] No install, upstream script, scaffold, generator, dependency or paid API
- [ ] OS/process egress is denied except loopback and all requests are logged
- [ ] No product repository or global skill directory changes
- [ ] Evidence roots separate and run manifests immutable
- [ ] Residual servers and browser processes attributed and closed
- [ ] Contract and runbook explicitly authorize execution at the verified commit
