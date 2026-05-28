import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { getAppProfile } from "../appProfiles.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerAppInfoTool: RegisterTool = (server) => {
  server.registerTool(
    "android_app_info",
    {
      title: "Get detailed Android app info",
      description: "Returns package info including versionName, versionCode, install time, update time, and requested permissions. Uses dumpsys package.",
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
          ["shell", "dumpsys", "package", resolvedPackage],
          { deviceId: resolvedDeviceId }
        );

        const extract = (regex: RegExp): string => {
          const match = result.stdout.match(regex);
          return match?.[1] ?? "unknown";
        };

        const versionName = extract(/versionName=(\S+)/);
        const versionCode = extract(/versionCode=(\d+)/);
        const firstInstall = extract(/firstInstallTime=([^\n]+)/);
        const lastUpdate = extract(/lastUpdateTime=([^\n]+)/);

        // Extract runtime permissions (requested, not necessarily granted)
        const permMatches = result.stdout.matchAll(/requested: ([^\n]+)/g);
        const permissions = [...permMatches].map((m) => m[1].trim());

        // Check if enabled
        const enabledMatch = result.stdout.match(/enabled=([^\s\n]+)/);
        const disabledComponents = result.stdout.match(/disabledComponents/);

        const enabled = disabledComponents ? "partially disabled" : "enabled";

        const output = [
          `package: ${resolvedPackage}`,
          app ? `profile: ${app}` : null,
          `versionName: ${versionName}`,
          `versionCode: ${versionCode}`,
          `firstInstallTime: ${firstInstall}`,
          `lastUpdateTime: ${lastUpdate}`,
          `status: ${enabled}`,
          `---`,
          `requested permissions (${permissions.length}):`,
          ...(permissions.length > 0 ? permissions.map((p) => `  ${p}`) : ["  none"])
        ].filter(Boolean).join("\n");

        return textResponse(output);
      } catch (error) {
        const message = formatError(error);
        const hint = message.includes("Unknown package") || message.includes("does not exist")
          ? `\n\nPackage is not installed on the device.`
          : message.includes("Unknown app profile")
            ? ""
            : "";

        return textResponse(`Failed to get app info:\n${message}${hint}`);
      }
    }
  );
};
