param([Parameter(Mandatory=$true)][string]$Path,[switch]$Exclusive,[int]$OwnerPid)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$stream = $null
try {
  $access = [IO.FileAccess]::Read
  $share = [IO.FileShare]::Read
  if ($Exclusive) { $access = [IO.FileAccess]::ReadWrite; $share = [IO.FileShare]::None }
  # Never delete guard files: the kernel handle, not a pathname timestamp, is the lease.
  $stream = [IO.File]::Open($Path,[IO.FileMode]::Open,$access,$share)
  $owner = [Diagnostics.Process]::GetProcessById($OwnerPid)
  [Console]::Out.WriteLine((@{ready=$true;pid=$OwnerPid;born=$owner.StartTime.ToUniversalTime().Ticks.ToString();bridgePid=$PID} | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  # Anonymous pipe EOF releases the handle even when the parent crashes.
  while ($null -ne ($line = [Console]::In.ReadLine())) {
    try {
      $request = $line | ConvertFrom-Json
      if ($Exclusive -and $request.operation -eq 'prune-retired') {
        . (Join-Path $PSScriptRoot 'cold-retention.ps1')
        $removed=Invoke-PackerRetention ([string]$request.home) $Path $stream ([long]$request.now)
        [Console]::Out.WriteLine((@{operation=$true;removed=$removed}|ConvertTo-Json -Compress));[Console]::Out.Flush();continue
      }
      if ($Exclusive -and $request.operation -in @('legacy-check','legacy-retire')) {
        . (Join-Path $PSScriptRoot 'legacy-proof.ps1')
        $proof=Invoke-LegacyRecovery ([string]$request.home) ([string]$request.id) ($request.operation -eq 'legacy-retire')
        [Console]::Out.WriteLine((@{operation=$true;proof=$proof}|ConvertTo-Json -Compress -Depth 8));[Console]::Out.Flush();continue
      }
      if (-not $Exclusive -or $request.operation -ne 'retire' -or $request.id -notmatch '^[a-f0-9]{32}$') { throw 'INVALID_OPERATION' }
      # Compare and retire in the very process holding the root operation handle.
      # A crashed bridge cannot leave its JS parent able to perform a stale rename.
      if ([IO.File]::ReadAllText($request.source) -ne $request.id) { throw 'TASK_LOCK_LOST' }
      [IO.File]::Move($request.source,$request.destination)
      [Console]::Out.WriteLine('{"operation":true}')
    } catch {
      $code='TASK_LOCK_RETIRE_FAILED';if ($_.Exception.Message -match '^[A-Z][A-Z0-9_]+$') {$code=$_.Exception.Message}
      [Console]::Out.WriteLine((@{operation=$false;code=$code}|ConvertTo-Json -Compress))
    }
    [Console]::Out.Flush()
  }
} catch { [Console]::Out.WriteLine('{"ready":false}'); exit 2 }
finally { if ($null -ne $stream) { $stream.Dispose() } }
