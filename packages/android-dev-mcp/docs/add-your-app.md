# Add Your Android App

This guide shows how to add any Android app profile to `android-dev-mcp`.

## 1. Confirm ADB

```powershell
adb devices
```

Your device should appear with state `device`.

## 2. Find the Package Name

List packages:

```powershell
adb shell pm list packages
```

Filter on Windows:

```powershell
adb shell pm list packages | findstr example
```

## 3. Find the Current Activity

Launch the app manually, then run:

```powershell
adb shell dumpsys window | findstr mCurrentFocus
```

You should see a component like:

```text
com.example.myapp/.MainActivity
```

You can also ask Android to resolve a launch activity:

```powershell
adb shell cmd package resolve-activity --brief com.example.myapp
```

## 4. Add a Profile

Edit `config/apps.json`:

```json
{
  "apps": {
    "myapp": {
      "package": "com.example.myapp",
      "activity": ".MainActivity"
    }
  }
}
```

Then test:

```json
{ "app": "myapp" }
```

with `android_launch_app`.

## 5. Add Log Tags

If your app logs with stable tags:

```json
{
  "logTags": ["MyApp", "MyApp-Network"]
}
```

Then use:

```json
{ "app": "myapp", "lines": 300 }
```

with `android_read_logcat`.

## 6. Add Debug Intents

If your app exposes debug broadcast actions:

```json
{
  "debugIntents": {
    "openDebugPanel": "com.example.myapp.DEBUG_OPEN_PANEL",
    "dumpState": "com.example.myapp.DEBUG_DUMP_STATE"
  }
}
```

Then use:

```json
{ "app": "myapp", "intent": "dumpState" }
```

with `android_send_debug_intent`.

## 7. Add Workflows

Workflows are simple linear tool sequences:

```json
{
  "workflows": {
    "appSmoke": [
      { "tool": "android_launch_app", "args": {} },
      { "tool": "android_capture_state", "args": {} },
      { "tool": "android_generate_report", "args": { "lines": 300 } }
    ]
  }
}
```

Run with:

```json
{ "app": "myapp", "workflow": "appSmoke" }
```

## Templates

Copy one of these files as a starting point:

- `templates/apps.basic.json`
- `templates/apps.with-logcat.json`
- `templates/apps.with-debug-intents.json`
- `templates/apps.with-workflows.json`

