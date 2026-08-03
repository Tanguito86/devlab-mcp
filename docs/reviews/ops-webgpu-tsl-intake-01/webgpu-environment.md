# OPS-WEBGPU-TSL-INTAKE-01 — environment correction

The original environment conclusion is superseded by
`OPS-WEBGPU-ENV-01` and `DEVLAB-CODEX-WEBGPU-REVIEW-02`.

```text
NATIVE_WEBGPU: AVAILABLE
GPU_ADAPTER: NVIDIA / TURING / HARDWARE
PLAYWRIGHT_CDP: SUPPORTED
ROOT_CAUSE_OF_PREVIOUS_FAILURE: ABOUT_BLANK_FALSE_NEGATIVE
```

The failed probes queried `navigator.gpu` before navigating the page away
from `about:blank`. A WebGPU availability probe is valid only after navigation
to a non-opaque origin. The corrected harness navigates to an ephemeral
`http://127.0.0.1:<port>/` origin, then requires `navigator.gpu`, a non-null
hardware adapter and a successfully created device.

The full version-pinned Chromium executable is selected explicitly. The
`chromium-headless-shell` executable, opaque origins, WebGL fallback and
software adapters are rejected. Runtime browser version, executable hash,
origin, adapter identity and device limits are recorded per capture.

Host HTTP-response injection was observed from the installed security product.
The harness prevents it without disabling the product: the allowlisted local
top-level document is fulfilled directly under the real loopback origin, all
other fixture/vendor files remain served from the loopback server, and every
non-local request is aborted fail-closed.
