import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const root = join(repo, "scripts", "ab04-isolation");
const manifest = JSON.parse(readFileSync(join(repo, "benchmarks", "threejs-game-skills-ab", "isolation", "provision-manifest.json"), "utf8"));
const proposal = JSON.parse(readFileSync(join(repo, "benchmarks", "threejs-game-skills-ab", "isolation", "contract-amendment-proposal.json"), "utf8"));
const text = (name) => readFileSync(join(root, name), "utf8");

test("AB04 isolation remains preparation-only and fail-closed", () => {
  assert.equal(manifest.sprint, "DEVLAB-AB04-ISOLATION-TOKEN-03");
  assert.equal(manifest.parentSprint, "DEVLAB-AB04-ISOLATION-PROVISION-02");
  assert.equal(manifest.mode, "PREPARATION_ONLY");
  assert.equal(manifest.applyAuthorized, false);
  assert.equal(manifest.reviewGate.independentApprovalStatus, "UNSET");
  assert.equal(manifest.reviewGate.currentDecision, "DO_NOT_APPLY");
  assert.equal(manifest.architectureDisposition.status, "REJECTED_BY_STATIC_FEASIBILITY_GATE");
  assert.equal(manifest.architectureDisposition.localUserRestrictedTokenApproved, false);
  assert.equal(manifest.architectureDisposition.requiredFallback, "DISPOSABLE_VM_OR_WINDOWS_SANDBOX_WITH_GPU");
  assert.match(manifest.reviewGate.blockingFinding, /BUILTIN Users/);
});

test("AB04 identities, paths and runtime copies are exact", () => {
  assert.deepEqual(manifest.accounts, {
    legA: "DevLabAb04LegA",
    legB: "DevLabAb04LegB",
    standardUsersOnly: true,
    forbiddenGroups: ["S-1-5-32-544", "S-1-5-32-555"],
    interactiveLogonEnabledByProvisioner: false,
    rdpEnabledByProvisioner: false,
  });
  assert.equal(manifest.paths.runRoot, "H:/UserData/Deposito/Documents/devlab-runs/threejs-game-skills-ab-04");
  assert.equal(manifest.paths.protectedHostPaths.length, 11);
  assert.ok(manifest.paths.protectedHostPaths.includes("C:/Users/Deposito/.codex"));
  assert.ok(manifest.paths.protectedHostPaths.includes("H:/UserData/Deposito/Documents/img2threejs-intake"));
  assert.match(manifest.paths.legAChromium, /leg-a\/runtime\/chromium$/);
  assert.match(manifest.paths.legBChromium, /leg-b\/runtime\/chromium$/);
  assert.equal(manifest.runtime.chromiumExecutableSha256, "290fa7018fda22c52ada5eddb0113baf3ebc41fd0fde6085eddb19793606c635");
  assert.equal(manifest.runtime.chromiumDistributionTreeSha256, "bfd9c556552c637ceee2cf808aa1b5984da29f874965f0fd99b42326b3110fa0");
  assert.equal(manifest.runtime.executableInventory.length, 7);
  assert.equal(manifest.runtime.nodeExecutableSha256, "d14ba95cdce1ef7dc9ad3ac74949ca5db38b27378ee30f30a23cf26f9e875a11");
  assert.equal(manifest.runtime.adapterVendor, "nvidia");
  assert.equal(manifest.runtime.adapterArchitecture, "turing");
  assert.equal(manifest.runtime.adapterPciDeviceId, "10DE:1E89");
});

