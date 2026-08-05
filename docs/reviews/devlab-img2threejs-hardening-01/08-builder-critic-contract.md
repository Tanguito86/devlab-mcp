# Builder / Critic / Resolver

La biblioteca expresa tres productos incompatibles entre sí:

- `BuildArtifact` (`BUILDER_OUTPUT`) contiene identidad, path y hashes; no tiene campo de aprobación.
- `CriticReport` (`CRITIC_OUTPUT`) queda ligado al SHA-256 del artifact y exige evidencia no vacía por finding.
- `Resolution` (`RESOLVER_OUTPUT`) registra hash de artifact, hash del reporte, decisión y códigos bloqueantes.

Un coordinador confiable crea tres puertos de capacidad separados usando un secreto de
autoridad de al menos 256 bits. Artifacts, reportes y resoluciones quedan ligados por
session ID, binding SHA-256 completo y HMAC. Los constructores de rol crudos no forman
parte del export público y `package.json` bloquea deep imports.

Los objetos se copian profundamente y se congelan. El builder no recibe una API para
crear reportes ni resoluciones. El critic no puede mutar el artifact. El resolver valida
rol, sesión, binding, firma, severidad y categoría runtime (`SECURITY`, `TECHNICAL`,
`VISUAL`, `PRODUCT`) antes de aplicar una tabla
cerrada: `BLOCKER -> BLOCKED`, `REQUIRED -> CHANGES_REQUIRED`, solo `OPTIONAL` o ausencia
de findings permite `APPROVED`.
