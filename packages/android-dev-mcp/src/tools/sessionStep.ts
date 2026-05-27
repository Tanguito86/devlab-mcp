import { z } from "zod";
import { formatError } from "../adb.js";
import { resolveDeviceId } from "../sessionContext.js";
import { appendAction, validateSessionId } from "../sessionManager.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerSessionStepTool: RegisterTool = (server) => {
  server.registerTool(
    "android_session_step",
    {
      title: "Record a session step",
      description: "Record an action within a testing session with optional screenshot and UI dump evidence.",
      inputSchema: {
        sessionId: z.string().min(1),
        action: z.string().min(1),
        screenshot: z.boolean().optional(),
        uiDump: z.boolean().optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ sessionId, action, screenshot, uiDump, deviceId }) => {
      try {
        validateSessionId(sessionId);
        const resolvedDeviceId = resolveDeviceId(deviceId);

        let screenshotRel: string | undefined;
        let uiDumpRel: string | undefined;

        if (screenshot) {
          const safeAction = action.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
          screenshotRel = `screenshots/step_${safeAction}.png`;
          const { captureScreenshot } = await import("../inspection.js");
          const fullPath = `sessions/${sessionId}/${screenshotRel}`;
          await captureScreenshot(fullPath, { deviceId: resolvedDeviceId });
        }

        if (uiDump) {
          const safeAction = action.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
          uiDumpRel = `ui-dumps/step_${safeAction}.xml`;
          const { captureUiDump } = await import("../inspection.js");
          const fullPath = `sessions/${sessionId}/${uiDumpRel}`;
          await captureUiDump(fullPath, { deviceId: resolvedDeviceId });
        }

        const entry = await appendAction(sessionId, action, screenshotRel, uiDumpRel);

        const output = [
          `step: ${entry.step}`,
          `action: ${entry.action}`,
          `timestamp: ${entry.timestamp}`,
          entry.screenshot ? `screenshot: ${entry.screenshot}` : null,
          entry.uiDump ? `uiDump: ${entry.uiDump}` : null
        ].filter(Boolean).join("\n");

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to record session step:\n${formatError(error)}`);
      }
    }
  );
};
