// ═══════════════════════════════════════════════
// String naming helpers — pure, no IO, no runtime deps
// ═══════════════════════════════════════════════

/** Normalize a name for use as a filesystem-safe identifier. */
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "session";
}

/** Validate a session ID against path traversal and character restrictions. */
export function validateSessionId(sessionId: string): void {
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("sessionId is required and must be a string.");
  }
  if (sessionId.includes("..") || sessionId.includes("/") || sessionId.includes("\\")) {
    throw new Error(`Invalid sessionId: "${sessionId}". Path traversal not allowed.`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error(
      `Invalid sessionId: "${sessionId}". Only alphanumeric, hyphens, and underscores allowed.`
    );
  }
}
