import { z } from "zod";
import { adb, formatError, formatOutput } from "../adb.js";
import { rememberSessionContext, resolveDeviceId } from "../sessionContext.js";
import { textResponse, type RegisterTool } from "./types.js";

function encodeInputText(text: string): string {
  return text.replace(/%/g, "%25").replace(/\s/g, "%s");
}

export const registerInputTextTool: RegisterTool = (server) => {
  server.registerTool(
    "android_input_text",
    {
      title: "Input Android text",
      description: "Type text with adb shell input text.",
      inputSchema: {
        text: z.string(),
        deviceId: z.string().min(1).optional()
      }
    },
    async ({ text, deviceId }) => {
      try {
        const resolvedDeviceId = resolveDeviceId(deviceId);
        const encodedText = encodeInputText(text);
        const result = await adb(["shell", "input", "text", encodedText], { deviceId: resolvedDeviceId });
        rememberSessionContext({ deviceId: resolvedDeviceId });
        return textResponse(formatOutput("Text input sent.", result));
      } catch (error) {
        return textResponse(`Failed to input text:\n${formatError(error)}`);
      }
    }
  );
};
