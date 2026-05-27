import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerStartActivityTool: RegisterTool = (server) => {
  server.registerTool(
    "android_start_activity",
    {
      title: "Start an Android activity",
      description: "Launch an arbitrary Android component (package/activity). Optionally specify an intent action. No config profile required.",
      inputSchema: {
        package: z.string().min(1),
        activity: z.string().min(1),
        action: z.string().min(1).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ package: pkg, activity, action, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);

        const args: Array<string | number> = ["shell", "am", "start"];
        if (action) {
          args.push("-a", action);
        }
        args.push("-n", `${pkg}/${activity}`);

        const result = await adb(args, { deviceId: resolvedDeviceId });

        const output = [
          `component: ${pkg}/${activity}`,
          action ? `action: ${action}` : null,
          `---`,
          result.stdout.trim() || result.stderr.trim() || "OK"
        ].filter(Boolean).join("\n");

        return textResponse(output);
      } catch (error) {
        const message = formatError(error);
        const hint = message.includes("does not exist") || message.includes("Error type 3")
          ? `\n\nComponent ${pkg}/${activity} does not exist or is not exported. Check the package and activity name.`
          : message.includes("Permission Denial")
            ? "\n\nThe activity is not exported or you lack permission to launch it."
            : "";

        return textResponse(`Failed to start activity:\n${message}${hint}`);
      }
    }
  );
};
