# Contrato `DevLabCaptureTarget`

La frontera de renderer es `CaptureAdapter`: `capture`, `recover` y `dispose`. El target
expone `begin`, `captureFrame`, `end` y `dispose`, además de ID, width, height, pixelRatio,
colorSpace y alpha. Mantiene `READY`, `IN_PROGRESS`, `DEVICE_LOST`, `RECOVERING` y
`DISPOSED`.

Cada sesión fija runId, seed, background, views y output format. Cada frame fija frameId,
viewId, camera/scene spec hashes y options hash. El target fija backend y dimensiones.
Texto, dimensiones lógicas y físicas, pixel ratio, pixels y bytes
de salida están acotados. `alpha` se valida como booleano en runtime. `raw-rgba` exige
exactamente `physicalWidth * physicalHeight * 4` bytes; `png` pasa por el parser canónico
y debe declarar las dimensiones físicas esperadas. La admisión sucede antes de avanzar
la secuencia, por lo que un readback truncado o corrupto no produce evidencia. Una
captura exitosa produce byteLength, SHA-256, procedencia,
path relativo y secuencia monotónica; no contiene wall clock. Device
loss no incrementa secuencia ni crea evidencia parcial, queda visible como estado y
requiere `recover` antes del retry. El fake adapter tiene una política explícita
`raw-rgba`-only y hace reproducibles estos gates sin
afirmar funcionamiento de WebGL, WebGPU o hardware real. `MinimumRendererCaptureAdapter`
adapta el contrato actual de readback/recovery/dispose y deja el mismo límite listo para
un backend WebGPU futuro. Los dispose concurrentes
comparten una única Promise y una única llamada al adapter.
