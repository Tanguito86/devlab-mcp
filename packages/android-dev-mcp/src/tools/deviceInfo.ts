import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

export const registerDeviceInfoTool: RegisterTool = (server) => {
  server.registerTool(
    "android_device_info",
    {
      title: "Get Android device info",
      description: "Returns manufacturer, model, Android version, SDK level, ABI, battery level, and charging status.",
      inputSchema: {
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const opts = { deviceId: resolvedDeviceId };

        const [props, battery] = await Promise.all([
          adb(["shell", "getprop"], opts),
          adb(["shell", "dumpsys", "battery"], opts)
        ]);

        const getProp = (key: string): string => {
          const match = props.stdout.match(new RegExp(`\\[${key}\\]:\\s*\\[(.*)\\]`));
          return match?.[1] ?? "unknown";
        };

        const manufacturer = getProp("ro.product.manufacturer");
        const model = getProp("ro.product.model");
        const device = getProp("ro.product.device");
        const androidVersion = getProp("ro.build.version.release");
        const sdk = getProp("ro.build.version.sdk");
        const abi = getProp("ro.product.cpu.abi");

        const levelMatch = battery.stdout.match(/level:\s*(\d+)/);
        const chargingMatch = battery.stdout.match(/USB plugged:\s*(true|false)/);
        const acMatch = battery.stdout.match(/AC powered:\s*(true|false)/);
        const wirelessMatch = battery.stdout.match(/Wireless powered:\s*(true|false)/);

        const batteryLevel = levelMatch ? parseInt(levelMatch[1], 10) : null;
        const usbPlugged = chargingMatch?.[1] === "true";
        const acPowered = acMatch?.[1] === "true";
        const wirelessPowered = wirelessMatch?.[1] === "true";
        const chargingStatus = usbPlugged || acPowered || wirelessPowered ? "charging" : "discharging";

        const info = [
          `manufacturer: ${manufacturer}`,
          `model: ${model}`,
          `device: ${device}`,
          `androidVersion: ${androidVersion}`,
          `sdk: ${sdk}`,
          `abi: ${abi}`,
          `batteryLevel: ${batteryLevel ?? "unknown"}%`,
          `chargingStatus: ${chargingStatus}`
        ].join("\n");

        return textResponse(info);
      } catch (error) {
        return textResponse(`Failed to get device info:\n${formatError(error)}`);
      }
    }
  );
};
