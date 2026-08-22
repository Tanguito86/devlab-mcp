import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  applyInputSchema,
  applyWireOutputSchema,
  EVIDENCE_ONLY_ANNOTATIONS,
  MUTATING_ANNOTATIONS,
  rollbackInputSchema,
  ROLLBACK_ANNOTATIONS,
  rollbackWireOutputSchema,
  verifyTextInputSchema,
  verifyTextWireOutputSchema,
  type ToolOutput,
} from "./contracts.js";
import { GovernedGameMakerWriteService, mapToolError } from "./core.js";

function response(output: ToolOutput) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    structuredContent: output,
    ...(output.ok ? {} : { isError: true }),
  };
}

export function createGameMakerWriteMcpServer(
  service: GovernedGameMakerWriteService = new GovernedGameMakerWriteService(),
): McpServer {
  const server = new McpServer({
    name: "gamemaker-write-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "gamemaker_apply",
    {
      title: "Apply a GameMaker mutation plan",
      description:
        "Apply an immutable plan from gamemaker_plan inside a locked, write-ahead transaction with a verified byte-exact backup. Defaults to a dry run. Never compiles and never launches a runtime.",
      inputSchema: applyInputSchema,
      outputSchema: applyWireOutputSchema,
      annotations: MUTATING_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.apply(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "gamemaker_verify_text",
    {
      title: "Verify GameMaker project text structure",
      description:
        "Parse every GameMaker JSON file and check basic GML structure. Writes verification evidence outside the project. Compilation and runtime verification are not available in this server.",
      inputSchema: verifyTextInputSchema,
      outputSchema: verifyTextWireOutputSchema,
      annotations: EVIDENCE_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.verifyText(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "gamemaker_rollback",
    {
      title: "Roll back an applied GameMaker transaction",
      description:
        "Restore an applied transaction from its verified backup blobs and report whether the restoration was byte-exact.",
      inputSchema: rollbackInputSchema,
      outputSchema: rollbackWireOutputSchema,
      annotations: ROLLBACK_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.rollback(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  return server;
}
