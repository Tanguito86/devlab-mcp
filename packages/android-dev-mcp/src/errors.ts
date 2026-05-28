export type ErrorCategory = "validation" | "adb" | "workflow" | "ui_parsing" | "file_system";

export class AndroidDevMcpError extends Error {
  constructor(
    public readonly category: ErrorCategory,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AndroidDevMcpError";
  }
}

export function contractError(category: ErrorCategory, message: string, details?: unknown): AndroidDevMcpError {
  return new AndroidDevMcpError(category, message, details);
}

export function formatContractError(error: unknown): string {
  if (error instanceof AndroidDevMcpError) {
    return `[${error.category}] ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
