# DEVLAB-THREEJS-GAME-SKILLS-AB-04

This directory freezes the contract for an isolated A/B benchmark of selected
read-only guidance from `majidmanzarpour/threejs-game-skills`. It does not
contain a game, external source files, benchmark output, or authorization to
execute the benchmark.

LEG_A and LEG_B must use the same DevLab internal scaffold, WebGPU runtime,
browser, hardware adapter, prompt, seed, assets, budget, model, effort, time
limit, cycle count and evaluator. The only intended treatment is that LEG_B may
read the exact hashed files in `selected-guidance-manifest.json`.

```text
STATUS: DESIGNED / AUTHORIZED / NOT_EXECUTED
WORKING_TITLE: ASH RELAY
EXTERNAL_INSTALL: FORBIDDEN
EXTERNAL_SCRIPTS: FORBIDDEN
EXTERNAL_SCAFFOLD: FORBIDDEN
NETWORK: DENY_EXCEPT_LOOPBACK
```

Execution requires a separate sprint authorization and two fresh isolated
workdirs. Follow `runbook.md` and `isolation-checklist.md` without weakening
DevLab's source registry, capture harness, browser or GPU gates.
