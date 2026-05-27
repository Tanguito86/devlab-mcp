import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { createFailureReport } from "../failureDiagnostics.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { formatUiMatch } from "../uiParser.js";
import { dumpAndFindUiNodes } from "./findUi.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerTapResourceTool: RegisterTool = (server) => {
  server.registerTool(
    "android_tap_resource",
    {
      title: "Tap Android resource",
      description: "Shortcut for tapping a node by resource-id.",
      inputSchema: {
        resourceId: z.string().min(1),
        index: z.number().int().nonnegative().optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ resourceId, index, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const result = await dumpAndFindUiNodes({ resourceId, deviceId: resolvedDeviceId });
        if (result.matches.length === 0) {
          const reportPath = await createFailureReport("tap-resource-no-match", { deviceId: resolvedDeviceId }, { resourceId });
          return textResponse(`No resource match found for "${resourceId}".\nfailure report: ${reportPath}`);
        }

        if (index === undefined && result.matches.length > 1) {
          return textResponse(
            [`Multiple resource matches found (${result.matches.length}). Pass index to choose one.`]
              .concat(result.matches.map((match, matchIndex) => formatUiMatch(match, matchIndex)))
              .join("\n\n")
          );
        }

        const selectedIndex = index ?? 0;
        const selected = result.matches[selectedIndex];
        if (selected?.centerX === undefined || selected.centerY === undefined) {
          const reportPath = await createFailureReport("tap-resource-invalid-match", { deviceId: resolvedDeviceId }, { resourceId, index: selectedIndex });
          return textResponse(`Resource match is missing usable bounds.\nfailure report: ${reportPath}`);
        }

        await adb(["shell", "input", "tap", selected.centerX, selected.centerY], { deviceId: resolvedDeviceId });
        rememberSessionContext({ deviceId: resolvedDeviceId });
        return textResponse(`Tapped resource "${resourceId}" at ${selected.centerX},${selected.centerY}.\n\n${formatUiMatch(selected, selectedIndex)}`);
      } catch (error) {
        return textResponse(`Failed to tap resource:\n${formatError(error)}`);
      }
    }
  );
};
