import { z } from "zod";
import { formatError } from "../adb.js";
import { getAppProfile, listAppProfiles } from "../appProfiles.js";
import { textResponse, type RegisterTool } from "./types.js";

function formatWorkflows(app: string, workflows: string[]): string {
  return [`App: ${app}`, ...(workflows.length > 0 ? workflows.map((workflow) => `- ${workflow}`) : ["- none"])].join("\n");
}

export const registerListWorkflowsTool: RegisterTool = (server) => {
  server.registerTool(
    "android_list_workflows",
    {
      title: "List Android workflows",
      description: "List workflows configured for all apps or a specific app profile.",
      inputSchema: {
        app: z.string().min(1).optional()
      }
    },
    async ({ app }) => {
      try {
        if (app) {
          const profile = await getAppProfile(app);
          return textResponse(formatWorkflows(app, Object.keys(profile.workflows ?? {}).sort()));
        }

        const profiles = await listAppProfiles();
        const output = Object.keys(profiles)
          .sort()
          .map((name) => formatWorkflows(name, Object.keys(profiles[name].workflows ?? {}).sort()));

        return textResponse(output.join("\n\n"));
      } catch (error) {
        return textResponse(`Failed to list workflows:\n${formatError(error)}`);
      }
    }
  );
};
