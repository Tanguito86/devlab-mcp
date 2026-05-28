# Debug Intents

Debug intents are optional Android broadcast actions implemented by your app and exposed through `config/apps.json`.

They are useful for agent workflows because they provide stable, app-defined entry points that do not depend on fragile UI taps.

## Configure

```json
{
  "apps": {
    "myapp": {
      "package": "com.example.myapp",
      "activity": ".MainActivity",
      "debugIntents": {
        "openDebugPanel": "com.example.myapp.DEBUG_OPEN_PANEL",
        "dumpState": "com.example.myapp.DEBUG_DUMP_STATE"
      }
    }
  }
}
```

Use:

```json
{
  "app": "myapp",
  "intent": "dumpState",
  "extras": {
    "level": 3,
    "enabled": true,
    "label": "agent-check"
  }
}
```

## Kotlin Example

```kotlin
class DebugReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "com.example.myapp.DEBUG_OPEN_PANEL" -> {
                // Open a debug screen or set a debug flag.
            }
            "com.example.myapp.DEBUG_DUMP_STATE" -> {
                val level = intent.getIntExtra("level", 0)
                val enabled = intent.getBooleanExtra("enabled", false)
                val label = intent.getStringExtra("label")
                // Dump useful app state to logcat.
            }
        }
    }
}
```

Manifest:

```xml
<receiver
    android:name=".DebugReceiver"
    android:exported="true">
    <intent-filter>
        <action android:name="com.example.myapp.DEBUG_OPEN_PANEL" />
        <action android:name="com.example.myapp.DEBUG_DUMP_STATE" />
    </intent-filter>
</receiver>
```

## Java Example

```java
public class DebugReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if ("com.example.myapp.DEBUG_DUMP_STATE".equals(action)) {
            int level = intent.getIntExtra("level", 0);
            boolean enabled = intent.getBooleanExtra("enabled", false);
            String label = intent.getStringExtra("label");
            // Dump useful app state to logcat.
        }
    }
}
```

## ADB Equivalent

The MCP tool sends:

```powershell
adb shell am broadcast -a com.example.myapp.DEBUG_DUMP_STATE
```

With `deviceId`, it uses:

```powershell
adb -s SERIAL shell am broadcast -a com.example.myapp.DEBUG_DUMP_STATE
```

