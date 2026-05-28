import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerSetBluetoothTool: RegisterTool = (server) => {
  server.registerTool(
    "android_set_bluetooth",
    {
      title: "Toggle Android Bluetooth",
      description: "Enable or disable Bluetooth on the device. Best-effort: may be blocked by OEM restrictions or Android version.",
      inputSchema: {
        enabled: z.boolean(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ enabled, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const opts = { deviceId: resolvedDeviceId };
        const results: string[] = [];

        if (enabled) {
          try {
            await adb(["shell", "svc", "bluetooth", "enable"], opts);
            results.push("svc bluetooth enable: OK");
          } catch (e) {
            results.push(`svc bluetooth enable: ${formatError(e)}`);
          }

          try {
            await adb(["shell", "settings", "put", "global", "bluetooth_on", "1"], opts);
            results.push("settings put global bluetooth_on 1: OK");
          } catch (e) {
            results.push(`settings put global bluetooth_on 1: ${formatError(e)}`);
          }
        } else {
          try {
            await adb(["shell", "svc", "bluetooth", "disable"], opts);
            results.push("svc bluetooth disable: OK");
          } catch (e) {
            results.push(`svc bluetooth disable: ${formatError(e)}`);
          }

          try {
            await adb(["shell", "settings", "put", "global", "bluetooth_on", "0"], opts);
            results.push("settings put global bluetooth_on 0: OK");
          } catch (e) {
            results.push(`settings put global bluetooth_on 0: ${formatError(e)}`);
          }
        }

        const warning = enabled
          ? "NOTE: Bluetooth enable may fail on some devices due to OEM restrictions or Android security policies."
          : "NOTE: Bluetooth disable may silently reconnect after a delay on some devices.";

        const output = [
          `requested: ${enabled ? "enabled" : "disabled"}`,
          `---`,
          ...results,
          `---`,
          warning
        ].join("\n");

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to toggle Bluetooth:\n${formatError(error)}`);
      }
    }
  );
};
