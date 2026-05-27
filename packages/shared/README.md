# @tanguito/devlab-shared

Shared types, schemas, and helpers for the DevLab MCP Suite.

## What's included

- **naming** — `sanitizeName`, `validateSessionId` (filesystem-safe identifiers)
- **tools** — `textResponse`, `RegisterTool` type (MCP response helpers)
- **evidence** — `BaseSessionMetadata`, `BaseEvidenceEntry` (session/evidence contracts)
- **workflows** — `WorkflowStep`, `Workflow`, `StepResult` (workflow execution types)

## Design

- **Zero IO** — no `fs`, `child_process`, `path`, `os`, or any runtime deps
- **Pure contracts** — TypeScript types, Zod-ready schemas, string helpers
- **≤107 lines** — kept intentionally small to avoid coupling
- **No runtime coupling between MCP packages** — shared is build-time only

## Quick Start

```bash
pnpm build        # tsc → dist/
pnpm test         # 9 pure-contract tests
pnpm run doctor   # 17 health checks
```

## Usage

```typescript
import { sanitizeName, validateSessionId, textResponse } from "@tanguito/devlab-shared";

const name = sanitizeName("Hello World!");  // "hello-world"
validateSessionId("safe_id-123");            // OK
validateSessionId("../bad");                 // throws

const response = textResponse("hello");
// { content: [{ type: "text", text: "hello" }] }
```

## License

MIT
