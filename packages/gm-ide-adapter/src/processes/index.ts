import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import type { GmProcessSnapshot } from "../contracts/index.js";
import { GmAdapterError, fail } from "../errors/index.js";

const execFileAsync = promisify(execFile);
export interface RawProcess { readonly pid: number; readonly parentPid: number | null; readonly name: string; readonly executable: string | null; readonly commandLine: string; readonly creationDate: string }
export interface OwnedProcessRecord extends GmProcessSnapshot { readonly ownerTransactionId: string; readonly kind: "igor" | "runner"; readonly startedByOperation: true; readonly state: "running" | "exited" | "terminated" | "identity-lost"; readonly exitCode: number | null }
export type ProcessInventory = () => Promise<readonly RawProcess[]>;

export const commandHash = (executable: string, args: readonly string[]): string => createHash("sha256").update(JSON.stringify([executable, ...args])).digest("hex");
export async function windowsProcessInventory(): Promise<readonly RawProcess[]> {
  if (process.platform !== "win32") return [];
  const script = "$p=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,CreationDate; $p | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 10_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
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
  register(raw: RawProcess, transactionId: string, kind: "igor" | "runner", expectedCommandHash?: string): OwnedProcessRecord {
    const record = Object.freeze({ ...toProcessSnapshot(raw, transactionId), commandHash: expectedCommandHash ?? toProcessSnapshot(raw).commandHash, ownerTransactionId: transactionId, kind, startedByOperation: true as const, state: "running" as const, exitCode: null }); this.#records.set(raw.pid, record); return record;
  }
  markExited(pid: number, exitCode: number | null): void { const current = this.#records.get(pid); if (current) this.#records.set(pid, Object.freeze({ ...current, state: "exited", exitCode })); }
  async identityMatches(record: OwnedProcessRecord): Promise<boolean> {
    const current = (await this.inventory()).find(({ pid }) => pid === record.pid); if (!current) return false;
    if (record.startToken && current.creationDate !== record.startToken) return false;
    if (record.executable && current.executable && record.executable.toLowerCase() !== current.executable.toLowerCase()) return false;
    return true;
  }
  async terminateOwned(child: ChildProcess, transactionId: string): Promise<void> {
    const pid = child.pid; if (!pid) fail("PROCESS_OWNERSHIP", "owned child has no PID"); const record = this.#records.get(pid);
    if (!record || record.ownerTransactionId !== transactionId || !record.startedByOperation) fail("PROCESS_OWNERSHIP", "process is not owned by this transaction");
    if (!(await this.identityMatches(record))) { this.#records.set(pid, Object.freeze({ ...record, state: "identity-lost" })); fail("PROCESS_OWNERSHIP", "PID identity changed; refusing termination"); }
    child.kill("SIGTERM"); await new Promise<void>((resolve) => { const done = (): void => resolve(); child.once("exit", done); setTimeout(done, 1_500).unref(); });
    if (child.exitCode === null && await this.identityMatches(record)) child.kill("SIGKILL");
    this.#records.set(pid, Object.freeze({ ...record, state: "terminated", exitCode: child.exitCode }));
  }
  async terminateRecord(record: OwnedProcessRecord, transactionId: string): Promise<void> {
    if (record.ownerTransactionId !== transactionId || !record.startedByOperation || !(await this.identityMatches(record))) fail("PROCESS_OWNERSHIP", "process identity is not owned by this transaction");
    try { process.kill(record.pid, "SIGTERM"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    const deadline = Date.now() + 1_500; while (Date.now() < deadline && await this.identityMatches(record)) await new Promise((resolve) => setTimeout(resolve, 50));
    if (await this.identityMatches(record)) { try { process.kill(record.pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; } }
    this.#records.set(record.pid, Object.freeze({ ...record, state: "terminated", exitCode: null }));
  }
}

export interface OwnedCommandResult { readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly timedOut: boolean; readonly cancelled: boolean; readonly ownedPids: readonly number[]; readonly observedRunners: readonly OwnedProcessRecord[]; readonly startToken: string }
export async function runOwnedCommand(input: Readonly<{ executable: string; args: readonly string[]; cwd: string; transactionId: string; timeoutMs: number; cancellation?: AbortSignal; ledger: ProcessLedger; expectedRuntimeSignal?: string }>): Promise<OwnedCommandResult> {
  if (input.cancellation?.aborted) fail("CANCELLED", "operation cancelled before process start", true);
  const operationStarted = Date.now(); const before = await input.ledger.inventory(); const beforeRunnerIds = new Set(before.filter(({ name }) => /^Runner(?:\.exe)?$/i.test(name)).map(({ pid }) => pid));
  const child = spawn(input.executable, [...input.args], { cwd: input.cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  if (!child.pid) fail("PROCESS_OWNERSHIP", "failed to obtain child PID");
  const expectedHash = commandHash(input.executable, input.args); let initial: RawProcess | undefined; const identityDeadline = Math.min(operationStarted + input.timeoutMs, Date.now() + 5_000);
  while (!initial && Date.now() < identityDeadline && child.exitCode === null) { if (input.cancellation?.aborted) { child.kill("SIGTERM"); fail("CANCELLED", "operation cancelled during process identity acquisition", true); } initial = (await input.ledger.inventory()).find(({ pid }) => pid === child.pid); if (!initial) await new Promise((resolve) => setTimeout(resolve, 50)); }
  if (!initial) {
    if (child.exitCode === null) child.kill("SIGTERM");
    if (Date.now() >= operationStarted + input.timeoutMs) throw new GmAdapterError("TIMEOUT", "owned process exceeded timeout during identity acquisition", true, { ownedPids: [child.pid] });
    fail("PROCESS_OWNERSHIP", "could not acquire the Igor OS creation token", true, { pid: child.pid });
  }
  const startToken = initial.creationDate;
  input.ledger.register(initial, input.transactionId, "igor", expectedHash);
  let stdout = ""; let stderr = ""; child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); }); child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  const observed = new Map<number, OwnedProcessRecord>(); let settled = false; let timedOut = false; let cancelled = false; let polling = false;
  const poll = setInterval(() => { if (polling) return; polling = true; void input.ledger.inventory().then((rows) => { for (const row of rows) if (/^Runner(?:\.exe)?$/i.test(row.name) && !beforeRunnerIds.has(row.pid) && !observed.has(row.pid)) observed.set(row.pid, input.ledger.register(row, input.transactionId, "runner")); }).catch(() => undefined).finally(() => { polling = false; }); }, 250); poll.unref();
  const timeout = setTimeout(() => { timedOut = true; void input.ledger.terminateOwned(child, input.transactionId).catch(() => undefined); }, Math.max(1, input.timeoutMs - (Date.now() - operationStarted))); timeout.unref();
  const onAbort = (): void => { cancelled = true; void input.ledger.terminateOwned(child, input.transactionId).catch(() => undefined); }; input.cancellation?.addEventListener("abort", onAbort, { once: true });
  if (input.cancellation?.aborted) onAbort();
  const exitCode = await new Promise<number>((resolve, reject) => { child.once("error", reject); child.once("exit", (code) => { settled = true; resolve(code ?? -1); }); }).finally(() => { clearInterval(poll); clearTimeout(timeout); input.cancellation?.removeEventListener("abort", onAbort); });
  input.ledger.markExited(child.pid, exitCode);
  for (const record of observed.values()) if (!(await input.ledger.identityMatches(record))) input.ledger.markExited(record.pid, 0);
  if (!settled) fail("PROCESS_OWNERSHIP", "owned process did not settle", true);
  if (timedOut) throw new GmAdapterError("TIMEOUT", "owned process exceeded timeout", true, { stdout, stderr, ownedPids: [child.pid, ...observed.keys()] });
  if (cancelled) throw new GmAdapterError("CANCELLED", "owned process was cancelled", true, { stdout, stderr, ownedPids: [child.pid, ...observed.keys()] });
  return Object.freeze({ exitCode, stdout, stderr, timedOut, cancelled, ownedPids: Object.freeze([child.pid, ...observed.keys()]), observedRunners: Object.freeze([...observed.values()]), startToken });
}
