import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { verifySelectedGuidance } from "../../../../scripts/threejs-game-skills-ab04.mjs";

export const SYNTHETIC_SOURCE = "devlab/ab04-synthetic-guidance";
export const SYNTHETIC_ORIGIN = "https://example.invalid/devlab/ab04-synthetic-guidance";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonSnapshot(value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  return { text, value, sha256: sha256(Buffer.from(text, "utf8")) };
}

function gitEnvironment() {
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  };
}

function runGit(checkout, args) {
  return execFileSync("git", ["-C", checkout, ...args], {
    env: gitEnvironment(),
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function createSyntheticGuidanceFixture(baseContract, baseVerification, { attached = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "devlab-ab04-guidance-"));
  const checkout = join(root, "checkout");
  mkdirSync(checkout);
  runGit(checkout, ["init", "--initial-branch=main"]);
  runGit(checkout, ["config", "core.autocrlf", "false"]);

  const canonicalManifest = baseVerification.snapshots.selectedGuidanceManifest.value;
  const allowedFiles = canonicalManifest.allowedFiles.map((entry, index) => {
    const content = `Synthetic AB-04 guidance fixture ${String(index + 1).padStart(2, "0")} for ${entry.path}.\n`;
    const absolute = join(checkout, ...entry.path.split("/"));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, { encoding: "utf8" });
    return {
      path: entry.path,
      sha256: sha256(Buffer.from(content, "utf8")),
      purpose: `synthetic coverage ${String(index + 1).padStart(2, "0")}`,
    };
  });

  runGit(checkout, ["add", "--all"]);
  runGit(checkout, [
    "-c", "user.name=DevLab AB04 Fixture",
    "-c", "user.email=ab04-fixture@example.invalid",
    "commit", "--no-gpg-sign", "-m", "synthetic AB-04 guidance fixture",
  ]);
  runGit(checkout, ["remote", "add", "origin", `${SYNTHETIC_ORIGIN}.git`]);
  const initialHead = runGit(checkout, ["rev-parse", "HEAD"]);
  if (!attached) runGit(checkout, ["checkout", "--detach", initialHead]);

  const policy = {
    ...structuredClone(baseVerification.snapshots.sourcePolicy.value),
    source: SYNTHETIC_SOURCE,
    repository: SYNTHETIC_ORIGIN,
    pin: initialHead,
  };
  const manifest = {
    ...structuredClone(canonicalManifest),
    source: SYNTHETIC_SOURCE,
    repository: SYNTHETIC_ORIGIN,
    pin: initialHead,
    allowedFiles,
  };
  const contract = structuredClone(baseContract);
  contract.treatment.sourceId = "ab04-synthetic-guidance";
  contract.treatment.sourceRepository = SYNTHETIC_ORIGIN;
  contract.treatment.sourcePin = initialHead;

  let snapshots;
  const refreshSnapshots = () => {
    const sourcePolicy = jsonSnapshot(policy);
    const selectedGuidanceManifest = jsonSnapshot(manifest);
    contract.treatment.sourcePolicySha256 = sourcePolicy.sha256;
    contract.treatment.selectedGuidanceManifestSha256 = selectedGuidanceManifest.sha256;
    snapshots = { sourcePolicy, selectedGuidanceManifest };
    return snapshots;
  };
  refreshSnapshots();

  const setPin = (pin) => {
    contract.treatment.sourcePin = pin;
    policy.pin = pin;
    manifest.pin = pin;
    refreshSnapshots();
  };

  const buildVerification = () => {
    const guidance = verifySelectedGuidance(contract, snapshots, { checkout });
    const contractText = `${JSON.stringify(contract, null, 2)}\n`;
    const resultSchema = structuredClone(baseVerification.snapshots.resultSchema.value);
    const legBSource = resultSchema.allOf[1].then.properties.sourceProvenance.properties;
    legBSource.sourceHead.const = contract.treatment.sourcePin;
    legBSource.sourcePolicySha256.const = contract.treatment.sourcePolicySha256;
    legBSource.selectedGuidanceManifestSha256.const = contract.treatment.selectedGuidanceManifestSha256;
    const verification = {
      ...baseVerification,
      contractSha256: sha256(Buffer.from(contractText, "utf8")),
      selectedGuidanceManifestSha256: guidance.manifestSha256,
      sourceHead: guidance.sourceHead,
      allowlistCount: guidance.allowlistCount,
    };
    Object.defineProperty(verification, "contract", { value: contract, enumerable: false });
    Object.defineProperty(verification, "snapshots", {
      value: {
        ...baseVerification.snapshots,
        contract: {
          text: contractText,
          sha256: verification.contractSha256,
        },
        resultSchema: {
          ...baseVerification.snapshots.resultSchema,
          value: resultSchema,
        },
        sourcePolicy: snapshots.sourcePolicy,
        selectedGuidanceManifest: snapshots.selectedGuidanceManifest,
      },
      enumerable: false,
    });
    return verification;
  };

  return {
    root,
    checkout,
    contract,
    policy,
    manifest,
    get snapshots() { return snapshots; },
    buildVerification,
    refreshSnapshots,
    setPin,
    git: (args) => runGit(checkout, args),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
