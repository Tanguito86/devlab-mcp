import { z } from "zod";
import { formatError } from "../adb.js";
import { resolveDeviceId } from "../sessionContext.js";
import { stopSession, validateSessionId } from "../sessionManager.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerStopSessionTool: RegisterTool = (server) => {
  server.registerTool(
    "android_stop_session",
    {
      title: "Stop a testing session and generate report",
      description: "Finalize a session: capture logcat, current app, device info, and generate final-report.md.",
      inputSchema: {
        sessionId: z.string().min(1),
        logcatLines: z.number().int().min(100).max(5000).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ sessionId, logcatLines, deviceId }) => {
      try {
        validateSessionId(sessionId);
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const lines = logcatLines ?? 2000;

        const meta = await stopSession(sessionId, lines, { deviceId: resolvedDeviceId });

        const startedDate = new Date(meta.startedAt);
        const endedDate = new Date(meta.endedAt!);
        const durationMs = endedDate.getTime() - startedDate.getTime();
        const durationMin = Math.floor(durationMs / 60000);
        const durationSec = Math.floor((durationMs % 60000) / 1000);

        const output = [
          `sessionId: ${meta.sessionId}`,
          `status: completed`,
          `duration: ${durationMin}m ${durationSec}s`,
          `steps: ${meta.stepCount}`,
          `report: sessions/${meta.sessionId}/final-report.md`,
          `logcat: sessions/${meta.sessionId}/logcat.txt`
        ].join("\n");

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to stop session:\n${formatError(error)}`);
      }
    }
  );
};
