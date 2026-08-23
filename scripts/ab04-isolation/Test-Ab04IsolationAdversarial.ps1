#Requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedReceiptSha256,
  [Parameter(Mandatory)][Management.Automation.PSCredential]$LegACredential,
  [Parameter(Mandatory)][Management.Automation.PSCredential]$LegBCredential,
  [string]$ManifestPath = (Join-Path $PSScriptRoot '..\..\benchmarks\threejs-game-skills-ab\isolation\provision-manifest.json')
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Ab04Isolation.Common.psm1') -Force
$manifest = Read-Ab04Manifest -LiteralPath $ManifestPath
if ($manifest.architectureDisposition.localUserRestrictedTokenApproved -ne $true -or
    $manifest.tokenHardening.runtimeExecutionAuthorized -ne $true) {
  throw 'AB04_LOCAL_USER_ARCHITECTURE_REJECTED_USE_VM_OR_WINDOWS_SANDBOX'
}
$receiptPath = Join-Path $manifest.paths.coordinatorPrivate $manifest.audit.receiptFile
if ((Get-Ab04Sha256 -LiteralPath $receiptPath) -ne $ExpectedReceiptSha256) { throw 'AB04_RECEIPT_HASH_MISMATCH' }
$receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
$credentials = @{ legA = $LegACredential; legB = $LegBCredential }
$probeScript = Join-Path $PSScriptRoot 'ab04-leg-probe.mjs'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$guidanceManifest = Get-Content -LiteralPath (Join-Path $repoRoot $manifest.guidanceBundle.sourceManifest) -Raw | ConvertFrom-Json

$sentinels = @{
  legA = Join-Path $manifest.paths.legA '.ab04-leg-a-sentinel'
  legB = Join-Path $manifest.paths.legB '.ab04-leg-b-sentinel'
  private = Join-Path $manifest.paths.coordinatorPrivate '.ab04-private-sentinel'
}
foreach ($entry in $sentinels.GetEnumerator()) { [IO.File]::WriteAllText($entry.Value, $entry.Key, (New-Object Text.UTF8Encoding($false))) }
$externalSentinel = Join-Path $manifest.paths.externalSource 'README.md'
$results = [ordered]@{}

