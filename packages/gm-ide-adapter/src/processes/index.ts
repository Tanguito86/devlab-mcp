import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { GmProcessSnapshot } from "../contracts/index.js";
import { GmAdapterError, fail } from "../errors/index.js";

const execFileAsync = promisify(execFile);
const OUTPUT_LIMIT_BYTES = 1024 * 1024;
const TERMINATION_GRACE_MS = 1_500;
const CLEANUP_DEADLINE_MS = 5_000;
const INVENTORY_DEADLINE_MS = 2_000;
const OUTPUT_TRUNCATION_MARKER = Buffer.from("\n[DEVLAB_OUTPUT_TRUNCATED]\n", "utf8");
const SAFE_ENVIRONMENT_KEYS = Object.freeze([
  "ALLUSERSPROFILE", "APPDATA", "CommonProgramFiles", "CommonProgramFiles(x86)", "CommonProgramW6432",
  "ComSpec", "LOCALAPPDATA", "PATH", "PATHEXT", "ProgramData", "ProgramFiles", "ProgramFiles(x86)",
  "ProgramW6432", "PUBLIC", "SystemDrive", "SystemRoot", "TEMP", "TMP", "USERPROFILE", "windir"
]);
export interface RawProcess { readonly pid: number; readonly parentPid: number | null; readonly name: string; readonly executable: string | null; readonly commandLine: string; readonly creationDate: string }
export interface OwnedProcessRecord extends GmProcessSnapshot { readonly ownerTransactionId: string; readonly kind: "igor" | "runner"; readonly startedByOperation: true; readonly state: "running" | "exited" | "terminated" | "identity-lost"; readonly exitCode: number | null }
export type ProcessInventory = (signal?: AbortSignal) => Promise<readonly RawProcess[]>;

export function safeChildEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = {};
  const sourceKeys = Object.keys(source);
  for (const allowed of SAFE_ENVIRONMENT_KEYS) {
    const actual = sourceKeys.find((key) => key.toLowerCase() === allowed.toLowerCase());
    if (actual && source[actual] !== undefined && !Object.keys(output).some((key) => key.toLowerCase() === actual.toLowerCase())) output[actual] = source[actual];
  }
  return output;
}

