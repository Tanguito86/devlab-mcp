# MCP Client Setup

All MCP clients need:

- Node.js 20 or newer.
- Android SDK Platform Tools installed.
- `adb` available in `PATH`.
- USB debugging enabled.
- The phone/emulator authorized by ADB.

Build first:

```powershell
npm install
npm run build
```

## Installation Modes

Local repository build:

```json
{
  "mcpServers": {
    "android-dev-mcp": {
      "command": "node",
      "args": [
        "C:/Users/Deposito/Documents/android-dev-mcp/dist/index.js"
      ]
    }
  }
}
```

Global npm install:

```powershell
npm install -g @tanguito/android-dev-mcp
```

```json
{
  "mcpServers": {
    "android-dev-mcp": {
      "command": "android-dev-mcp",
      "args": []
    }
  }
}
```

Future `npx` usage:

```json
{
  "mcpServers": {
    "android-dev-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@tanguito/android-dev-mcp"
      ]
    }
  }
}
```

## Claude Desktop

```json
{
  "mcpServers": {
    "android-dev-mcp": {
      "command": "node",
      "args": [
        "C:/Users/Deposito/Documents/android-dev-mcp/dist/index.js"
      ]
    }
  }
}
```

Installed binary form after npm publication:

```json
{
  "mcpServers": {
    "android-dev-mcp": {
      "command": "android-dev-mcp",
      "args": []
    }
  }
}
```

## Cursor

```json
{
  "mcpServers": {
    "android-dev-mcp": {
      "command": "node",
      "args": [
        "C:/Users/Deposito/Documents/android-dev-mcp/dist/index.js"
      ]
    }
  }
}
```

## OpenCode

```json
{
  "mcpServers": {
    "android-dev-mcp": {
      "command": "node",
      "args": [
        "C:/Users/Deposito/Documents/android-dev-mcp/dist/index.js"
      ]
    }
  }
}
```

## Generic MCP stdio Client

```json
{
  "mcpServers": {
    "android-dev-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/android-dev-mcp/dist/index.js"
      ]
    }
  }
}
```

If installed globally in the future:

```json
{
  "mcpServers": {
    "android-dev-mcp": {
      "command": "android-dev-mcp",
      "args": []
    }
  }
}
```
