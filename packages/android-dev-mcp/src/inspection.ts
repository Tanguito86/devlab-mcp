import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentActivity } from "./activity.js";
import { adb, adbBinary, type AdbOptions } from "./adb.js";
import { toAdbHostPath } from "./pathUtils.js";

const REMOTE_UI_DUMP_PATH = "/sdcard/window_dump.xml";

export type DeviceMetadata = {
  deviceId?: string;
  timestamp: string;
  model: string;
  sdk: string;
  androidVersion: string;
  currentFocus?: string;
  app?: string;
  currentActivity?: {
    packageName?: string;
    activityName?: string;
    rawSource: string;
  };
  details?: Record<string, unknown>;
};

export function timestampForPath(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    "-",
    pad(date.getMinutes()),
    "-",
    pad(date.getSeconds())
  ].join("");
}

export async function fileSize(filePath: string): Promise<number> {
  return (await stat(filePath)).size;
}

export async function captureScreenshot(outputPath: string, options: AdbOptions = {}): Promise<number> {
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  const png = await adbBinary(["exec-out", "screencap", "-p"], options);

  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, png);

  return png.length;
}

export async function captureUiDump(outputPath: string, options: AdbOptions = {}): Promise<number> {
  const resolvedPath = path.resolve(process.cwd(), outputPath);

  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await adb(["shell", "uiautomator", "dump", REMOTE_UI_DUMP_PATH], options);
  await adb(["pull", REMOTE_UI_DUMP_PATH, toAdbHostPath(resolvedPath)], options);

  return fileSize(resolvedPath);
}

function parseFocus(dumpsysWindow: string): string | undefined {
  const focusLine = dumpsysWindow
    .split(/\r?\n/)
    .find((line) => line.includes("mCurrentFocus") || line.includes("mFocusedApp"));

  return focusLine?.trim();
}

export async function getDeviceMetadata(options: AdbOptions = {}, app?: string): Promise<DeviceMetadata> {
  const [model, sdk, androidVersion, windowDump, currentActivity] = await Promise.all([
    adb(["shell", "getprop", "ro.product.model"], options),
    adb(["shell", "getprop", "ro.build.version.sdk"], options),
    adb(["shell", "getprop", "ro.build.version.release"], options),
    adb(["shell", "dumpsys", "window"], options),
    getCurrentActivity(options)
  ]);

  return {
    deviceId: options.deviceId,
    timestamp: new Date().toISOString(),
    model: model.stdout.trim(),
    sdk: sdk.stdout.trim(),
    androidVersion: androidVersion.stdout.trim(),
    currentFocus: parseFocus(windowDump.stdout),
    currentActivity,
    app
  };
}

export async function writeMetadata(outputPath: string, metadata: DeviceMetadata): Promise<void> {
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}
