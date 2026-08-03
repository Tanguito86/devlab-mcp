# Independent API review

The audit was repeated against the installed, pinned `three@0.185.1` source.

| Finding | Resolution |
|---|---|
| `positionLocal + normalWorld` | Confirmed misleading; fixture uses coherent local-space nodes. |
| Unbounded DPR | Confirmed in reference; fixtures cap DPR at 2. |
| 100,000 sphere particles | Confirmed excessive; fixture uses 16,384 instanced sprites. |
| `renderer.backend.device` | Confirmed private/version-bound; isolated to device-loss fixture and documented. |
| Claimed r171+ vs r183+ APIs | Confirmed incoherent; DevLab pins `0.185.1`. |
| `RenderPipeline` version binding | Confirmed; runtime verified only at the pinned version. |
| Recovery duplication | Confirmed in reference; fixture reuses one canvas and no animation loop. |
| Missing license material | Confirmed; substantial reuse remains unauthorized. |

Additional corrections found by Codex:

- `instancedArray()` exposes CPU data through `node.value.array` in the pinned
  version. The original fixture incorrectly used `node.array`.
- `instanceIndex` must drive an instanced draw. The fixture now uses
  `InstancedMesh`, `SpriteNodeMaterial` and `storage.toAttribute()`.
- `renderer.render()` is usable synchronously after `await renderer.init()`;
  the mandatory missing operation was initialization, not `renderAsync()`.
- the global TSL `time` node is not compatible with frozen deterministic
  capture; a uniform updated by `setTime()` is used instead.
- the previous CDP conclusion was false. `navigator.gpu` was queried on
  `about:blank`; navigation to loopback exposes native WebGPU.

The two broken addon paths and the private backend dependency remain findings
of the external reference. They are not imported by the verified fixtures.