try {
  foreach ($leg in @('legA', 'legB')) {
    $isA = $leg -eq 'legA'
    $ownRoot = if ($isA) { $manifest.paths.legA } else { $manifest.paths.legB }
    $sibling = if ($isA) { $sentinels.legB } else { $sentinels.legA }
    $node = if ($isA) { $manifest.paths.legANode } else { $manifest.paths.legBNode }
    $chromium = Join-Path (if ($isA) { $manifest.paths.legAChromium } else { $manifest.paths.legBChromium }) 'chrome.exe'
    $profile = if ($isA) { $manifest.paths.legABrowserProfile } else { $manifest.paths.legBBrowserProfile }
    $configPath = Join-Path $ownRoot '.ab04-probe-config.json'
    $resultPath = Join-Path $ownRoot '.ab04-probe-result.json'
    Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
    $config = [pscustomobject]@{
      leg = $leg; ownRoot = $ownRoot; siblingSentinel = $sibling; privateSentinel = $sentinels.private
      externalSentinel = $externalSentinel; chromium = $chromium; browserProfile = $profile
      deniedTargets = @($manifest.paths.protectedHostPaths) + @($sibling, $sentinels.private) + $(if ($isA) { @($manifest.paths.legBGuidanceReadonly) } else { @($manifest.paths.legA) })
      guidanceRoot = if ($isA) { $null } else { $manifest.paths.legBGuidanceReadonly }
      guidanceFiles = if ($isA) { @() } else { @($guidanceManifest.allowedFiles | ForEach-Object { Join-Path $manifest.paths.legBGuidanceReadonly (([string]$_.path).Replace('/', '\')) }) }
      externalProbeIp = '1.1.1.1'
      escapeCandidates = @(
        @{ file = (Join-Path $env:SystemRoot 'System32\curl.exe'); args = @('-fsS', '--max-time', '4', 'https://example.com/') },
        @{ file = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'); args = @('-NoProfile', '-NonInteractive', '-Command', 'try { Invoke-WebRequest -UseBasicParsing https://example.com/ -TimeoutSec 4 | Out-Null; exit 0 } catch { exit 7 }') },
        @{ file = (Join-Path $env:SystemRoot 'System32\cmd.exe'); args = @('/d', '/c', 'curl.exe -fsS --max-time 4 https://example.com/') },
        @{ file = 'git.exe'; args = @('ls-remote', 'https://github.com/git/git') }
      )
    }
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 7) + "`n", (New-Object Text.UTF8Encoding($false)))
    $tokenReport = & (Join-Path $PSScriptRoot 'Start-Ab04RestrictedProcess.ps1') -Leg $leg -Credential $credentials[$leg] -Runtime node -ArgumentList @($probeScript, $configPath, $resultPath) -WorkingDirectory $ownRoot -ExpectedReceiptSha256 $ExpectedReceiptSha256 -ManifestPath $ManifestPath
    $deadline = [DateTime]::UtcNow.AddMinutes(3)
    while (-not (Test-Path -LiteralPath $resultPath -PathType Leaf) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
    if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) { throw "AB04_LEG_PROBE_TIMEOUT: $leg" }
    $results[$leg] = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
    $results[$leg] | Add-Member -NotePropertyName restrictedToken -NotePropertyValue $tokenReport
  }
} finally {
  foreach ($path in @($sentinels.legA, $sentinels.legB, $sentinels.private)) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
}

$failures = New-Object System.Collections.Generic.List[string]
foreach ($leg in @('legA', 'legB')) {
  $probe = $results[$leg]
  if (-not $probe.tests.ownRootWritable) { $failures.Add("$leg:OWN_ROOT_NOT_WRITABLE") }
  if ($probe.tests.siblingReadable) { $failures.Add("$leg:SIBLING_READABLE") }
  if ($probe.tests.privateReadable) { $failures.Add("$leg:PRIVATE_READABLE") }
  if ($probe.tests.externalReadable) { $failures.Add("$leg:EXTERNAL_CHECKOUT_READABLE") }
  if (-not $probe.tests.localhostAvailable) { $failures.Add("$leg:LOOPBACK_UNAVAILABLE") }
  if (-not $probe.tests.loopbackIPv4) { $failures.Add("$leg:IPV4_LOOPBACK_UNAVAILABLE") }
  if (-not $probe.tests.loopbackIPv6) { $failures.Add("$leg:IPV6_LOOPBACK_UNAVAILABLE") }
  if ($probe.tests.internetAvailable) { $failures.Add("$leg:INTERNET_AVAILABLE") }
  foreach ($target in @($probe.tests.deniedTargets)) { if ($target.readable) { $failures.Add("$leg:DENIED_TARGET_READABLE:$($target.path)") } }
  if (-not $probe.tests.chromium.launched -or -not $probe.tests.chromium.gpu.available -or -not $probe.tests.chromium.gpu.adapter) { $failures.Add("$leg:WEBGPU_UNAVAILABLE") }
  if (-not $probe.tests.chromium.gpu.deviceCreated -or -not $probe.tests.chromium.gpu.computeSubmitted -or -not $probe.tests.chromium.gpu.readbackVerified) { $failures.Add("$leg:WEBGPU_READBACK_FAILED") }
  if ([string]$probe.tests.chromium.gpu.vendor -notmatch '(?i)nvidia') { $failures.Add("$leg:GPU_VENDOR_MISMATCH") }
  if ([string]$probe.tests.chromium.gpu.architecture -notmatch '(?i)turing') { $failures.Add("$leg:GPU_ARCHITECTURE_MISMATCH") }
  foreach ($escape in @($probe.tests.childEscape)) { if ($escape.available -and $escape.exitCode -eq 0) { $failures.Add("$leg:CHILD_EGRESS:$($escape.file)") } }
  if ($leg -eq 'legA') {
    if (@($probe.tests.guidance.readable).Count -ne 0) { $failures.Add('legA:GUIDANCE_PRESENT') }
  } else {
    if (@($probe.tests.guidance.readable).Count -ne 25 -or @($probe.tests.guidance.readable | Where-Object { -not $_.readable }).Count -gt 0) { $failures.Add('legB:GUIDANCE_READ_FAILED') }
    if ($probe.tests.guidance.writable) { $failures.Add('legB:GUIDANCE_WRITABLE') }
  }
}
if ($results.legA.user -eq $results.legB.user) { $failures.Add('LEG_IDENTITIES_NOT_DISTINCT') }
if ($results.legA.tests.chromium.pid -eq $results.legB.tests.chromium.pid) { $failures.Add('BROWSER_PROCESS_NOT_DISTINCT') }

[pscustomobject]@{
  sprint = $manifest.sprint
  status = if ($failures.Count -eq 0) { 'PASS' } else { 'FAIL' }
  receiptSha256 = $ExpectedReceiptSha256
  results = $results
  failures = @($failures)
} | ConvertTo-Json -Depth 12
if ($failures.Count -gt 0) { exit 1 }
