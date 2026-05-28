import { z } from "zod";
import { formatError } from "../adb.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { createSession } from "../sessionManager.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerStartSessionTool: RegisterTool = (server) => {
  server.registerTool(
    "android_start_session",
    {
      title: "Start a testing session",
      description: "Create a timestamped session directory for evidence capture. Optionally clears logcat and records device info.",
      inputSchema: {
        name: z.string().min(1).optional(),
        clearLogcat: z.boolean().optional(),
        app: z.string().min(1).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ name, clearLogcat, app, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const meta = await createSession(
          name ?? "session",
          clearLogcat !== false,
          { deviceId: resolvedDeviceId },
          app
        );
        rememberSessionContext({ app, deviceId: resolvedDeviceId });

        const output = [
          `sessionId: ${meta.sessionId}`,
          `sessionDir: sessions/${meta.sessionId}`,
          `name: ${meta.name}`,
          `device: ${meta.deviceModel}, Android ${meta.androidVersion} (SDK ${meta.sdk})`,
          `logcatCleared: ${clearLogcat !== false}`,
          `startedAt: ${meta.startedAt}`
        ].join("\n");

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to start session:\n${formatError(error)}`);
      }
    }
  );
};
