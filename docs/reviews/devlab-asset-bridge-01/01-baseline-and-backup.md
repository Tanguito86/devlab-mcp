# 01 — Baseline and backup

## Baseline verificado (independiente, por Codex, y re-confirmado por el Builder)

```text
REPOSITORY:        devlab-mcp
BRANCH:            master
INITIAL_HEAD:      9af3d7d647631c4c7bfcefbcde587074fdba7b9b
ORIGIN/MASTER:     6c447e9448aee35fc5cb185e1f6f8a505ffb8903
LOCAL_AHEAD:       21
REMOTE_AHEAD:      0
WORKTREE:          clean
INDEX:             empty
NODE:              v24.13.0
PNPM:              9.15.4
```

Re-confirmación del Builder (2026-08-05, antes de escribir archivos):
`git status` → "On branch master / nothing to commit, working tree clean";
`git rev-parse HEAD` → `9af3d7d647631c4c7bfcefbcde587074fdba7b9b`;
`git log --oneline -5` muestra la cadena de commits locales esperada
(DEVLAB-HERMES-BRIDGE-PILOT-01, DEVLAB-GM-BRIDGE-04/03/02/01).
Los 21 commits locales están presentes (bundle verify, abajo).
Procesos: cero GameMaker/Igor/Runner al inicio (inventario Win32_Process).

## Backup bundle (creado por Codex; NO se recrea ni modifica)

```text
PATH:      H:\Temp\Deposito\devlab-asset-bridge-01-baseline-9af3d7d-20260805-153449.bundle
SHA-256:   297730bc21b6c5a4e217992fe48c4556d124d5a9fce2376f8a55b851ec79aa21
```

Verificación read-only del Builder sobre el bundle existente:

```
$ git bundle verify "H:\Temp\Deposito\devlab-asset-bridge-01-baseline-9af3d7d-20260805-153449.bundle"
H:/Temp/Deposito/devlab-asset-bridge-01-baseline-9af3d7d-20260805-153449.bundle is okay
The bundle records a complete history.
The bundle uses this hash algorithm: sha1

$ git bundle list-heads <bundle>
9af3d7d647631c4c7bfcefbcde587074fdba7b9b refs/heads/master      ← HEAD = baseline
9af3d7d647631c4c7bfcefbcde587074fdba7b9b HEAD
6c447e9448aee35fc5cb185e1f6f8a505ffb8903 refs/remotes/origin/master
6c447e9448aee35fc5cb185e1f6f8a505ffb8903 refs/remotes/origin/HEAD
```

El bundle contiene 33 refs (todas las ramas locales + worktrees del historial),
historia completa y autocontenida, y su HEAD coincide exactamente con el baseline.

## Prueba de restauración (ejecutada por Codex, registrada aquí)

1. Clon del bundle en directorio temporal: `git clone <bundle> <temp>`.
2. HEAD del clon == `9af3d7d647631c4c7bfcefbcde587074fdba7b9b` (baseline).
3. Los 21 commits locales presentes: `git rev-list --count HEAD` == 21 (por encima de
   `origin/master` remoto), worktree del clon limpio.
4. Eliminación segura de la copia temporal: movida a Windows Recycle Bin
   (no borrado destructivo irrecuperable).
5. El bundle queda fuera del árbol trackeado (H:\Temp\Deposito), nunca dentro del repo,
   sin tag de respaldo.

## Estado de preservación

- No se modificó ni recreó el bundle durante este sprint.
- No se creó tag para el respaldo.
- El bundle no se incorpora al repositorio.
- Prohibiciones del baseline respetadas: sin rebase, push, tag, force-push ni cambios
  de origin. No se invocó cierre sobre ningún proceso ajeno. El piloto real exige
  cero procesos GameMaker al inicio y al final; la preservación de un Runner ajeno
  se prueba con identidad/PID en la suite, sin comparar la población cambiante de
  procesos no-GameMaker del sistema.
