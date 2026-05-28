# Fase 17C — Session Validation Script

Ejecutar con dispositivo Android conectado vía USB (adb devices debe mostrar "device").

## Setup

```bash
# Asegurar que adb está en PATH o usar ruta completa
ADB="/mnt/c/Users/Deposito/AppData/Local/Android/Sdk/platform-tools/adb.exe"

# Verificar conectividad
$ADB devices
# Esperado: List of devices attached
#          RXXXXXXXXXX    device
```

## Test 1 — systemUiSmoke con session

```bash
cd /mnt/c/Users/Deposito/Documents/android-dev-mcp

# Ejecutar via MCP (o simular con node)
node -e "
const { runWorkflow } = require('./dist/workflows.js');
(async () => {
  const result = await runWorkflow('system', 'systemUiSmoke', null, {
    enabled: true,
    name: 'validation-smoke-17c',
    captureSteps: true,
    captureUiDumps: true,
    clearLogcat: true
  });
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error(e.message); process.exit(1); });
"
```

## Verificaciones

### 1. Estructura de sesión creada
```bash
ls sessions/*validation-smoke-17c/
# Esperado: metadata.json  actions.jsonl  device-info.json  logcat.txt  final-report.md  screenshots/  ui-dumps/
```

### 2. Screenshots por step
```bash
ls -la sessions/*validation-smoke-17c/screenshots/
# Esperado: step-1.png, step-2.png, step-3.png (3 steps en systemUiSmoke)
# Cada archivo > 10 KB (screenshot real, no vacío)
```

### 3. UI dumps por step
```bash
ls -la sessions/*validation-smoke-17c/ui-dumps/
# Esperado: step-1.xml, step-2.xml, step-3.xml
# Cada archivo > 500 bytes (XML de uiautomator válido)
```

### 4. Logcat final
```bash
wc -l sessions/*validation-smoke-17c/logcat.txt
# Esperado: > 100 líneas (logcat capturado)
head -5 sessions/*validation-smoke-17c/logcat.txt
# Esperado: líneas con formato timestamp estándar de Android
```

### 5. final-report.md legible
```bash
cat sessions/*validation-smoke-17c/final-report.md
# Esperado:
# - Título "# Session: validation-smoke-17c"
# - Sección "Started: ..."
# - Sección "Ended: ..."
# - Sección "Duration: Xm Ys"
# - Tabla "## Actions" con columnas Step | Timestamp | Action | Evidence
# - Sección "## Final State"
# - Sección "## Logcat"
```

### 6. actions.jsonl
```bash
cat sessions/*validation-smoke-17c/actions.jsonl | wc -l
# Esperado: 3 líneas (una por step)
cat sessions/*validation-smoke-17c/actions.jsonl | head -3
# Esperado: JSON válido con step, timestamp, action, screenshot, uiDump
```

### 7. metadata.json
```bash
cat sessions/*validation-smoke-17c/metadata.json | python3 -m json.tool
# Esperado: JSON válido con name, sessionId, startedAt, endedAt, deviceModel, androidVersion, sdk, stepCount, logcatPath, reportPath
```

## Resultados esperados

| Verificación | Criterio | Estado |
|---|---|---|
| Session creada | Directorio sessions/<ts>_validation-smoke-17c existe | ☐ |
| Screenshots | 3 PNGs > 10 KB cada uno | ☐ |
| UI dumps | 3 XMLs > 500 bytes cada uno | ☐ |
| Logcat | > 100 líneas | ☐ |
| Report | Markdown con título, timeline, tabla de acciones | ☐ |
| actions.jsonl | 3 líneas JSON válidas | ☐ |
| metadata.json | Campos startedAt, endedAt, stepCount=3 presentes | ☐ |
| No errores | Workflow: OK en output | ☐ |

## Cleanup post-test

```bash
rm -rf sessions/*validation-smoke-17c*/
rm -rf workflow-reports/*validation*
```
