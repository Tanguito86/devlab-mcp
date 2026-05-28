import { z } from "zod";
import { adb, formatError, listDevices, validateDeviceId } from "../adb.js";
import { rememberSessionContext } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerDevicesTool: RegisterTool = (server) => {
  server.registerTool(
    "adb_devices",
    {
      title: "List ADB devices",
      description: "List Android devices currently visible to adb.",
      inputSchema: {
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ deviceId }) => {
      try {
        if (deviceId) {
          await validateDeviceId(deviceId);
          const devices = await listDevices();
          const device = devices.find((candidate) => candidate.id === deviceId);
          rememberSessionContext({ deviceId });
          return textResponse(`Device ${deviceId} is connected with state ${device?.state ?? "unknown"}.`);
        }

        const result = await adb(["devices"]);
        const output = result.stdout.trim() || result.stderr.trim() || "No adb output.";
        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to list adb devices:\n${formatError(error)}`);
      }
    }
  );
};
