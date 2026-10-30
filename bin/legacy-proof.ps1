# Dot-sourced by the root operation bridge. No reboot, process termination or ZIP cleanup.
$ErrorActionPreference = 'Stop'
function Assert-LegacyPath([string]$Path) {
  if (-not [IO.Path]::IsPathRooted($Path)) { throw 'COLD_STATE_CORRUPT' }
  $current = [IO.Path]::GetFullPath($Path)
  while ($current) {
    if (Test-Path -LiteralPath $current) {
      if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'COLD_STATE_CORRUPT' }
    }
    $parent = Split-Path -Parent $current
    if ($parent -eq $current) { break }; $current = $parent
  }
}
function Get-LegacyEvents([string]$Provider,[int]$Id,[string]$AfterRecord='0') {
  try {
    $xpath = "*[System[Provider[@Name='$Provider'] and EventID=$Id and EventRecordID > $AfterRecord]]"
    $events = @(Get-WinEvent -LogName System -FilterXPath $xpath -MaxEvents 10001 -ErrorAction Stop)
    if ($events.Count -gt 10000) { throw 'COLD_LEGACY_PROOF_UNAVAILABLE' }
    return $events
  } catch {
    if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { return @() }
    throw 'COLD_LEGACY_PROOF_UNAVAILABLE'
  }
}
function Get-LegacyEventData($Event) {
  $xml = [xml]$Event.ToXml(); $data = @{}
  foreach ($item in $xml.Event.EventData.Data) { $data[[string]$item.Name] = [string]$item.'#text' }
  return $data
}
function Get-LegacyHash([byte[]]$Bytes) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Get-LegacyTaskProof([string]$SourceHome,[string]$Id,[byte[]]$LockedJob) {
  if ($Id -notmatch '^[a-f0-9]{32}$') { throw 'COLD_STATE_CORRUPT' }
  $root = Join-Path $SourceHome '.packer-cold'; $dir = Join-Path $root $Id
  Assert-LegacyPath $dir; Assert-LegacyPath (Join-Path $root 'active.lock')
  $drive = New-Object IO.DriveInfo([IO.Path]::GetPathRoot($dir))
  if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS') { throw 'COLD_LEGACY_PROOF_UNAVAILABLE' }
  if ([IO.File]::ReadAllText((Join-Path $root 'active.lock')) -ne $Id) { throw 'TASK_LOCK_LOST' }
  $records = @{}; $hashes = @{}; $latest = [datetime]::MinValue
  $required = @('job.json','launched.json','ready.json','worker-ready.json','accepted.json','status.json')
  foreach ($name in $required) {
    $file = Join-Path $dir $name; Assert-LegacyPath $file
    try {
      $bytes = if ($name -eq 'job.json' -and $null -ne $LockedJob) { $LockedJob } else { [IO.File]::ReadAllBytes($file) }
      if ($bytes.Length -gt 16384) { throw 'COLD_STATE_CORRUPT' }
      $record = [Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xfeff) | ConvertFrom-Json
      if ($record.id -cne $Id) { throw 'COLD_STATE_CORRUPT' }
      $records[$name] = $record; $hashes[$name] = Get-LegacyHash $bytes
    } catch { throw 'COLD_STATE_CORRUPT' }
  }
  $job=$records['job.json'];$ready=$records['ready.json'];$status=$records['status.json']
  if ($job.schema -ne 1 -or $null -ne $job.lockProtocol -or $job.homeDir -cne $SourceHome -or $job.confirmPrivate -isnot [bool] -or $job.confirmExternal -isnot [bool] -or $job.confirmPrivate -ne $true -or $job.confirmExternal -ne $true -or
      $job.hostPid -lt 1 -or $ready.workerPid -lt 1 -or $ready.uiPid -lt 1 -or $ready.uiPid -ne $records['launched.json'].uiPid -or
      $ready.workerPid -ne $records['worker-ready.json'].pid -or $ready.phase -ne 'waiting' -or
      $status.phase -notin @('waiting','exit-verified','scanning','writing','verifying','success','failed') -or $status.at -lt 1 -or
      $job.waitMs -lt 1000 -or $job.waitMs -gt 1800000 -or $job.dshVersion -notmatch '^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$') { throw 'COLD_STATE_CORRUPT' }
  $at=0.0
  if (-not [double]::TryParse([string]$status.at,[Globalization.NumberStyles]::Float,[Globalization.CultureInfo]::InvariantCulture,[ref]$at) -or [double]::IsNaN($at) -or [double]::IsInfinity($at) -or $at -gt 253402300799000) { throw 'COLD_STATE_CORRUPT' }
  if (-not [IO.Path]::IsPathRooted($job.runtime) -or -not [IO.Path]::IsPathRooted($job.target) -or [IO.Path]::GetExtension($job.target) -ine '.zip' -or
      (Split-Path -Parent $job.profileDir) -ine (Join-Path $SourceHome 'profiles')) { throw 'COLD_STATE_CORRUPT' }
  $bootEvents = @(Get-LegacyEvents 'Microsoft-Windows-Kernel-Boot' 27)
  $startEvents = @(Get-LegacyEvents 'Microsoft-Windows-Kernel-General' 12)
  if (-not $bootEvents.Count -or -not $startEvents.Count) { throw 'COLD_LEGACY_PROOF_UNAVAILABLE' }
  $bootEvent = $bootEvents | Sort-Object RecordId -Descending | Select-Object -First 1
  $startEvent = $startEvents | Sort-Object RecordId -Descending | Select-Object -First 1
  if ($bootEvent.Version -notin @(0,1) -or $startEvent.Version -ne 0) { throw 'COLD_LEGACY_FULL_BOOT_UNPROVEN' }
  $bootData=Get-LegacyEventData $bootEvent;$startData=Get-LegacyEventData $startEvent
  if ($bootData.BootType -cne '0' -or $startData.BootMode -cne '0') { throw 'COLD_LEGACY_FULL_BOOT_UNPROVEN' }
  try { $boot=[datetime]::Parse($startData.StartTime).ToUniversalTime();$cimBoot=(Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 10 -ErrorAction Stop).LastBootUpTime.ToUniversalTime() }
  catch { throw 'COLD_LEGACY_PROOF_UNAVAILABLE' }
  if ([Math]::Abs(($bootEvent.TimeCreated.ToUniversalTime()-$boot).TotalSeconds) -gt 30 -or
      [Math]::Abs(($startEvent.TimeCreated.ToUniversalTime()-$boot).TotalSeconds) -gt 30 -or [Math]::Abs(($cimBoot-$boot).TotalSeconds) -gt 30) { throw 'COLD_LEGACY_FULL_BOOT_UNPROVEN' }
  $statusTime=[datetime]::Parse('1970-01-01T00:00:00Z').ToUniversalTime().AddMilliseconds([double]$status.at)
  if ($statusTime -ge $boot.AddMinutes(-2)) { throw 'COLD_LEGACY_REBOOT_REQUIRED' }
  # Check record order rather than wall-clock filtering, so a clock rollback cannot hide itself.
  $changes = @(Get-LegacyEvents 'Microsoft-Windows-Kernel-General' 1 ([string]$startEvent.RecordId))
  $clockMovementMs=0.0
  foreach ($change in $changes) {
    try {
      $data=Get-LegacyEventData $change
      if (-not $data.NewTime -or -not $data.OldTime) { throw 'COLD_LEGACY_CLOCK_UNPROVEN' }
      $clockMovementMs += [Math]::Abs(([datetime]::Parse($data.NewTime)-[datetime]::Parse($data.OldTime)).TotalMilliseconds)
    } catch { throw 'COLD_LEGACY_CLOCK_UNPROVEN' }
  }
  # Bound the TOTAL movement, not just the final net offset. The two-minute
  # task/boot margin is larger than this budget plus the independent uptime check.
  if ($clockMovementMs -gt 15000) { throw 'COLD_LEGACY_CLOCK_UNPROVEN' }
  $now=[datetime]::UtcNow
  if ($now -le $boot -or ($now-$boot).TotalDays -gt 49) { throw 'COLD_LEGACY_CLOCK_UNPROVEN' }
  # TickCount is monotonic within this bounded (<49 days) window. Reject rollovers rather than guess.
  $uptimeMs=[double]([uint32]([long][Environment]::TickCount -band 0xffffffffL))
  if ([Math]::Abs((($now-$boot).TotalMilliseconds)-$uptimeMs) -gt 30000) { throw 'COLD_LEGACY_CLOCK_UNPROVEN' }
  foreach ($file in @((Get-Item -LiteralPath (Join-Path $root 'active.lock') -Force)) + @(Get-ChildItem -LiteralPath $dir -Recurse -Force)) {
    Assert-LegacyPath $file.FullName
    # Our own durable fencing/diagnostic records can exist after a previously interrupted recovery.
    if ($file.Name -eq 'cancel' -or $file.Name -eq 'recovered.json' -or $file.Name -like 'legacy-recovery-*.json') { continue }
    if ($file.CreationTimeUtc -gt $latest) { $latest=$file.CreationTimeUtc }
    if ($file.CreationTimeUtc -ge $boot.AddMinutes(-2) -or (-not $file.PSIsContainer -and $file.LastWriteTimeUtc -ge $boot.AddMinutes(-2))) { throw 'COLD_LEGACY_REBOOT_REQUIRED' }
    if (-not $file.PSIsContainer -and $file.LastWriteTimeUtc -gt $latest) { $latest=$file.LastWriteTimeUtc }
  }
  if ((Get-Item -LiteralPath $dir -Force).CreationTimeUtc -ge $boot.AddMinutes(-2)) { throw 'COLD_LEGACY_REBOOT_REQUIRED' }
  $statusTime=[datetime]::Parse('1970-01-01T00:00:00Z').ToUniversalTime().AddMilliseconds([double]$status.at)
  if ($statusTime -ge $boot.AddMinutes(-2)) { throw 'COLD_LEGACY_REBOOT_REQUIRED' }
  if ($statusTime -gt $latest) { $latest=$statusTime }
  try { $all=@(Get-CimInstance Win32_Process -OperationTimeoutSec 10 -ErrorAction Stop) } catch { throw 'COLD_IDENTITY_UNPROVEN' }
  if (-not $all.Count) { throw 'COLD_IDENTITY_UNPROVEN' }
  foreach ($p in $all) {
    if ([int]$p.ProcessId -eq $PID) { continue }
    $candidate=$p.Name -match '^(powershell|pwsh|node|DeepSeek Harness)\.exe$' -or $p.Name -ieq [IO.Path]::GetFileName($job.runtime) -or [int]$p.ProcessId -in @([int]$job.hostPid,[int]$ready.uiPid,[int]$ready.workerPid)
    if ($candidate -and (-not $p.CommandLine -or -not $p.CreationDate)) { throw 'COLD_IDENTITY_UNPROVEN' }
    # Known old launchers must also be recognized with relative task arguments.
    # Conservatively refuse while ANY supported cold-task component is active.
    if ($p.CommandLine -and $p.CommandLine -match '(?i)(cold-backup\.mjs|cold-window\.ps1|start-cold\.ps1)') { throw 'COLD_TASK_RUNNING_OR_UNPROVEN' }
    if ($p.CommandLine -and $p.CommandLine.Replace('/','\').IndexOf($dir,[StringComparison]::OrdinalIgnoreCase) -ge 0) { throw 'COLD_TASK_RUNNING_OR_UNPROVEN' }
    if ($candidate -and $p.CreationDate.ToUniversalTime() -lt $boot.AddSeconds(-30)) { throw 'COLD_LEGACY_FULL_BOOT_UNPROVEN' }
  }
  return @{id=$Id;protocol='legacy-reboot-v1';checkedUtc=$now.ToString('o');bootUtc=$boot.ToString('o');taskLatestUtc=$latest.ToString('o');bootType=0;bootRecordId=[string]$bootEvent.RecordId;startRecordId=[string]$startEvent.RecordId;recordHashes=$hashes;clockMovementMs=$clockMovementMs;processesChecked=$all.Count;result='unconfirmed'}
}
function Write-LegacyEvidence([string]$Path,$Record) {
  $bytes=[Text.Encoding]::UTF8.GetBytes(($Record|ConvertTo-Json -Compress -Depth 8))
  $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  try { $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true) } finally { $stream.Dispose() }
}
function Invoke-LegacyRecovery([string]$SourceHome,[string]$Id,[bool]$Commit) {
  $proof=Get-LegacyTaskProof $SourceHome $Id
  if (-not $Commit) { return $proof }
  $dir=Join-Path (Join-Path $SourceHome '.packer-cold') $Id;$handles=New-Object 'System.Collections.Generic.List[System.IO.FileStream]';$active=$null
  try {
    # Old code does not understand task.guard. Exclusive job read prevents ANY late old
    # bootstrap/UI/coordinator from initializing while census and token retirement run.
    $job=[IO.File]::Open((Join-Path $dir 'job.json'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None);$handles.Add($job)
    $buffer=New-Object byte[] ([int]$job.Length);if ($job.Read($buffer,0,$buffer.Length) -ne $buffer.Length) { throw 'COLD_STATE_CORRUPT' }
    foreach ($name in @('launched.json','ready.json','worker-ready.json','accepted.json','status.json')) {
      $handles.Add([IO.File]::Open((Join-Path $dir $name),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
    }
    $lock=Join-Path (Split-Path -Parent $dir) 'active.lock';$active=[IO.File]::Open($lock,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    $proof=Get-LegacyTaskProof $SourceHome $Id $buffer
    $proof.jobFence='exclusive-read-with-share-none'
    Write-LegacyEvidence (Join-Path $dir ('legacy-recovery-'+[guid]::NewGuid().ToString('N')+'.json')) $proof
    $marker=Join-Path $dir 'recovered.json'
    if (Test-Path -LiteralPath $marker) { if (([IO.File]::ReadAllText($marker)|ConvertFrom-Json).id -cne $Id) { throw 'COLD_STATE_CORRUPT' } }
    else { Write-LegacyEvidence $marker @{id=$Id;phase='interrupted';protocol='legacy-reboot-v1';result='unconfirmed';evidencePreserved=$true} }
    $cancel=Join-Path $dir 'cancel';if (-not (Test-Path -LiteralPath $cancel)) { Write-LegacyEvidence $cancel @{id=$Id;reason='legacy-reboot-recovery'} }
    $active.Dispose();$active=$null
    # Same process still holds root operation.guard and exclusive job.json here.
    [IO.File]::Move($lock,(Join-Path $dir 'recovered.lock'))
    return $proof
  } finally { if ($null -ne $active) {$active.Dispose()};foreach ($handle in $handles) {$handle.Dispose()} }
}
