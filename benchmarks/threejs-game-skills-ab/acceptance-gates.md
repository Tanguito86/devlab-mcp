# Acceptance gates

- Pair isolation: independent directories and contexts; LEG_B receives no LEG_A
  outcome or artifacts.
- Contract equality: prompt hash, model/version, effort, seed, time, cycles,
  assets, scaffold, WebGPU backend, browser, adapter, viewports, budget, tests
  and evaluator match.
- Source: exact detached pin, clean checkout, exact path and SHA-256 allowlist.
- Security: no global install, external script, external scaffold, paid API,
  external network request, copied upstream file or credential.
- Correctness: build/typecheck pass; console/page/network errors zero; complete
  start, checkpoint, pause, defeat, restart, mini-boss and victory paths.
- Runtime: native WebGPU hardware adapter; no software fallback; bounded
  resources; resize and desktop/mobile input pass; p95/p99 recorded.
- Determinism: frozen A-vs-A byte/pixel equality; known controlled change
  detected; live gameplay compared statistically; bot replay equality forbidden.
- Evaluation: complete metrics, blinded human scoring and documented verdict.
- Process: maximum 120 minutes and three rework cycles per run.

Benchmark execution, commits, push and tags are forbidden until a separate
execution sprint authorizes them.
