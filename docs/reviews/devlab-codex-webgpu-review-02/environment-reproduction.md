# Environment reproduction

The corrected probe navigated to `http://127.0.0.1:<ephemeral-port>/` before
querying WebGPU. Regression tests reject `about:blank`, `data:`, opaque origins,
non-loopback origins, headless-shell and software adapter identities.

```text
BROWSER: Chromium 148.0.7778.96 (full executable)
BROWSER_EXECUTABLE_SHA256: 290fa7018fda22c52ada5eddb0113baf3ebc41fd0fde6085eddb19793606c635
NAVIGATOR_GPU: PRESENT
ADAPTER: nvidia / turing
FALLBACK_ADAPTER: false
DEVICE_CREATED: true
PREFERRED_CANVAS_FORMAT: bgra8unorm
MAX_BUFFER_SIZE: 268435456
MAX_STORAGE_BUFFER_BINDING_SIZE: 134217728
MAX_COMPUTE_WORKGROUP_SIZE_X: 256
```

The WebGL diagnostic string independently reported NVIDIA GeForce RTX 2060.
No WebGL or software adapter was presented as the WebGPU result.

During the first native attempt, the host security product rewrote the local
HTML response and injected a non-local script. The route aborted it and the
run failed closed. Direct allowlisted document fulfillment removed the host
rewrite without disabling security software. All accepted runs report:

```text
CONSOLE_ERRORS: 0
PAGE_ERRORS: 0
BLOCKED_OR_EXTERNAL_REQUESTS: 0
```
