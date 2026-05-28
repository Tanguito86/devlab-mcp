import { z } from "zod";
import { formatError } from "../adb.js";
import { getCurrentActivity } from "../activity.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerCurrentAppTool: RegisterTool = (server) => {
  server.registerTool(
    "android_current_app",
    {
      title: "Get the currently focused Android app",
      description: "Returns the package and activity name of the app currently in focus. Uses dumpsys window and dumpsys activity as fallbacks.",
      inputSchema: {
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const activity = await getCurrentActivity({ deviceId: resolvedDeviceId });

        const output = [
          `package: ${activity.packageName ?? "unknown"}`,
          `activity: ${activity.activityName ?? "unknown"}`,
          `---`,
          `raw currentFocus: ${activity.rawSource}`
        ].join("\n");

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to get current app:\n${formatError(error)}`);
      }
    }
  );
};