export class BoundedOutputCapture {
  readonly #chunks: Buffer[] = [];
  #bytes = 0;
  #truncated = false;
  constructor(readonly limitBytes = OUTPUT_LIMIT_BYTES) {
    if (!Number.isSafeInteger(limitBytes) || limitBytes < 1) throw new RangeError("output limit must be a positive safe integer");
  }
  get truncated(): boolean { return this.#truncated; }
  append(value: Buffer | string): void {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
    const remaining = this.limitBytes - this.#bytes;
    if (remaining > 0) { const kept = Buffer.from(bytes.subarray(0, remaining)); this.#chunks.push(kept); this.#bytes += kept.byteLength; }
    if (bytes.byteLength > remaining) this.#truncated = true;
  }
  text(): string {
    const bytes = Buffer.concat(this.#chunks, this.#bytes);
    if (!this.#truncated) return bytes.toString("utf8");
    if (this.limitBytes <= OUTPUT_TRUNCATION_MARKER.byteLength) return OUTPUT_TRUNCATION_MARKER.subarray(0, this.limitBytes).toString("utf8");
    const payloadLimit = this.limitBytes - OUTPUT_TRUNCATION_MARKER.byteLength;
    let payload = bytes.subarray(0, payloadLimit).toString("utf8");
    while (Buffer.byteLength(payload, "utf8") > payloadLimit) payload = payload.slice(0, -1);
    return `${payload}${OUTPUT_TRUNCATION_MARKER.toString("utf8")}`;
  }
}

export function isProcessDescendant(candidatePid: number, ancestorPid: number, rows: readonly RawProcess[]): boolean {
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const seen = new Set<number>();
  let current = byPid.get(candidatePid);
  while (current?.parentPid != null && !seen.has(current.pid)) {
    seen.add(current.pid);
    if (current.parentPid === ancestorPid) return true;
    current = byPid.get(current.parentPid);
  }
  return false;
}

function delay(milliseconds: number): Promise<void> { return new Promise((resolve) => { const timer = setTimeout(resolve, milliseconds); timer.unref(); }); }
function remaining(deadline: number, message: string): number {
  const value = deadline - Date.now(); if (value <= 0) throw new GmAdapterError("PROCESS_OWNERSHIP", message, true); return value;
}
async function inventoryWithin(inventory: ProcessInventory, milliseconds: number, message: string): Promise<readonly RawProcess[]> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const work = Promise.resolve().then(() => inventory(controller.signal));
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new GmAdapterError("PROCESS_OWNERSHIP", message, true)); }, Math.max(1, milliseconds)); timer.unref(); });
  try { return await Promise.race([work, deadline]); }
  finally { if (timer) clearTimeout(timer); controller.abort(); void work.catch(() => undefined); }
}
async function waitForChildExit(child: ChildProcess, milliseconds: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const finish = (): void => { clearTimeout(timer); child.removeListener("exit", finish); resolve(true); };
    const timer = setTimeout(() => { child.removeListener("exit", finish); resolve(false); }, milliseconds);
    timer.unref(); child.once("exit", finish);
  });
}
async function terminateUnregisteredChild(child: ChildProcess, message: string): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const gracefulSent = child.kill("SIGTERM");
  if ((gracefulSent || child.exitCode !== null) && await waitForChildExit(child, TERMINATION_GRACE_MS)) return;
  const forcedSent = child.kill("SIGKILL");
  if ((forcedSent || child.exitCode !== null) && await waitForChildExit(child, TERMINATION_GRACE_MS)) return;
  fail("PROCESS_OWNERSHIP", message, true);
}
async function waitForClose(close: Promise<void>, milliseconds: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), Math.max(1, milliseconds)); timer.unref(); });
  try { return await Promise.race([close.then(() => true), timeout]); } finally { if (timer) clearTimeout(timer); }
}
function hasStrongIdentity(raw: RawProcess): boolean { return Boolean(raw.creationDate.trim() && raw.executable?.trim() && raw.commandLine.trim()); }
function executableKey(value: string): string { const normalized = value.replace(/\\/g, "/"); return process.platform === "win32" ? normalized.toLowerCase() : normalized; }
function runnerKey(raw: RawProcess): string { return `${raw.pid}:${raw.creationDate}`; }
let systemPowerShell: Promise<string> | undefined;
function trustedPowerShellExecutable(): Promise<string> {
  systemPowerShell ??= (async () => {
    const configuredRoot = process.env.SystemRoot ?? process.env.windir;
    if (!configuredRoot || !isAbsolute(configuredRoot)) fail("PROCESS_OWNERSHIP", "Windows system root is unavailable for process inventory", true);
    const physicalRoot = await realpath(configuredRoot).catch(() => fail("PROCESS_OWNERSHIP", "Windows system root identity is unavailable", true));
    const executable = await realpath(resolve(physicalRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")).catch(() => fail("PROCESS_OWNERSHIP", "trusted Windows PowerShell is unavailable", true));
    const back = relative(physicalRoot, executable);
    if (back === ".." || back.startsWith(`..${sep}`) || isAbsolute(back)) fail("PROCESS_OWNERSHIP", "trusted Windows PowerShell escapes the system root", true);
    return executable;
  })();
  return systemPowerShell;
}

export const commandHash = (executable: string, args: readonly string[]): string => createHash("sha256").update(JSON.stringify([executable, ...args])).digest("hex");
export async function windowsProcessInventory(signal?: AbortSignal): Promise<readonly RawProcess[]> {
  if (process.platform !== "win32") return [];
  const script = "$p=Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ ProcessId=$_.ProcessId; ParentProcessId=$_.ParentProcessId; Name=$_.Name; ExecutablePath=$_.ExecutablePath; CommandLine=$_.CommandLine; CreationDate=if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToFileTimeUtc().ToString([Globalization.CultureInfo]::InvariantCulture) } else { '' } } }; $p | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync(await trustedPowerShellExecutable(), ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", env: safeChildEnvironment(), signal, timeout: 10_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const parsed = stdout.trim() ? JSON.parse(stdout) as unknown : [];
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return Object.freeze(rows.map((row) => { const value = row as Record<string, unknown>; return Object.freeze({ pid: Number(value.ProcessId), parentPid: value.ParentProcessId == null ? null : Number(value.ParentProcessId), name: String(value.Name ?? ""), executable: value.ExecutablePath == null ? null : String(value.ExecutablePath), commandLine: String(value.CommandLine ?? ""), creationDate: String(value.CreationDate ?? "") }); }).filter(({ pid }) => Number.isSafeInteger(pid) && pid > 0));
}
export function toProcessSnapshot(raw: RawProcess, ownerTransactionId: string | null = null): GmProcessSnapshot {
  return Object.freeze({ pid: raw.pid, parentPid: raw.parentPid, name: raw.name, executable: raw.executable, commandHash: createHash("sha256").update(raw.commandLine).digest("hex"), startToken: raw.creationDate, ownerTransactionId });
}
export async function gameMakerProcesses(inventory: ProcessInventory = windowsProcessInventory): Promise<readonly GmProcessSnapshot[]> {
  const rows = await inventory(); return Object.freeze(rows.filter(({ name }) => /^(GameMaker|Igor|Runner)(?:\.exe)?$/i.test(name)).sort((a, b) => a.pid - b.pid).map((row) => toProcessSnapshot(row)));
}

export class ProcessLedger {
  readonly #records = new Map<number, OwnedProcessRecord>();
  constructor(readonly inventory: ProcessInventory = windowsProcessInventory) {}
  records(transactionId?: string): readonly OwnedProcessRecord[] { return Object.freeze([...this.#records.values()].filter((record) => !transactionId || record.ownerTransactionId === transactionId).sort((a, b) => a.pid - b.pid)); }
  register(raw: RawProcess, transactionId: string, kind: "igor" | "runner"): OwnedProcessRecord {
    if (!hasStrongIdentity(raw)) fail("PROCESS_OWNERSHIP", "owned process lacks a complete OS identity", true, { pid: raw.pid, kind });
    const record = Object.freeze({ ...toProcessSnapshot(raw, transactionId), ownerTransactionId: transactionId, kind, startedByOperation: true as const, state: "running" as const, exitCode: null }); this.#records.set(raw.pid, record); return record;
  }
  markExited(pid: number, exitCode: number | null): void { const current = this.#records.get(pid); if (current) this.#records.set(pid, Object.freeze({ ...current, state: "exited", exitCode })); }
  async #identityStatus(record: OwnedProcessRecord, deadline: number): Promise<"match" | "absent" | "mismatch"> {
    if (!record.startToken || !record.executable || !record.commandHash) return "mismatch";
    const current = (await inventoryWithin(this.inventory, Math.min(INVENTORY_DEADLINE_MS, remaining(deadline, "process identity deadline expired")), "process inventory exceeded identity deadline")).find(({ pid }) => pid === record.pid);
    if (!current) return "absent";
    if (!hasStrongIdentity(current) || current.creationDate !== record.startToken || executableKey(record.executable) !== executableKey(current.executable!) || createHash("sha256").update(current.commandLine).digest("hex") !== record.commandHash) return "mismatch";
    return "match";
  }
  async identityMatches(record: OwnedProcessRecord, deadline = Date.now() + INVENTORY_DEADLINE_MS): Promise<boolean> {
    return await this.#identityStatus(record, deadline) === "match";
  }
  async terminateOwned(child: ChildProcess, transactionId: string, deadline = Date.now() + CLEANUP_DEADLINE_MS): Promise<void> {
    const pid = child.pid; if (!pid) fail("PROCESS_OWNERSHIP", "owned child has no PID"); const record = this.#records.get(pid);
    if (!record || record.ownerTransactionId !== transactionId || !record.startedByOperation) fail("PROCESS_OWNERSHIP", "process is not owned by this transaction");
    if (child.exitCode !== null || child.signalCode !== null) { this.markExited(pid, child.exitCode); return; }
    if (!(await this.identityMatches(record, deadline))) { this.#records.set(pid, Object.freeze({ ...record, state: "identity-lost" })); fail("PROCESS_OWNERSHIP", "PID identity changed; refusing termination"); }
    if (!child.kill("SIGTERM") && await this.identityMatches(record, deadline)) fail("PROCESS_OWNERSHIP", "owned process rejected graceful termination", true);
    if (!(await waitForChildExit(child, Math.min(TERMINATION_GRACE_MS, remaining(deadline, "owned process cleanup exceeded deadline")))) && await this.identityMatches(record, deadline)) {
      if (!child.kill("SIGKILL")) fail("PROCESS_OWNERSHIP", "owned process rejected forced termination", true);
      if (!(await waitForChildExit(child, Math.min(TERMINATION_GRACE_MS, remaining(deadline, "owned process cleanup exceeded deadline")))) && await this.identityMatches(record, deadline)) fail("PROCESS_OWNERSHIP", "owned process remained alive after forced termination", true);
    }
    this.#records.set(pid, Object.freeze({ ...record, state: "terminated", exitCode: child.exitCode }));
  }
  async terminateRecord(record: OwnedProcessRecord, transactionId: string, deadline = Date.now() + TERMINATION_GRACE_MS): Promise<void> {
    if (record.ownerTransactionId !== transactionId || !record.startedByOperation) fail("PROCESS_OWNERSHIP", "process is not owned by this transaction");
    while (Date.now() < deadline) {
      const status = await this.#identityStatus(record, deadline);
      if (status === "absent") { this.markExited(record.pid, 0); return; }
      if (status === "mismatch") { this.#records.set(record.pid, Object.freeze({ ...record, state: "identity-lost" })); fail("PROCESS_OWNERSHIP", "Runner PID identity changed; refusing cleanup", true, { residualPids: Object.freeze([record.pid]) }); }
      await delay(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    const finalStatus = await this.#identityStatus(record, Date.now() + INVENTORY_DEADLINE_MS);
    if (finalStatus === "absent") { this.markExited(record.pid, 0); return; }
    if (finalStatus === "mismatch") { this.#records.set(record.pid, Object.freeze({ ...record, state: "identity-lost" })); fail("PROCESS_OWNERSHIP", "Runner PID identity changed; refusing cleanup", true, { residualPids: Object.freeze([record.pid]) }); }
    // A CIM-discovered Runner has no retained OS handle. Signalling its PID
    // would introduce an unavoidable reuse race, so report it as residual.
    fail("PROCESS_OWNERSHIP", "Runner remains alive without a safely retained process handle", true, {
      residualPids: Object.freeze([record.pid]),
      identityEvidence: Object.freeze([{ pid: record.pid, startToken: record.startToken, commandHash: record.commandHash }])
    });
  }
}

export interface OwnedCommandResult { readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly stdoutTruncated: boolean; readonly stderrTruncated: boolean; readonly timedOut: boolean; readonly cancelled: boolean; readonly ownedPids: readonly number[]; readonly observedRunners: readonly OwnedProcessRecord[]; readonly startToken: string }
export async function runOwnedCommand(input: Readonly<{ executable: string; args: readonly string[]; cwd: string; transactionId: string; timeoutMs: number; cancellation?: AbortSignal; ledger: ProcessLedger; expectedRuntimeSignal?: string }>): Promise<OwnedCommandResult> {
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1) fail("INVALID_REQUEST", "process timeout must be a positive safe integer");
  if (input.cancellation?.aborted) fail("CANCELLED", "operation cancelled before process start", true);
  const operationStarted = Date.now();
  const before = await inventoryWithin(input.ledger.inventory, Math.min(INVENTORY_DEADLINE_MS, input.timeoutMs), "preflight process inventory exceeded deadline");
  const foreignRunners = before.filter(({ name }) => /^Runner(?:\.exe)?$/i.test(name));
  if (foreignRunners.length) fail("RUN_BLOCKED_EXTERNAL_RUNNER", "a foreign Runner exists before process start", true, {
    pids: Object.freeze(foreignRunners.map(({ pid }) => pid).sort((a, b) => a - b))
  });
  const beforeRunnerKeys = new Set(before.filter(({ name }) => /^Runner(?:\.exe)?$/i.test(name)).map(runnerKey));
  if (input.cancellation?.aborted) fail("CANCELLED", "operation cancelled during process preflight", true);
  if (Date.now() >= operationStarted + input.timeoutMs) throw new GmAdapterError("TIMEOUT", "operation timed out before process start", true);
  const expectedExecutable = executableKey(await realpath(input.executable).catch(() => fail("PROCESS_OWNERSHIP", "configured process executable identity is unavailable", true)));
  if (input.cancellation?.aborted) fail("CANCELLED", "operation cancelled before process start", true);
  if (Date.now() >= operationStarted + input.timeoutMs) throw new GmAdapterError("TIMEOUT", "operation timed out before process start", true);
  const child = spawn(input.executable, [...input.args], { cwd: input.cwd, env: safeChildEnvironment(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const exit = new Promise<Readonly<{ kind: "exit"; code: number }> | Readonly<{ kind: "error"; error: Error }>>((resolve) => { child.once("error", (error) => resolve({ kind: "error", error })); child.once("exit", (code) => resolve({ kind: "exit", code: code ?? -1 })); });
  const close = new Promise<void>((resolve) => { child.once("close", () => resolve()); });
  const stdoutCapture = new BoundedOutputCapture(); const stderrCapture = new BoundedOutputCapture(); child.stdout?.on("data", (chunk: Buffer) => { stdoutCapture.append(chunk); }); child.stderr?.on("data", (chunk: Buffer) => { stderrCapture.append(chunk); });
  const details = (extra: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> => Object.freeze({ stdout: stdoutCapture.text(), stderr: stderrCapture.text(), stdoutTruncated: stdoutCapture.truncated, stderrTruncated: stderrCapture.truncated, ownedPids: Object.freeze(child.pid ? [child.pid] : []), ...extra });
  if (!child.pid) { await waitForClose(close, TERMINATION_GRACE_MS); throw new GmAdapterError("PROCESS_OWNERSHIP", "failed to obtain child PID", true, details()); }
  let initial: RawProcess | undefined; let identityFailure: unknown; const identityDeadline = Math.min(operationStarted + input.timeoutMs, Date.now() + 5_000);
  while (!initial && Date.now() < identityDeadline && child.exitCode === null && child.signalCode === null) {
    if (input.cancellation?.aborted) break;
    try { const rows = await inventoryWithin(input.ledger.inventory, Math.max(1, Math.min(INVENTORY_DEADLINE_MS, identityDeadline - Date.now())), "process inventory exceeded identity acquisition deadline"); const candidate = rows.find(({ pid }) => pid === child.pid); if (candidate && child.exitCode === null && child.signalCode === null) initial = candidate; }
    catch (error) { identityFailure = error; break; }
    if (!initial) await delay(50);
  }
  if (!initial) {
    const exitedBeforeIdentityCleanup = child.exitCode !== null || child.signalCode !== null;
    await terminateUnregisteredChild(child, "could not stop process after identity acquisition failed");
    const directOutcome = await exit;
    const drained = await waitForClose(close, TERMINATION_GRACE_MS); if (!drained) { child.stdout?.destroy(); child.stderr?.destroy(); }
    let residualRows: readonly RawProcess[];
    try { residualRows = await inventoryWithin(input.ledger.inventory, INVENTORY_DEADLINE_MS, "final process inventory exceeded deadline"); }
    catch { throw new GmAdapterError("PROCESS_OWNERSHIP", "final process inventory could not prove zero residual Runners", true, details({ exitCode: child.exitCode, residualState: "unknown" })); }
    const residuals = residualRows.filter((row) => /^Runner(?:\.exe)?$/i.test(row.name) && !beforeRunnerKeys.has(runnerKey(row)));
    const failureDetails = details({ exitCode: child.exitCode, residualPids: Object.freeze(residuals.map(({ pid }) => pid).sort((a, b) => a - b)), identityEvidence: Object.freeze(residuals.map((row) => ({ pid: row.pid, startToken: row.creationDate, commandHash: createHash("sha256").update(row.commandLine).digest("hex") }))) });
    if (residuals.length) throw new GmAdapterError("PROCESS_OWNERSHIP", "process exited without containment and left residual Runners", true, failureDetails);
    if (!drained) throw new GmAdapterError("PROCESS_OWNERSHIP", "process output streams did not close after fast exit", true, failureDetails);
    if (input.cancellation?.aborted) throw new GmAdapterError("CANCELLED", "operation cancelled during process identity acquisition", true, failureDetails);
    if (Date.now() >= operationStarted + input.timeoutMs) throw new GmAdapterError("TIMEOUT", "owned process exceeded timeout during identity acquisition", true, failureDetails);
    if (identityFailure) throw new GmAdapterError("PROCESS_OWNERSHIP", "process inventory failed during identity acquisition", true, failureDetails);
    if (!exitedBeforeIdentityCleanup) throw new GmAdapterError("PROCESS_OWNERSHIP", "strong process identity could not be acquired before cleanup", true, failureDetails);
    if (directOutcome.kind === "error") throw new GmAdapterError("PROCESS_OWNERSHIP", "owned process emitted a spawn error", true, failureDetails);
    return Object.freeze({ exitCode: directOutcome.code, stdout: stdoutCapture.text(), stderr: stderrCapture.text(), stdoutTruncated: stdoutCapture.truncated, stderrTruncated: stderrCapture.truncated, timedOut: false, cancelled: false, ownedPids: Object.freeze([child.pid]), observedRunners: Object.freeze([]), startToken: "" });
  }
  if (!hasStrongIdentity(initial) || executableKey(await realpath(initial.executable!).catch(() => "")) !== expectedExecutable) { await terminateUnregisteredChild(child, "could not stop process after identity validation failed"); await waitForClose(close, TERMINATION_GRACE_MS); throw new GmAdapterError("PROCESS_OWNERSHIP", "spawned PID does not match the requested executable and strong OS identity", true, details({ pid: child.pid })); }
  const startToken = initial.creationDate;
  input.ledger.register(initial, input.transactionId, "igor");
  type StopReason = "timeout" | "cancelled" | "inventory";
  let requestStop!: (reason: StopReason) => void;
  const stop = new Promise<StopReason>((resolve) => { requestStop = resolve; });
  const observed = new Map<number, OwnedProcessRecord>(); const ambiguous = new Map<number, RawProcess>(); let acceptingRunners = true; let pollFailure: unknown; let pollInFlight: Promise<void> | null = null;
  const pollOnce = async (): Promise<void> => {
    const rows = await inventoryWithin(input.ledger.inventory, INVENTORY_DEADLINE_MS, "process inventory exceeded Runner ownership deadline"); if (!acceptingRunners) return;
    for (const row of rows) {
      if (!/^Runner(?:\.exe)?$/i.test(row.name) || beforeRunnerKeys.has(runnerKey(row))) continue;
      const current = observed.get(row.pid); if (current) { if (current.startToken !== row.creationDate) throw new GmAdapterError("PROCESS_OWNERSHIP", "observed Runner PID identity changed", true, { residualPids: Object.freeze([row.pid]) }); continue; }
      if (!isProcessDescendant(row.pid, child.pid!, rows)) { ambiguous.set(row.pid, row); continue; }
      observed.set(row.pid, input.ledger.register(row, input.transactionId, "runner"));
    }
    if (ambiguous.size) throw new GmAdapterError("PROCESS_OWNERSHIP", "a new Runner could not be bound to the owned Igor ancestry", true, { residualPids: Object.freeze([...ambiguous.keys()].sort((a, b) => a - b)), identityEvidence: Object.freeze([...ambiguous.values()].map((row) => ({ pid: row.pid, startToken: row.creationDate, commandHash: createHash("sha256").update(row.commandLine).digest("hex") }))) });
  };
  const startPoll = (): void => { if (!acceptingRunners || pollInFlight || pollFailure) return; const task = pollOnce().catch((error: unknown) => { pollFailure = error; requestStop("inventory"); }).finally(() => { if (pollInFlight === task) pollInFlight = null; }); pollInFlight = task; };
  startPoll(); const poll = setInterval(startPoll, 250); poll.unref();
  const timeout = setTimeout(() => requestStop("timeout"), Math.max(1, input.timeoutMs - (Date.now() - operationStarted))); timeout.unref();
  const onAbort = (): void => requestStop("cancelled"); input.cancellation?.addEventListener("abort", onAbort, { once: true });
  if (input.cancellation?.aborted) onAbort();
  let first: Awaited<typeof exit> | StopReason; let outcome: Awaited<typeof exit>; let cleanupFailure: unknown;
  try {
    first = await Promise.race([exit, stop]); clearInterval(poll); if (pollInFlight) await pollInFlight;
    if (pollFailure && first !== "timeout" && first !== "cancelled") first = "inventory";
    if (!pollFailure) { try { await pollOnce(); } catch (error) { pollFailure = error; if (first !== "timeout" && first !== "cancelled") first = "inventory"; } }
    acceptingRunners = false;
    if (first === "timeout" || first === "cancelled" || first === "inventory") {
      const cleanupDeadline = Date.now() + CLEANUP_DEADLINE_MS;
      try { await input.ledger.terminateOwned(child, input.transactionId, cleanupDeadline); const results = await Promise.allSettled([...observed.values()].map((record) => input.ledger.terminateRecord(record, input.transactionId, cleanupDeadline))); const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected"); if (failure) throw failure.reason; }
      catch (error) { cleanupFailure = error; }
      outcome = child.exitCode !== null || child.signalCode !== null ? await exit : { kind: "error", error: new Error("owned child did not exit during cleanup") };
    } else outcome = first;
  } finally { acceptingRunners = false; clearInterval(poll); clearTimeout(timeout); input.cancellation?.removeEventListener("abort", onAbort); if (pollInFlight) await pollInFlight; }
  let runnerFailure: unknown;
  if (!cleanupFailure) { const runnerDeadline = Date.now() + TERMINATION_GRACE_MS; const results = await Promise.allSettled([...observed.values()].map((record) => input.ledger.terminateRecord(record, input.transactionId, runnerDeadline))); runnerFailure = results.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason; }
  if (cleanupFailure || runnerFailure || ambiguous.size) { child.stdout?.destroy(); child.stderr?.destroy(); const failure = cleanupFailure ?? runnerFailure ?? pollFailure; if (failure instanceof GmAdapterError) throw new GmAdapterError("PROCESS_OWNERSHIP", failure.message, true, details(failure.details)); throw new GmAdapterError("PROCESS_OWNERSHIP", "owned process cleanup could not prove zero residual Runners", true, details({ residualPids: Object.freeze([...ambiguous.keys()]) })); }
  const drained = await waitForClose(close, TERMINATION_GRACE_MS); if (!drained) { child.stdout?.destroy(); child.stderr?.destroy(); throw new GmAdapterError("PROCESS_OWNERSHIP", "owned process output streams did not close after exit", true, details()); }
  if (outcome.kind === "error") throw new GmAdapterError("PROCESS_OWNERSHIP", "owned process emitted a spawn error", true, details());
  const exitCode = outcome.code; input.ledger.markExited(child.pid, exitCode); const ownedPids = Object.freeze([child.pid, ...observed.keys()]); const resultDetails = details({ ownedPids });
  if (pollFailure) { if (pollFailure instanceof GmAdapterError) throw new GmAdapterError("PROCESS_OWNERSHIP", pollFailure.message, true, { ...resultDetails, ...pollFailure.details }); throw new GmAdapterError("PROCESS_OWNERSHIP", "process inventory failed while establishing Runner ownership", true, resultDetails); }
  if (first === "timeout") throw new GmAdapterError("TIMEOUT", "owned process exceeded timeout", true, resultDetails);
  if (first === "cancelled") throw new GmAdapterError("CANCELLED", "owned process was cancelled", true, resultDetails);
  return Object.freeze({ exitCode, stdout: stdoutCapture.text(), stderr: stderrCapture.text(), stdoutTruncated: stdoutCapture.truncated, stderrTruncated: stderrCapture.truncated, timedOut: false, cancelled: false, ownedPids, observedRunners: Object.freeze([...observed.values()]), startToken });
}
