# OPS-WEBGPU-TSL-INTAKE-01 — corrected runtime fixture status

The four fixtures are now runtime-verified on the NVIDIA Turing adapter:

```text
threejs-webgpu-basic        WebGPURenderer + deterministic TSL + resize
threejs-webgpu-compute      instancedArray + instanceIndex + fixed-step compute
threejs-webgpu-post         RenderPipeline + bloom + grading + vignette
threejs-webgpu-device-loss  controlled loss + same-canvas recovery
```

All renderers call `await renderer.init()` before use. TSL animation uses a
contract-controlled time uniform rather than the global real-time node.
WebGPU capture serializes the presented canvas with `toDataURL("image/png")`,
decodes that PNG, validates its dimensions, and extracts RGBA from the decoded
image. The Node-side harness independently validates PNG signature/IHDR and
the exact RGBA length.

The compute fixture uses 16,384 instanced sprites, typed storage arrays and a
fixed 20 ms step. The post fixture is an independent implementation; its
maximum read-only eight-token shingle overlap with the unresolved-license
reference is 1.8450%, limited to imports and standard API expressions.

```text
NATIVE_WEBGPU: PASS
PNG_RGBA_CAPTURE: PASS
DETERMINISM_SAME_EXECUTABLE_AND_BACKEND: PASS
CONTROLLED_CHANGE: PASS
RESIZE_MATRIX: PASS
DEVICE_LOSS_AND_RECOVERY: PASS
RESOURCE_GROWTH: BOUNDED
EXTERNAL_NETWORK_REQUESTS: 0
```

Detailed runtime evidence is recorded by `DEVLAB-CODEX-WEBGPU-REVIEW-02`.
