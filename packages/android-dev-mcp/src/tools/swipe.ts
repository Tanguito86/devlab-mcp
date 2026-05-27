import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { validateCoordinates } from "../validation.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerSwipeTool: RegisterTool = (server) => {
  server.registerTool(
    "android_swipe",
    {
      title: "Swipe Android screen",
      description: "Run adb shell input swipe with coordinates and optional duration.",
      inputSchema: {
        x1: z.number().int(),
        y1: z.number().int(),
        x2: z.number().int(),
        y2: z.number().int(),
        durationMs: z.number().int().positive().optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ x1, y1, x2, y2, durationMs, deviceId }) => {
      try {
        validateCoordinates({ x1, y1, x2, y2 }, ["x1", "y1", "x2", "y2"]);
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const args: Array<string | number> = ["shell", "input", "swipe", x1, y1, x2, y2];
        if (durationMs !== undefined) {
          args.push(durationMs);
        }

        const result = await adb(args, { deviceId: resolvedDeviceId });
        rememberSessionContext({ deviceId: resolvedDeviceId });
        return textResponse(formatOutput(`Swiped ${x1},${y1} to ${x2},${y2}`, result));
      } catch (error) {
        return textResponse(`Failed to swipe screen:\n${formatError(error)}`);
      }
    }
  );
};
