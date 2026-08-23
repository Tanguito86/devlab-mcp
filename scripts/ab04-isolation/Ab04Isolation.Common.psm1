Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

function Get-Ab04Sha256 {
  param([Parameter(Mandatory)][string]$LiteralPath)
  (Get-FileHash -LiteralPath $LiteralPath -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-Ab04RawTreeIdentity {
  param([Parameter(Mandatory)][string]$LiteralPath)
  $root = [IO.Path]::GetFullPath($LiteralPath).TrimEnd('\')
  if (-not (Test-Path -LiteralPath $root -PathType Container)) {
    throw "AB04_TREE_MISSING: $root"
  }
  $entries = New-Object System.Collections.Generic.List[object]
  [long]$byteLength = 0
  function Visit-Ab04Directory([string]$directory) {
    $names = @([IO.Directory]::EnumerateFileSystemEntries($directory) | ForEach-Object { [IO.Path]::GetFileName($_) })
    [Array]::Sort($names, [StringComparer]::Ordinal)
    foreach ($name in $names) {
      $path = Join-Path $directory $name
      $item = Get-Item -LiteralPath $path -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "AB04_TREE_LINK_FORBIDDEN: $path"
      }
      if ($item.PSIsContainer) {
        Visit-Ab04Directory $path
      } elseif ($item -is [IO.FileInfo]) {
        $relative = $item.FullName.Substring($root.Length + 1).Replace('\', '/')
        $entries.Add([pscustomobject][ordered]@{
          path = $relative
          size = [long]$item.Length
          sha256 = Get-Ab04Sha256 -LiteralPath $item.FullName
        })
        $script:Ab04TreeBytes += [long]$item.Length
      } else {
        throw "AB04_TREE_IRREGULAR_ENTRY: $path"
      }
    }
  }
  $script:Ab04TreeBytes = 0
  Visit-Ab04Directory $root
  [object[]]$entryArray = $entries.ToArray()
  $json = ConvertTo-Json -InputObject $entryArray -Compress -Depth 4
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $treeHash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($json + "`n")))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
  [pscustomobject]@{
    root = $root
    fileCount = $entries.Count
    byteLength = $script:Ab04TreeBytes
    treeSha256 = $treeHash
  }
}

function Read-Ab04Manifest {
  param([Parameter(Mandatory)][string]$LiteralPath)
  if (-not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) {
    throw "AB04_MANIFEST_MISSING: $LiteralPath"
  }
  $manifest = Get-Content -LiteralPath $LiteralPath -Raw | ConvertFrom-Json
  if ($manifest.schemaVersion -ne 1 -or $manifest.sprint -ne 'DEVLAB-AB04-ISOLATION-TOKEN-03') {
    throw 'AB04_MANIFEST_IDENTITY_MISMATCH'
  }
  if ($manifest.resourcePrefix -ne 'DevLab AB04' -or $manifest.mode -ne 'PREPARATION_ONLY') {
    throw 'AB04_MANIFEST_SCOPE_MISMATCH'
  }
  if ($manifest.accounts.legA -ne 'DevLabAb04LegA' -or $manifest.accounts.legB -ne 'DevLabAb04LegB') {
    throw 'AB04_ACCOUNT_NAME_MISMATCH'
  }
  if ($manifest.accounts.standardUsersOnly -ne $true -or $manifest.accounts.rdpEnabledByProvisioner -ne $false) {
    throw 'AB04_ACCOUNT_POLICY_MISMATCH'
  }
  if ($manifest.paths.runRoot -ne 'H:/UserData/Deposito/Documents/devlab-runs/threejs-game-skills-ab-04') {
    throw 'AB04_RUN_ROOT_MISMATCH'
  }
  if ($manifest.network.firewallGroup -ne 'DevLab AB04 Isolation') {
    throw 'AB04_FIREWALL_SCOPE_MISMATCH'
  }
  if ($manifest.network.policy -ne 'LOOPBACK_IPV4_IPV6_ONLY' -or
      @($manifest.network.blockedRemoteAddressRanges) -join ',' -ne '0.0.0.0-127.0.0.0,127.0.0.2-255.255.255.255,::,::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' -or
      @($manifest.network.allowedLoopback) -join ',' -ne '127.0.0.1,::1') {
    throw 'AB04_FIREWALL_RANGE_MISMATCH'
  }
  if ($manifest.tokenHardening.restrictedLauncherRequired -ne $true -or
      $manifest.tokenHardening.normalProcessExecution -ne 'PROHIBITED' -or
      $manifest.tokenHardening.credentialPersistence -ne $false) {
    throw 'AB04_TOKEN_POLICY_MISMATCH'
  }
  if ($manifest.architectureDisposition.decision -ne 'DO_NOT_APPLY' -or
      $manifest.architectureDisposition.localUserRestrictedTokenApproved -ne $false) {
    throw 'AB04_ARCHITECTURE_DISPOSITION_MISMATCH'
  }
  $manifest
}

function Test-Ab04Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-Ab04LocalUserSddl {
  param([Parameter(Mandatory)][string]$Sid)
  if ($Sid -notmatch '^S-1-5-21-(?:\d+-){3}\d+$') { throw "AB04_USER_SID_INVALID: $Sid" }
  "D:(A;;CC;;;$Sid)"
}

function Set-Ab04ProtectedDirectoryAcl {
  param(
    [Parameter(Mandatory)][string]$LiteralPath,
    [Parameter(Mandatory)][string]$CoordinatorSid,
    [string]$LegSid,
    [ValidateSet('Modify', 'ReadAndExecute', 'Traverse')][string]$LegRights = 'Modify'
  )
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
  $propagate = [Security.AccessControl.PropagationFlags]::None
  foreach ($sid in @('S-1-5-18', 'S-1-5-32-544', $CoordinatorSid)) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', $inherit, $propagate, 'Allow')
    [void]$acl.AddAccessRule($rule)
  }
  if ($LegSid) {
    $rights = [Security.AccessControl.FileSystemRights]$LegRights
    $legInherit = if ($LegRights -eq 'Traverse') { [Security.AccessControl.InheritanceFlags]::None } else { $inherit }
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($LegSid, $rights, $legInherit, $propagate, 'Allow')
    [void]$acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $LiteralPath -AclObject $acl
}

function Get-Ab04TokenFilesystemFeasibility {
  param([Parameter(Mandatory)]$Manifest)
  $reasons = New-Object System.Collections.Generic.List[string]
  $hRoot = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath([string]$Manifest.paths.runRoot))
  if (-not (Test-Path -LiteralPath $hRoot -PathType Container)) {
    $reasons.Add('RUN_VOLUME_MISSING')
  } else {
    $rootAcl = Get-Acl -LiteralPath $hRoot
    $usersRead = $false
    foreach ($rule in $rootAcl.Access) {
      $sid = try { $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { $rule.IdentityReference.Value }
      if ($sid -eq 'S-1-5-32-545' -and $rule.AccessControlType -eq 'Allow' -and
          ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadAndExecute)) {
        $usersRead = $true
      }
    }
    if ($usersRead) { $reasons.Add('BUILTIN_USERS_AUTHORIZES_H_READ') }
  }
  foreach ($required in @('C:\Windows\System32\kernel32.dll', 'C:\Windows\System32\ntdll.dll')) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      $reasons.Add('WINDOWS_RUNTIME_FILE_MISSING')
      continue
    }
    $usersRuntime = $false
    foreach ($rule in (Get-Acl -LiteralPath $required).Access) {
      $sid = try { $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { $rule.IdentityReference.Value }
      if ($sid -eq 'S-1-5-32-545' -and $rule.AccessControlType -eq 'Allow' -and
          ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadAndExecute)) {
        $usersRuntime = $true
      }
    }
    if ($usersRuntime) { $reasons.Add('WINDOWS_RUNTIME_DEPENDS_ON_BUILTIN_USERS') }
  }
  [pscustomobject]@{
    status = if ($reasons.Count -eq 0) { 'UNPROVEN' } else { 'FAILED' }
    decision = 'DO_NOT_APPLY'
    reasons = @($reasons | Select-Object -Unique)
    hostChanged = $false
  }
}

