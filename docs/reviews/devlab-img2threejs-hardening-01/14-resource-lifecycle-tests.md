# Resource lifecycle

Los tests ejercitan las seis categorías de recursos, deduplicación por identidad,
políticas `SHARED` y `EXTERNAL`, mixers, listeners, referencias de escena, errores y doble
dispose. Un soak sintético de 100 ciclos crea seis recursos owned por ciclo y vuelve a
cero recursos vivos después de cada teardown; peak observado: 6, final observado: 0.

Esta es evidencia del contrato JavaScript independiente. No es una medición de heap GPU
ni sustituye un soak WebGPU del futuro piloto.
