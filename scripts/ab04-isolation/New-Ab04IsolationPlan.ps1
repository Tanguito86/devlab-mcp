#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$ManifestPath = (Join-Path $PSScriptRoot '..\..\benchmarks\threejs-game-skills-ab\isolation\provision-manifest.json'),
  [string]$OutputPath
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Ab04Isolation.Common.psm1') -Force

$manifest = Read-Ab04Manifest -LiteralPath $ManifestPath
$runtime = Assert-Ab04RuntimeIdentity -Manifest $manifest
$accountState = foreach ($name in @($manifest.accounts.legA, $manifest.accounts.legB)) {
  $user = Get-LocalUser -Name $name -ErrorAction SilentlyContinue
  [pscustomobject]@{ name = $name; exists = [bool]$user; sid = if ($user) { $user.SID.Value } else { $null } }
}
$firewallRules = @(Get-NetFirewallRule -Group $manifest.network.firewallGroup -ErrorAction SilentlyContinue)
$resourcePaths = @($manifest.paths.runRoot, $manifest.paths.legA, $manifest.paths.legB, $manifest.paths.coordinatorPrivate)
$existingPaths = @($resourcePaths | Where-Object { Test-Path -LiteralPath $_ })
$pathsToAudit = @($manifest.paths.protectedHostPaths) + @((Split-Path -Parent $manifest.paths.runRoot))
$genericExposure = Test-Ab04GenericParentExposure -LiteralPath $pathsToAudit
$tokenFilesystem = Get-Ab04TokenFilesystemFeasibility -Manifest $manifest

$blocking = New-Object System.Collections.Generic.List[string]
if (@($accountState | Where-Object exists).Count -gt 0) { $blocking.Add('UNEXPECTED_LOCAL_ACCOUNT') }
if ($firewallRules.Count -gt 0) { $blocking.Add('UNEXPECTED_FIREWALL_RULE') }
if ($existingPaths.Count -gt 0) { $blocking.Add('UNEXPECTED_RESOURCE_PATH') }
if ($genericExposure.Count -gt 0) { $blocking.Add('H_EXPOSURE_WITH_NORMAL_TOKEN_RECOGNIZED') }
if ($tokenFilesystem.status -ne 'PASS') { $blocking.Add('RESTRICTED_TOKEN_FILESYSTEM_FEASIBILITY_FAILED') }
if ($manifest.architectureDisposition.localUserRestrictedTokenApproved -ne $true) { $blocking.Add('LOCAL_USER_ARCHITECTURE_REJECTED') }
if ($manifest.guidanceBundle.builderExecutionAuthorized -ne $true) { $blocking.Add('GUIDANCE_CONTRACT_V3_RECONCILIATION_MISSING') }
if ($manifest.applyAuthorized -ne $true) { $blocking.Add('APPLY_NOT_AUTHORIZED') }
if ($manifest.reviewGate.independentApprovalStatus -ne 'INDEPENDENTLY_APPROVED') { $blocking.Add('INDEPENDENT_REVIEW_MISSING') }

$plan = [pscustomobject][ordered]@{
  schemaVersion = 1
  sprint = $manifest.sprint
  generatedUtc = [DateTime]::UtcNow.ToString('o')
  mode = 'STATIC_PLAN_ONLY'
  hostChanged = $false
  canApply = ($blocking.Count -eq 0)
  decision = if ($blocking.Count -eq 0) { 'READY_FOR_ONE_SHOT_ADMIN_PROVISIONING' } else { 'DO_NOT_APPLY' }
  blocking = @($blocking)
  manifestSha256 = Get-Ab04Sha256 -LiteralPath $ManifestPath
  baselineHead = $manifest.baselineHead
  accounts = @($accountState)
  existingResourcePaths = $existingPaths
  firewallRuleCount = $firewallRules.Count
  genericParentAclExposure = @($genericExposure)
  tokenFilesystemFeasibility = $tokenFilesystem
  runtime = [pscustomobject]@{
    chromiumSource = $runtime.root
    chromiumFileCount = $runtime.fileCount
    chromiumByteLength = $runtime.byteLength
    chromiumTreeSha256 = $runtime.treeSha256
    chromiumExecutableSha256 = Get-Ab04Sha256 -LiteralPath (Join-Path $runtime.root 'chrome.exe')
    nodeExecutableSha256 = Get-Ab04Sha256 -LiteralPath $manifest.runtime.nodeSource
  }
  intendedChanges = @(
    'candidate only: create exactly two standard local users from in-memory PSCredentials',
    'candidate only: create the fixed AB04 run root and child roots',
    'candidate only: compile and hash the restricted-token launcher',
    'candidate only: copy authenticated Chromium and Node runtimes into each leg',
    'candidate only: materialize the canonical 25-file LEG_B guidance bundle read-only',
    'candidate only: create per-SID outbound rules excluding IPv4 and IPv6 loopback',
    'candidate only: write coordinator-private HMAC key, audit log and receipt without credentials'
  )
}

$json = $plan | ConvertTo-Json -Depth 8
if ($OutputPath) {
  $parent = Split-Path -Parent ([IO.Path]::GetFullPath($OutputPath))
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'AB04_PLAN_PARENT_MISSING' }
  [IO.File]::WriteAllText($OutputPath, $json + "`n", (New-Object Text.UTF8Encoding($false)))
}
$json
