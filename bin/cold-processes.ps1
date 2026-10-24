param([string]$HomePath, [string]$RuntimePath, [string]$ExcludePids = '', [string]$TrackedPids = '')
$ErrorActionPreference = 'Stop'
try {
  $excluded = @($ExcludePids.Split(',') | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })
  $tracked = @($TrackedPids.Split(',') | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })
  $writers = @()
  $uncertain = $false
  $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  $terminalUi = @()
  $tasks = Join-Path $HomePath '.packer-cold'
  if (Test-Path -LiteralPath $tasks -PathType Container) {
    foreach ($task in @(Get-ChildItem -LiteralPath $tasks -Directory -ErrorAction Stop)) {
      if ($task.Name -notmatch '^[a-f0-9]{32}$' -or ($task.Attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }
      try {
        $s = Get-Content -LiteralPath (Join-Path $task.FullName 'status.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $r = Get-Content -LiteralPath (Join-Path $task.FullName 'ready.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($s.id -ne $task.Name -or $r.id -ne $task.Name -or $s.phase -notin @('success','failed')) { continue }
        $worker = $all | Where-Object { $_.ProcessId -eq [int]$r.workerPid }
        if ($worker) {
          if (-not $worker.CommandLine) { continue }
          if ($worker.CommandLine.IndexOf('cold-backup.mjs',[StringComparison]::OrdinalIgnoreCase) -ge 0 -and
              $worker.CommandLine.IndexOf($task.FullName,[StringComparison]::OrdinalIgnoreCase) -ge 0) { continue }
        }
        $ui = $all | Where-Object { $_.ProcessId -eq [int]$r.uiPid -and $_.Name -ieq 'powershell.exe' }
        $helper = Join-Path $PSScriptRoot 'cold-window.ps1'
        if ($ui -and $ui.CommandLine -and $ui.CommandLine.IndexOf($helper,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            $ui.CommandLine.IndexOf($task.FullName,[StringComparison]::OrdinalIgnoreCase) -ge 0) {
          $terminalUi += [int]$ui.ProcessId
        }
      } catch { # Unreadable/unconfirmed state is never an exemption.
      }
    }
  }
  foreach ($p in $all) {
    if ($excluded -contains [int]$p.ProcessId -or [int]$p.ProcessId -eq $PID) { continue }
    if ($terminalUi -contains [int]$p.ProcessId -or ($p.Name -ieq 'conhost.exe' -and $terminalUi -contains [int]$p.ParentProcessId)) { continue }
    # The coordinator and worker may query concurrently. Only their own exact
    # monitor script is exempt; a DSH child or unrelated PowerShell is not.
    if ($excluded -contains [int]$p.ParentProcessId -and $p.Name -ieq 'powershell.exe' -and $p.CommandLine -and
        $p.CommandLine.IndexOf($PSCommandPath,[StringComparison]::OrdinalIgnoreCase) -ge 0) { continue }
    # Conservative: every Desktop process using this runtime blocks, including another instance.
    $dsh = $p.Name -ieq [IO.Path]::GetFileName($RuntimePath) -or $p.Name -ieq 'DeepSeek Harness.exe'
    $database = $p.Name -match '^(postgres|mysqld|mariadbd|mongod|redis-server|sqlservr)\.exe$'
    $referencesHome = $p.CommandLine -and $p.CommandLine.IndexOf($HomePath, [StringComparison]::OrdinalIgnoreCase) -ge 0
    if ($dsh -or $database -or $referencesHome -or $tracked -contains [int]$p.ProcessId) {
      if (-not $p.CreationDate) { $uncertain = $true; continue }
      $writers += @{ pid = [int]$p.ProcessId; born = $p.CreationDate.ToUniversalTime().ToString('o'); parent = [int]$p.ParentProcessId }
    }
  }
  # Track descendants even when their command line no longer references home.
  do {
    $added = $false
    foreach ($p in $all) {
      if ($excluded -contains [int]$p.ProcessId -or [int]$p.ProcessId -eq $PID -or @($writers.pid) -contains [int]$p.ProcessId) { continue }
      if ($terminalUi -contains [int]$p.ProcessId -or ($p.Name -ieq 'conhost.exe' -and $terminalUi -contains [int]$p.ParentProcessId)) { continue }
      if (@($writers.pid) -contains [int]$p.ParentProcessId) {
        if (-not $p.CreationDate) { $uncertain = $true; continue }
        $writers += @{pid=[int]$p.ProcessId;born=$p.CreationDate.ToUniversalTime().ToString('o');parent=[int]$p.ParentProcessId}; $added=$true
      }
    }
  } while ($added)
  [Console]::Out.Write((@{writers=@($writers);uncertain=$uncertain} | ConvertTo-Json -Compress -Depth 4))
} catch { [Console]::Error.Write('WRITER_QUERY_FAILED'); exit 1 }
