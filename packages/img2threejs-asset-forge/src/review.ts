import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { assertSafeRelativePath } from "./artifacts.js";
import { canonicalJson } from "./safe-generation.js";

export type FindingSeverity = "BLOCKER" | "REQUIRED" | "OPTIONAL";
export type FindingCategory = "SECURITY" | "TECHNICAL" | "VISUAL" | "PRODUCT";
export interface BuildArtifactInput { id: string; relativePath: string; sha256: string; inputsHash: string }
export interface BuildArtifact extends Readonly<BuildArtifactInput> { readonly role: "BUILDER_OUTPUT"; readonly sessionId: string; readonly artifactBinding: string; readonly signature: string }
export interface CriticFinding { readonly severity: FindingSeverity; readonly category: FindingCategory; readonly code: string; readonly message: string; readonly evidence: readonly string[] }
export interface CriticReport { readonly role: "CRITIC_OUTPUT"; readonly sessionId: string; readonly artifactBinding: string; readonly criticId: string; readonly findings: readonly CriticFinding[]; readonly signature: string }
export type ResolutionStatus = "APPROVED" | "CHANGES_REQUIRED" | "BLOCKED";
export interface Resolution { readonly role: "RESOLVER_OUTPUT"; readonly sessionId: string; readonly artifactBinding: string; readonly reportHash: string; readonly status: ResolutionStatus; readonly blockingCodes: readonly string[]; readonly signature: string }
export interface BuilderPort { createArtifact(input: BuildArtifactInput): BuildArtifact }
export interface CriticPort { createReport(artifact: BuildArtifact, criticId: string, findings: readonly CriticFinding[]): CriticReport }
export interface ResolverPort { resolve(artifact: BuildArtifact, report: CriticReport): Resolution }
export interface ReviewCoordinator { readonly sessionId: string; readonly builder: BuilderPort; readonly critic: CriticPort; readonly resolver: ResolverPort }

const SEVERITIES = new Set<FindingSeverity>(["BLOCKER", "REQUIRED", "OPTIONAL"]);
const CATEGORIES = new Set<FindingCategory>(["SECURITY", "TECHNICAL", "VISUAL", "PRODUCT"]);

function immutableCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => immutableCopy(item))) as T;
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value as Record<string, unknown>)) output[key] = immutableCopy((value as Record<string, unknown>)[key]);
    return Object.freeze(output) as T;
  }
  return value;
}

export function hashReviewInput(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

function sign(secret: Uint8Array, payload: unknown): string { return createHmac("sha256", secret).update(canonicalJson(payload)).digest("hex"); }
function signatureMatches(secret: Uint8Array, payload: unknown, signature: unknown): boolean {
  if (typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(sign(secret, payload), "hex"), Buffer.from(signature, "hex"));
}

export function createReviewCoordinator(sessionId: string, authoritySecret: Uint8Array): ReviewCoordinator {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(sessionId)) throw new Error("review sessionId is outside policy");
  if (authoritySecret.byteLength < 32) throw new Error("review authority secret must contain at least 32 bytes");
  const secret = Uint8Array.from(authoritySecret);

  const verifyArtifact = (artifact: BuildArtifact): void => {
    if (!artifact || artifact.role !== "BUILDER_OUTPUT" || artifact.sessionId !== sessionId) throw new Error("artifact role or review session is invalid");
    const binding = hashReviewInput({ id: artifact.id, relativePath: artifact.relativePath, sha256: artifact.sha256, inputsHash: artifact.inputsHash });
    if (binding !== artifact.artifactBinding || !signatureMatches(secret, { role: artifact.role, sessionId, artifactBinding: binding }, artifact.signature)) throw new Error("artifact binding or signature is invalid");
  };

  const builder: BuilderPort = Object.freeze({
    createArtifact(input: BuildArtifactInput): BuildArtifact {
      if (!input.id.trim() || !/^[0-9a-f]{64}$/.test(input.sha256) || !/^[0-9a-f]{64}$/.test(input.inputsHash)) throw new Error("artifact identity and hashes are required");
      const normalized: BuildArtifactInput = { id: input.id, relativePath: assertSafeRelativePath(input.relativePath), sha256: input.sha256, inputsHash: input.inputsHash };
      const artifactBinding = hashReviewInput(normalized);
      const payload = { role: "BUILDER_OUTPUT" as const, sessionId, artifactBinding };
      return immutableCopy({ ...normalized, ...payload, signature: sign(secret, payload) });
    },
  });

  const critic: CriticPort = Object.freeze({
    createReport(artifact: BuildArtifact, criticId: string, findings: readonly CriticFinding[]): CriticReport {
      verifyArtifact(artifact);
      if (!/^[A-Za-z0-9._-]{1,128}$/.test(criticId)) throw new Error("criticId is outside policy");
      if (!Array.isArray(findings)) throw new Error("findings must be an array");
      const seen = new Set<string>();
      for (const finding of findings) {
        if (!finding || !SEVERITIES.has(finding.severity) || !CATEGORIES.has(finding.category) || !/^[A-Z0-9_-]{1,64}$/.test(finding.code) || seen.has(finding.code)) throw new Error("finding severity, category, and code must be closed, unique, and valid");
        seen.add(finding.code);
        if (typeof finding.message !== "string" || !finding.message.trim() || !Array.isArray(finding.evidence) || finding.evidence.length === 0 || finding.evidence.some((item: unknown) => typeof item !== "string" || !item.trim())) throw new Error("every finding requires message and evidence");
      }
      const cleanFindings = findings.map((finding): CriticFinding => ({ severity: finding.severity, category: finding.category, code: finding.code, message: finding.message, evidence: [...finding.evidence] }));
      const payload = immutableCopy({ role: "CRITIC_OUTPUT" as const, sessionId, artifactBinding: artifact.artifactBinding, criticId, findings: cleanFindings });
      return immutableCopy({ ...payload, signature: sign(secret, payload) });
    },
  });

  const resolver: ResolverPort = Object.freeze({
    resolve(artifact: BuildArtifact, report: CriticReport): Resolution {
      verifyArtifact(artifact);
      if (!report || report.role !== "CRITIC_OUTPUT" || report.sessionId !== sessionId || report.artifactBinding !== artifact.artifactBinding || !Array.isArray(report.findings)) throw new Error("critic report role, session, or artifact binding is invalid");
      const reportPayload = { role: report.role, sessionId, artifactBinding: report.artifactBinding, criticId: report.criticId, findings: report.findings };
      if (!signatureMatches(secret, reportPayload, report.signature)) throw new Error("critic report signature is invalid");
      for (const finding of report.findings) if (!finding || !SEVERITIES.has(finding.severity)) throw new Error("critic report contains an unknown severity");
      const blocker = report.findings.filter(({ severity }) => severity === "BLOCKER").map(({ code }) => code).sort();
      const required = report.findings.filter(({ severity }) => severity === "REQUIRED").map(({ code }) => code).sort();
      const status: ResolutionStatus = blocker.length > 0 ? "BLOCKED" : required.length > 0 ? "CHANGES_REQUIRED" : "APPROVED";
      const unsigned = { role: "RESOLVER_OUTPUT" as const, sessionId, artifactBinding: artifact.artifactBinding, reportHash: hashReviewInput(report), status, blockingCodes: [...blocker, ...required] };
      return immutableCopy({ ...unsigned, signature: sign(secret, unsigned) });
    },
  });
  return Object.freeze({ sessionId, builder, critic, resolver });
}
