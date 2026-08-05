# Readiness del siguiente piloto

El hardening deja disponible una frontera interna para ejecutar, en un sprint separado,
`DEVLAB-IMG2THREEJS-ASSET-PILOT-01 / CINDER RELAY DRONE`.

Disponible:

- spec estructurada a módulo TypeScript determinista;
- PNG canónico acotado;
- Builder/Critic/Resolver con autoridad separada;
- `disposeModel` con ownership explícito;
- fake capture y adapter mínimo de renderer;
- manifest con hashes, provenance y métricas;
- paths de evidencia restringidos.

Presupuestos iniciales del piloto, no estándares universales: generación `<= 10 s`, pico
estimado `<= 256 MiB`, PNG de entrada `<= 16 MiB`, decodificado `<= 64 MiB`, geometrías
`<= 256`, materiales `<= 128`, texturas `<= 64`, dispose `<= 2 s` y capturas `<= 8`.

No se ejecutó el piloto, no se instaló ni ejecutó upstream y no se validaron fidelidad
visual, renderer real, WebGPU ni hardware. El adapter mínimo demuestra forwarding del
contrato, no una captura real. El siguiente sprint debe producir el asset, capturas y
manifest y someterlos al gate crítico.
