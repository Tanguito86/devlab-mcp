import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { adbBinary, formatError } from "../adb.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerScreenshotTool: RegisterTool = (server) => {
  server.registerTool(
    "android_screenshot",
    {
      title: "Capture Android screenshot",
      description: "Capture a PNG screenshot using adb exec-out screencap -p.",
      inputSchema: {
        outputPath: z.string().min(1).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ outputPath, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const screenshotPath = outputPath ?? path.join("screenshots", `android-${Date.now()}.png`);
        const resolvedPath = path.resolve(process.cwd(), screenshotPath);
        const png = await adbBinary(["exec-out", "screencap", "-p"], { deviceId: resolvedDeviceId });

        await mkdir(path.dirname(resolvedPath), { recursive: true });
        await writeFile(resolvedPath, png);
        rememberSessionContext({ deviceId: resolvedDeviceId });

        return textResponse(`Screenshot saved to ${screenshotPath}`);
      } catch (error) {
        return textResponse(`Failed to capture screenshot:\n${formatError(error)}`);
      }
    }
  );
};
