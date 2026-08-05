# Revisión del crítico de seguridad

La revisión fue read-only y separada del builder. Cubrió inyección, PNG, autoridad de
roles, paths, manifests, recursos y admisión de captura.

## Iteraciones

1. La primera revisión bloqueó la aprobación porque el reporte del critic podía
   fabricarse y porque PNG todavía no era una única frontera. También exigió límites
   operativos, errores tipados, binding completo de evidencia, ownership/retry de
   recursos, escritura de artefactos fail-closed y validación runtime del manifest.
2. La segunda revisión confirmó esos cierres y pidió completar el reader de archivo
   acotado, la precondición de ownership/ACL del root y el schema exacto del manifest.
3. La revalidación de captura detectó que un readback no vacío podía admitirse sin
   verificar formato, dimensiones o longitud y que `alpha` no se comprobaba en runtime.
4. El cierre final verificó `alpha` booleano, dimensiones físicas acotadas, RGBA exacto,
   PNG canónico con dimensiones esperadas, admisión previa a secuencia y fake raw-only.

## Veredicto final

`PASS / SECURITY_AND_CAPTURE_CONTRACTS_CLOSED`

Findings abiertos: `BLOCKER 0 / REQUIRED 0 / OPTIONAL 0`.
