import { z } from "zod";
import { adb, formatError } from "../adb.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerListPackagesTool: RegisterTool = (server) => {
  server.registerTool(
    "android_list_packages",
    {
      title: "List installed Android packages",
      description: "List packages installed on the device via pm list packages. Optionally filter by case-insensitive substring.",
      inputSchema: {
        filter: z.string().min(1).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ filter, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const result = await adb(
          ["shell", "pm", "list", "packages"],
          { deviceId: resolvedDeviceId }
        );

        const packages = result.stdout
          .split(/\r?\n/)
          .map((line) => line.replace(/^package:/, "").trim())
          .filter((pkg) => pkg.length > 0);

        const lowerFilter = filter?.toLowerCase();
        const filtered = lowerFilter
          ? packages.filter((pkg) => pkg.toLowerCase().includes(lowerFilter))
          : packages;

        const output = [
          `total packages: ${packages.length}`,
          filter ? `matching "${filter}": ${filtered.length}` : null,
          `---`,
          ...filtered
        ].filter(Boolean).join("\n");

        return textResponse(output);
      } catch (error) {
        return textResponse(`Failed to list packages:\n${formatError(error)}`);
      }
    }
  );
};
