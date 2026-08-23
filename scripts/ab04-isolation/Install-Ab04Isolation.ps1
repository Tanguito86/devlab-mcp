#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory)][string]$ApprovedPlanPath,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ApprovedPlanSha256,
  [Parameter(Mandatory)][Management.Automation.PSCredential]$LegACredential,
  [Parameter(Mandatory)][Management.Automation.PSCredential]$LegBCredential,
  [string]$ManifestPath = (Join-Path $PSScriptRoot '..\..\benchmarks\threejs-game-skills-ab\isolation\provision-manifest.json')
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Ab04Isolation.Common.psm1') -Force

if (-not (Test-Ab04Administrator)) { throw 'AB04_ADMIN_REQUIRED' }
$manifest = Read-Ab04Manifest -LiteralPath $ManifestPath
if ($manifest.architectureDisposition.localUserRestrictedTokenApproved -ne $true -or
    $manifest.tokenHardening.runtimeExecutionAuthorized -ne $true) {
  throw 'AB04_LOCAL_USER_ARCHITECTURE_REJECTED_USE_VM_OR_WINDOWS_SANDBOX'
}
if ($manifest.applyAuthorized -ne $true -or $manifest.reviewGate.independentApprovalStatus -ne 'INDEPENDENTLY_APPROVED') {
  throw 'AB04_INDEPENDENT_APPROVAL_REQUIRED'
}
if ((Get-Ab04Sha256 -LiteralPath $ApprovedPlanPath) -ne $ApprovedPlanSha256) {
  throw 'AB04_APPROVED_PLAN_HASH_MISMATCH'
}
$plan = Get-Content -LiteralPath $ApprovedPlanPath -Raw | ConvertFrom-Json
if ($plan.sprint -ne $manifest.sprint -or $plan.canApply -ne $true -or $plan.decision -ne 'READY_FOR_ONE_SHOT_ADMIN_PROVISIONING') {
  throw 'AB04_APPROVED_PLAN_NOT_APPLICABLE'
}
if ($plan.manifestSha256 -ne (Get-Ab04Sha256 -LiteralPath $ManifestPath)) {
  throw 'AB04_MANIFEST_CHANGED_AFTER_REVIEW'
}
$normalTokenExposure = @(Test-Ab04GenericParentExposure -LiteralPath @($manifest.paths.protectedHostPaths))
if ($normalTokenExposure.Count -eq 0) { throw 'AB04_EXPECTED_NORMAL_TOKEN_EXPOSURE_NOT_REPRODUCED' }
[void](Get-Ab04TokenFilesystemFeasibility -Manifest $manifest)
[void](Assert-Ab04RuntimeIdentity -Manifest $manifest)

