import path from "node:path";
import { z } from "zod";
import { formatError } from "../adb.js";
import { captureScreenshot, captureUiDump, getDeviceMetadata, timestampForPath, writeMetadata } from "../inspection.js";
import { rememberSessionContext, resolveApp, resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerCaptureStateTool: RegisterTool = (server) => {
  server.registerTool(
    "android_capture_state",
    {
      title: "Capture Android state",
      description: "Capture screenshot, UI hierarchy, and basic device metadata together.",
      inputSchema: {
        app: z.string().min(1).optional(),
        outputDir: z.string().min(1).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ app, outputDir, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const resolvedApp = resolveApp(app);
        const timestamp = timestampForPath();
        const captureDir = outputDir ?? path.join("captures", timestamp);
        const screenshotPath = path.join(captureDir, "screenshot.png");
        const uiDumpPath = path.join(captureDir, "window_dump.xml");
        const metadataPath = path.join(captureDir, "metadata.json");

        const screenshotSize = await captureScreenshot(screenshotPath, { deviceId: resolvedDeviceId });
        const uiDumpSize = await captureUiDump(uiDumpPath, { deviceId: resolvedDeviceId });
        const metadata = await getDeviceMetadata({ deviceId: resolvedDeviceId }, resolvedApp);
        await writeMetadata(metadataPath, metadata);
        rememberSessionContext({ app: resolvedApp, deviceId: resolvedDeviceId });

        return textResponse(
          [
            `Capture state saved to ${captureDir}`,
            `screenshot: ${screenshotPath} (${screenshotSize} bytes)`,
            `ui dump: ${uiDumpPath} (${uiDumpSize} bytes)`,
            `metadata: ${metadataPath}`
          ].join("\n")
        );
      } catch (error) {
        return textResponse(`Failed to capture Android state:\n${formatError(error)}`);
      }
    }
  );
};
