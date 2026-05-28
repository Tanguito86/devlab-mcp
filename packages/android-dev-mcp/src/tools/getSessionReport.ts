import { z } from "zod";
import { formatError } from "../adb.js";
import { getSessionReport, validateSessionId } from "../sessionManager.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerGetSessionReportTool: RegisterTool = (server) => {
  server.registerTool(
    "android_get_session_report",
    {
      title: "Get session report",
      description: "Read the final-report.md for a completed session. The session must be stopped first.",
      inputSchema: {
        sessionId: z.string().min(1)
      }
    },
    async ({ sessionId }) => {
      try {
        validateSessionId(sessionId);
        const report = await getSessionReport(sessionId);

        const output = [
          `reportPath: sessions/${sessionId}/final-report.md`,
          `---`,
          report
        ].join("\n");

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to get session report:\n${formatError(error)}`);
      }
    }
  );
};
