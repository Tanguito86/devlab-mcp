# Test results

All results below come from executed gates:

- Frozen install: pass after adding only the required empty workspace importer for the new package; a second `--frozen-lockfile` run made no further change.
- Kit unit tests: 16/16 pass.
- Capability registry contract: 3/3 pass.
- DevLab workspace: build 5/5 pass; typecheck 5/5 pass after build generated the shared declarations; tests 189/189 pass (9 shared, 16 kit, 8 visual, 42 Android, 114 browser).
- Ash Relay contract v2: 7 pass, 1 intentional external-copy skip, 0 fail.
- Ash Relay consumer: typecheck pass, build pass, tests 48/48 pass.
- Bot: 10/10 pass, softlocks 0, restart 10/10, checkpoint restore 10/10, simulated duration 108.467 s.
- Adversarial lifecycle suite: 45/45 pass.
- Frozen parity: 96/96 PNG/RGBA files exact, 0 mismatch across 3 viewports, 8 states, 2 runs.
- Native WebGPU gauntlet: pass for desktop/touch controls, performance, ten lifecycle cycles, sensitivity, and resource stability.
- Device loss: 9/9 live states pass; renderer generation recovered, simulation stayed byte-coherent, one canvas/loop remained, input/audio/capture recovered.
- Hardware: NVIDIA/Turing adapter, fallback false, full contractual Chromium SHA-256 `290fa7018fda22c52ada5eddb0113baf3ebc41fd0fde6085eddb19793606c635`.
- Console/page/network errors: 0; external requests: 0.
- Consumer dist tree SHA-256: `97c8ee9438f8baa27acc2576b239a55089acb9986089ce12e460fe755ceacbaa`.
- Gauntlet summary SHA-256: `8dd10dc7d9eaca23a645215d9cefe8818513b7bc5e800ac5351fe9d0d5e55878`.

The first aggregate typecheck attempt ran before shared declarations were rebuilt and failed on missing `@tanguito/devlab-shared` declarations; the ordered build then typecheck gate passed without source changes. Final clean-checkout gates are rerun after commits and fast-forward.
