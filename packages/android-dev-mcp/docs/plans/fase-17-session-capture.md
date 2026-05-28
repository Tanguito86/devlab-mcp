# Fase 17 — Session Capture & Evidence Upgrade — Plan Técnico

## Estado actual (v1.1.0)

El MCP ya tiene capacidades de captura puntual:

| Tool existente | Qué captura | Limitación |
|---|---|---|
| `android_capture_state` | screenshot + UI dump + metadata | Instantánea única, sin narrativa |
| `android_generate_report` | screenshot + UI dump + logcat + device info + metadata | Lo mismo, más logcat |
| `android_clear_logcat` / `android_read_logcat` | Control de logcat | Manual, no asociado a sesión |
| `android_current_app` | Package/activity actual | Dato suelto |
| `android_device_info` | Manufacturer, model, SDK, battery | Dato suelto |
| `failureDiagnostics.ts` | `createFailureReport()` helper | Solo para errores, no sesiones |

**El gap:** no hay forma de decir "empecé a testear, hice paso A, paso B, paso C, terminé — dame todo junto con timeline".

## Alcance recomendado: MVP (Fase 17A)

5 tools nuevas. **36 → 41 tools total.**

NO incluir en MVP:
- Auto-session en workflows (Fase 17B)
- Video recording dentro de sesiones
- Session comparison / diff
- Performance metrics (CPU/mem)
- Session replay

## Diseño de tools

### 1. `android_start_session`

```
Input:
  name?: string              — label humano ("smoke-test-build-42")
  clearLogcat?: boolean      — default: true
  deviceId?: string
  app?: string

Comportamiento:
  1. Crear sessions/<timestamp>[-name]/
  2. Escribir metadata.json:
     { name, startedAt, deviceId, app, deviceModel, androidVersion }
  3. Si clearLogcat: adb logcat -c
  4. Guardar device info en device-info.json (getprop recortado)

Output:
  sessionId: "2026-05-26_18-30-15_smoke-test-build-42"
  sessionDir: "sessions/2026-05-26_18-30-15_smoke-test-build-42"
  logcatCleared: true
```

### 2. `android_session_step`

```
Input:
  sessionId: string           — requerido
  action: string              — "launched app", "tapped login", "sent debug intent X"
  screenshot?: boolean        — default: false
  uiDump?: boolean            — default: false
  deviceId?: string

Comportamiento:
  1. Leer sessions/<sessionId>/metadata.json → validar que existe
  2. Si screenshot: capturar → sessions/<id>/screenshots/step_N_action.png
  3. Si uiDump: capturar → sessions/<id>/ui-dumps/step_N_ui.xml
  4. Append línea JSON a actions.jsonl:
     { step, timestamp, action, screenshot?, uiDump? }
  5. step = auto-incremental (leer última línea de actions.jsonl)

Output:
  step: 3
  action: "tapped login"
  screenshot: "screenshots/step_3_tapped-login.png" (si aplica)
  timestamp: "2026-05-26T18:31:22.456Z"
```

### 3. `android_stop_session`

```
Input:
  sessionId: string
  deviceId?: string

Comportamiento:
  1. Leer metadata.json → validar sesión activa
  2. Capturar current app (android_current_app)
  3. Capturar logcat final → sessions/<id>/logcat.txt
  4. Capturar device info actualizado → actualizar device-info.json
  5. Generar final-report.md:

     # Session: <name>
     - Started: <ISO>
     - Ended: <ISO>
     - Duration: <X min Y s>
     - Device: <model>, Android <version>
     - App: <package>

     ## Actions
     | Step | Timestamp | Action | Evidence |
     |------|-----------|--------|----------|
     | 1    | ...       | ...    | screenshot |
     ...

     ## Final State
     - Current app: <package/activity>
     - Device: <model>, Android <version>, battery <N>%

     ## Logcat
     - Last N lines captured → logcat.txt

  6. Actualizar metadata.json con endedAt, currentApp, logcatPath

Output:
  sessionId
  duration: "2m 34s"
  steps: 5
  report: "sessions/<id>/final-report.md"
  logcat: "sessions/<id>/logcat.txt"
  status: "completed"
```

### 4. `android_list_sessions`

```
Input:
  limit?: number              — default: 20
  deviceId?: string           — opcional

Comportamiento:
  1. Leer sessions/ → ordenar por timestamp descendente
  2. Para cada sesión, leer metadata.json → mostrar:
     - sessionId
     - name
     - startedAt
     - endedAt (o "active" si no terminó)
     - stepCount (de actions.jsonl)
     - deviceModel

Output:
  2026-05-26_18-30-15_smoke-test-42  "smoke test build 42"  5 steps  completed  2m 34s
  2026-05-26_17-15-00_bt-audit       "BT audit"             12 steps  active     —
  ...
```

### 5. `android_get_session_report`

```
Input:
  sessionId: string

Comportamiento:
  1. Leer sessions/<id>/final-report.md
  2. Si no existe → error: "Session not stopped. Run android_stop_session first."

Output:
  reportPath: "sessions/<id>/final-report.md"
  content: <markdown completo>
```

## Estructura de archivos

```
sessions/
  <timestamp>[-name]/
    metadata.json          # { name, startedAt, endedAt?, deviceId, app, deviceModel, androidVersion, stepCount }
    actions.jsonl          # una línea JSON por paso
    device-info.json       # getprop resumido (manufacturer, model, sdk, release, abi)
    logcat.txt             # capturado en stop_session
    final-report.md        # generado en stop_session
    screenshots/
      step_1_launched-app.png
      step_3_tapped-login.png
    ui-dumps/
      step_1_ui.xml
```

