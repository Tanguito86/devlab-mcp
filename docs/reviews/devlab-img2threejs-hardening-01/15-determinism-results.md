# Resultados de determinismo

- misma definición con claves en distinto orden: módulo TypeScript byte a byte idéntico;
- módulo válido: compilación aislada PASS con TypeScript del workspace;
- mismo frameKey/dimensiones/seed/spec hash en fake target: payload y SHA-256 idénticos;
- el fake emite RGBA de longitud exacta; PNG y RGBA reales se admiten antes de secuenciar;
- el sequence number altera el nombre de evidencia, no el contenido capturado;
- inputs de manifest en distinto orden: manifest estructural idéntico;
- distinta seed: manifest distinto; distinto build/run ID: mismos entries y hashes de output;
- el manifest registra versión del generator y Three.js, spec hash, cámara, dimensiones,
  backend y opciones de captura;
- no se usa reloj, `Math.random`, red ni estado global mutable en los outputs.

El alcance demuestra determinismo de contratos y fake capture, no determinismo visual de
un renderer real.
