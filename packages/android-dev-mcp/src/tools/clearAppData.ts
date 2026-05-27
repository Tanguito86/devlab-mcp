import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { getAppProfile } from "../appProfiles.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerClearAppDataTool: RegisterTool = (server) => {
  server.registerTool(
    "android_clear_app_data",
    {
      title: "Clear Android app data",
      description: "Clear all local data, cache, and settings for an app. WARNING: this resets the app to factory state — user preferences, login state, and local files will be lost.",
      inputSchema: {
        app: z.string().min(1),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ app, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const profile = await getAppProfile(app);
        const result = await adb(
          ["shell", "pm", "clear", profile.package],
          { deviceId: resolvedDeviceId }
        );

        const output = [
          `app: ${app}`,
          `package: ${profile.package}`,
          `---`,
          "WARNING: All local data has been cleared (preferences, cache, login, config).",
          `result: ${result.stdout.trim() || "OK"}`
        ].join("\n");

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to clear app data:\n${formatError(error)}`);
      }
    }
  );
};
