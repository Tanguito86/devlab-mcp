#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$ManifestPath = (Join-Path $PSScriptRoot '..\..\benchmarks\threejs-game-skills-ab\isolation\provision-manifest.json'),
  [string]$HashManifestPath = (Join-Path $PSScriptRoot 'script-hashes.sha256')
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Ab04Isolation.Common.psm1') -Force
$manifest = Read-Ab04Manifest -LiteralPath $ManifestPath
$failures = New-Object System.Collections.Generic.List[string]
$scripts = @(Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object Extension -in @('.ps1', '.psm1', '.mjs', '.cs'))

foreach ($script in $scripts | Where-Object Extension -in @('.ps1', '.psm1')) {
  $tokens = $null; $errors = $null
  [void][Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors)
  foreach ($parseError in @($errors)) { $failures.Add("PARSE:$($script.Name):$($parseError.Message)") }
}

$reviewTargets = @($scripts | Where-Object Name -notin @('Test-Ab04IsolationStatic.ps1', 'Test-Ab04RestrictedToken.ps1'))
$allText = ($reviewTargets | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`n"
$installText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Install-Ab04Isolation.ps1') -Raw
$uninstallText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Uninstall-Ab04Isolation.ps1') -Raw
foreach ($forbidden in @(
  'Set-NetFirewallProfile', 'Enable-PSRemoting', 'Set-ItemProperty.*Terminal Server',
  'Remote Desktop Users.*Add-LocalGroupMember', 'Administrators.*Add-LocalGroupMember',
  'New-ScheduledTask', 'Register-ScheduledTask', 'New-Service', 'Set-Service',
  'netsh\s+advfirewall', 'Set-ExecutionPolicy', 'Invoke-Expression',
  '(?:Import|Export)-Clixml', 'ConvertFrom-SecureString', 'GetNetworkCredential\(\)\.Password',
  'Start-Process[^\r\n]+-Credential', 'LOGON_NETCREDENTIALS_ONLY', 'CREATE_BREAKAWAY_FROM_JOB'
)) {
  if ($allText -match $forbidden) { $failures.Add("FORBIDDEN_OPERATION:$forbidden") }
}
if ($installText -notmatch '#Requires -RunAsAdministrator') { $failures.Add('INSTALL_NOT_ADMIN_ONE_SHOT') }
if ($uninstallText -notmatch '#Requires -RunAsAdministrator') { $failures.Add('UNINSTALL_NOT_ADMIN_ONE_SHOT') }
if ($installText -notmatch 'New-LocalUser' -or $installText -match 'PasswordNeverExpires') { $failures.Add('LOCAL_USER_POLICY_INVALID') }
if ($installText -notmatch 'New-NetFirewallRule' -or $installText -notmatch '-LocalUser') { $failures.Add('FIREWALL_NOT_USER_SCOPED') }
if ($installText -match '-Program\s+["'']?(?:Any|\*)') { $failures.Add('BROAD_PROGRAM_RULE') }
if ($allText -match '(?im)Write-(?:Output|Host|Verbose|Information).*password') { $failures.Add('PASSWORD_LOGGING_PATTERN') }
if ($manifest.accounts.standardUsersOnly -ne $true) { $failures.Add('STANDARD_USER_POLICY_FALSE') }
if ($manifest.executor.shellExposedToBuilder -ne $false) { $failures.Add('BUILDER_SHELL_EXPOSED') }
if ($manifest.network.normalUserRulesModified -ne $false) { $failures.Add('NORMAL_USER_FIREWALL_MUTATION') }
if ($manifest.reviewGate.currentDecision -ne 'DO_NOT_APPLY') { $failures.Add('PREPARATION_GATE_RELAXED') }
if ($manifest.applyAuthorized -ne $false) { $failures.Add('APPLY_AUTHORIZED_PREMATURELY') }
if ($manifest.architectureDisposition.status -ne 'REJECTED_BY_STATIC_FEASIBILITY_GATE' -or
    $manifest.architectureDisposition.requiredFallback -ne 'DISPOSABLE_VM_OR_WINDOWS_SANDBOX_WITH_GPU') {
  $failures.Add('ARCHITECTURE_REJECTION_NOT_RECORDED')
}
if ($manifest.tokenHardening.runtimeExecutionAuthorized -ne $false) { $failures.Add('RESTRICTED_RUNTIME_AUTHORIZED_PREMATURELY') }
if ($manifest.guidanceBundle.builderExecutionAuthorized -ne $false) { $failures.Add('GUIDANCE_CONTRACT_GATE_RELAXED') }
if ((Get-Content -LiteralPath $ManifestPath -Raw) -match 'HASH_PENDING') { $failures.Add('MANIFEST_HASH_PENDING') }

$hashesChecked = 0
$expectedHashFiles = @(
  'Ab04Isolation.Common.psm1',
  'Install-Ab04Isolation.ps1',
  'New-Ab04IsolationPlan.ps1',
  'RestrictedTokenLauncher.cs',
  'Start-Ab04RestrictedProcess.ps1',
  'Test-Ab04IsolationAdversarial.ps1',
  'Test-Ab04IsolationStatic.ps1',
  'Test-Ab04RestrictedToken.ps1',
  'Uninstall-Ab04Isolation.ps1',
  'ab04-leg-probe.mjs'
)
$actualHashFiles = New-Object System.Collections.Generic.List[string]
if (Test-Path -LiteralPath $HashManifestPath -PathType Leaf) {
  foreach ($line in Get-Content -LiteralPath $HashManifestPath) {
    if (-not $line.Trim()) { continue }
    if ($line -notmatch '^([a-f0-9]{64})  ([^\\]+)$') { $failures.Add("HASH_LINE_INVALID:$line"); continue }
    $path = Join-Path $PSScriptRoot $Matches[2]
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $failures.Add("HASH_FILE_MISSING:$($Matches[2])"); continue }
    if ((Get-Ab04Sha256 -LiteralPath $path) -ne $Matches[1]) { $failures.Add("HASH_MISMATCH:$($Matches[2])") }
    $actualHashFiles.Add($Matches[2])
    $hashesChecked++
  }
  $actualHashSet = @($actualHashFiles | Sort-Object) -join ','
  $expectedHashSet = @($expectedHashFiles | Sort-Object) -join ','
  if ($actualHashSet -ne $expectedHashSet) {
    $failures.Add('HASH_FILESET_MISMATCH')
  }
} else {
  $failures.Add('HASH_MANIFEST_MISSING')
}

[pscustomobject]@{
  sprint = $manifest.sprint
  status = if ($failures.Count -eq 0) { 'PASS' } else { 'FAIL' }
  hostChanged = $false
  scriptsParsed = $scripts.Count
  hashesChecked = $hashesChecked
  applyAuthorized = $manifest.applyAuthorized
  independentReview = $manifest.reviewGate.independentApprovalStatus
  failures = @($failures)
} | ConvertTo-Json -Depth 5
if ($failures.Count -gt 0) { exit 1 }
