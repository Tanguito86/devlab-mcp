import { formatError } from "../adb.js";
import { listAppProfiles } from "../appProfiles.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerListAppsTool: RegisterTool = (server) => {
  server.registerTool(
    "android_list_apps",
    {
      title: "List configured Android apps",
      description: "List app profiles from config/apps.json with package, activity, workflows, and debug intents.",
      inputSchema: {}
    },
    async () => {
      try {
        const profiles = await listAppProfiles();
        const names = Object.keys(profiles).sort();

        if (names.length === 0) {
          return textResponse("No app profiles configured.");
        }

        const output = names.map((name) => {
          const profile = profiles[name];
          const workflows = Object.keys(profile.workflows ?? {}).sort();
          const debugIntents = Object.keys(profile.debugIntents ?? {}).sort();

          return [
            `App: ${name}`,
            `package: ${profile.package}`,
            `activity: ${profile.activity}`,
            `workflows: ${workflows.length > 0 ? workflows.join(", ") : "none"}`,
            `debug intents: ${debugIntents.length > 0 ? debugIntents.join(", ") : "none"}`
          ].join("\n");
        });

        return textResponse(output.join("\n\n"));
      } catch (error) {
        return textResponse(`Failed to list app profiles:\n${formatError(error)}`);
      }
    }
  );
};
