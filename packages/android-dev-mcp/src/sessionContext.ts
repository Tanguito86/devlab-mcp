let lastDeviceId: string | undefined;
let lastApp: string | undefined;

export type SessionContextInput = {
  deviceId?: string;
  app?: string;
};

export function rememberSessionContext(input: SessionContextInput): void {
  if (input.deviceId) {
    lastDeviceId = input.deviceId;
  }

  if (input.app) {
    lastApp = input.app;
  }
}

export function resolveDeviceId(deviceId?: string): string | undefined {
  return deviceId ?? lastDeviceId;
}

export function resolveApp(app?: string): string | undefined {
  return app ?? lastApp;
}

