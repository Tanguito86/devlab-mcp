import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  BUILD_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  toolchainStatusInputSchema,
  toolchainStatusWireOutputSchema,
  verifyBuildInputSchema,
  verifyBuildWireOutputSchema,
  type ToolOutput,
} from "./contracts.js";
import { GovernedGameMakerBuildService, mapToolError } from "./core.js";

function response(output: ToolOutput) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    structuredContent: output,
    ...(output.ok ? {} : { isError: true }),
  };
}

export function createGameMakerCompileMcpServer(
  service: GovernedGameMakerBuildService = new GovernedGameMakerBuildService(),
): McpServer {
  const server = new McpServer({
    name: "gamemaker-compile-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "gamemaker_toolchain_status",
    {
      title: "GameMaker build toolchain status",
      description:
        "Report whether this host can run a governed GameMaker build: platform, opt-in flag, configured paths and their presence on disk. Starts no process and returns no filesystem paths.",
      inputSchema: toolchainStatusInputSchema,
      outputSchema: toolchainStatusWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (_input, extra) => {
      try {
        return response(await service.toolchainStatus(extra.requestId));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "gamemaker_verify_build",
    {
      title: "Verify a GameMaker build with real Igor",
      description:
        "Run the configured Igor against one project and report TEXT_VALID, PROJECT_LOAD_VALID and COMPILE_VALID. Igor is invoked with its Run verb, so the game is compiled AND briefly launched; owned Runners are terminated afterwards. Supply expectedRuntimeSignal to additionally assert RUNTIME_VALID. Modifies no project file.",
      inputSchema: verifyBuildInputSchema,
      outputSchema: verifyBuildWireOutputSchema,
      annotations: BUILD_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.verifyBuild(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  return server;
}
