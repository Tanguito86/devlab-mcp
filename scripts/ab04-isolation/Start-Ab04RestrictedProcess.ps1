#Requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('legA', 'legB')][string]$Leg,
  [Parameter(Mandatory)][Management.Automation.PSCredential]$Credential,
  [Parameter(Mandatory)][ValidateSet('node', 'chromium')][string]$Runtime,
  [string[]]$ArgumentList = @(),
  [string]$WorkingDirectory,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedReceiptSha256,
  [string]$ManifestPath = (Join-Path $PSScriptRoot '..\..\benchmarks\threejs-game-skills-ab\isolation\provision-manifest.json')
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Ab04Isolation.Common.psm1') -Force

function Assert-Ab04ContainedPath {
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Path,
    [switch]$Directory
  )
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $pathFull = [IO.Path]::GetFullPath($Path)
  if ($pathFull -ne $rootFull -and -not $pathFull.StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'AB04_RESTRICTED_PATH_OUTSIDE_LEG'
  }
  $cursor = $pathFull
  while ($cursor.Length -ge $rootFull.Length) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "AB04_RESTRICTED_PATH_LINKED: $cursor" }
    }
    if ($cursor -eq $rootFull) { break }
    $cursor = Split-Path -Parent $cursor
  }
  if ($Directory) {
    if (-not (Test-Path -LiteralPath $pathFull -PathType Container)) { throw 'AB04_RESTRICTED_WORKING_DIRECTORY_MISSING' }
  } elseif (-not (Test-Path -LiteralPath $pathFull -PathType Leaf)) {
    throw 'AB04_RESTRICTED_EXECUTABLE_MISSING'
  }
  $pathFull
}

$manifest = Read-Ab04Manifest -LiteralPath $ManifestPath
if ($manifest.architectureDisposition.localUserRestrictedTokenApproved -ne $true -or
    $manifest.tokenHardening.runtimeExecutionAuthorized -ne $true) {
  throw 'AB04_LOCAL_USER_ARCHITECTURE_REJECTED_USE_VM_OR_WINDOWS_SANDBOX'
}
if ($manifest.tokenHardening.normalProcessExecution -ne 'PROHIBITED' -or
    $manifest.tokenHardening.restrictedLauncherRequired -ne $true) {
  throw 'AB04_RESTRICTED_TOKEN_POLICY_MISSING'
}
$receiptPath = Join-Path $manifest.paths.coordinatorPrivate $manifest.audit.receiptFile
if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { throw 'AB04_RECEIPT_MISSING' }
if ((Get-Ab04Sha256 -LiteralPath $receiptPath) -ne $ExpectedReceiptSha256) { throw 'AB04_RECEIPT_HASH_MISMATCH' }
$receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
if ($receipt.manifestSha256 -ne (Get-Ab04Sha256 -LiteralPath $ManifestPath)) { throw 'AB04_RECEIPT_MANIFEST_MISMATCH' }

