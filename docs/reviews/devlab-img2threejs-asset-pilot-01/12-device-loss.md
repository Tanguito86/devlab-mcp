# Device loss

The final harness used `WEBGL_lose_context` during a `DevLabCaptureTarget`
capture. The attempted frame raised `DeviceLostError`, advanced no sequence, and
left the target visibly in `DEVICE_LOST` with a bound failed request.

Explicit recovery restored the same canvas/context contract. An explicit retry
used the identical request, seed, spec hash, view, camera, lighting, frame, and
dimensions. The retry became sequence one and reproduced the accepted game-scale
PNG SHA-256. The incomplete frame was never emitted or marked successful, and
dispose completed.
