# AB-04A scaffold validation

## Final result

```text
FINAL_NATIVE_SMOKE_ROUND: R12
FINAL_MATERIALIZATION_ROUND: R12
MATERIALIZATION: PASS
A/B_INITIAL_TREE_EQUALITY: PASS
FROZEN_OFFLINE_INSTALL: 2/2 PASS
BUILD: 2/2 PASS
TYPECHECK: 2/2 PASS
SCAFFOLD_TESTS: 34/34 PASS
NATIVE_WEBGPU_DESKTOP_AND_MOBILE: 4/4 PASS
CONSOLE_ERRORS: 0
PAGE_ERRORS: 0
BLOCKED_OR_EXTERNAL_REQUESTS: 0
BENCHMARK_EXECUTED: NO
```

Evidence root:

`H:\UserData\Deposito\Documents\devlab-runs\ab04a-scaffold-validation-20260803T201832-r12`

R12 is the final materialization and native-smoke round. R7 is retained at the
same path with suffix `-r7` as diagnostic evidence: its smoke stopped before
build/capture because a
pre-final Vite tree anchor included generated `.bin` shims containing absolute
paths. The corrected anchor hashes package-owned Vite bytes and excludes only
generated top-level `node_modules`; R8 then passed. R7 is not acceptance
evidence.

R9 then rematerialized both baselines after result-verifier hardening. A final
audit added exact Chromium identity checks and authenticated the complete local
capture-harness dependency closure. Because those changes altered the contract
and smoke runner, R10 rematerialized and repeated the full native validation;
a subsequent security audit found that Playwright package code was not yet
tree-authenticated. R11 added those package anchors. A second security pass then
identified unauthenticated Chromium sidecars; R12 anchors all 308 distribution
files and repeats the entire validation. R7 through R11 remain diagnostic or
superseded evidence, not final acceptance.

## Reproducible trees

```text
CONTRACT_SHA256_CANONICAL_LF: 852676a9255dc01c32828100b8b327bab9337579a43bc4e226be9e8de3f43482
SCAFFOLD_TREE_SHA256: c085bed4d3b3c52fc6d87eab44e0a9ee54cdf3891d5ba59154a57d16cf363908
INITIAL_COMPLETE_TREE_SHA256_CANONICAL_AND_RAW: 913da32c44b66502cf44ec2641dd3fee4583b6680b00efd8464efafda481ea9b
BUILD_TREE_SHA256_CANONICAL_AND_RAW: cbde24bbce2b93bfe4765dbe839e453b2e83abad36a6506e601b9cfe13203878
PACKAGE_JSON_SHA256: c072981489dd7db31394a7dcf7d39653b0ad436fc62202729fbed5be48d73839
PNPM_LOCK_SHA256: 34c3f2f1f78a990e59131adecbdc70a9ddac38443b8feaec7588580055a98688
FINAL_R12_MATERIALIZER_SHA256_CANONICAL_LF: e3c3052fc1e434c417c18c1d2410e35e8d461c7dfaaeffd80074609c67891c87
SMOKE_RUNNER_SHA256_CANONICAL_LF: 605125a916d7e39179dfa01d882df864cd3762d470c569e7e31a3968fe926a4f
CAPTURE_HARNESS_CAPTURE_JS_SHA256: e723d29feb8f7473784e7acc883c716f9396adfb362b62521f46005889087541
CAPTURE_HARNESS_BROWSER_RUNTIME_JS_SHA256: 369120710de97c8195f56b17eb24c249c564daad863b52dd5c9ae4a1c0032941
CAPTURE_HARNESS_SERVER_JS_SHA256: cf035842ef08f26f19c9487745d2d70f1fd6f3c86c19160610b2e82b8142f202
CAPTURE_HARNESS_CONTRACT_JS_SHA256: 59bcce177356b54883af8378fe57040585a0f640c6abdc715e4d4631c5638304
PLAYWRIGHT_1.60.0_FILES_AND_TREE: 65 / 5c9d3beb07a087bfede0e3aaa63dcf837b4288b42bb74fe2e23b571efa0776ed
PLAYWRIGHT_CORE_1.60.0_FILES_AND_TREE: 106 / e6f3793c5970342eeb1d60188f7abb3adcd5f652a44c8ecc8a8c7297b2f99603
CHROMIUM_1223_FILES_BYTES_TREE: 308 / 432272872 / bfd9c556552c637ceee2cf808aa1b5984da29f874965f0fd99b42326b3110fa0
```

For each leg the smoke deleted `node_modules` and `dist`, authenticated Node,
Corepack, the pre-provisioned pnpm distribution and all four local capture
harness files, plus Playwright and playwright-core, ran a frozen offline install
with `COREPACK_ENABLE_NETWORK=0`, authenticated Vite, invoked its exact bin
through the anchored Node executable, authenticated the entire Chromium
distribution, and rechecked every package and browser byte after capture. The
build tree was unchanged before and after both captures.

## Toolchain identity

```text
NODE: v24.13.0
NODE_EXE_SHA256: d14ba95cdce1ef7dc9ad3ac74949ca5db38b27378ee30f30a23cf26f9e875a11
COREPACK: 0.34.5
COREPACK_LAUNCHER_SHA256: 4bd305443b25ccb4c11b0c3f9eefe65d755af39f3545bfec24af428a1f9451b5
COREPACK_LIBRARY_SHA256: c0fa7f24f0de71e85e2b4ac8716ce979a3da9c0ccf5dc2a81b90d41d8b9263fe
PNPM: 9.15.4
PNPM_PACKAGE_TREE_SHA256: e2bffa92dd69d95cd0f5fd79af67e0ae28b21922edecc64586152e3c77eb7bc7
VITE: 8.2.0
VITE_EXECUTABLE_SHA256: fa03478846d229651a3c6aa64833ba2c6cbf580a798b92bd8f47c7480bafb5d8
VITE_PACKAGE_TREE_SHA256: 7c2c164fb19f47a88a2b6244a39d39a6b302774bfccc8766f5be63fa47c95fc7
ALL_CONTRACT_ANCHORS_MATCHED: YES
```

## Native WebGPU evidence

| Viewport | PNG SHA-256 | RGBA SHA-256 | Result |
| --- | --- | --- | --- |
| Desktop `1280×720` | `32ee9519c46e6690ad93e29e28d375584a2a33d285c39a33b33df203bd7aa4aa` | `d4bda35666bc5873f929a9ccf03b5b4436b48fc981bc39ba51625429ba2d6438` | nonblank, A/B identical |
| Mobile `390×844` | `4691a83c71aa563d49e3b57a03004da784a0e13f489e67b8fa1adf6fd1e7a39e` | `118838af3bb5b143bc74ceea2e9d2a8727cd70a9a85075aef40329e9f3b50981` | nonblank, A/B identical |

Chromium `148.0.7778.96` ran as the full executable with hash
`290fa7018fda22c52ada5eddb0113baf3ebc41fd0fde6085eddb19793606c635`.
The native WebGPU probe reported NVIDIA/Turing/non-fallback; Windows inventory
found exactly one healthy NVIDIA adapter, GeForce RTX 2060 (`10DE:1E89`), and
the browser renderer agreed. Desktop and mobile images were visually inspected
and were rendered, nonblank and responsive.

## Evidence boundary

These runs validate the common scaffold and capture path only. They did not
start builders, implement gameplay, run bot/performance benchmark scenarios,
score either treatment or execute the A/B comparison. Corepack/pnpm resolution
and browser requests were fail-closed offline; OS-level egress and leg ACLs
remain mandatory responsibilities of the future AB-04 executor.
