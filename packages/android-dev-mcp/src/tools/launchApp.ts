import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { getAppProfile } from "../appProfiles.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerLaunchAppTool: RegisterTool = (server) => {
  server.registerTool(
    "android_launch_app",
    {
      title: "Launch Android app",
      description: "Launch an Android app using a profile from config/apps.json.",
      inputSchema: {
        app: z.string().min(1),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ app, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const profile = await getAppProfile(app);
        const component = `${profile.package}/${profile.activity}`;
        const result = await adb(["shell", "am", "start", "-n", component], { deviceId: resolvedDeviceId });
        rememberSessionContext({ app, deviceId: resolvedDeviceId });
        return textResponse(formatOutput(`Launched ${app} (${component})`, result));
      } catch (error) {
        return textResponse(`Failed to launch app:\n${formatError(error)}`);
      }
    }
  );
};
