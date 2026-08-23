import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  authoredPlanWireOutputSchema,
  inspectInputSchema,
  inspectWireOutputSchema,
  newObjectInputSchema,
  newRoomInputSchema,
  newScriptInputSchema,
  newTilesetInputSchema,
  placeInstanceInputSchema,
  planInputSchema,
  planWireOutputSchema,
  READ_ONLY_ANNOTATIONS,
  readTextInputSchema,
  readTextWireOutputSchema,
  statusInputSchema,
  statusWireOutputSchema,
  tileLayerInputSchema,
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
    "gamemaker_read_text",
    {
      title: "Read GameMaker project files",
      description:
        "Return the text of project files, so an edit can be planned against what a file actually says. Readable extensions are exactly the ones the plan tools may write: .gml, .yy, .yyp, .json, .resource_order. Each file comes back with the digest of the bytes on disk; hand that same text, modified, to gamemaker_plan. Requires the exact inspect fingerprint, because text read against one project state and edited against another is how a concurrent change gets overwritten.",
      inputSchema: readTextInputSchema,
      outputSchema: readTextWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.readText(input, extra.requestId, extra.signal));
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

  server.registerTool(
    "gamemaker_plan_new_room",
    {
      title: "Plan a new GameMaker room",
      description:
        "Return an immutable plan that creates a room with an instance layer and a background layer, optionally pre-populated with object instances, and registers it in the project's resources and room order. Writes nothing; hand the returned plan to gamemaker_apply of the write-tier server.",
      inputSchema: newRoomInputSchema,
      outputSchema: authoredPlanWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.planNewRoom(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "gamemaker_plan_place_instance",
    {
      title: "Plan placing object instances into an existing room",
      description:
        "Return an immutable plan that adds instances to a room that already exists. The room is patched as text, never re-rendered, so layers and settings this server does not model survive untouched. Writes nothing; hand the returned plan to gamemaker_apply of the write-tier server.",
      inputSchema: placeInstanceInputSchema,
      outputSchema: authoredPlanWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.planPlaceInstance(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "gamemaker_plan_new_tileset",
    {
      title: "Plan a new GameMaker tileset",
      description:
        "Return an immutable plan that slices an existing sprite into a tileset and registers it in the project. The sprite's pixel size is read from the project, so only the tile size is supplied; the resulting tile count is (spriteWidth / tileWidth) * (spriteHeight / tileHeight), indexed from zero in reading order. Writes nothing; hand the returned plan to gamemaker_apply of the write-tier server.",
      inputSchema: newTilesetInputSchema,
      outputSchema: authoredPlanWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.planNewTileset(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "gamemaker_plan_tile_layer",
    {
      title: "Plan a tile layer for an existing room",
      description:
        "Return an immutable plan that adds a run-length encoded tile layer to a room that already exists, painting cells from a tileset already in the project. Cells are row-major tile indices; -2147483648 leaves a cell blank, and index 0 is GameMaker's reserved blank tile. The tile size and tile count are read from the tileset, and every index is bounds-checked against it. The room is patched as text, so layers and settings this server does not model survive untouched. Writes nothing; hand the returned plan to gamemaker_apply of the write-tier server.",
      inputSchema: tileLayerInputSchema,
      outputSchema: authoredPlanWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.planTileLayer(input, extra.requestId, extra.signal));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  return server;
}
