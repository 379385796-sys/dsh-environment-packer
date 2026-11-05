param([Parameter(Mandatory=$true)][string]$TaskDirectory)
$ErrorActionPreference = 'Stop'
$script:finished = $false
$script:worker = $null
$script:leases = New-Object 'System.Collections.Generic.List[System.IO.FileStream]'
$script:leaseProcessed = $false
$script:taskGuard = $null
$script:userCancelled = $false
$script:terminalSeen = $false
function Write-NewTaskRecord([string]$Name,[string]$Json) {
  $destination = Join-Path $TaskDirectory $Name
  $temporary = $destination + '.new'
  [IO.File]::WriteAllText($temporary,$Json,[Text.Encoding]::UTF8)
  [IO.File]::Move($temporary,$destination)
}
# Bounded projection: stable codes and a count only. Old or malformed records
# stay 'unknown'; they are never reported as a clean, complete capture.
function Get-BoundedCoverage($Value) {
  $unknown=@{schema=1;state='unknown';criticalCount=0;criticalCodes=@();truncated=$false;recoveryBlocked=$null;blockReason=$null}
  if($null -eq $Value -or $Value.schema -ne 1){return $unknown}
  $state=[string]$Value.state
  if($state -notin @('critical-gaps','no-known-critical-gaps')){return $unknown}
  $count=0;try{$count=[int]$Value.criticalCount}catch{$count=0};if($count -lt 0){$count=0}
  $codes=@()
  if($null -ne $Value.criticalCodes){$codes=@($Value.criticalCodes|Where-Object{$_ -match '^[A-Z0-9_]{1,64}$'}|Select-Object -Unique -First 8)}
  $blocked=($state -eq 'critical-gaps')
  return @{schema=1;state=$state;criticalCount=$count;criticalCodes=$codes;truncated=($Value.truncated -eq $true);recoveryBlocked=$blocked;blockReason=$(if($blocked){'CRITICAL_COVERAGE_GAPS'}else{$null})}
}
function Complete-AssistantView([string]$Outcome,[int]$Delay,[string]$Code) {
  # A terminal-looking status is not enough: the owning coordinator must have
  # completed its finally block, including worker shutdown and lock retirement.
  if ($null -eq $script:worker -or -not $script:worker.HasExited) { return }
  # D8: never claim success unless the ZIP really exists at the target and its
  # size matches the verified terminal record. The coordinator already checked
  # structure, CRC, manifest and every payload hash before publishing.
  if ($Outcome -eq 'success') {
    $sizeOk=$false
    try { $item=Get-Item -LiteralPath $job.target -ErrorAction Stop; $sizeOk=(-not $item.PSIsContainer) -and ($null -eq $script:lastStatus.bytes -or [long]$item.Length -eq [long]$script:lastStatus.bytes) } catch {}
    if (-not $sizeOk -or $script:lastStatus.phase -ne 'success') { $Outcome='unknown'; $Code='ASSISTANT_ZIP_MISSING' }
  }
  foreach ($stream in $script:leases) { $stream.Dispose() }; $script:leases.Clear()
  $state=$script:lastStatus
  $zipPresent=$false; try { $zipPresent=Test-Path -LiteralPath $job.target } catch {}
  $completedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $rawCoverage=$null;if($state){$rawCoverage=$state.coverage}
  $coverage=Get-BoundedCoverage $rawCoverage
  $record=@{id=$job.id;outcome=$Outcome;code=$Code;result=if($Outcome -eq 'success'){'files-verified'}else{'unconfirmed'};phase=if($state){[string]$state.phase}else{'unknown'};target=$job.target;bytes=if($state -and $null -ne $state.bytes){[long]$state.bytes}else{$null};sha256=if($state -and $state.sha256){[string]$state.sha256}else{$null};files=if($state -and $null -ne $state.files){[long]$state.files}else{$null};verified=($state -and $state.verified -eq $true);cleanup=($state -and $state.cleanup -eq $true);dependencyIssues=if($state -and $null -ne $state.dependencyIssues){[int]$state.dependencyIssues}else{0};coverage=$coverage;integrity=if($Outcome -eq 'success'){'zip-crc-manifest-payload-verified'}else{'unconfirmed'};zipPresent=$zipPresent;completedAt=$completedAt;workerExited=$true;workerExitCode=$script:worker.ExitCode;sourceLeasesReleased=$true;at=$completedAt}
  $durable=$false
  try { Write-NewTaskRecord 'ui-result.json' ($record|ConvertTo-Json -Compress);$durable=$true } catch {}
  $script:finished=$true;$confirmExit.Enabled=$false;$cancel.Enabled=$true;$cancel.Text='关闭窗口'
  $progress.MarqueeAnimationSpeed=0;$progress.Style='Continuous'
  if($Outcome -eq 'unknown'){
    Update-PackerAssistantState $view @{phase='unknown';files=$state.files;error=$Code;target=$job.target;at=$completedAt;zipPresent=$zipPresent}
    $view.title.Text='结果未确认';$view.subtitle.Text='协调器已退出，但没有可靠的完整终态。'
    $view.instructions.Visible=$true;$view.instructions.Text='诊断已保留；未报告成功的 ZIP 不能当作成功备份，任务锁继续按原规则保护。'
  }elseif($Outcome -eq 'cancelled'){
    Update-PackerAssistantState $view @{phase='cancelled';files=$state.files;error=$Code;target=$job.target;at=$completedAt;zipPresent=$zipPresent}
    $view.title.Text='任务已取消';$view.subtitle.Text='写入与收尾已经结束；未生成有效 ZIP。'
  }
  # D-09: every terminal outcome must report record persistence truthfully.
  if($durable){
    $view.hint.Text=if($Outcome -eq 'success'){'结果已保留，请确认后关闭。不会自动重启 DSH。'}elseif($Outcome -eq 'cancelled'){'结果已保留；如仍需备份，请重新发起。'}else{'结果已保留，请确认后关闭；诊断可在下次启动 DSH 后查看。'}
  }else{Set-PackerRecordDurability $view $false}
  & $view.Layout
  # The final page stays until the user closes it. No auto-close timer is armed.
  try { $timer.Stop() } catch {}
  try { $form.Activate();$form.BringToFront() } catch {}
}
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $job = Get-Content -LiteralPath (Join-Path $TaskDirectory 'job.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($job.id -notmatch '^[a-f0-9]{32}$' -or $job.confirmPrivate -ne $true -or $job.runtime.Contains('"')) { throw 'INVALID_COLD_TASK' }
  if ($job.lockProtocol -ne 2) { throw 'INVALID_COLD_TASK' }
  $script:taskGuard = [IO.File]::Open((Join-Path $TaskDirectory 'task.guard'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  $lock = Join-Path (Split-Path -Parent $TaskDirectory) 'active.lock'
  if ((Get-Content -LiteralPath $lock -Raw) -ne $job.id -or (Test-Path -LiteralPath (Join-Path $TaskDirectory 'recovered.json'))) { throw 'TASK_LOCK_LOST' }
  Write-NewTaskRecord 'ui-owner.json' (@{pid=$PID;born=([Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString())} | ConvertTo-Json -Compress)
  . (Join-Path $PSScriptRoot 'cold-window-view.ps1')
  $view = New-PackerAssistantView $job.target
  $form=$view.form; $label=$view.label; $progress=$view.progress
  $confirmExit=$view.confirmExit; $cancel=$view.cancel; $open=$view.open
  $confirmExit.Add_Click({
    $record = @{id=$job.id} | ConvertTo-Json -Compress
    Write-NewTaskRecord 'exit-confirmed.json' $record
    $confirmExit.Enabled = $false
    $confirmExit.Text = '已确认，等待进程检测通过'
  })
  $cancel.Add_Click({
    if ($script:finished) { $form.Close(); return }
    if ($script:terminalSeen) { return }
    $script:userCancelled=$true
    [IO.File]::WriteAllText((Join-Path $TaskDirectory 'cancel'),'')
    $cancel.Enabled = $false
    $label.Text = '已请求取消，正在等待安全清理。请勿结束助手进程。'
  })
  $open.Add_Click({ Start-Process -FilePath 'explorer.exe' -ArgumentList ('/select,"' + $job.target + '"') })
  $form.Add_FormClosing({
    param($sender,$event)
    if (-not $script:finished) {
      if ($script:terminalSeen) { $event.Cancel=$true;$label.Text='任务已记录结果，正在等待安全收尾完成。';return }
      $script:userCancelled=$true
      [IO.File]::WriteAllText((Join-Path $TaskDirectory 'cancel'),'')
      $event.Cancel = $true
      $label.Text = '已请求取消，正在等待安全清理。'
    }
  })
  $timer = New-Object Windows.Forms.Timer
  $timer.Interval = 350
  $script:ready = $false
  $script:lastStatus = $null
  $script:started = [DateTime]::UtcNow
  $timer.Add_Tick({
    try {
      if($script:finished){return}
      if (([DateTime]::UtcNow - $script:started).TotalSeconds -gt 3) { $form.TopMost = $false }
      $leaseRequest = Join-Path $TaskDirectory 'lease-request.private.json'
      if (-not $script:leaseProcessed -and (Test-Path -LiteralPath $leaseRequest)) {
        $script:leaseProcessed = $true
        $timer.Stop()
        try {
          $lease = Get-Content -LiteralPath $leaseRequest -Raw -Encoding UTF8 | ConvertFrom-Json
          if ($lease.id -ne $job.id -or @($lease.files).Count -gt 59999) { throw 'SOURCE_LEASE_FAILED' }
          $count = 0
          foreach ($file in $lease.files) {
            if (Test-Path -LiteralPath (Join-Path $TaskDirectory 'cancel')) { throw 'BACKUP_ABORTED' }
            # FileShare.Read permits backup readers but denies existing/new writers and deletion.
            # Node already inventories/validates absolute source paths and rejects
            # reparse points. Framework File.Open otherwise rejects long valid
            # drive paths. Only change their IO spelling, retaining the same
            # kernel read lease and denial of write/delete sharing.
            $leasePath=if($file.Length -ge 248 -and $file -match '^[A-Za-z]:\\'){'\\?\'+$file}else{$file}
            $stream = [IO.File]::Open($leasePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
            $script:leases.Add($stream)
            $count++
            if ($count % 200 -eq 0) { [Windows.Forms.Application]::DoEvents() }
          }
          $record = @{id=$job.id;uiPid=$PID;files=$count} | ConvertTo-Json -Compress
          Write-NewTaskRecord 'lease-ready.json' $record
        } catch {
          foreach ($stream in $script:leases) { $stream.Dispose() }
          $script:leases.Clear()
          [IO.File]::WriteAllText((Join-Path $TaskDirectory 'lease-failed.json'),'{}')
        } finally { $timer.Start() }
      }
      $statusFile = Join-Path $TaskDirectory 'status.json'
      if (Test-Path -LiteralPath (Join-Path $TaskDirectory 'terminal.json')) { $statusFile = Join-Path $TaskDirectory 'terminal.json' }
      if (Test-Path -LiteralPath $statusFile) {
        try { $s = Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch {
          if (-not $script:worker.HasExited) { return }
          $label.Text = '任务已退出，但状态记录损坏。结果未确认。关闭助手后，在 Packer 页面检查并恢复异常任务；诊断和 ZIP 均保留。'
          Complete-AssistantView 'unknown' 10000 'ASSISTANT_STATE_CORRUPT'
          return
        }
        if ($s.id -ne $job.id) { throw 'INVALID_COLD_TASK' }
        $script:lastStatus = $s
        if($s.phase -eq 'failed'){try{$s|Add-Member -NotePropertyName zipPresent -NotePropertyValue (Test-Path -LiteralPath $job.target) -Force}catch{}}
        # A terminal-looking success is not displayed as success while the
        # coordinator is still alive or the target ZIP is absent/mismatched.
        $effective=$s
        if($s.phase -eq 'success'){
          $zipOk=$false
          try { $item=Get-Item -LiteralPath $job.target -ErrorAction Stop; $zipOk=(-not $item.PSIsContainer) -and ($null -eq $s.bytes -or [long]$item.Length -eq [long]$s.bytes) } catch {}
          if(-not $script:worker.HasExited -or -not $zipOk){$effective=@{phase='unknown';files=$s.files;error='ASSISTANT_TERMINAL_UNCONFIRMED';target=$job.target;at=$s.at;zipPresent=$zipOk}}
        }
        Update-PackerAssistantState $view $effective
        if (-not $script:ready -and (Test-Path -LiteralPath (Join-Path $TaskDirectory 'worker-ready.json'))) {
          $r = Get-Content -LiteralPath (Join-Path $TaskDirectory 'worker-ready.json') -Raw -Encoding UTF8 | ConvertFrom-Json
          if($script:worker.HasExited){Complete-AssistantView 'unknown' 10000 'ASSISTANT_START_FAILED';return}
          if ($r.id -ne $job.id -or $r.pid -ne $script:worker.Id -or $script:worker.HasExited) { throw 'ASSISTANT_START_FAILED' }
          $ready = @{id=$job.id;phase='waiting';uiPid=$PID;workerPid=$script:worker.Id} | ConvertTo-Json -Compress
          Write-NewTaskRecord 'ready.json' $ready
          $script:ready = $true
        }
        $stage = switch ($s.phase) {
          'waiting' { '等待你正常退出 DSH，并在此确认（尚未开始备份）' }
          'exit-verified' { '已确认：相关进程全部退出，准备开始冷备份' }
          'scanning' { '正在扫描文件' }
          'checking-dependencies' { '正在检查已安装依赖与本地包' }
          'writing' { '正在生成备份' }
          'verifying' { '正在验证 ZIP、清单及全部载荷哈希' }
          'success' { '备份成功（文件完整性通过；恢复运行仍需独立验收）' }
          'failed' { '备份失败或已安全取消' }
          default { '正在初始化' }
        }
        $label.Text = "$stage`r`n已处理文件：$($s.files)`r`n任务：$($job.id)"
        if ($s.phase -eq 'waiting') {
          $confirmExit.Enabled = $script:ready -and -not $s.exitConfirmed
          $label.Text += "`r`n步骤 1：保存工作，通过 DSH 菜单或托盘正常退出所有 DSH 实例。`r`n步骤 2：回来点击【我已正常退出，检查后继续】。`r`n检测到的相关进程：$($s.writers)。人工确认：$($s.exitConfirmed)。`r`n点击确认不能绕过检测；进程未退出、状态不明，均不会开始备份。`r`n只关窗口可能仍在托盘运行。10 分钟内未完成将取消。"
        }
        if ($s.phase -ne 'waiting') { $confirmExit.Enabled = $false }
        if ($s.phase -eq 'success' -or $s.phase -eq 'failed') {
          $script:terminalSeen=$true;$cancel.Enabled=$false
          $confirmExit.Enabled = $false; $progress.MarqueeAnimationSpeed = 0; $progress.Style = 'Continuous'
          # Keep inventory/lease evidence for diagnosis. Never remove failed artifacts.
          if ($s.phase -eq 'success') {
            $progress.Value = 100
            $doneAt=$null;try{$doneAt=[DateTimeOffset]::FromUnixTimeMilliseconds([long]$s.at).ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss')}catch{}
            $conflicts=if($null -ne $s.dependencyIssues){[int]$s.dependencyIssues}else{0}
            $label.Text += "`r`n路径：$($job.target)`r`n大小：$($s.bytes) bytes`r`nSHA-256：$($s.sha256)`r`n完整性：ZIP 结构、CRC、清单与全部载荷哈希通过；临时文件已清理。`r`n完成时间：$doneAt`r`n依赖冲突：$(if($conflicts -gt 0){"$conflicts 项已记录；恢复时将重新检查，未解决的关键问题会阻断提交。"}else{'未发现冲突。'})`r`n私人 ZIP 未加密，请妥善保管。结果会保留到你主动关闭；不会自动重启 DSH。"
            $open.Enabled = $true
          } else {
            $zipPresent=$false;try{$zipPresent=Test-Path -LiteralPath $job.target}catch{}
            $doneAt=$null;try{$doneAt=[DateTimeOffset]::FromUnixTimeMilliseconds([long]$s.at).ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss')}catch{}
            $label.Text += "`r`n错误码：$($s.error)`r`n有效 ZIP：$(if($zipPresent){'存在未确认文件，不能视为成功备份。'}else{'未生成。'})`r`n需要重新备份：是。请使用新的 ZIP 名称重试。`r`n完成时间：$doneAt`r`n故障记录和残留文件已保留。关闭此窗口后，可在 Packer 页面点击【检查并恢复异常任务】。"
            if ($s.error -in @('TRANSITIVE_DEPENDENCY_MISSING','PEER_VERSION_MISMATCH','HOST_PEER_VERSION_MISMATCH','HOST_BROWSER_PEER_UNPROVEN','DSH_ENGINE_MISMATCH')) {
              $label.Text += "`r`n依赖检查记录了冲突，但该冲突不是本次备份中止的原因；请查看保留的依赖诊断，恢复时会重新检查并阻断未解决的关键问题。"
            } elseif ($s.error -eq 'DECLARED_DEPENDENCY_MISSING') {
              $label.Text += "`r`nProfile 声明的插件/依赖没有完整安装，请通过正常插件管理流程修复安装后，再使用新 ZIP 名称重试。"
            } elseif ($s.error -eq 'INSTALLED_PACKAGE_INVALID') {
              $label.Text += "`r`n已安装包的元数据无法解析；这不是版本冲突，请先修复插件安装。"
            }
          }
          if($script:worker.HasExited){
            $hasTerminal=$statusFile -eq (Join-Path $TaskDirectory 'terminal.json')
            if($hasTerminal -and $s.phase -eq 'failed' -and $s.error){
              if($script:userCancelled -and $s.error -eq 'BACKUP_ABORTED'){Complete-AssistantView 'cancelled' 700 $s.error}else{Complete-AssistantView 'failed' 10000 $s.error}
            }elseif($hasTerminal -and $s.phase -eq 'success'){
              $released=$false;$committed=$false
              try{$released=[IO.File]::ReadAllText((Join-Path $TaskDirectory 'released.lock')) -ceq $job.id;$receipt=Get-Content -LiteralPath (Join-Path $TaskDirectory 'committed.json') -Raw -Encoding UTF8|ConvertFrom-Json;$committed=$receipt.id -ceq $job.id -and $receipt.sha256 -ceq $s.sha256}catch{}
              if($script:worker.ExitCode -eq 0 -and $s.verified -eq $true -and $s.cleanup -eq $true -and $released -and $committed){Complete-AssistantView 'success' 3000 ''}else{Complete-AssistantView 'unknown' 10000 'ASSISTANT_CLEANUP_UNCONFIRMED'}
            }else{Complete-AssistantView 'unknown' 10000 'ASSISTANT_TERMINAL_UNCONFIRMED'}
          }else{$view.hint.Text='结果已记录，正在等待协调器完成收尾；不会提前关闭。'}
        }
      }
      if (-not $script:finished -and $script:worker.HasExited) {
        $label.Text = '助手工作进程异常退出。备份结果未确认，请勿将任何残留 ZIP 当作成功备份。请检查私有任务记录和临时文件；重试前保留现场。'
        Complete-AssistantView 'unknown' 10000 'ASSISTANT_COORDINATOR_EXITED'
      }
      if (-not $script:ready -and ([DateTime]::UtcNow - $script:started).TotalSeconds -gt 25) {
        [IO.File]::WriteAllText((Join-Path $TaskDirectory 'cancel'),'')
      }
    } catch {
      [IO.File]::WriteAllText((Join-Path $TaskDirectory 'cancel'),'')
      $label.Text = '助手状态读取失败（ASSISTANT_STATUS_FAILED）。已请求停止；DSH 无需退出。'
      if($null -ne $script:worker -and $script:worker.HasExited){Complete-AssistantView 'unknown' 10000 'ASSISTANT_STATUS_FAILED'}
    }
  })
  $form.Add_Shown({
    $form.ShowInTaskbar = $true
    $form.WindowState = 'Normal'
    $form.Activate()
    $form.BringToFront()
    $arguments = '--expose-internals "' + (Join-Path $PSScriptRoot 'cold-backup.mjs') + '" --task "' + $TaskDirectory + '"'
    $env:ELECTRON_RUN_AS_NODE = '1'
    $env:DSH_COLD_UI_PID = [string]$PID
    $script:worker = Start-Process -FilePath $job.runtime -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $TaskDirectory 'runtime.stderr.log') -RedirectStandardOutput (Join-Path $TaskDirectory 'runtime.stdout.log')
    # Windows PowerShell's Start-Process can otherwise lose ExitCode after exit.
    # Retain the real process handle while it is running; never infer success
    # from a missing exit code.
    $null = $script:worker.Handle
    $timer.Start()
  })
  [void]$form.ShowDialog()
  $timer.Dispose(); $form.Dispose()
} catch {
  try {
    $diagnostic = @{code='ASSISTANT_UI_FAILED';line=$_.InvocationInfo.ScriptLineNumber;type=$_.Exception.GetType().Name} | ConvertTo-Json -Compress
    [IO.File]::WriteAllText((Join-Path $TaskDirectory 'ui-failed.json'),$diagnostic,[Text.Encoding]::UTF8)
  } catch {}
  try { [IO.File]::WriteAllText((Join-Path $TaskDirectory 'cancel'),'') } catch {}
  exit 1
} finally {
  foreach ($stream in $script:leases) { $stream.Dispose() }
  if ($null -ne $script:taskGuard) { $script:taskGuard.Dispose() }
  if ($null -ne $script:worker -and $script:worker.HasExited) { $script:worker.Dispose() }
}
