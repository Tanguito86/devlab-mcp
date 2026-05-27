import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { getAppProfile } from "../appProfiles.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerManagePermissionsTool: RegisterTool = (server) => {
  server.registerTool(
    "android_manage_permissions",
    {
      title: "Grant or revoke Android app permissions",
      description: "Grant or revoke a runtime permission for an app. Use this to test permission-dependent flows.",
      inputSchema: {
        app: z.string().min(1),
        permission: z.string().min(1),
        action: z.enum(["grant", "revoke"]),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ app, permission, action, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const profile = await getAppProfile(app);
        const result = await adb(
          ["shell", "pm", action, profile.package, permission],
          { deviceId: resolvedDeviceId }
        );

        const output = [
          `app: ${app}`,
          `package: ${profile.package}`,
          `permission: ${permission}`,
          `action: ${action}`,
          `---`,
          result.stdout.trim() || result.stderr.trim() || "OK"
        ].join("\n");

        return textResponse(output);
      } catch (error) {
        const message = formatError(error);
        const hint = message.includes("not a changeable permission type")
          ? "\n\nThis permission may not be a runtime permission that can be granted/revoked via ADB."
          : message.includes("Unknown package")
            ? `\n\nPackage for app "${app}" is not installed on the device.`
            : "";

        return textResponse(`Failed to ${action} permission:\n${message}${hint}`);
      }
    }
  );
};
