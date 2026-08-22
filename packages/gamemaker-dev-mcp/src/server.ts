import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  authoredPlanWireOutputSchema,
  inspectInputSchema,
  inspectWireOutputSchema,
  newObjectInputSchema,
  newScriptInputSchema,
  planInputSchema,
  planWireOutputSchema,
  READ_ONLY_ANNOTATIONS,
  statusInputSchema,
  statusWireOutputSchema,
  type ToolOutput,
} from "./contracts.js";
import { mapToolError, ReadonlyGameMakerService } from "./core.js";

function response(output: ToolOutput) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    structuredContent: output,
    ...(output.ok ? {} : { isError: true }),
  };
}

export function createGameMakerMcpServer(
  service: ReadonlyGameMakerService = new ReadonlyGameMakerService(),
): McpServer {
  const server = new McpServer({
    name: "gamemaker-dev-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "gamemaker_status",
    {
      title: "GameMaker project status",
      description: "Read the governed status and fingerprint of one configured GameMaker project.",
      inputSchema: statusInputSchema,
      outputSchema: statusWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.status(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "gamemaker_inspect",
    {
      title: "Inspect GameMaker project",
      description: "Return a canonical read-only file and resource snapshot with SHA-256 fingerprints.",
      inputSchema: inspectInputSchema,
      outputSchema: inspectWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.inspect(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "gamemaker_plan",
    {
      title: "Plan a hypothetical GameMaker edit",
      description: "Validate an allowlisted text-only hypothetical modification and return a non-applicable immutable plan summary.",
      inputSchema: planInputSchema,
      outputSchema: planWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.plan(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "gamemaker_plan_new_script",
    {
      title: "Plan a new GameMaker script",
      description:
        "Return an immutable plan that creates a new GML script resource and registers it in the project. Writes nothing; hand the returned plan to gamemaker_apply of the write-tier server.",
      inputSchema: newScriptInputSchema,
      outputSchema: authoredPlanWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.planNewScript(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "gamemaker_plan_new_object",
    {
      title: "Plan a new GameMaker object",
      description:
        "Return an immutable plan that creates a new object with its event code and registers it in the project. Supported events: create, destroy, alarm, step, draw, other, cleanup. Writes nothing; hand the returned plan to gamemaker_apply of the write-tier server.",
      inputSchema: newObjectInputSchema,
      outputSchema: authoredPlanWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.planNewObject(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  return server;
}
