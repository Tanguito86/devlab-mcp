import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { getAppProfile } from "../appProfiles.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

const extraValueSchema = z.union([z.string(), z.number(), z.boolean()]);

function appendExtra(args: Array<string | number>, key: string, value: string | number | boolean): void {
  if (typeof value === "boolean") {
    args.push("--ez", key, value ? "true" : "false");
    return;
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      args.push("--ei", key, value);
      return;
    }

    args.push("--ef", key, value);
    return;
  }

  args.push("--es", key, value);
}

export const registerDebugIntentTool: RegisterTool = (server) => {
  server.registerTool(
    "android_send_debug_intent",
    {
      title: "Send Android debug intent",
      description: "Send a configured app debug broadcast intent from config/apps.json.",
      inputSchema: {
        app: z.string().min(1),
        intent: z.string().min(1),
        extras: z.record(z.string(), extraValueSchema).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ app, intent, extras, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const profile = await getAppProfile(app);
        const action = profile.debugIntents?.[intent];

        if (!action) {
          const available = Object.keys(profile.debugIntents ?? {}).sort().join(", ") || "none";
          return textResponse(`Unknown debug intent "${intent}" for app "${app}". Available intents: ${available}.`);
        }

        const args: Array<string | number> = ["shell", "am", "broadcast", "-p", profile.package, "-a", action];
        for (const [key, value] of Object.entries(extras ?? {})) {
          appendExtra(args, key, value);
        }

        const result = await adb(args, { deviceId: resolvedDeviceId });
        rememberSessionContext({ app, deviceId: resolvedDeviceId });
        return textResponse(formatOutput(`Sent debug intent ${intent} for ${app}`, result));
      } catch (error) {
        return textResponse(`Failed to send debug intent:\n${formatError(error)}`);
      }
    }
  );
};
