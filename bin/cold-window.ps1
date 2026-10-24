param([Parameter(Mandatory=$true)][string]$TaskDirectory)
$ErrorActionPreference = 'Stop'
$script:finished = $false
$script:worker = $null
$script:leases = New-Object 'System.Collections.Generic.List[System.IO.FileStream]'
$script:leaseProcessed = $false
function Write-NewTaskRecord([string]$Name,[string]$Json) {
  $destination = Join-Path $TaskDirectory $Name
  $temporary = $destination + '.new'
  [IO.File]::WriteAllText($temporary,$Json,[Text.Encoding]::UTF8)
  [IO.File]::Move($temporary,$destination)
}
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $job = Get-Content -LiteralPath (Join-Path $TaskDirectory 'job.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($job.id -notmatch '^[a-f0-9]{32}$' -or $job.confirmPrivate -ne $true -or $job.runtime.Contains('"')) { throw 'INVALID_COLD_TASK' }
  $form = New-Object Windows.Forms.Form
  $form.Text = 'DSH 离线环境备份'
  $form.Size = New-Object Drawing.Size(760,560)
  $form.StartPosition = 'CenterScreen'
  $form.Font = New-Object Drawing.Font('Microsoft YaHei UI',10)
  $form.MinimumSize = $form.Size
  $form.TopMost = $true
  $label = New-Object Windows.Forms.TextBox
  $label.Multiline = $true
  $label.ReadOnly = $true
  $label.BorderStyle = 'None'
  $label.BackColor = [Drawing.SystemColors]::Control
  $label.ScrollBars = 'Vertical'
  $label.Location = New-Object Drawing.Point(22,22)
  $label.Size = New-Object Drawing.Size(700,340)
  $label.Text = "正在初始化独立助手…`r`n请暂时不要退出 DSH。"
  $form.Controls.Add($label)
  $progress = New-Object Windows.Forms.ProgressBar
  $progress.Location = New-Object Drawing.Point(22,375)
  $progress.Size = New-Object Drawing.Size(700,18)
  $progress.Style = 'Marquee'
  $progress.MarqueeAnimationSpeed = 30
  $form.Controls.Add($progress)
  $confirmExit = New-Object Windows.Forms.Button
  $confirmExit.Text = '我已正常退出，检查后继续'
  $confirmExit.Location = New-Object Drawing.Point(22,420)
  $confirmExit.Size = New-Object Drawing.Size(250,38)
  $confirmExit.Enabled = $false
  $confirmExit.Add_Click({
    $record = @{id=$job.id} | ConvertTo-Json -Compress
    Write-NewTaskRecord 'exit-confirmed.json' $record
    $confirmExit.Enabled = $false
    $confirmExit.Text = '已确认，等待进程检测通过'
  })
  $form.Controls.Add($confirmExit)
  $cancel = New-Object Windows.Forms.Button
  $cancel.Text = '取消任务'
  $cancel.Location = New-Object Drawing.Point(290,420)
  $cancel.Size = New-Object Drawing.Size(130,36)
  $cancel.Add_Click({
    if ($script:finished) { $form.Close(); return }
    [IO.File]::WriteAllText((Join-Path $TaskDirectory 'cancel'),'')
    $cancel.Enabled = $false
    $label.Text = '已请求取消，正在等待安全清理。请勿结束助手进程。'
  })
  $form.Controls.Add($cancel)
  $open = New-Object Windows.Forms.Button
  $open.Text = '打开所在文件夹'
  $open.Location = New-Object Drawing.Point(440,420)
  $open.Size = New-Object Drawing.Size(160,36)
  $open.Enabled = $false
  $open.Add_Click({ Start-Process -FilePath 'explorer.exe' -ArgumentList ('/select,"' + $job.target + '"') })
  $form.Controls.Add($open)
  $form.Add_FormClosing({
    param($sender,$event)
    if (-not $script:finished) {
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
            $stream = [IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
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
      if (Test-Path -LiteralPath $statusFile) {
        try { $s = Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return }
        if ($s.id -ne $job.id) { throw 'INVALID_COLD_TASK' }
        $script:lastStatus = $s
        if (-not $script:ready -and (Test-Path -LiteralPath (Join-Path $TaskDirectory 'worker-ready.json'))) {
          $r = Get-Content -LiteralPath (Join-Path $TaskDirectory 'worker-ready.json') -Raw -Encoding UTF8 | ConvertFrom-Json
          if ($r.id -ne $job.id -or $r.pid -ne $script:worker.Id -or $script:worker.HasExited) { throw 'ASSISTANT_START_FAILED' }
          $ready = @{id=$job.id;phase='waiting';uiPid=$PID;workerPid=$script:worker.Id} | ConvertTo-Json -Compress
          Write-NewTaskRecord 'ready.json' $ready
          $script:ready = $true
        }
        $stage = switch ($s.phase) {
          'waiting' { '等待你正常退出 DSH，并在此确认（尚未开始备份）' }
          'exit-verified' { '已确认：相关进程全部退出，准备开始冷备份' }
          'scanning' { '正在扫描文件' }
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
          $script:finished = $true; $timer.Stop(); $cancel.Enabled = $true; $cancel.Text = '关闭'
          $confirmExit.Enabled = $false; $progress.MarqueeAnimationSpeed = 0; $progress.Style = 'Continuous'
          foreach ($stream in $script:leases) { $stream.Dispose() }; $script:leases.Clear()
          if (Test-Path -LiteralPath $leaseRequest) { [IO.File]::Delete($leaseRequest) }
          if ($s.phase -eq 'success') {
            $progress.Value = 100
            $label.Text += "`r`n路径：$($job.target)`r`n大小：$($s.bytes) bytes`r`nSHA-256：$($s.sha256)`r`n载荷、CRC、清单、条目集合已验证；临时文件已清理。`r`n私人 ZIP 未加密，请妥善保管。不会自动重启 DSH。"
            $open.Enabled = $true
          } else {
            $label.Text += "`r`n错误码：$($s.error)`r`n请检查：所有 DSH/外部数据库已正常退出、磁盘空间、权限及目标未存在。`r`n若进程或系统异常中断，请先保留并检查私有临时文件和任务锁；不要信任未报告成功的 ZIP。"
          }
        }
      }
      if (-not $script:finished -and $script:worker.HasExited) {
        $script:finished = $true; $timer.Stop(); $cancel.Enabled = $true; $cancel.Text = '关闭'
        $confirmExit.Enabled = $false; $progress.MarqueeAnimationSpeed = 0; $progress.Style = 'Continuous'
        foreach ($stream in $script:leases) { $stream.Dispose() }; $script:leases.Clear()
        $label.Text = '助手工作进程异常退出。备份结果未确认，请勿将任何残留 ZIP 当作成功备份。请检查私有任务记录和临时文件；重试前保留现场。'
      }
      if (-not $script:ready -and ([DateTime]::UtcNow - $script:started).TotalSeconds -gt 25) {
        [IO.File]::WriteAllText((Join-Path $TaskDirectory 'cancel'),'')
      }
    } catch {
      [IO.File]::WriteAllText((Join-Path $TaskDirectory 'cancel'),'')
      $label.Text = '助手状态读取失败（ASSISTANT_STATUS_FAILED）。已请求停止；DSH 无需退出。'
    }
  })
  $form.Add_Shown({
    $form.ShowInTaskbar = $true
    $form.WindowState = 'Normal'
    $form.Activate()
    $form.BringToFront()
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $job.runtime
    $start.Arguments = '--expose-internals "' + (Join-Path $PSScriptRoot 'cold-backup.mjs') + '" --task "' + $TaskDirectory + '"'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WorkingDirectory = $PSScriptRoot
    $start.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'
    $start.EnvironmentVariables['DSH_COLD_UI_PID'] = [string]$PID
    $script:worker = [Diagnostics.Process]::Start($start)
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
}
