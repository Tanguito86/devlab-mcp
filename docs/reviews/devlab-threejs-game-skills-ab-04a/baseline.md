# DEVLAB-THREEJS-GAME-SKILLS-AB-04A — Baseline

## Alcance

AB-04A es un sprint de reconciliación contractual y de materialización del
scaffold común. No ejecuta `LEG_A`, `LEG_B`, la evaluación ciega ni la decisión
comparativa de DEVLAB-THREEJS-GAME-SKILLS-AB-04.

## Preflight que abrió el sprint

El preflight de AB-04 se detuvo antes de crear builders o evidencia de juego.
La inspección de solo lectura dejó este baseline:

- repositorio DevLab: `H:\UserData\Deposito\Documents\devlab-mcp`;
- branch: `master`;
- HEAD: `4c66a883e58d021ebd955789d0b324a098c61e85`;
- worktree: limpio; `git status --porcelain` no produjo entradas;
- fuente externa: detached y limpia en
  `7221c1f4a6d2ae189a4d85d058d24f3228499d46`;
- contrato v1: los trece archivos obligatorios estaban presentes, tracked y sin
  archivos adicionales en el directorio;
- allowlist externa: veinticinco rutas únicas, regulares, tracked, contenidas en
  el checkout y con sus veinticinco SHA-256 coincidentes;
- el run root de producción no existía;
- el worktree y la branch coordinadores de AB-04 tampoco existían.

Por lo tanto, el bloqueo no fue causado por suciedad del repositorio, deriva de
la fuente externa ni reutilización de una ejecución anterior.

## Evidencia de integridad del baseline v1

El `promptSha256` almacenado en el contrato v1 sí coincidía con el contenido de
`benchmark-prompt.md` al aplicar la política textual correcta: UTF-8 sin BOM y
normalización CRLF a LF. El hash distinto observado sobre los bytes físicos del
worktree provenía de `core.autocrlf=true`; no demostraba una modificación del
prompt.

La discrepancia que detuvo AB-04 era semántica: el contrato versionado y la
autorización operativa describían configuraciones diferentes. El benchmark no
había comenzado, de modo que detenerse conservó una comparación válida.

## Worktree de reconciliación

AB-04A trabaja únicamente en:

`H:\UserData\Deposito\Documents\devlab-mcp-ab04-contract`

El worktree fue solicitado desde el baseline anterior y con la branch aislada
`devlab-threejs-game-skills-ab-04a`. La aceptación de AB-04A deberá producir un
nuevo `EXPECTED_HEAD`; hasta entonces, la declaración
`AUTHORIZED_READY_TO_RESUME` del contrato v2 describe el resultado pretendido
del sprint, no permiso para iniciar anticipadamente los builders A/B.

## Estado estático observado durante la documentación

Sin ejecutar instalaciones, builds, tests ni el materializador, la inspección
del árbol de trabajo confirmó:

- `benchmark-contract.json` declara `ab04-v2` y `sourceOfTruth: true`;
- prompt y gates tienen marca de archivo generado desde ese contrato;
- ambas políticas de pierna apuntan al mismo SHA-256 canónico del contrato;
- el runbook contiene `EXECUTION_AUTHORIZED: YES` y
  `CONTRACT_VERSION: ab04-v2`;
- no hay valores legacy en los archivos operativos inspeccionados;
- el scaffold nominal ahora resuelve a un directorio real con lockfile, código
  base y tests mínimos;
- los comandos de verificación, materialización y comparación están declarados
  en `package.json`;
- el run root de producción seguía ausente.

Estas observaciones prueban presencia y coherencia documental estática. Los
resultados de tests, build, typecheck, WebGPU y smoke pertenecen a la evidencia
de validación de AB-04A y no se infieren aquí.

## Límites preservados

- `BENCHMARK_A/B: NO EJECUTADO`
- `BUILDERS_A/B: NO INICIADOS`
- no se instalaron skills externas ni se ejecutó código upstream;
- no se modificaron repositorios de producto;
- no se hizo push ni tag.
