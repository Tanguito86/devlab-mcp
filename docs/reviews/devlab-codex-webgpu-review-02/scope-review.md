# Scope review

`f933fa2` is limited to the curated `webgpu-claude-skill` registry intake,
license/API audit, four first-party capture fixtures, harness support and
review documentation. It contains no product changes, binary assets, runtime
dependency on the external checkout, CDN import, installed skill, enabled
Cursor rule or external-code execution path.

Initial review verdict: `HOTFIX_REQUIRED`.

Accepted corrections:

- use the TSL `texture` export instead of nonexistent `THREE.texture`;
- initialize every `WebGPURenderer` before use;
- replace WebGPU-canvas `drawImage` capture with PNG serialization and
  validated decoding;
- add data-URI favicons;
- launch a verified full Chromium binary and reject headless shell;
- probe only after navigation to the real loopback origin;
- freeze TSL time with contract-controlled uniforms;
- fix the compute storage-node API and instanced draw model;
- make the post A/B variant mutable inside one page;
- make device-loss recovery measurable and bounded;
- remove personal paths and correct the previous `about:blank` diagnosis;
- rewrite the post fixture to avoid substantial reuse from an
  unresolved-license reference.

No external skill or code was installed, enabled or executed.
