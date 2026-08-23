#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedReceiptSha256,
  [switch]$ConfirmEvidenceArchived,
  [string]$ManifestPath = (Join-Path $PSScriptRoot '..\..\benchmarks\threejs-game-skills-ab\isolation\provision-manifest.json')
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Ab04Isolation.Common.psm1') -Force
if (-not (Test-Ab04Administrator)) { throw 'AB04_ADMIN_REQUIRED' }
$manifest = Read-Ab04Manifest -LiteralPath $ManifestPath
$receiptPath = Join-Path $manifest.paths.coordinatorPrivate $manifest.audit.receiptFile
if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { throw 'AB04_RECEIPT_MISSING' }
if ((Get-Ab04Sha256 -LiteralPath $receiptPath) -ne $ExpectedReceiptSha256) { throw 'AB04_RECEIPT_HASH_MISMATCH' }
$receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
if ($receipt.sprint -ne $manifest.sprint -or $receipt.paths.runRoot -ne $manifest.paths.runRoot) { throw 'AB04_RECEIPT_SCOPE_MISMATCH' }

$provisionOnlyPrefixes = @('runtime', 'profiles', 'guidance-readonly')
$unexpected = foreach ($legPath in @($manifest.paths.legA, $manifest.paths.legB)) {
  if (Test-Path -LiteralPath $legPath) {
    Get-ChildItem -LiteralPath $legPath -Force | Where-Object { $provisionOnlyPrefixes -notcontains $_.Name } | ForEach-Object FullName
  }
}
if (@($unexpected).Count -gt 0 -and -not $ConfirmEvidenceArchived) {
  throw 'AB04_BENCHMARK_EVIDENCE_PRESENT_ARCHIVE_CONFIRMATION_REQUIRED'
}

foreach ($leg in @('legA', 'legB')) {
  $user = Get-LocalUser -Name $manifest.accounts.$leg -ErrorAction SilentlyContinue
  if (-not $user -or $user.SID.Value -ne $receipt.accounts.$leg.sid) { throw "AB04_USER_RECEIPT_MISMATCH: $leg" }
}
$profiles = @{}
foreach ($leg in @('legA', 'legB')) {
  $sid = [string]$receipt.accounts.$leg.sid
  $profile = Get-CimInstance -ClassName Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue
  if ($profile -and $profile.Loaded) { throw "AB04_PROFILE_STILL_LOADED: $leg" }
  $profiles[$leg] = $profile
}
$rules = @(Get-NetFirewallRule -Group $manifest.network.firewallGroup -ErrorAction SilentlyContinue)
if ($rules.Count -ne 2 -or @($rules.Name | Where-Object { @($receipt.firewallRules) -notcontains $_ }).Count -gt 0) {
  throw 'AB04_FIREWALL_RECEIPT_MISMATCH'
}

if (-not $PSCmdlet.ShouldProcess('DevLab AB04 exact receipt resources', 'Remove firewall rules, users and run root')) { return }
foreach ($leg in @('legA', 'legB')) {
  $profile = $profiles[$leg]
  if ($profile) {
    $profile | Remove-CimInstance -ErrorAction Stop
  }
  Remove-LocalUser -Name $manifest.accounts.$leg -ErrorAction Stop
}
$resolvedRunRoot = [IO.Path]::GetFullPath($manifest.paths.runRoot).TrimEnd('\')
$expectedRunRoot = 'H:\UserData\Deposito\Documents\devlab-runs\threejs-game-skills-ab-04'
if ($resolvedRunRoot -ne $expectedRunRoot) { throw 'AB04_DESTRUCTIVE_TARGET_SCOPE_MISMATCH' }
Remove-Item -LiteralPath $resolvedRunRoot -Recurse -Force
foreach ($rule in @($receipt.firewallRules)) { Remove-NetFirewallRule -Name $rule -ErrorAction Stop }

$remainingUsers = @(@($manifest.accounts.legA, $manifest.accounts.legB) | Where-Object { Get-LocalUser -Name $_ -ErrorAction SilentlyContinue })
$remainingRules = @(Get-NetFirewallRule -Group $manifest.network.firewallGroup -ErrorAction SilentlyContinue)
[pscustomobject]@{
  status = if ($remainingUsers.Count -eq 0 -and $remainingRules.Count -eq 0 -and -not (Test-Path -LiteralPath $resolvedRunRoot)) { 'REMOVED_VERIFIED' } else { 'REMOVAL_INCOMPLETE' }
  removedReceiptSha256 = $ExpectedReceiptSha256
  runRootExists = Test-Path -LiteralPath $resolvedRunRoot
  remainingUsers = $remainingUsers.Count
  remainingRules = $remainingRules.Count
} | ConvertTo-Json -Compress
