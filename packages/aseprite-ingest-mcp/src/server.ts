import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  asepriteIngestInputSchema,
  asepriteIngestWireOutputSchema,
  asepriteInspectInputSchema,
  asepriteInspectWireOutputSchema,
  asepriteStatusInputSchema,
  asepriteStatusWireOutputSchema,
  asepritePublishInputSchema,
  asepritePublishWireOutputSchema,
  INGEST_ANNOTATIONS,
  PUBLISH_ANNOTATIONS,
  PROBE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  type ToolOutput,
} from "./contracts.js";
import { GovernedAsepriteIngestService, mapToolError } from "./core.js";

function response(output: ToolOutput) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    structuredContent: output,
    ...(output.ok ? {} : { isError: true }),
  };
}

export function createAsepriteIngestMcpServer(
  service: GovernedAsepriteIngestService = new GovernedAsepriteIngestService(),
): McpServer {
  const server = new McpServer({ name: "aseprite-ingest-mcp", version: "0.1.0" });

  server.registerTool(
    "aseprite_status",
    {
      title: "Aseprite ingest status",
      description:
        "Report whether this host can ingest: the executable, the source root, the catalog root, the write opt-in, and the available origin presets. Starts no process and returns no filesystem path.",
      inputSchema: asepriteStatusInputSchema,
      outputSchema: asepriteStatusWireOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (_input, extra) => {
      try {
        return response(await service.status(extra.requestId));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "aseprite_inspect",
    {
      title: "Inspect an Aseprite source",
      description:
        "Read one Aseprite file's frame count, canvas size, colour format and frame timings. Runs Aseprite headlessly against a throwaway scratch directory and writes nothing to the catalog.",
      inputSchema: asepriteInspectInputSchema,
      outputSchema: asepriteInspectWireOutputSchema,
      annotations: PROBE_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.inspect(input, extra.requestId));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "aseprite_ingest",
    {
      title: "Ingest an Aseprite source into the catalog",
      description:
        "Export the frames and write a spec, artifact manifest and PNG exports into the Asset Forge catalog layout, returning a DRAFT catalog entry. The frames are exported twice and must be byte-identical. Requires the write opt-in.",
      inputSchema: asepriteIngestInputSchema,
      outputSchema: asepriteIngestWireOutputSchema,
      annotations: INGEST_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.ingest(input, extra.requestId));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  server.registerTool(
    "aseprite_publish",
    {
      title: "Publish an ingested asset into the catalog index",
      description:
        "Register an already-ingested asset in the Asset Forge catalog index at the requested status. APPROVED is what the Asset-GM bridge requires before an import. The entry is rebuilt from the spec and artifact manifest on disk rather than accepted from the caller, and every exported frame is re-checked against the digest and byte length recorded at ingest: an asset whose bytes changed cannot be published. Defaults to a dry run.",
      inputSchema: asepritePublishInputSchema,
      outputSchema: asepritePublishWireOutputSchema,
      annotations: PUBLISH_ANNOTATIONS,
    },
    async (input, extra) => {
      try {
        return response(await service.publish(input, extra.requestId));
      } catch (error) {
        return response(mapToolError(error, extra.requestId));
      }
    },
  );

  return server;
}
