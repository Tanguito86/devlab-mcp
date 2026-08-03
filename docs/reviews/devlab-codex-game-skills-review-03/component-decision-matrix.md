# Component decision matrix

| Component | Source path | Value | Risk / overlap | Decision | Required adaptation | Benchmark eligible |
|---|---|---|---|---|---|---|
| game director | `threejs-game-director/SKILL.md` | phased evidence | instructions can conflict with benchmark; no DevLab equivalent | ADAPT | benchmark restrictions override sourcing/install phases | yes |
| phase playbook | director reference | entry/exit evidence | verbose and generator-oriented | ADAPT | select applicable phases only | yes |
| game design brief | gameplay references | compact intent | absent in DevLab | ADAPT | freeze as process output | yes |
| core loop contract | gameplay references | measurable loop | absent in DevLab | ADAPT | bind to ASH RELAY requirements | yes |
| encounter planning | level-design reference | pacing/recovery | absent in DevLab | ADAPT | require testable beats | yes |
| game feel | game-feel reference | impact vocabulary | subjective/tuning risk | ADAPT | measure plus human review | yes |
| technical art budgets | technical-art reference | target discipline | generic limits overlap DevLab metrics | ADAPT | DevLab measurements remain authority | yes |
| visual scorecard | visual-scorecard reference | structured human review | cannot be automated by pixel metrics | ADAPT | blinded written human score | yes |
| fresh-eyes review | visual-scorecard reference | adversarial visual check | evaluator bias | ADAPT | blind and randomize pair | yes |
| UI checklist | UI references | state/readability coverage | generic | ADAPT | map to required game states | yes |
| mobile checklist | mobile-input reference | touch/safe-area coverage | emulation is not hardware | ADAPT | same viewport; hardware is separate gate | yes |
| debug profiler | profiler guidance | useful triage | overlaps stronger DevLab diagnostics | REFERENCE_ONLY | never replace DevLab capture/runtime | yes |
| QA release flow | QA references | complete verification sequence | some soft gates | ADAPT | use DevLab fail-closed gates | yes |
| canvas inspector | QA script | pixel statistics | software fallback; WebGL-centric; executable | REFERENCE_ONLY | formulas may be reimplemented, script excluded | no |
| seed hooks | scaffold `Game.ts` | controllable RNG | unconditional production exposure | ADAPT | internal test build guard and acknowledgements | yes |
| state hooks | scaffold `Game.ts` | frozen states | arbitrary state mutation | ADAPT | internal test build guard | yes |
| visual regression template | scaffold tests | stable screenshot pattern | 1.5% tolerance is not byte equality | ADAPT | DevLab PNG/RGBA contract | yes |
| bot playtest | scaffold/template guidance | progress evidence | genre-specific script and variable time | ADAPT | statistical repeated runs | yes |
| softlock checks | bot guidance | robustness signal | false positives | ADAPT | objective-aware windows and human review | yes |
| asset sourcing ledger | director guidance | provenance discipline | encourages paid generation | REFERENCE_ONLY | local/procedural row only | no |
| Tripo generator | `threejs-3d-generator` | external 3D | paid API/network/script | REJECT | none | no |
| Gemini generator | `threejs-image-generator` | external imagery | paid API/network/script | REJECT | none | no |
| ElevenLabs generator | `threejs-audio-generator` | external audio | paid API/network/script | REJECT | none | no |
| installer | `install.sh` | global discovery | destructive flags and ownership flaw | REJECT | none | no |
| external scaffold | bundled Vite game | learning example | WebGL-only, leaks, different architecture | REFERENCE_ONLY | separate future scaffold benchmark | no |

DevLab retains exclusive authority over filesystem/network isolation, source
registry, browser/GPU selection, software fallback rejection, WebGPU/TSL,
compute, RenderPipeline, device loss, capture contracts, A/B comparison,
evidence integrity, Git integration and release approval.