function Assert-Ab04RuntimeIdentity {
  param([Parameter(Mandatory)]$Manifest)
  $tree = Get-Ab04RawTreeIdentity -LiteralPath $Manifest.runtime.chromiumSource
  if ($tree.fileCount -ne $Manifest.runtime.chromiumDistributionFileCount -or
      $tree.byteLength -ne $Manifest.runtime.chromiumDistributionByteLength -or
      $tree.treeSha256 -ne $Manifest.runtime.chromiumDistributionTreeSha256) {
    throw 'AB04_CHROMIUM_TREE_MISMATCH'
  }
  $chrome = Join-Path $Manifest.runtime.chromiumSource 'chrome.exe'
  if ((Get-Ab04Sha256 -LiteralPath $chrome) -ne $Manifest.runtime.chromiumExecutableSha256) {
    throw 'AB04_CHROMIUM_EXECUTABLE_MISMATCH'
  }
  if ((Get-Ab04Sha256 -LiteralPath $Manifest.runtime.nodeSource) -ne $Manifest.runtime.nodeExecutableSha256) {
    throw 'AB04_NODE_EXECUTABLE_MISMATCH'
  }
  $tree
}

function Test-Ab04GenericParentExposure {
  param([Parameter(Mandatory)][string[]]$LiteralPath)
  $generic = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')
  $findings = New-Object System.Collections.Generic.List[object]
  foreach ($path in $LiteralPath) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    foreach ($rule in (Get-Acl -LiteralPath $path).Access) {
      $sid = try { $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { $rule.IdentityReference.Value }
      $dangerous = $rule.FileSystemRights -band ([Security.AccessControl.FileSystemRights]'ReadAndExecute, Write, Modify, FullControl')
      if ($rule.AccessControlType -eq 'Allow' -and $generic -contains $sid -and $dangerous) {
        $findings.Add([pscustomobject]@{ path = $path; sid = $sid; rights = [string]$rule.FileSystemRights; inherited = $rule.IsInherited })
      }
    }
  }
  $findings.ToArray()
}

Export-ModuleMember -Function @(
  'Assert-Ab04RuntimeIdentity',
  'Get-Ab04LocalUserSddl',
  'Get-Ab04RawTreeIdentity',
  'Get-Ab04Sha256',
  'Get-Ab04TokenFilesystemFeasibility',
  'Read-Ab04Manifest',
  'Set-Ab04ProtectedDirectoryAcl',
  'Test-Ab04Administrator',
  'Test-Ab04GenericParentExposure'
)
