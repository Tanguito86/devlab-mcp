import { z } from "zod";
import { formatError } from "../adb.js";
import { listSessions } from "../sessionManager.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerListSessionsTool: RegisterTool = (server) => {
  server.registerTool(
    "android_list_sessions",
    {
      title: "List testing sessions",
      description: "List existing session directories with metadata (name, status, step count, duration).",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional()
      }
    },
    async ({ limit }) => {
      try {
        const sessions = await listSessions(limit ?? 20);

        if (sessions.length === 0) {
          return textResponse("No sessions found. Start one with android_start_session.");
        }

        const output = sessions.map((meta) => {
          const status = meta.endedAt ? "completed" : "active";
          let duration = "—";
          if (meta.endedAt) {
            const ms = new Date(meta.endedAt).getTime() - new Date(meta.startedAt).getTime();
            const min = Math.floor(ms / 60000);
            const sec = Math.floor((ms % 60000) / 1000);
            duration = `${min}m ${sec}s`;
          }

          return [
            `${meta.sessionId}`,
            `  name: ${meta.name}`,
            `  status: ${status}`,
            `  steps: ${meta.stepCount}`,
            `  duration: ${duration}`,
            `  device: ${meta.deviceModel}, Android ${meta.androidVersion}`,
            meta.app ? `  app: ${meta.app}` : null
          ].filter(Boolean).join("\n");
        });

        return textResponse(output.join("\n\n"));
      } catch (error) {
        return textResponse(`Failed to list sessions:\n${formatError(error)}`);
      }
    }
  );
};
