import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { createFailureReport } from "../failureDiagnostics.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { formatUiMatch } from "../uiParser.js";
import { dumpAndFindUiNodes } from "./findUi.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerTapTextTool: RegisterTool = (server) => {
  server.registerTool(
    "android_tap_text",
    {
      title: "Tap Android text",
      description: "Shortcut for tapping a visible text node.",
      inputSchema: {
        text: z.string().min(1),
        index: z.number().int().nonnegative().optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ text, index, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const result = await dumpAndFindUiNodes({ text, deviceId: resolvedDeviceId });
        if (result.matches.length === 0) {
          const reportPath = await createFailureReport("tap-text-no-match", { deviceId: resolvedDeviceId }, { text });
          return textResponse(`No text match found for "${text}".\nfailure report: ${reportPath}`);
        }

        if (index === undefined && result.matches.length > 1) {
          return textResponse(
            [`Multiple text matches found (${result.matches.length}). Pass index to choose one.`]
              .concat(result.matches.map((match, matchIndex) => formatUiMatch(match, matchIndex)))
              .join("\n\n")
          );
        }

        const selectedIndex = index ?? 0;
        const selected = result.matches[selectedIndex];
        if (selected?.centerX === undefined || selected.centerY === undefined) {
          const reportPath = await createFailureReport("tap-text-invalid-match", { deviceId: resolvedDeviceId }, { text, index: selectedIndex });
          return textResponse(`Text match is missing usable bounds.\nfailure report: ${reportPath}`);
        }

        await adb(["shell", "input", "tap", selected.centerX, selected.centerY], { deviceId: resolvedDeviceId });
        rememberSessionContext({ deviceId: resolvedDeviceId });
        return textResponse(`Tapped text "${text}" at ${selected.centerX},${selected.centerY}.\n\n${formatUiMatch(selected, selectedIndex)}`);
      } catch (error) {
        return textResponse(`Failed to tap text:\n${formatError(error)}`);
      }
    }
  );
};
