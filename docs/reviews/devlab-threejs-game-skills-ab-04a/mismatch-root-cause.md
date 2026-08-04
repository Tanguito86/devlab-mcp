# DEVLAB-THREEJS-GAME-SKILLS-AB-04A — Causa raíz de la discrepancia

## Dictamen

El bloqueo de AB-04 fue correcto. DevLab, WebGPU y el checkout externo no
fallaron. El preflight encontró que la autorización operativa más reciente y
el contrato v1 versionado definían benchmarks distintos; ejecutar cualquiera
de las piernas habría invalidado el control A/B.

## Qué no fue la causa

- El repositorio DevLab estaba en el HEAD y la branch esperados, sin cambios.
- La fuente externa estaba detached, limpia y en el pin autorizado.
- La allowlist validaba todos sus archivos y hashes.
- El run root de producción no existía.
- La diferencia entre el hash físico CRLF del prompt y su hash canónico LF era
  una consecuencia esperable de `core.autocrlf`, no evidencia de tampering.

## Discrepancia v1 frente a la autorización vigente

Esta tabla es evidencia histórica no ejecutable. Los valores operativos
vigentes deben leerse exclusivamente de `benchmark-contract.json`.

| Campo | Contrato v1 | Autorización AB-04/AB-04A |
| --- | --- | --- |
| Esfuerzo | `high` | `ultra` |
| Seed de mundo | `1729` | `424242` |
| Viewport desktop | `960×540` | `1280×720` |
| Construcciones por pierna | dos runs | una construcción independiente |
| Presupuesto | 120 minutos por run | 240 minutos totales por pierna |
| Ciclos | tres reworks por run | un ciclo de implementación y dos de corrección |

Además:

- el prompt v1 era internamente hash-correcto, pero no era el contrato funcional
  exacto autorizado para reanudar AB-04;
- el runbook v1 todavía declaraba que la ejecución no estaba autorizada;
- `devlab-internal-threejs-game-benchmark-v1` era solo un identificador: no
  resolvía a una plantilla materializable ni a un procedimiento reproducible.

## Causa raíz

Los valores compartidos tenían más de una fuente manual: documentos del
repositorio y texto de autorización copiado desde la conversación. Esas copias
evolucionaron por separado. El hash del prompt protegía un archivo contra
deriva byte a byte canónica, pero no demostraba que ese archivo representara la
configuración operativa más reciente. Tampoco existía una cadena verificable
que enlazara contrato, prompt, gates, políticas y scaffold real.

La ausencia de un scaffold materializable agravaba la discrepancia: aun
eligiendo uno de los dos conjuntos de parámetros, no era posible demostrar que
ambas piernas arrancarían desde árboles idénticos.

## Corrección sistémica en AB-04A

AB-04A elimina la causa en vez de elegir manualmente entre copias:

1. `benchmark-contract.json` pasa a ser la única fuente manual de configuración
   compartida y se versiona como `ab04-v2`.
2. Prompt, gates y políticas se derivan del contrato y fallan cerrado ante
   cualquier diferencia.
3. Las políticas conservan solo identidad de pierna, tratamiento y el hash del
   contrato común.
4. Los textos usan SHA-256 sobre UTF-8 sin BOM con LF canónico; los binarios se
   hashean sobre sus bytes originales.
5. El scaffold tiene una ruta real, lockfile, árbol hash-locked y un
   materializador stdlib con staging y controles de ruta.
6. El preflight de reanudación queda reducido al nuevo `EXPECTED_HEAD`, la ruta
   del contrato y un comando de verificación; no vuelve a copiar los parámetros
   compartidos.

## Clasificación

El estado de AB-04 al detectar el problema fue
`BLOCKED / BENCHMARK_BASELINE_CHANGED`. No corresponde
`INVALID / BENCHMARK_INTEGRITY_FAILURE`, porque ninguna pierna había empezado y
no existía evidencia comparativa que contaminar.

AB-04 solo puede pasar a `AUTHORIZED / READY_TO_RESUME` después de que AB-04A
complete sus validaciones, cierre un commit único y publique ese commit como el
nuevo `EXPECTED_HEAD` local, sin push ni tag.
