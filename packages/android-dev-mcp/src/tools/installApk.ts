import { access } from "node:fs/promises";
import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerInstallApkTool: RegisterTool = (server) => {
  server.registerTool(
    "android_install_apk",
    {
      title: "Install Android APK",
      description: "Install a debug APK using adb install -r.",
      inputSchema: {
        apkPath: z.string().min(1),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ apkPath, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        await access(apkPath);
        const result = await adb(["install", "-r", apkPath], { deviceId: resolvedDeviceId });
        rememberSessionContext({ deviceId: resolvedDeviceId });
        return textResponse(formatOutput(`Installed APK: ${apkPath}`, result));
      } catch (error) {
        return textResponse(`Failed to install APK:\n${formatError(error)}`);
      }
    }
  );
};
