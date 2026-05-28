import { mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { fileSize, timestampForPath } from "../inspection.js";
import { toAdbHostPath } from "../pathUtils.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

const REMOTE_VIDEO_PATH = "/sdcard/android-dev-mcp-recording.mp4";

export const registerRecordVideoTool: RegisterTool = (server) => {
  server.registerTool(
    "android_record_video",
    {
      title: "Record Android screen",
      description: "Record a short Android screen video using adb shell screenrecord.",
      inputSchema: {
        durationSec: z.number().int().positive().max(180).optional(),
        outputPath: z.string().min(1).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ durationSec, outputPath, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const duration = durationSec ?? 10;
        const videoPath = outputPath ?? path.join("recordings", `android-${timestampForPath()}.mp4`);
        const resolvedPath = path.resolve(process.cwd(), videoPath);

        await mkdir(path.dirname(resolvedPath), { recursive: true });
        await adb(["shell", "rm", "-f", REMOTE_VIDEO_PATH], { deviceId: resolvedDeviceId });
        await adb(["shell", "screenrecord", "--time-limit", duration, REMOTE_VIDEO_PATH], { deviceId: resolvedDeviceId });
        await adb(["pull", REMOTE_VIDEO_PATH, toAdbHostPath(resolvedPath)], { deviceId: resolvedDeviceId });
        const size = await fileSize(resolvedPath);
        rememberSessionContext({ deviceId: resolvedDeviceId });

        return textResponse([`Video saved to ${videoPath}`, `size: ${size} bytes`, `duration: ${duration} seconds`].join("\n"));
      } catch (error) {
        return textResponse(`Failed to record video:\n${formatError(error)}`);
      }
    }
  );
};
