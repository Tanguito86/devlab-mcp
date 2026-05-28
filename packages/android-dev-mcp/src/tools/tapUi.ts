import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { createFailureReport } from "../failureDiagnostics.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { formatUiFilters, hasAnyUiFilter } from "../uiFilters.js";
import { formatUiMatch } from "../uiParser.js";
import { dumpAndFindUiNodes } from "./findUi.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerTapUiTool: RegisterTool = (server) => {
  server.registerTool(
    "android_tap_ui",
    {
      title: "Tap Android UI node",
      description: "Find a UI node by text or resource-id and tap its center.",
      inputSchema: {
        text: z.string().min(1).optional(),
        resourceId: z.string().min(1).optional(),
        className: z.string().min(1).optional(),
        packageName: z.string().min(1).optional(),
        clickable: z.boolean().optional(),
        enabled: z.boolean().optional(),
        index: z.number().int().nonnegative().optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ text, resourceId, className, packageName, clickable, enabled, index, deviceId }) => {
      try {
        const filters = { text, resourceId, className, packageName, clickable, enabled };
        if (!hasAnyUiFilter(filters)) {
          return textResponse("Provide at least one UI filter.");
        }

        const resolvedDeviceId = resolveDeviceId(deviceId);
        const result = await dumpAndFindUiNodes({ ...filters, deviceId: resolvedDeviceId });

        if (result.matches.length === 0) {
          const reportPath = await createFailureReport("tap-ui-no-match", { deviceId: resolvedDeviceId }, { filters });
          return textResponse(`No UI matches found.\nfilters: ${formatUiFilters(filters)}\ndump: ${result.dumpPath}\nfailure report: ${reportPath}`);
        }

        if (index === undefined && result.matches.length > 1) {
          return textResponse(
            [`Multiple UI matches found (${result.matches.length}). Pass index to choose one.`, `filters: ${formatUiFilters(filters)}`, `dump: ${result.dumpPath}`]
              .concat(result.matches.map((match, matchIndex) => formatUiMatch(match, matchIndex)))
              .join("\n\n")
          );
        }

        const selectedIndex = index ?? 0;
        const selected = result.matches[selectedIndex];
        if (!selected) {
          const reportPath = await createFailureReport("tap-ui-bad-index", { deviceId: resolvedDeviceId }, { filters, index: selectedIndex });
          return textResponse(`No UI match at index ${selectedIndex}. Found ${result.matches.length} match(es).\nfailure report: ${reportPath}`);
        }

        if (selected.centerX === undefined || selected.centerY === undefined) {
          const reportPath = await createFailureReport("tap-ui-no-bounds", { deviceId: resolvedDeviceId }, { filters, index: selectedIndex });
          return textResponse(`Selected UI match has no usable bounds.\nfailure report: ${reportPath}\n\n${formatUiMatch(selected, selectedIndex)}`);
        }

        await adb(["shell", "input", "tap", selected.centerX, selected.centerY], { deviceId: resolvedDeviceId });
        if (resolvedDeviceId) {
          rememberSessionContext({ deviceId: resolvedDeviceId });
        }

        return textResponse(
          [
            `Tapped UI match #${selectedIndex}`,
            `total matches: ${result.matches.length}`,
            `coordinates: ${selected.centerX},${selected.centerY}`,
            `filters: ${formatUiFilters(filters)}`,
            `dump: ${result.dumpPath}`,
            formatUiMatch(selected, selectedIndex)
          ].join("\n\n")
        );
      } catch (error) {
        return textResponse(`Failed to tap UI node:\n${formatError(error)}`);
      }
    }
  );
};
