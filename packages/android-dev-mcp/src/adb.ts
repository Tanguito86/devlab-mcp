import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatContractError } from "./errors.js";

const execFileAsync = promisify(execFile);

export type AdbResult = {
  stdout: string;
  stderr: string;
};

export type AdbOptions = {
  deviceId?: string;
};

function stringifyArg(arg: string | number): string {
  return String(arg);
}

function withDevice(args: Array<string | number>, options: AdbOptions = {}): string[] {
  const adbArgs = args.map(stringifyArg);
  if (!options.deviceId) {
    return adbArgs;
  }

  return ["-s", options.deviceId, ...adbArgs];
}

export async function adb(args: Array<string | number>, options: AdbOptions = {}): Promise<AdbResult> {
  await validateDeviceId(options.deviceId);

  try {
    const { stdout, stderr } = await execFileAsync("adb", withDevice(args, options), {
      encoding: "buffer",
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 20
    });

    return {
      stdout: stdout.toString("utf8"),
      stderr: stderr.toString("utf8")
    };
  } catch (error) {
    if (error instanceof Error && "stdout" in error && "stderr" in error) {
      const execError = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
      const stdout = Buffer.isBuffer(execError.stdout)
        ? execError.stdout.toString("utf8")
        : String(execError.stdout ?? "");
      const stderr = Buffer.isBuffer(execError.stderr)
        ? execError.stderr.toString("utf8")
        : String(execError.stderr ?? "");

      throw new Error([error.message, stdout, stderr].filter(Boolean).join("\n").trim());
    }

    throw error;
  }
}

export async function adbBinary(args: Array<string | number>, options: AdbOptions = {}): Promise<Buffer> {
  await validateDeviceId(options.deviceId);

  try {
    const { stdout } = await execFileAsync("adb", withDevice(args, options), {
      encoding: "buffer",
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 20
    });

    return stdout;
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      const execError = error as Error & { stderr?: Buffer | string };
      const stderr = Buffer.isBuffer(execError.stderr)
        ? execError.stderr.toString("utf8")
        : String(execError.stderr ?? "");
      throw new Error([error.message, stderr].filter(Boolean).join("\n").trim());
    }

    throw error;
  }
}

export async function listDevices(): Promise<Array<{ id: string; state: string }>> {
  const { stdout } = await execFileAsync("adb", ["devices"], {
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });

  return stdout
    .toString("utf8")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, state = "unknown"] = line.split(/\s+/);
      return { id, state };
    });
}

export async function validateDeviceId(deviceId?: string): Promise<void> {
  if (!deviceId) {
    return;
  }

  const devices = await listDevices();
  const device = devices.find((candidate) => candidate.id === deviceId);

  if (!device) {
    const available = devices.map((candidate) => `${candidate.id} (${candidate.state})`).join(", ") || "none";
    throw new Error(`Device "${deviceId}" was not found. Available devices: ${available}.`);
  }

  if (device.state !== "device") {
    throw new Error(`Device "${deviceId}" is connected with state "${device.state}", not "device".`);
  }
}

export function formatOutput(title: string, output: AdbResult): string {
  const stdout = output.stdout.trim();
  const stderr = output.stderr.trim();

  if (!stdout && !stderr) {
    return `${title}\nOK`;
  }

  return [title, stdout, stderr ? `stderr:\n${stderr}` : ""].filter(Boolean).join("\n");
}

export function formatError(error: unknown): string {
  return formatContractError(error);
}