$credentialByLeg = @{ legA = $LegACredential; legB = $LegBCredential }
foreach ($leg in @('legA', 'legB')) {
  $expected = [string]$manifest.accounts.$leg
  $supplied = [string]$credentialByLeg[$leg].UserName
  if ($supplied.Contains('@')) { throw "AB04_UPN_CREDENTIAL_FORBIDDEN: $leg" }
  if ($supplied.Contains('\')) { $supplied = $supplied.Split(@('\'), 2)[1] }
  if ($supplied -ne $expected) { throw "AB04_CREDENTIAL_USER_MISMATCH: $leg" }
}

$receiptPath = Join-Path $manifest.paths.coordinatorPrivate $manifest.audit.receiptFile
if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
  $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
  $matches = $receipt.manifestSha256 -eq (Get-Ab04Sha256 -LiteralPath $ManifestPath)
  foreach ($leg in @('legA', 'legB')) {
    $user = Get-LocalUser -Name $manifest.accounts.$leg -ErrorAction SilentlyContinue
    $matches = $matches -and $user -and $user.SID.Value -eq $receipt.accounts.$leg.sid
  }
  $rules = @(Get-NetFirewallRule -Group $manifest.network.firewallGroup -ErrorAction SilentlyContinue)
  $matches = $matches -and $rules.Count -eq 2
  if (-not $matches) { throw 'AB04_PREEXISTING_RECEIPT_MISMATCH' }
  [pscustomobject]@{ status = 'NO_CHANGE'; receiptSha256 = Get-Ab04Sha256 -LiteralPath $receiptPath } | ConvertTo-Json -Compress
  return
}

$unexpected = New-Object System.Collections.Generic.List[string]
foreach ($name in @($manifest.accounts.legA, $manifest.accounts.legB)) {
  if (Get-LocalUser -Name $name -ErrorAction SilentlyContinue) { $unexpected.Add("account:$name") }
}
if (Test-Path -LiteralPath $manifest.paths.runRoot) { $unexpected.Add("path:$($manifest.paths.runRoot)") }
if (@(Get-NetFirewallRule -Group $manifest.network.firewallGroup -ErrorAction SilentlyContinue).Count -gt 0) { $unexpected.Add('firewall-group') }
if ($unexpected.Count -gt 0) { throw "AB04_UNEXPECTED_PREEXISTING_RESOURCE: $($unexpected -join ',')" }

$createdUsers = New-Object System.Collections.Generic.List[string]
$createdRules = New-Object System.Collections.Generic.List[string]
$createdRoot = $false
try {
  if (-not $PSCmdlet.ShouldProcess('DevLab AB04 exact resources', 'Provision isolated benchmark identities and roots')) { return }
  $users = [ordered]@{}
  foreach ($leg in @('legA', 'legB')) {
    $name = $manifest.accounts.$leg
    $user = New-LocalUser -Name $name -Password $credentialByLeg[$leg].Password -Description "DevLab AB04 isolated builder $leg" -UserMayNotChangePassword
    $createdUsers.Add($name)
    $users[$leg] = [pscustomobject]@{ name = $name; sid = $user.SID.Value }
    foreach ($forbiddenSid in @($manifest.accounts.forbiddenGroups)) {
      $group = Get-LocalGroup -SID $forbiddenSid -ErrorAction Stop
      if (Get-LocalGroupMember -Group $group.Name -Member $name -ErrorAction SilentlyContinue) {
        throw "AB04_FORBIDDEN_GROUP_MEMBERSHIP: $name/$forbiddenSid"
      }
    }
  }

  New-Item -ItemType Directory -Path $manifest.paths.runRoot -ErrorAction Stop | Out-Null
  $createdRoot = $true
  foreach ($path in @($manifest.paths.legA, $manifest.paths.legB, $manifest.paths.coordinatorPrivate)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }

  $coordinatorSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  Set-Ab04ProtectedDirectoryAcl -LiteralPath $manifest.paths.runRoot -CoordinatorSid $coordinatorSid
  Set-Ab04ProtectedDirectoryAcl -LiteralPath $manifest.paths.legA -CoordinatorSid $coordinatorSid -LegSid $users.legA.sid
  Set-Ab04ProtectedDirectoryAcl -LiteralPath $manifest.paths.legB -CoordinatorSid $coordinatorSid -LegSid $users.legB.sid
  Set-Ab04ProtectedDirectoryAcl -LiteralPath $manifest.paths.coordinatorPrivate -CoordinatorSid $coordinatorSid
  foreach ($path in @(
    $manifest.paths.legABrowserProfile, $manifest.paths.legBBrowserProfile,
    $manifest.paths.legAChromium, $manifest.paths.legBChromium,
    (Split-Path -Parent $manifest.paths.legANode), (Split-Path -Parent $manifest.paths.legBNode),
    (Split-Path -Parent $manifest.paths.legARestrictedLauncher),
    (Split-Path -Parent $manifest.paths.legBRestrictedLauncher),
    (Split-Path -Parent $manifest.paths.coordinatorRestrictedLauncher),
    $manifest.paths.legBGuidanceReadonly
  )) { New-Item -ItemType Directory -Path $path -Force | Out-Null }

  foreach ($destination in @($manifest.paths.legAChromium, $manifest.paths.legBChromium)) {
    $code = (Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\robocopy.exe') -ArgumentList @($manifest.runtime.chromiumSource, $destination, '/E', '/COPY:DAT', '/DCOPY:DAT', '/R:1', '/W:1', '/XJ', '/NFL', '/NDL', '/NJH', '/NJS') -Wait -PassThru -WindowStyle Hidden).ExitCode
    if ($code -gt 7) { throw "AB04_CHROMIUM_COPY_FAILED: $code" }
    $identity = Get-Ab04RawTreeIdentity -LiteralPath $destination
    if ($identity.treeSha256 -ne $manifest.runtime.chromiumDistributionTreeSha256) { throw 'AB04_CHROMIUM_COPY_HASH_MISMATCH' }
  }
  Copy-Item -LiteralPath $manifest.runtime.nodeSource -Destination $manifest.paths.legANode
  Copy-Item -LiteralPath $manifest.runtime.nodeSource -Destination $manifest.paths.legBNode
  foreach ($node in @($manifest.paths.legANode, $manifest.paths.legBNode)) {
    if ((Get-Ab04Sha256 -LiteralPath $node) -ne $manifest.runtime.nodeExecutableSha256) { throw 'AB04_NODE_COPY_HASH_MISMATCH' }
  }

  $launcherSource = Join-Path $PSScriptRoot 'RestrictedTokenLauncher.cs'
  if ((Get-Ab04Sha256 -LiteralPath $launcherSource) -ne $manifest.tokenHardening.launcherSourceSha256) {
    throw 'AB04_RESTRICTED_LAUNCHER_SOURCE_HASH_MISMATCH'
  }
  Add-Type -Path $launcherSource -OutputAssembly $manifest.paths.coordinatorRestrictedLauncher -OutputType ConsoleApplication -ErrorAction Stop
  $launcherBinaryHash = Get-Ab04Sha256 -LiteralPath $manifest.paths.coordinatorRestrictedLauncher
  foreach ($destination in @($manifest.paths.legARestrictedLauncher, $manifest.paths.legBRestrictedLauncher)) {
    Copy-Item -LiteralPath $manifest.paths.coordinatorRestrictedLauncher -Destination $destination
    if ((Get-Ab04Sha256 -LiteralPath $destination) -ne $launcherBinaryHash) { throw 'AB04_RESTRICTED_LAUNCHER_COPY_HASH_MISMATCH' }
  }
  Set-Ab04ProtectedDirectoryAcl -LiteralPath (Split-Path -Parent $manifest.paths.legARestrictedLauncher) -CoordinatorSid $coordinatorSid -LegSid $users.legA.sid -LegRights ReadAndExecute
  Set-Ab04ProtectedDirectoryAcl -LiteralPath (Split-Path -Parent $manifest.paths.legBRestrictedLauncher) -CoordinatorSid $coordinatorSid -LegSid $users.legB.sid -LegRights ReadAndExecute

  $guidanceManifestPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) $manifest.guidanceBundle.sourceManifest
  if ((Get-Ab04Sha256 -LiteralPath $guidanceManifestPath) -ne $manifest.guidanceBundle.sourceManifestSha256) {
    throw 'AB04_GUIDANCE_MANIFEST_HASH_MISMATCH'
  }
  $guidance = Get-Content -LiteralPath $guidanceManifestPath -Raw | ConvertFrom-Json
  if (@($guidance.allowedFiles).Count -ne $manifest.guidanceBundle.fileCount) { throw 'AB04_GUIDANCE_FILE_COUNT_MISMATCH' }
  $seenGuidancePaths = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  $strictUtf8 = New-Object Text.UTF8Encoding($false, $true)
  foreach ($entry in @($guidance.allowedFiles)) {
    $relative = [string]$entry.path
    if ($relative -notmatch '^[A-Za-z0-9._/-]+$' -or $relative.StartsWith('/') -or $relative -match '(^|/)\.\.(/|$)' -or
        -not $seenGuidancePaths.Add($relative)) { throw "AB04_GUIDANCE_PATH_UNSAFE: $relative" }
    $source = Join-Path $manifest.paths.externalSource ($relative.Replace('/', '\'))
    $sourceItem = Get-Item -LiteralPath $source -Force
    if ($sourceItem.PSIsContainer -or ($sourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "AB04_GUIDANCE_SOURCE_NOT_REGULAR: $relative"
    }
    [byte[]]$sourceBytes = [IO.File]::ReadAllBytes($source)
    if ($sourceBytes.Length -ge 3 -and $sourceBytes[0] -eq 0xef -and $sourceBytes[1] -eq 0xbb -and $sourceBytes[2] -eq 0xbf) {
      throw "AB04_GUIDANCE_BOM_FORBIDDEN: $relative"
    }
    $canonicalText = $strictUtf8.GetString($sourceBytes).Replace("`r`n", "`n").Replace("`r", "`n")
    [byte[]]$canonicalBytes = $strictUtf8.GetBytes($canonicalText)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $canonicalHash = ([BitConverter]::ToString($sha.ComputeHash($canonicalBytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    if ($canonicalHash -ne [string]$entry.sha256) { throw "AB04_GUIDANCE_CANONICAL_HASH_MISMATCH: $relative" }
    $destination = Join-Path $manifest.paths.legBGuidanceReadonly ($relative.Replace('/', '\'))
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    [IO.File]::WriteAllBytes($destination, $canonicalBytes)
  }
  $guidanceIdentity = Get-Ab04RawTreeIdentity -LiteralPath $manifest.paths.legBGuidanceReadonly
  if ($guidanceIdentity.fileCount -ne $manifest.guidanceBundle.fileCount -or
      $guidanceIdentity.byteLength -ne $manifest.guidanceBundle.byteLength -or
      $guidanceIdentity.treeSha256 -ne $manifest.guidanceBundle.bundleTreeSha256) {
    throw 'AB04_GUIDANCE_BUNDLE_IDENTITY_MISMATCH'
  }
  Set-Ab04ProtectedDirectoryAcl -LiteralPath $manifest.paths.legBGuidanceReadonly -CoordinatorSid $coordinatorSid -LegSid $users.legB.sid -LegRights ReadAndExecute

  foreach ($leg in @('legA', 'legB')) {
    $ruleName = "DevLabAB04-$leg-BlockNonLoopback"
    New-NetFirewallRule -Name $ruleName -DisplayName "DevLab AB04 $leg block non-loopback" -Group $manifest.network.firewallGroup -Direction Outbound -Action Block -Enabled True -Profile Any -RemoteAddress @($manifest.network.blockedRemoteAddressRanges) -LocalUser (Get-Ab04LocalUserSddl -Sid $users[$leg].sid) | Out-Null
    $createdRules.Add($ruleName)
  }

  $key = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($key)
  $protectedKey = [Security.Cryptography.ProtectedData]::Protect($key, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllText((Join-Path $manifest.paths.coordinatorPrivate 'audit-hmac-key.dpapi'), [Convert]::ToBase64String($protectedKey), (New-Object Text.UTF8Encoding($false)))

  $receipt = [pscustomobject][ordered]@{
    schemaVersion = 1
    sprint = $manifest.sprint
    provisionedUtc = [DateTime]::UtcNow.ToString('o')
    manifestSha256 = Get-Ab04Sha256 -LiteralPath $ManifestPath
    approvedPlanSha256 = $ApprovedPlanSha256
    coordinatorSid = $coordinatorSid
    accounts = $users
    firewallRules = @($createdRules)
    paths = [pscustomobject]@{ runRoot = $manifest.paths.runRoot; coordinatorPrivate = $manifest.paths.coordinatorPrivate }
    runtime = [pscustomobject]@{
      chromiumTreeSha256 = $manifest.runtime.chromiumDistributionTreeSha256
      nodeSha256 = $manifest.runtime.nodeExecutableSha256
      restrictedTokenLauncherSourceSha256 = $manifest.tokenHardening.launcherSourceSha256
      restrictedTokenLauncherSha256 = $launcherBinaryHash
    }
    guidance = [pscustomobject]@{
      fileCount = $guidanceIdentity.fileCount
      byteLength = $guidanceIdentity.byteLength
      treeSha256 = $guidanceIdentity.treeSha256
    }
  }
  $receiptJson = $receipt | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($receiptPath, $receiptJson + "`n", (New-Object Text.UTF8Encoding($false)))
  $hmac = New-Object Security.Cryptography.HMACSHA256(,$key)
  try {
    $signature = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($receiptJson + "`n")))).Replace('-', '').ToLowerInvariant()
    $auditPayload = [pscustomobject][ordered]@{
      sequence = 1
      utc = [DateTime]::UtcNow.ToString('o')
      event = 'PROVISIONED'
      manifestSha256 = $receipt.manifestSha256
      approvedPlanSha256 = $ApprovedPlanSha256
      legASid = $users.legA.sid
      legBSid = $users.legB.sid
      chromiumTreeSha256 = $receipt.runtime.chromiumTreeSha256
      nodeSha256 = $receipt.runtime.nodeSha256
      restrictedTokenLauncherSha256 = $receipt.runtime.restrictedTokenLauncherSha256
      guidanceTreeSha256 = $receipt.guidance.treeSha256
    }
    $auditPayloadJson = $auditPayload | ConvertTo-Json -Compress
    $auditSignature = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($auditPayloadJson)))).Replace('-', '').ToLowerInvariant()
    $auditLine = [pscustomobject][ordered]@{ payload = $auditPayload; hmacSha256 = $auditSignature } | ConvertTo-Json -Compress
    $auditPath = Join-Path $manifest.paths.coordinatorPrivate $manifest.audit.auditLogFile
    [IO.File]::WriteAllText($auditPath, $auditLine + "`n", (New-Object Text.UTF8Encoding($false)))
  } finally { $hmac.Dispose(); [Array]::Clear($key, 0, $key.Length) }
  [IO.File]::WriteAllText((Join-Path $manifest.paths.coordinatorPrivate 'provision-receipt.hmac'), $signature + "`n", (New-Object Text.UTF8Encoding($false)))
  [pscustomobject]@{
    status = 'PROVISIONED'
    legASid = $users.legA.sid
    legBSid = $users.legB.sid
    manifestSha256 = $receipt.manifestSha256
    receiptSha256 = Get-Ab04Sha256 -LiteralPath $receiptPath
    auditLogSha256 = Get-Ab04Sha256 -LiteralPath $auditPath
    chromiumTreeSha256 = $receipt.runtime.chromiumTreeSha256
    nodeSha256 = $receipt.runtime.nodeSha256
    restrictedTokenLauncherSha256 = $receipt.runtime.restrictedTokenLauncherSha256
    guidanceTreeSha256 = $receipt.guidance.treeSha256
  } | ConvertTo-Json -Compress
} catch {
  foreach ($rule in $createdRules) { Remove-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue }
  if ($createdRoot -and (Test-Path -LiteralPath $manifest.paths.runRoot)) { Remove-Item -LiteralPath $manifest.paths.runRoot -Recurse -Force -ErrorAction SilentlyContinue }
  foreach ($name in $createdUsers) { Remove-LocalUser -Name $name -ErrorAction SilentlyContinue }
  throw
}
