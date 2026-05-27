import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { validateCoordinates } from "../validation.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerTapTool: RegisterTool = (server) => {
  server.registerTool(
    "android_tap",
    {
      title: "Tap Android screen",
      description: "Run adb shell input tap with x/y coordinates.",
      inputSchema: {
        x: z.number().int(),
        y: z.number().int(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ x, y, deviceId }) => {
      try {
        validateCoordinates({ x, y }, ["x", "y"]);
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const result = await adb(["shell", "input", "tap", x, y], { deviceId: resolvedDeviceId });
        rememberSessionContext({ deviceId: resolvedDeviceId });
        return textResponse(formatOutput(`Tapped ${x},${y}`, result));
      } catch (error) {
        return textResponse(`Failed to tap screen:\n${formatError(error)}`);
      }
    }
  );
};
