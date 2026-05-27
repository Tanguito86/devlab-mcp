import path from "node:path";
import { z } from "zod";
import { captureUiDump, timestampForPath } from "../inspection.js";
import { formatError } from "../adb.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerUiDumpTool: RegisterTool = (server) => {
  server.registerTool(
    "android_ui_dump",
    {
      title: "Capture Android UI hierarchy",
      description: "Capture the current Android UI hierarchy using uiautomator dump.",
      inputSchema: {
        outputPath: z.string().min(1).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ outputPath, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const timestamp = timestampForPath();
        const dumpPath = outputPath ?? path.join("ui-dumps", `window_dump-${timestamp}.xml`);
        const size = await captureUiDump(dumpPath, { deviceId: resolvedDeviceId });
        rememberSessionContext({ deviceId: resolvedDeviceId });

        return textResponse([`UI dump saved to ${dumpPath}`, `size: ${size} bytes`, `timestamp: ${timestamp}`].join("\n"));
      } catch (error) {
        return textResponse(`Failed to capture UI dump:\n${formatError(error)}`);
      }
    }
  );
};
