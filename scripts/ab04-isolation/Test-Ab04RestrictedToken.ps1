#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$ManifestPath = (Join-Path $PSScriptRoot '..\..\benchmarks\threejs-game-skills-ab\isolation\provision-manifest.json')
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Ab04Isolation.Common.psm1') -Force
$manifest = Read-Ab04Manifest -LiteralPath $ManifestPath
$sourcePath = Join-Path $PSScriptRoot 'RestrictedTokenLauncher.cs'
$source = Get-Content -LiteralPath $sourcePath -Raw
$failures = New-Object System.Collections.Generic.List[string]

foreach ($api in @(
  'LogonUserW', 'CreateRestrictedToken', 'CreateEnvironmentBlock',
  'CreateProcessAsUserW', 'GetTokenInformation',
  'AdjustTokenPrivileges', 'AssignProcessToJobObject'
)) {
  if ($source -notmatch [regex]::Escape($api)) { $failures.Add("MISSING_API:$api") }
}
foreach ($gate in @(
  'S-1-5-11', 'S-1-5-32-545', 'SeChangeNotifyPrivilege',
  'AB04_AUTHENTICATED_USERS_ENABLED', 'AB04_BUILTIN_USERS_ENABLED',
  'AB04_CHILD_TOKEN_RESTRICTIONS_MISMATCH', 'AB04_INTEGRITY_NOT_MEDIUM',
  'AB04_TOKEN_PRIVILEGES_REMAIN', 'ERROR_NOT_ALL_ASSIGNED'
)) {
  if ($source -notmatch [regex]::Escape($gate)) { $failures.Add("MISSING_GATE:$gate") }
}
if ($source -match 'SANDBOX_INERT|AppContainer|Codex.*sandbox') { $failures.Add('FORBIDDEN_SANDBOX_MECHANISM') }
if ($source -match 'SecureStringToBSTR|PtrToStringBSTR|PtrToStringUni\(password') { $failures.Add('PASSWORD_MANAGED_STRING_CONVERSION') }
if ($source -match 'CreateProcessWithTokenW|CREATE_BREAKAWAY_FROM_JOB|LOGON_NETCREDENTIALS_ONLY') { $failures.Add('FORBIDDEN_PROCESS_FALLBACK') }
if ($manifest.architectureDisposition.decision -ne 'DO_NOT_APPLY' -or
    $manifest.tokenHardening.runtimeExecutionAuthorized -ne $false) { $failures.Add('STATIC_FEASIBILITY_GATE_RELAXED') }
if ((Get-Ab04Sha256 -LiteralPath $sourcePath) -ne $manifest.tokenHardening.launcherSourceSha256) { $failures.Add('LAUNCHER_SOURCE_HASH_MISMATCH') }

$tempBase = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
$outputPath = Join-Path $tempBase ("DevLabAb04Token03-{0}.exe" -f [guid]::NewGuid().ToString('N'))
try {
  Add-Type -Path $sourcePath -OutputAssembly $outputPath -OutputType ConsoleApplication -ErrorAction Stop
  if (-not (Test-Path -LiteralPath $outputPath -PathType Leaf)) { $failures.Add('CSHARP_OUTPUT_MISSING') }
  elseif ((Get-Item -LiteralPath $outputPath).Length -le 0) { $failures.Add('CSHARP_OUTPUT_EMPTY') }
} catch {
  $failures.Add("CSHARP_COMPILE_FAILED:$($_.Exception.GetType().Name)")
} finally {
  if (Test-Path -LiteralPath $outputPath) {
    $resolved = (Resolve-Path -LiteralPath $outputPath).Path
    if (-not $resolved.StartsWith($tempBase + '\', [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolved) -notmatch '^DevLabAb04Token03-[a-f0-9]{32}\.exe$') {
      throw 'AB04_COMPILE_CLEANUP_SCOPE_INVALID'
    }
    [IO.File]::Delete($resolved)
  }
}

[pscustomobject]@{
  sprint = 'DEVLAB-AB04-ISOLATION-TOKEN-03'
  status = if ($failures.Count -eq 0) { 'PASS' } else { 'FAIL' }
  hostChanged = $false
  sourceSha256 = Get-Ab04Sha256 -LiteralPath $sourcePath
  compileCheck = if ($failures | Where-Object { $_ -like 'CSHARP_*' }) { 'FAIL' } else { 'PASS' }
  temporaryOutputRemoved = -not (Test-Path -LiteralPath $outputPath)
  failures = @($failures)
} | ConvertTo-Json -Depth 5
if ($failures.Count -gt 0) { exit 1 }
