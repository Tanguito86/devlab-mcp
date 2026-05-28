import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { getAppProfile } from "../appProfiles.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerOpenAppSettingsTool: RegisterTool = (server) => {
  server.registerTool(
    "android_open_app_settings",
    {
      title: "Open Android app settings screen",
      description: "Open the system Settings > App Info screen for a given package. Uses android.settings.APPLICATION_DETAILS_SETTINGS intent.",
      inputSchema: {
        app: z.string().min(1).optional(),
        package: z.string().min(1).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ app, package: pkg, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);

        let resolvedPackage = pkg;
        if (!resolvedPackage) {
          if (!app) {
            return textResponse("Provide either 'app' (config profile) or 'package' (package name).");
          }
          const profile = await getAppProfile(app);
          resolvedPackage = profile.package;
        }

        const result = await adb(
          [
            "shell", "am", "start",
            "-a", "android.settings.APPLICATION_DETAILS_SETTINGS",
            "-d", `package:${resolvedPackage}`
          ],
          { deviceId: resolvedDeviceId }
        );

        const output = [
          `package: ${resolvedPackage}`,
          app ? `profile: ${app}` : null,
          `intent: android.settings.APPLICATION_DETAILS_SETTINGS`,
          `---`,
          result.stdout.trim() || result.stderr.trim() || "OK — settings screen opened"
        ].filter(Boolean).join("\n");

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to open app settings:\n${formatError(error)}`);
      }
    }
  );
};
