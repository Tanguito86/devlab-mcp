const MAX_IDENTIFIER_LENGTH = 64;
const MAX_STRING_LENGTH = 16_384;
const MAX_INPUT_BYTES = 1_048_576;
const MAX_DEPTH = 32;
const MAX_NODES = 50_000;
const MAX_ARRAY_LENGTH = 10_000;
const MAX_OBJECT_KEYS = 5_000;

const RESERVED = new Set([
  "await", "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "implements", "import", "in", "instanceof",
  "interface", "let", "new", "null", "package", "private", "protected", "public",
  "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof",
  "var", "void", "while", "with", "yield", "constructor", "prototype", "__proto__",
  "eval", "arguments", "undefined", "NaN", "Infinity",
]);

export interface SafeFactoryInput {
  exportName: string;
  assetId: string;
  symbols?: readonly string[];
  components: readonly Readonly<Record<string, unknown>>[];
  metadata?: Readonly<Record<string, unknown>>;
}

export type SafeIdentifierResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: string };

export function safeIdentifier(value: string): SafeIdentifierResult {
  if (value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH) return { ok: false, reason: "identifier length is outside policy" };
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) return { ok: false, reason: "identifier must use the explicit ASCII policy" };
  if (RESERVED.has(value)) return { ok: false, reason: "identifier is reserved or dangerous" };
  return { ok: true, value };
}

export function validateSafeIdentifier(value: string): string {
  const result = safeIdentifier(value);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

function validateGeneratedText(value: string): string {
  if (value.includes("\0")) throw new Error("NUL is forbidden");
  if (value.length > MAX_STRING_LENGTH) throw new Error("string exceeds policy");
  if (/\r|\n|`|\$\{|\.\.[/\\]|\*\/|^[A-Za-z]:|^\//.test(value) || value.includes("\\")) throw new Error("string contains a hostile code or path sequence");
  if (RESERVED.has(value)) throw new Error("string equals a reserved or dangerous token");
  return value;
}

interface CanonicalBudget { nodes: number; bytes: number }
function consumeBudget(state: CanonicalBudget, bytes = 8): void {
  state.nodes += 1; state.bytes += bytes;
  if (state.nodes > MAX_NODES || state.bytes > MAX_INPUT_BYTES) throw new Error("input exceeds canonicalization resource budget");
}

function canonicalize(value: unknown, seen: WeakSet<object>, state: CanonicalBudget, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new Error("input exceeds canonicalization depth");
  consumeBudget(state, typeof value === "string" ? Buffer.byteLength(value, "utf8") : 8);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("numbers must be finite");
    if (Object.is(value, -0)) throw new Error("negative zero is forbidden");
    return value;
  }
  if (typeof value === "string") {
    return validateGeneratedText(value);
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) throw new Error("array exceeds canonicalization length budget");
    if (seen.has(value)) throw new Error("cyclic input is forbidden");
    seen.add(value);
    const result = value.map((item) => canonicalize(item, seen, state, depth + 1));
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(object);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("only plain or null-prototype records are supported");
    if (Object.getOwnPropertySymbols(object).length > 0) throw new Error("symbol keys are forbidden");
    const keys = Object.keys(object);
    if (keys.length > MAX_OBJECT_KEYS || Object.getOwnPropertyNames(object).length !== keys.length) throw new Error("object keys exceed or violate canonicalization policy");
    if (seen.has(object)) throw new Error("cyclic input is forbidden");
    seen.add(object);
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys.sort()) {
      if (RESERVED.has(key)) throw new Error(`dangerous object key: ${key}`);
      validateGeneratedText(key);
      if (key.length > MAX_IDENTIFIER_LENGTH) throw new Error("object key is outside policy");
      consumeBudget(state, Buffer.byteLength(key, "utf8"));
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !("value" in descriptor)) throw new Error("accessor properties are forbidden");
      result[key] = canonicalize(descriptor.value, seen, state, depth + 1);
    }
    seen.delete(object);
    return result;
  }
  throw new Error(`unsupported value type: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  const result = JSON.stringify(canonicalize(value, new WeakSet(), { nodes: 0, bytes: 0 }, 0));
  if (result === undefined) throw new Error("value is not serializable");
  return result;
}

export function generateSafeFactoryModule(input: SafeFactoryInput): string {
  const exportName = validateSafeIdentifier(input.exportName);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(input.assetId) || input.assetId.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error("assetId violates the safe relative identifier policy");
  const symbols = (input.symbols ?? []).map(validateSafeIdentifier);
  if (new Set([exportName, ...symbols]).size !== symbols.length + 1) throw new Error("generated symbols collide");
  const canonical = canonicalJson({
    assetId: input.assetId,
    components: input.components,
    metadata: input.metadata ?? {},
    symbols,
  });
  if (Buffer.byteLength(canonical, "utf8") > MAX_INPUT_BYTES) throw new Error("canonical input exceeds policy");
  return [
    "// Generated by the DevLab safe asset-factory boundary.",
    "// Input-derived text is serialized as data, never as source comments.",
    `const definition = ${canonical} as const;`,
    `export function ${exportName}() {`,
    "  return definition;",
    "}",
    "",
  ].join("\n");
}
