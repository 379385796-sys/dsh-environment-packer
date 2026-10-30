param([string]$HomePath, [string]$RuntimePath, [string]$ExcludePids = '', [string]$TrackedPids = '', [string]$TaskId = '')
$ErrorActionPreference = 'Stop'
try {
  $excluded = @($ExcludePids.Split(',') | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })
  $tracked = @($TrackedPids.Split(',') | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })
  $writers = @()
  $uncertain = $false
  $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  $ownHostProbes = @()
  if ($TaskId -match '^[a-f0-9]{32}$') {
    try {
      $taskDir = Join-Path (Join-Path $HomePath '.packer-cold') $TaskId
      $paths = @($taskDir,(Join-Path $taskDir 'job.json'),(Join-Path $taskDir 'coordinator-owner.json'),(Join-Path (Split-Path -Parent $taskDir) 'active.lock'))
      foreach ($f in $paths) { if ((Get-Item -LiteralPath $f -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'UNPROVEN' } }
      $job = Get-Content -LiteralPath $paths[1] -Raw -Encoding UTF8 | ConvertFrom-Json
      $owner = Get-Content -LiteralPath $paths[2] -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($job.id -ne $TaskId -or $job.lockProtocol -ne 2 -or (Get-Content -LiteralPath $paths[3] -Raw -Encoding UTF8) -cne $TaskId -or $excluded -notcontains [int]$owner.pid) { throw 'UNPROVEN' }
      $parent = $all | Where-Object { $_.ProcessId -eq [int]$owner.pid }
      $parentProcess = [Diagnostics.Process]::GetProcessById([int]$owner.pid)
      function QuoteProbeArg([string]$value) { if ($value -match '\s') { return '"'+$value+'"' }; return $value }
      $parentCommand = (QuoteProbeArg $RuntimePath)+' --expose-internals "'+(Join-Path $PSScriptRoot 'cold-backup.mjs')+'" --task "'+$taskDir+'"'
      if ($parentProcess.StartTime.ToUniversalTime().Ticks.ToString() -cne $owner.born -or -not $parent.ExecutablePath -or
          $parent.ExecutablePath -ine $RuntimePath -or -not $parent.CommandLine -or $parent.CommandLine.TrimEnd() -cne $parentCommand) { throw 'UNPROVEN' }
      $probeScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets/host-proof.cjs'))
      if ((Get-Item -LiteralPath $probeScript -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'UNPROVEN' }
      $scriptHasher = [Security.Cryptography.SHA256]::Create()
      $scriptStream = [IO.File]::OpenRead($probeScript)
      try { $scriptHash = ([BitConverter]::ToString($scriptHasher.ComputeHash($scriptStream))).Replace('-','').ToLowerInvariant() } finally { $scriptStream.Dispose(); $scriptHasher.Dispose() }
      foreach ($recordFile in @(Get-ChildItem -LiteralPath $taskDir -Filter 'host-probe-*.json' -File)) {
        try {
          if ($recordFile.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
          $r = Get-Content -LiteralPath $recordFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
          if ($r.protocol -ne 1 -or $r.id -cne $TaskId -or $r.parentPid -ne $owner.pid -or $r.parentBorn -cne $owner.born -or
              $r.nonce -notmatch '^[a-f0-9]{32}$' -or $recordFile.Name -cne ('host-probe-'+$r.nonce+'.json') -or $r.scriptSHA256 -cne $scriptHash -or
              $r.payload -notmatch '^[A-Za-z0-9+/=]+$') { continue }
          $payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($r.payload)) | ConvertFrom-Json
          if ($payload.nonce -cne $r.nonce -or $payload.dshVersion -cne $job.dshVersion) { continue }
          $command = (QuoteProbeArg $RuntimePath)+' --expose-internals '+(QuoteProbeArg $probeScript)+' --probe64 '+$r.payload
          $receipt = $null
          $receiptPath = Join-Path $taskDir ('host-probe-live-'+$r.nonce+'.json')
          if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
            try {
              if ((Get-Item -LiteralPath $receiptPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'UNPROVEN' }
              $live = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
              $hasher = [Security.Cryptography.SHA256]::Create()
              try { $payloadHash = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($r.payload)))).Replace('-','').ToLowerInvariant() } finally { $hasher.Dispose() }
              if ($live.id -ceq $TaskId -and $live.nonce -ceq $r.nonce -and $live.parentPid -eq $owner.pid -and $live.parentBorn -ceq $owner.born -and
                  $live.scriptSHA256 -ceq $scriptHash -and $live.payloadSHA256 -ceq $payloadHash -and $live.pid -gt 0 -and $live.born -match '^\d+$' -and $live.cimBorn -match '^\d+$' -and
                  ([long]$live.born - [long]$live.cimBorn) -ge 0 -and ([long]$live.born - [long]$live.cimBorn) -le 9) { $receipt = $live }
            } catch { }
          }
          foreach ($child in @($all | Where-Object { $_.ParentProcessId -eq [int]$owner.pid })) {
            if ($child.ExecutablePath -and $child.ExecutablePath -ieq $RuntimePath -and $child.CommandLine -and $child.CommandLine.TrimEnd() -ceq $command -and
                $child.CreationDate -and $child.CreationDate.ToUniversalTime() -ge $parentProcess.StartTime.ToUniversalTime()) { $ownHostProbes += [int]$child.ProcessId }
            elseif ($receipt -and $child.ProcessId -eq [int]$receipt.pid -and $child.CreationDate -and $child.CreationDate.ToUniversalTime().Ticks.ToString() -ceq $receipt.cimBorn -and
                    (-not $child.ExecutablePath -or $child.ExecutablePath -ieq $RuntimePath) -and (-not $child.CommandLine -or $child.CommandLine.TrimEnd() -ceq $command)) {
              try { $current=[Diagnostics.Process]::GetProcessById([int]$receipt.pid); if ($current.StartTime.ToUniversalTime().Ticks.ToString() -ceq $receipt.born) { $ownHostProbes += [int]$child.ProcessId } }
              catch [ArgumentException] { $ownHostProbes += [int]$child.ProcessId } # Proven stale row of this departed read-only child.
              catch { } # Access/identity uncertainty is never an exemption.
            }
          }
        } catch { # Partial or invalid probe records never exempt a process.
        }
      }
    } catch { # Uncertainty leaves normal writer detection active.
    }
  }
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
    if ($excluded -contains [int]$p.ProcessId -or [int]$p.ProcessId -eq $PID -or $ownHostProbes -contains [int]$p.ProcessId) { continue }
    if ($terminalUi -contains [int]$p.ProcessId -or ($p.Name -ieq 'conhost.exe' -and $terminalUi -contains [int]$p.ParentProcessId)) { continue }
    # The coordinator and worker may query concurrently. Only their own exact
    # monitor script is exempt; a DSH child or unrelated PowerShell is not.
    if ($excluded -contains [int]$p.ParentProcessId -and $p.Name -ieq 'powershell.exe' -and $p.CommandLine -and
        $p.CommandLine.IndexOf($PSCommandPath,[StringComparison]::OrdinalIgnoreCase) -ge 0) { continue }
    if ($excluded -contains [int]$p.ParentProcessId -and $p.Name -ieq 'powershell.exe' -and $p.CommandLine) {
      $guardScript = Join-Path $PSScriptRoot 'task-guard.ps1'
      $ownerScript = Join-Path $PSScriptRoot 'task-owners.ps1'
      if ($p.CommandLine.IndexOf($guardScript,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or
          $p.CommandLine.IndexOf($ownerScript,[StringComparison]::OrdinalIgnoreCase) -ge 0) { continue }
    }
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
