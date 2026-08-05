# Resource lifecycle

The real Three.js factory completed 100 create/render/raw-capture/dispose cycles.
Every cycle created ten owned geometries and five owned materials, rendered on
the WebGL harness, performed readback, detached the asset, and disposed it twice.

- cycles/captures: 100/100;
- owned resources after dispose: 0;
- dispose errors: 0;
- double-dispose failures: 0;
- shared/external resources: preserved;
- asset textures/render targets: 0/0;
- average/max cleanup: about 0.222 ms / 0.4 ms in the final run.

The WebGL renderer reports one internal texture; the asset ownership manifest
correctly reports zero textures. Renderer infrastructure is not misclassified as
an asset-owned resource.
