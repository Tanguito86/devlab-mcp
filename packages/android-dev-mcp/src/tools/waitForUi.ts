import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { formatError } from "../adb.js";
import { createFailureReport } from "../failureDiagnostics.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { formatUiFilters, hasAnyUiFilter } from "../uiFilters.js";
import { formatUiMatch } from "../uiParser.js";
import { validateIntervalMs, validateTimeoutSec } from "../validation.js";
import { dumpAndFindUiNodes } from "./findUi.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerWaitForUiTool: RegisterTool = (server) => {
  server.registerTool(
    "android_wait_for_ui",
    {
      title: "Wait for Android UI node",
      description: "Wait until a UI node appears by text or resource-id.",
      inputSchema: {
        text: z.string().min(1).optional(),
        resourceId: z.string().min(1).optional(),
        className: z.string().min(1).optional(),
        packageName: z.string().min(1).optional(),
        clickable: z.boolean().optional(),
        enabled: z.boolean().optional(),
        timeoutSec: z.number().int().positive().max(300).optional(),
        intervalMs: z.number().int().positive().max(10000).optional(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ text, resourceId, className, packageName, clickable, enabled, timeoutSec, intervalMs, deviceId }) => {
      try {
        const filters = { text, resourceId, className, packageName, clickable, enabled };
        if (!hasAnyUiFilter(filters)) {
          return textResponse("Provide at least one UI filter.");
        }

        const resolvedDeviceId = resolveDeviceId(deviceId);
        const timeout = validateTimeoutSec(timeoutSec, 10, 300);
        const interval = validateIntervalMs(intervalMs, 1000, 10000);
        const deadline = Date.now() + timeout * 1000;
        let lastDumpPath = "";

        while (Date.now() <= deadline) {
          const result = await dumpAndFindUiNodes({ ...filters, deviceId: resolvedDeviceId });
          lastDumpPath = result.dumpPath;

          if (result.matches.length > 0) {
            if (resolvedDeviceId) {
              rememberSessionContext({ deviceId: resolvedDeviceId });
            }

            return textResponse(
              [
                `UI node appeared after ${timeout * 1000 - Math.max(0, deadline - Date.now())} ms.`,
                `filters: ${formatUiFilters(filters)}`,
                `dump: ${result.dumpPath}`,
                formatUiMatch(result.matches[0], 0)
              ].join("\n\n")
            );
          }

          if (Date.now() + interval > deadline) {
            break;
          }

          await sleep(interval);
        }

        const reportPath = await createFailureReport("wait-ui-timeout", { deviceId: resolvedDeviceId }, { filters, timeoutSec: timeout });
        return textResponse(`Timed out after ${timeout} seconds waiting for UI node.\nfilters: ${formatUiFilters(filters)}\nlast dump: ${lastDumpPath}\nfailure report: ${reportPath}`);
      } catch (error) {
        return textResponse(`Failed while waiting for UI node:\n${formatError(error)}`);
      }
    }
  );
};
