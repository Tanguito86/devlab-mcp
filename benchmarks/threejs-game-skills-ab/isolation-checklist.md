# Isolation checklist

- [ ] Separate contained workdir for each leg
- [ ] Same frozen DevLab commit and clean starting tree
- [ ] Same model/version, effort, prompt hash, seed, budgets and time
- [ ] Same internal scaffold, native WebGPU backend, browser and adapter
- [ ] Same viewports, local assets, tests and evaluator
- [ ] Fresh independent model context per leg
- [ ] No LEG_A outcome or artifacts visible to LEG_B
- [ ] LEG_A cannot read the external checkout
- [ ] LEG_B reads only exact hashed allowlist files
- [ ] External checkout detached, clean and unchanged
- [ ] No install, upstream script, scaffold, generator, dependency or paid API
- [ ] Network requests limited to loopback and logged
- [ ] No product repository or global skill directory changes
- [ ] Evidence roots separate and run manifests immutable
- [ ] Residual servers and browser processes attributed and closed
- [ ] Benchmark remains unexecuted until separately authorized
