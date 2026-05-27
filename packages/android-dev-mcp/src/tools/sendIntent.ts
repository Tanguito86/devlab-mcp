import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { resolveDeviceId } from "../sessionContext.js";
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

export const registerSendIntentTool: RegisterTool = (server) => {
  server.registerTool(
    "android_send_intent",
    {
      title: "Send an Android broadcast intent",
      description: "Send a generic Android broadcast intent with optional extras. Supports string, integer, and boolean extras. Use --es, --ei, --ez flags.",
      inputSchema: {
        action: z.string().min(1),
        package: z.string().min(1).optional(),
        component: z.string().min(1).optional(),
        extras: z.record(z.string(), extraValueSchema).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ action, package: pkg, component, extras, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);

        const args: Array<string | number> = ["shell", "am", "broadcast", "-a", action];

        if (pkg) {
          args.push("-p", pkg);
        }

        if (component) {
          args.push("-n", component);
        }

        const extraKeys: string[] = [];
        for (const [key, value] of Object.entries(extras ?? {})) {
          appendExtra(args, key, value);
          extraKeys.push(key);
        }

        const result = await adb(args, { deviceId: resolvedDeviceId });

        const output = [
          `action: ${action}`,
          pkg ? `package: ${pkg}` : null,
          component ? `component: ${component}` : null,
          extraKeys.length > 0 ? `extras (${extraKeys.length}): ${extraKeys.join(", ")}` : null,
          `---`,
          result.stdout.trim() || result.stderr.trim() || "Broadcast completed"
        ].filter(Boolean).join("\n");

        return textResponse(output);
      } catch (error) {
        const message = formatError(error);
        const hint = message.includes("No receivers")
          ? "\n\nNo broadcast receivers are registered for this intent action."
          : message.includes("Permission Denial")
            ? "\n\nThe intent requires a permission that is not granted."
            : "";

        return textResponse(`Failed to send intent:\n${message}${hint}`);
      }
    }
  );
};
