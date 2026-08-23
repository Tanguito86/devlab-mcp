import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  applyInputSchema,
  applyWireOutputSchema,
  createProjectInputSchema,
  createProjectWireOutputSchema,
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

  server.registerTool(
    "gamemaker_create_project",
    {
      title: "Create an empty GameMaker project",
      description:
        "Write the two files an empty GameMaker project consists of, byte-identical to what ProjectTool's PROJECT NEW produces, at an absent path whose real parent directory already exists. Existing paths are never replaced; only a valid durable PREPARING claim for the exact same request can be resumed. This is the one write with no plan and no rollback: there is no prior state to bind to, and removing a project is not offered. Defaults to a dry run. Follow it with gamemaker_inspect to get the fingerprint the plan tools require.",
      inputSchema: createProjectInputSchema,
      outputSchema: createProjectWireOutputSchema,
      annotations: MUTATING_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.createProject(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  return server;
}
