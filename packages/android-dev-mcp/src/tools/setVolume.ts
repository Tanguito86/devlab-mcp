import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerSetVolumeTool: RegisterTool = (server) => {
  server.registerTool(
    "android_set_volume",
    {
      title: "Set Android media volume",
      description: "Set the volume level for a given audio stream (default: 3 = media).",
      inputSchema: {
        level: z.number().int().min(0).max(15),
        stream: z.number().int().min(0).max(10).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ level, stream, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const streamType = stream ?? 3;
        const result = await adb(
          ["shell", "media", "volume", "--show", "--stream", streamType, "--set", level],
          { deviceId: resolvedDeviceId }
        );

        const output = [
          `stream: ${streamType}`,
          `level: ${level}`,
          `---`,
          result.stdout.trim() || "OK"
        ].join("\n");

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to set volume:\n${formatError(error)}`);
      }
    }
  );
};
