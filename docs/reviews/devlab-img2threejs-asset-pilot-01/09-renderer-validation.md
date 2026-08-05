# Renderer validation plan

Acceptance uses `THREE.WebGLRenderer` `0.185.1` in the already-installed pinned
Chromium. A loopback-only server exposes an exact allowlist of runtime modules;
the browser context aborts and records every request outside that exact origin.

The harness records WebGL version, unmasked renderer/vendor when available,
draw calls, renderer triangles, geometries, textures, dimensions, and context
state. PNG comes from the real canvas encoder and raw RGBA comes from
`gl.readPixels`, normalized to top-down row order.

WebGPU is an optional bounded adapter probe. No availability claim is converted
into compatibility without a comparative WebGPU render.
