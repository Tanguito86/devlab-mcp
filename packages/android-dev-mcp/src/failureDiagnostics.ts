import path from "node:path";
import { getCurrentActivity } from "./activity.js";
import type { AdbOptions } from "./adb.js";
import { captureScreenshot, captureUiDump, timestampForPath, writeMetadata } from "./inspection.js";

export async function createFailureReport(
  reason: string,
  options: AdbOptions = {},
  details: Record<string, unknown> = {}
): Promise<string> {
  const reportDir = path.join("failure-reports", `${timestampForPath()}-${reason.replace(/[^a-z0-9-]/gi, "-")}`);
  const screenshotPath = path.join(reportDir, "screenshot.png");
  const uiDumpPath = path.join(reportDir, "window_dump.xml");
  const metadataPath = path.join(reportDir, "metadata.json");
  const currentActivity = await getCurrentActivity(options);

  await captureScreenshot(screenshotPath, options);
  await captureUiDump(uiDumpPath, options);
  await writeMetadata(metadataPath, {
    deviceId: options.deviceId,
    timestamp: new Date().toISOString(),
    model: "",
    sdk: "",
    androidVersion: "",
    currentFocus: currentActivity.rawSource,
    app: typeof details.app === "string" ? details.app : undefined,
    details: {
      reason,
      ...details,
      currentActivity
    }
  });

  return reportDir;
}

