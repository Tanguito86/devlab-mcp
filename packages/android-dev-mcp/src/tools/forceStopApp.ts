import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { getAppProfile } from "../appProfiles.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerForceStopAppTool: RegisterTool = (server) => {
  server.registerTool(
    "android_force_stop_app",
    {
      title: "Force stop Android app",
      description: "Force stop an Android app by package using a profile from config/apps.json.",
      inputSchema: {
        app: z.string().min(1),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ app, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const profile = await getAppProfile(app);
        const result = await adb(["shell", "am", "force-stop", profile.package], { deviceId: resolvedDeviceId });
        rememberSessionContext({ app, deviceId: resolvedDeviceId });
        return textResponse(formatOutput(`Force-stopped ${app} (${profile.package})`, result));
      } catch (error) {
        return textResponse(`Failed to force stop app:\n${formatError(error)}`);
      }
    }
  );
};
