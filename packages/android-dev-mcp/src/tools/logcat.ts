import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { getAppProfile } from "../appProfiles.js";
import { rememberSessionContext, resolveApp, resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

function escapeRegexTag(tag: string): string {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const registerLogcatTools: RegisterTool = (server) => {
  server.registerTool(
    "android_clear_logcat",
    {
      title: "Clear Android logcat",
      description: "Clear the Android logcat buffer.",
      inputSchema: {
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        await adb(["logcat", "-c"], { deviceId: resolvedDeviceId });
        rememberSessionContext({ deviceId: resolvedDeviceId });
        return textResponse("Logcat cleared.");
      } catch (error) {
        return textResponse(`Failed to clear logcat:\n${formatError(error)}`);
      }
    }
  );

  server.registerTool(
    "android_read_logcat",
    {
      title: "Read Android logcat",
      description: "Read logcat output filtered by manual tags or app profile tags.",
      inputSchema: {
        app: z.string().min(1).optional(),
        tags: z.array(z.string().min(1)).optional(),
        lines: z.number().int().positive().max(5000).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ app, tags, lines, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const resolvedApp = resolveApp(app);
        const profileTags = resolvedApp ? (await getAppProfile(resolvedApp)).logTags ?? [] : [];
        const activeTags = tags && tags.length > 0 ? tags : profileTags;
        const lineCount = lines ?? 200;
        const result = await adb(["logcat", "-d", "-t", lineCount], { deviceId: resolvedDeviceId });
        rememberSessionContext({ app: resolvedApp, deviceId: resolvedDeviceId });
        let output = result.stdout.trim();

        if (activeTags.length > 0) {
          const tagPattern = new RegExp(`\\b(${activeTags.map(escapeRegexTag).join("|")})\\b`);
          output = output
            .split(/\r?\n/)
            .filter((line) => tagPattern.test(line))
            .join("\n")
            .trim();
        }

        if (!output) {
          const filterLabel = activeTags.length > 0 ? ` for tags: ${activeTags.join(", ")}` : "";
          return textResponse(`No logcat lines found${filterLabel}.`);
        }

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to read logcat:\n${formatError(error)}`);
      }
    }
  );
};
