import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { formatError } from "../adb.js";
import { captureUiDump, timestampForPath } from "../inspection.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { filterUiNodes, formatUiFilters, hasAnyUiFilter, type UiFilters } from "../uiFilters.js";
import { formatUiMatch, parseUiNodes } from "../uiParser.js";
import { textResponse, type RegisterTool } from "./types.js";

export async function dumpAndFindUiNodes(input: UiFilters & {
  deviceId?: string;
}) {
  const deviceId = resolveDeviceId(input.deviceId);
  const dumpPath = path.join("ui-dumps", `find-${timestampForPath()}.xml`);
  await captureUiDump(dumpPath, { deviceId });
  const xml = await readFile(path.resolve(process.cwd(), dumpPath), "utf8");
  const nodes = parseUiNodes(xml);
  const matches = filterUiNodes(nodes, input);

  if (deviceId) {
    rememberSessionContext({ deviceId });
  }

  return { dumpPath, matches, filters: input };
}

export const registerFindUiTool: RegisterTool = (server) => {
  server.registerTool(
    "android_find_ui",
    {
      title: "Find Android UI nodes",
      description: "Dump and search Android UI hierarchy nodes by text or resource-id.",
      inputSchema: {
        text: z.string().min(1).optional(),
        resourceId: z.string().min(1).optional(),
        className: z.string().min(1).optional(),
        packageName: z.string().min(1).optional(),
        clickable: z.boolean().optional(),
        enabled: z.boolean().optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ text, resourceId, className, packageName, clickable, enabled, deviceId }) => {
      try {
        const filters = { text, resourceId, className, packageName, clickable, enabled };
        if (!hasAnyUiFilter(filters)) {
          return textResponse("Provide at least one UI filter.");
        }

        const result = await dumpAndFindUiNodes({ ...filters, deviceId });
        if (result.matches.length === 0) {
          return textResponse(`No UI matches found.\nfilters: ${formatUiFilters(filters)}\ndump: ${result.dumpPath}`);
        }

        return textResponse(
          [`Found ${result.matches.length} UI match(es).`, `filters: ${formatUiFilters(filters)}`, `dump: ${result.dumpPath}`]
            .concat(result.matches.map((match, index) => formatUiMatch(match, index)))
            .join("\n\n")
        );
      } catch (error) {
        return textResponse(`Failed to find UI nodes:\n${formatError(error)}`);
      }
    }
  );
};
