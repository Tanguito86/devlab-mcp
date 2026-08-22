import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  assetApplyImportInputSchema,
  assetApplyWireOutputSchema,
  assetInspectInputSchema,
  assetInspectWireOutputSchema,
  assetPlanImportInputSchema,
  assetPlanWireOutputSchema,
  assetRollbackImportInputSchema,
  assetRollbackWireOutputSchema,
  assetStatusInputSchema,
  assetStatusWireOutputSchema,
  MUTATING_ANNOTATIONS,
  PLAN_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  ROLLBACK_ANNOTATIONS,
  type ToolOutput,
} from "./contracts.js";
import { GovernedAssetMcpService, mapToolError } from "./core.js";

function response(output: ToolOutput) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    structuredContent: output,
    ...(output.ok ? {} : { isError: true }),
  };
}

export function createGameMakerAssetMcpServer(
  service: GovernedAssetMcpService = new GovernedAssetMcpService(),
): McpServer {
  const server = new McpServer({ name: "gamemaker-asset-mcp", version: "0.1.0" });

  server.registerTool(
    "asset_status",
    {
      title: "Asset and project import status",
      description:
        "Report whether an Asset Forge asset is approved and whether the target GameMaker project is ready to receive it, plus any pending import transactions and whether writing is enabled on this host.",
      inputSchema: assetStatusInputSchema,
      outputSchema: assetStatusWireOutputSchema,
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
    "asset_inspect",
    {
      title: "Inspect a catalog asset",
      description:
        "Return an Asset Forge sprite's dimensions, frames, bounding box, budget verdict and lifecycle status. Touches no GameMaker project.",
      inputSchema: assetInspectInputSchema,
      outputSchema: assetInspectWireOutputSchema,
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
    "asset_plan_import",
    {
      title: "Plan a sprite import",
      description:
        "Bind an APPROVED catalog sprite to a GameMaker project and return an immutable plan summary with its planHash and bindingHash. Writes only the binding record, outside the project; the project itself is untouched.",
      inputSchema: assetPlanImportInputSchema,
      outputSchema: assetPlanWireOutputSchema,
      annotations: PLAN_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.planImport(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "asset_apply_import",
    {
      title: "Apply a planned sprite import",
      description:
        "Import the planned sprite into the project inside a locked transaction with a verified byte-exact backup. Defaults to a dry run. Requires the write opt-in.",
      inputSchema: assetApplyImportInputSchema,
      outputSchema: assetApplyWireOutputSchema,
      annotations: MUTATING_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.applyImport(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "asset_rollback_import",
    {
      title: "Roll back an applied sprite import",
      description:
        "Restore the project from the import's verified backup and report whether the restoration was byte-exact. Requires the write opt-in.",
      inputSchema: assetRollbackImportInputSchema,
      outputSchema: assetRollbackWireOutputSchema,
      annotations: ROLLBACK_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.rollbackImport(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  return server;
}