test("firewall is dedicated-SID scoped and covers every child process", () => {
  assert.equal(manifest.network.firewallGroup, "DevLab AB04 Isolation");
  assert.equal(manifest.network.programScope, "ALL_PROCESSES_FOR_DEDICATED_USER_SID");
  assert.deepEqual(manifest.network.blockedRemoteAddressRanges, [
    "0.0.0.0-127.0.0.0",
    "127.0.0.2-255.255.255.255",
    "::",
    "::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  ]);
  assert.deepEqual(manifest.network.allowedLoopback, ["127.0.0.1", "::1"]);
  assert.equal(manifest.network.normalUserRulesModified, false);
  assert.equal(manifest.aclTemplates.length, 4);
  assert.deepEqual(manifest.aclTemplates.map(({ pathKey }) => pathKey), ["runRoot", "legA", "legB", "coordinatorPrivate"]);
  assert.equal(manifest.executor.shellExposedToBuilder, false);
  assert.ok(manifest.executor.forbiddenBuilderLaunchers.includes("powershell.exe"));
});

test("installer and rollback contain one-shot safety gates", () => {
  const install = text("Install-Ab04Isolation.ps1");
  const uninstall = text("Uninstall-Ab04Isolation.ps1");
  assert.match(install, /#Requires -RunAsAdministrator/);
  assert.match(install, /Management\.Automation\.PSCredential\]\$LegACredential/);
  assert.match(install, /Management\.Automation\.PSCredential\]\$LegBCredential/);
  assert.match(install, /AB04_INDEPENDENT_APPROVAL_REQUIRED/);
  assert.match(install, /AB04_LOCAL_USER_ARCHITECTURE_REJECTED_USE_VM_OR_WINDOWS_SANDBOX/);
  assert.match(install, /New-LocalUser/);
  assert.match(install, /-LocalUser/);
  assert.match(install, /HMACSHA256/);
  assert.match(install, /auditLogSha256/);
  assert.doesNotMatch(install, /PasswordNeverExpires/);
  assert.doesNotMatch(install, /Import-Clixml|Export-Clixml|ConvertFrom-SecureString/);
  assert.match(install, /AB04_GUIDANCE_CANONICAL_HASH_MISMATCH/);
  assert.match(install, /restrictedTokenLauncherSha256/);
  assert.doesNotMatch(`${install}\n${uninstall}`, /Set-NetFirewallProfile|Enable-PSRemoting|Set-ExecutionPolicy/);
  assert.match(uninstall, /AB04_DESTRUCTIVE_TARGET_SCOPE_MISMATCH/);
  assert.match(uninstall, /AB04_BENCHMARK_EVIDENCE_PRESENT_ARCHIVE_CONFIRMATION_REQUIRED/);
  assert.match(uninstall, /Win32_UserProfile/);
  assert.match(uninstall, /AB04_PROFILE_STILL_LOADED/);
});

test("restricted-token candidate is auditable but runtime-authority stays closed", () => {
  const source = text("RestrictedTokenLauncher.cs");
  const wrapper = text("Start-Ab04RestrictedProcess.ps1");
  const adversarial = text("Test-Ab04IsolationAdversarial.ps1");
  assert.equal(manifest.tokenHardening.runtimeExecutionAuthorized, false);
  assert.equal(manifest.tokenHardening.credentialPersistence, false);
  assert.deepEqual(manifest.tokenHardening.remainingPrivileges, []);
  assert.match(source, /LogonUserW/);
  assert.match(source, /CreateRestrictedToken/);
  assert.match(source, /AdjustTokenPrivileges/);
  assert.match(source, /AB04_TOKEN_PRIVILEGES_REMAIN/);
  assert.match(source, /CreateProcessAsUserW/);
  assert.doesNotMatch(source, /CreateProcessWithTokenW|CREATE_BREAKAWAY_FROM_JOB|SANDBOX_INERT/);
  assert.doesNotMatch(source, /PtrToStringBSTR|GetNetworkCredential/);
  assert.match(wrapper, /AB04_LOCAL_USER_ARCHITECTURE_REJECTED_USE_VM_OR_WINDOWS_SANDBOX/);
  assert.doesNotMatch(adversarial, /Start-Process[^\r\n]+-Credential|Import-Clixml/);
  assert.match(adversarial, /Start-Ab04RestrictedProcess\.ps1/);
  const sourceHash = createHash("sha256").update(readFileSync(join(root, "RestrictedTokenLauncher.cs"))).digest("hex");
  assert.equal(sourceHash, manifest.tokenHardening.launcherSourceSha256);
});

test("guidance bundle identity is canonical and remains contract-blocked", () => {
  assert.equal(manifest.guidanceBundle.sourceManifestSha256, "443f510cd4021cc43f0a0d0a53a6f40faad34f45767d6137c6d1ef23c93037ee");
  assert.equal(manifest.guidanceBundle.fileCount, 25);
  assert.equal(manifest.guidanceBundle.byteLength, 128391);
  assert.equal(manifest.guidanceBundle.bundleTreeSha256, "316359c4eb750d156113791927651c45982fcd21c6d91ec8f402a680d2ddc5f3");
  assert.equal(manifest.guidanceBundle.legBAccess, "READ_ONLY");
  assert.equal(manifest.guidanceBundle.externalCheckoutAccess, "DENIED");
  assert.equal(manifest.guidanceBundle.builderExecutionAuthorized, false);
});

test("contract amendment proposal resolves root and order ambiguity without changing v2", () => {
  assert.equal(proposal.status, "PROPOSED_NOT_APPLIED");
  assert.equal(proposal.runIdentity.nestedRunIdDirectory, false);
  assert.equal(proposal.runIdentity.materializerRunRoot, manifest.paths.runRoot);
  assert.equal(proposal.orderSelection.method, "CSPRNG_UINT32_PARITY");
  assert.equal(proposal.orderSelection.selectedBeforeAnyBuilder, true);
  assert.equal(proposal.orderSelection.signedWith, "COORDINATOR_PRIVATE_HMAC_SHA256_KEY");
});

test("script hash manifest authenticates every executable review script", () => {
  const lines = text("script-hashes.sha256").trim().split(/\r?\n/);
  const expected = new Map(lines.map((line) => {
    const match = /^([a-f0-9]{64})  ([^\\/]+)$/.exec(line);
    assert.ok(match, line);
    return [match[2], match[1]];
  }));
  const names = [
    "Ab04Isolation.Common.psm1",
    "Install-Ab04Isolation.ps1",
    "New-Ab04IsolationPlan.ps1",
    "RestrictedTokenLauncher.cs",
    "Start-Ab04RestrictedProcess.ps1",
    "Test-Ab04IsolationAdversarial.ps1",
    "Test-Ab04IsolationStatic.ps1",
    "Test-Ab04RestrictedToken.ps1",
    "Uninstall-Ab04Isolation.ps1",
    "ab04-leg-probe.mjs",
  ];
  assert.deepEqual([...expected.keys()].sort(), names.sort());
  for (const name of names) {
    const actual = createHash("sha256").update(readFileSync(join(root, name))).digest("hex");
    assert.equal(actual, expected.get(name), name);
  }
});