$expectedName = [string]$manifest.accounts.$Leg
$credentialName = [string]$Credential.UserName
$domain = '.'
$user = $credentialName
if ($credentialName.Contains('\')) {
  $parts = $credentialName.Split(@('\'), 2)
  $domain = $parts[0]
  $user = $parts[1]
} elseif ($credentialName.Contains('@')) {
  throw 'AB04_UPN_CREDENTIAL_FORBIDDEN'
}
if ($user -ne $expectedName) { throw 'AB04_CREDENTIAL_USER_MISMATCH' }

$legRoot = if ($Leg -eq 'legA') { [string]$manifest.paths.legA } else { [string]$manifest.paths.legB }
$launcherPath = if ($Leg -eq 'legA') { [string]$manifest.paths.legARestrictedLauncher } else { [string]$manifest.paths.legBRestrictedLauncher }
$launcherPath = Assert-Ab04ContainedPath -Root $legRoot -Path $launcherPath
if ((Get-Ab04Sha256 -LiteralPath $launcherPath) -ne $receipt.runtime.restrictedTokenLauncherSha256) {
  throw 'AB04_RESTRICTED_LAUNCHER_BINARY_HASH_MISMATCH'
}

if ($Runtime -eq 'node') {
  $executable = if ($Leg -eq 'legA') { [string]$manifest.paths.legANode } else { [string]$manifest.paths.legBNode }
  $expectedExecutableHash = [string]$manifest.runtime.nodeExecutableSha256
} else {
  $chromiumRoot = if ($Leg -eq 'legA') { [string]$manifest.paths.legAChromium } else { [string]$manifest.paths.legBChromium }
  $executable = Join-Path $chromiumRoot 'chrome.exe'
  $expectedExecutableHash = [string]$manifest.runtime.chromiumExecutableSha256
}
$executable = Assert-Ab04ContainedPath -Root $legRoot -Path $executable
if ((Get-Ab04Sha256 -LiteralPath $executable) -ne $expectedExecutableHash) { throw 'AB04_RESTRICTED_RUNTIME_HASH_MISMATCH' }

if (-not $WorkingDirectory) { $WorkingDirectory = $legRoot }
$WorkingDirectory = Assert-Ab04ContainedPath -Root $legRoot -Path $WorkingDirectory -Directory
$expectedSid = [string]$receipt.accounts.$Leg.sid
if ($expectedSid -notmatch '^S-1-5-21-(?:\d+-){3}\d+$') { throw 'AB04_RECEIPT_USER_SID_INVALID' }

$coordinatorLauncher = [IO.Path]::GetFullPath([string]$manifest.paths.coordinatorRestrictedLauncher)
$privateRoot = [IO.Path]::GetFullPath([string]$manifest.paths.coordinatorPrivate).TrimEnd('\')
if (-not $coordinatorLauncher.StartsWith($privateRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath $coordinatorLauncher -PathType Leaf)) {
  throw 'AB04_COORDINATOR_LAUNCHER_SCOPE_INVALID'
}
if ((Get-Ab04Sha256 -LiteralPath $coordinatorLauncher) -ne $receipt.runtime.restrictedTokenLauncherSha256) {
  throw 'AB04_COORDINATOR_LAUNCHER_HASH_MISMATCH'
}
$assembly = [Reflection.Assembly]::LoadFile($coordinatorLauncher)
$launcherType = $assembly.GetType('DevLab.Ab04.RestrictedTokenLauncher', $true)
$method = $launcherType.GetMethod('Launch', [Reflection.BindingFlags]'Public, Static')
if (-not $method) { throw 'AB04_RESTRICTED_LAUNCH_METHOD_MISSING' }
$invokeArguments = New-Object object[] 8
$invokeArguments[0] = $Credential.Password
$invokeArguments[1] = $user
$invokeArguments[2] = $domain
$invokeArguments[3] = $expectedSid
$invokeArguments[4] = $launcherPath
$invokeArguments[5] = $executable
$invokeArguments[6] = $WorkingDirectory
$invokeArguments[7] = [string[]]$ArgumentList
try {
  $reportJson = [string]$method.Invoke($null, $invokeArguments)
} catch {
  if ($_.Exception.InnerException) { throw $_.Exception.InnerException }
  throw
} finally {
  $invokeArguments[0] = $null
}
$report = $reportJson | ConvertFrom-Json
if ($report.compliant -ne $true -or
    $report.userSid -ne $expectedSid -or
    $report.authenticatedUsers -notin @('DISABLED', 'DENY_ONLY') -or
    $report.builtinUsers -notin @('DISABLED', 'DENY_ONLY') -or
    $report.seChangeNotifyPrivilege -notin @('REMOVED', 'DISABLED') -or
    $report.administratorsMember -ne $false -or
    $report.integrity -ne 'MEDIUM' -or
    $report.childProcessTokenSameRestrictions -ne $true) {
  throw 'AB04_RESTRICTED_TOKEN_RUNTIME_GATE_FAILED'
}
$report