## Schemas (Zod)

```ts
// metadata.json
{
  name: z.string(),
  startedAt: z.string(),          // ISO
  endedAt: z.string().optional(),
  deviceId: z.string().optional(),
  app: z.string().optional(),
  deviceModel: z.string(),
  androidVersion: z.string(),
  sdk: z.string(),
  stepCount: z.number().int().min(0),
  logcatPath: z.string().optional(),
  reportPath: z.string().optional()
}

// actions.jsonl (cada línea)
{
  step: z.number().int().positive(),
  timestamp: z.string(),          // ISO
  action: z.string(),
  screenshot: z.string().optional(),
  uiDump: z.string().optional()
}
```

## Integración con workflows (Fase 17B, NO ahora)

Idea para futuro: flag `session: true` en `android_run_workflow` que:
1. Llama `start_session` (name = workflow name)
2. En cada step, llama `session_step`
3. Al final, llama `stop_session`

Esto NO se implementa en 17A. Los workflows actuales siguen funcionando igual.

## Archivos a modificar/crear

| Archivo | Acción | Notas |
|---------|--------|-------|
| `src/tools/startSession.ts` | **Nuevo** | |
| `src/tools/sessionStep.ts` | **Nuevo** | |
| `src/tools/stopSession.ts` | **Nuevo** | |
| `src/tools/listSessions.ts` | **Nuevo** | |
| `src/tools/getSessionReport.ts` | **Nuevo** | |
| `src/sessionManager.ts` | **Nuevo** | Helpers compartidos: crear/leer metadata, append action, generar report |
| `src/index.ts` | Modificar | +5 imports + 5 registros |
| `tests/sessionCapture.test.js` | **Nuevo** | Tests de metadata, actions.jsonl, path sanitization |
| `README.md` | Modificar | Nueva sección "Session capture" |
| `docs/api-contract.md` | Modificar | 5 nuevas secciones |
| `CHANGELOG.md` | Modificar | `[Unreleased]` |

## Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| **Sesiones grandes** — logcat puede ser muy pesado | `lines` cap (5000) ya existe en `android_read_logcat`. Stop_session usa el mismo cap. |
| **Path handling Windows** — `:` en timestamps | Usar `timestampForPath()` existente que ya genera `2026-05-26_18-30-15` sin `:`. |
| **Múltiples sesiones activas** — ¿qué pasa si start_session sin stop? | Cada `start_session` es independiente. `list_sessions` muestra "active" las no terminadas. Sin límite artificial. |
| **deviceId/app inconsistency** — session step con otro device | El `deviceId` de metadata.json es el que se usó en `start_session`. Steps lo heredan si no se pasa explícitamente. |
| **Concurrencia** — dos tools escribiendo actions.jsonl | No aplica: MCP stdio es single-threaded. |
| **Fallo en medio de sesión** — stop_session nunca llamado | `list_sessions` muestra sesiones "active". `stop_session` puede cerrar sesiones antiguas detectando que `endedAt` es null. |

## Tests mínimos (node:test)

| Test | Qué valida |
|------|-----------|
| `sessionManager.createSession` genera metadata.json correcto | Campos requeridos, timestamp ISO |
| `sessionManager.createSession` sanitiza nombre con espacios/caracteres especiales | `"smoke test v2.0!"` → `"smoke-test-v2_0"` |
| `sessionManager.appendAction` escribe JSONL incremental | step auto-incremental, timestamp ISO |
| `sessionManager.generateReport` produce markdown con tabla de acciones | Encabezados, tabla, duración calculada |
| `sessionManager.readMetadata` rechaza sessionId inválido | Sin path traversal (`../`) |
| `startSession` input validation | `name` opcional, `clearLogcat` boolean |
| `sessionStep` rechaza sessionId inexistente | Error claro |
| `stopSession` rechaza sessionId ya terminado | Error: "already completed" |
| `listSessions` ordena por fecha descendente | Sesión nueva primero |
| `getSessionReport` rechaza sesión no terminada | Error: "run stop_session first" |

## Prompt final para implementación

```
Fase 17A — Session capture & evidence upgrade

Objetivo:
Agregar 5 tools de captura de sesiones al MCP, sin romper APIs existentes.

Reglas:
- NO publicar npm
- NO tag/release
- NO modificar tools existentes
- NO modificar workflows
- NO agregar dependencias
- Mantener ADB puro
- Mantener compatibilidad Windows (usar timestampForPath existente)
- Sin estado en memoria — todo en archivos bajo sessions/

Tools a implementar:
1. android_start_session
2. android_session_step
3. android_stop_session
4. android_list_sessions
5. android_get_session_report

Helpers nuevos:
- src/sessionManager.ts — createSession, appendAction, readMetadata, generateReport, validateSessionId

Estructura de sessions/:
  sessions/<timestamp>[-name]/
    metadata.json
    actions.jsonl
    device-info.json
    logcat.txt
    final-report.md
    screenshots/
    ui-dumps/

Tests:
- 10 tests mínimos con node:test
- Validar path sanitization, metadata, actions.jsonl, report generation, lifecycle

Docs:
- README.md — nueva sección "Session capture"
- docs/api-contract.md — 5 nuevas secciones
- CHANGELOG.md — [Unreleased]

Commit sugerido:
Add session capture & evidence tools

Validación final:
npm run clean && npm run build && npm run typecheck && npm test && npm pack
```
