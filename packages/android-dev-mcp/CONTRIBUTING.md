# Contributing

Thanks for helping improve `android-dev-mcp`.

## Development

```powershell
npm install
npm run build
npm run typecheck
npm run doctor
```

## Guidelines

- Keep the project ADB-only and MCP stdio-based.
- Avoid heavy dependencies.
- Do not add OCR, OpenCV, Appium, HTTP servers, or background daemons without prior discussion.
- Keep tools modular under `src/tools/`.
- Preserve backward compatibility for existing tool names and inputs.
- Add docs or templates when a change affects onboarding.

## Pull Requests

Please include:

- What changed.
- Why it changed.
- Validation performed.
- Any Android device/emulator details if behavior was tested with ADB.

