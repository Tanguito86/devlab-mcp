import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { getAppProfile } from "../appProfiles.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerUninstallAppTool: RegisterTool = (server) => {
  server.registerTool(
    "android_uninstall_app",
    {
      title: "Uninstall an Android app",
      description: "Uninstall an app from the device. WARNING: This removes the app permanently. Use keepData=true to preserve app data and cache directories.",
      inputSchema: {
        app: z.string().min(1).optional(),
        package: z.string().min(1).optional(),
        keepData: z.boolean().optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ app, package: pkg, keepData, deviceId }) => {
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

        const keep = keepData === true;
        const args = keep
          ? ["shell", "pm", "uninstall", "-k", resolvedPackage]
          : ["uninstall", resolvedPackage];

        const result = await adb(args, { deviceId: resolvedDeviceId });

        const output = [
          `package: ${resolvedPackage}`,
          app ? `profile: ${app}` : null,
          `keepData: ${keep}`,
          `---`,
          "WARNING: App has been uninstalled from the device.",
          keep ? "App data and cache directories were preserved (-k flag)." : "All app data was removed.",
          `---`,
          result.stdout.trim() || "OK"
        ].filter(Boolean).join("\n");

        return textResponse(output);
      } catch (error) {
        const message = formatError(error);
        const hint = message.includes("not installed for")
          ? `\n\nPackage is not installed on the device.`
          : message.includes("DELETE_FAILED_DEVICE_POLICY_MANAGER")
            ? "\n\nThis app is protected by a device policy and cannot be uninstalled via ADB."
            : message.includes("DELETE_FAILED_INTERNAL_ERROR")
              ? "\n\nThe uninstall failed — the app may be a system app or protected."
              : "";

        return textResponse(`Failed to uninstall app:\n${message}${hint}`);
      }
    }
  );
};
