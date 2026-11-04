[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$toolRoot=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'restore-window-view.ps1')
$view=New-PackerRestoreView 'migrate-window.xaml'
$script:plan=$null;$script:busy=$false;$script:worker=$null;$script:requestDir=$null;$script:operation=$null
function Update-MigrationGate {
  foreach($name in 'zip','runtime','target','pickZip','pickRuntime','pickParent','confirm','close','closeCaption','back','stepBackup'){$view[$name].IsEnabled=-not $script:busy}
  $filled=-not [string]::IsNullOrWhiteSpace($view.zip.Text) -and -not [string]::IsNullOrWhiteSpace($view.runtime.Text) -and -not [string]::IsNullOrWhiteSpace($view.target.Text)
  $view.check.IsEnabled=-not $script:busy -and $filled
  $valid=$null -ne $script:plan -and $script:plan.canApply -eq $true
  $view.Busy=$script:busy;$view.next.IsEnabled=-not $script:busy -and $null -ne $script:plan;$view.stepTarget.IsEnabled=$view.next.IsEnabled
  $view.restore.IsEnabled=-not $script:busy -and $valid -and $view.confirm.IsChecked -eq $true
  $view.gateReason.Text=if($script:busy){'正在执行，请等待后台安全收尾。'}elseif(-not $filled){'选择 ZIP、DSH 安装目录及新 Workspace 根目录。'}elseif($null -eq $script:plan){'点击检查并生成计划；关键异常不会自动提交。'}elseif($valid){'计划可以在隔离目录执行。关键未知项仍会阻止完整提交。'}else{'计划包含不兼容依赖。可以查看报告，不能执行恢复。'}
}
function Invalidate-Migration {
  $script:plan=$null;$view.confirm.IsChecked=$false;Update-PackerRecoveryPresentation $view 'invalidated';Update-MigrationGate
}
function Pick-MigrationFolder([string]$Kind){
  Add-Type -AssemblyName System.Windows.Forms
  $dialog=New-Object Windows.Forms.FolderBrowserDialog;$dialog.ShowNewFolderButton=$false
  try{if($dialog.ShowDialog() -eq 'OK'){if($Kind -eq 'installation'){$view.runtime.Text=$dialog.SelectedPath}else{$view.target.Text=Join-Path $dialog.SelectedPath 'Restored-Workspace'}}}finally{$dialog.Dispose()}
}
function Start-MigrationOperation([string]$Action){
  if($script:busy){return}
  if($Action -eq 'restore' -and (-not $view.restore.IsEnabled -or $null -eq $script:plan)){return}
  $exe=Join-Path $view.runtime.Text 'DeepSeek Harness.exe'
  if(-not(Test-Path -LiteralPath $exe -PathType Leaf)){$view.result.Text='TARGET_HOST_INSPECTION_FAILED：安装目录中没有可信的 DSH 程序。';return}
  if(-not $script:requestDir){
    $parent=[IO.Path]::GetDirectoryName($view.target.Text);if(-not(Test-Path -LiteralPath $parent -PathType Container)){$view.result.Text='目标父目录不存在。';return}
    $script:requestDir=Join-Path $parent ('.packer-requests-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($script:requestDir)
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $script:requestDir /inheritance:r /grant:r ('*'+$sid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' | Out-Null
    if($LASTEXITCODE -ne 0){throw 'PRIVATE_ACL_FAILED'}
  }
  $request=if($Action -eq 'plan'){@{zipFile=$view.zip.Text;installation=$view.runtime.Text;workspace=$view.target.Text}}else{@{plan=$script:plan;confirmPrivate=$true;confirmExecution=$true}}
  $file=Join-Path $script:requestDir ([guid]::NewGuid().ToString('N')+'.json');[IO.File]::WriteAllText($file,($request|ConvertTo-Json -Depth 100),(New-Object Text.UTF8Encoding($false)))
  $info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=$exe;$info.WorkingDirectory=$toolRoot;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$info.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
  $info.EnvironmentVariables['ELECTRON_RUN_AS_NODE']='1';$info.EnvironmentVariables['TEMP']=$script:requestDir;$info.EnvironmentVariables['TMP']=$script:requestDir
  $arguments=@('--expose-internals',(Join-Path $toolRoot 'assets\migration-cli.cjs'),$Action,'--request',$file)
  $info.Arguments=($arguments|ForEach-Object{ConvertTo-PackerProcessArgument ([string]$_)}) -join ' '
  $process=New-Object Diagnostics.Process;$process.StartInfo=$info
  if(-not $process.Start()){$process.Dispose();throw 'ASSISTANT_WORKER_FAILED'}
  $script:worker=$process;$script:busy=$true;$script:operation=$Action;$script:stdout=$process.StandardOutput.ReadToEndAsync();$script:stderr=$process.StandardError.ReadToEndAsync()
  if($Action -eq 'restore'){$view.HasAttempted=$true;& $view.ShowPage 2}
  $view.progress.IsIndeterminate=$true;$view.result.Text='正在'+$(if($Action -eq 'plan'){'只读检查并生成确定性计划'}else{'隔离恢复、业务读取、正常关闭及重启验证'})+'。总体百分比未知。';Update-MigrationGate
}
$view.zip.Add_TextChanged({Invalidate-Migration});$view.runtime.Add_TextChanged({Invalidate-Migration});$view.target.Add_TextChanged({Invalidate-Migration})
$view.confirm.Add_Checked({Update-MigrationGate});$view.confirm.Add_Unchecked({Update-MigrationGate})
$view.pickZip.Add_Click({$d=New-Object Microsoft.Win32.OpenFileDialog;$d.Filter='Packer ZIP|*.zip';if($d.ShowDialog($view.form)){$view.zip.Text=$d.FileName}})
$view.pickRuntime.Add_Click({Pick-MigrationFolder 'installation'});$view.pickParent.Add_Click({Pick-MigrationFolder 'workspace'})
$view.check.Add_Click({Start-MigrationOperation 'plan'});$view.restore.Add_Click({Start-MigrationOperation 'restore'});$view.close.Add_Click({$view.form.Close()})
$view.form.FindName('StrictRestore').Add_Click({if(-not $script:busy){& (Join-Path $PSScriptRoot 'restore-assistant.ps1')}})
$view.form.Add_Closing({param($s,$e)if($script:busy){$e.Cancel=$true;$view.result.AppendText([Environment]::NewLine+'后台操作尚未完成，请等待安全收尾。')}})
$timer=New-Object Windows.Threading.DispatcherTimer;$timer.Interval=[TimeSpan]::FromMilliseconds(250)
$timer.Add_Tick({
  if(-not $script:busy -or -not $script:worker.HasExited -or -not $script:stdout.IsCompleted -or -not $script:stderr.IsCompleted){return}
  try{
    $output=$script:stdout.GetAwaiter().GetResult();if($output.Length -gt 16777216){throw 'ASSISTANT_RESULT_INVALID'}
    $response=$output.Trim()|ConvertFrom-Json
    if($script:worker.ExitCode -ne 0 -or $response.ok -ne $true){
      $code=if($response.code -match '^[A-Z0-9_]{1,100}$'){$response.code}else{'ASSISTANT_RESULT_INVALID'}
      $view.result.Text=$code+'：迁移未提交。原环境和 ZIP 未被覆盖；隔离数据及诊断保留。';$script:plan=$null;Update-PackerRecoveryPresentation $view 'failed'
    }elseif($script:operation -eq 'plan'){
      $script:plan=$response.result
      $view.Inspection=@{canRestore=$true};$view.integrity.Text='归档校验通过';$view.compatibility.Text=if($script:plan.canApply){'允许隔离验证'}else{'存在不兼容项'}
      $view.backupInfo.Text='源格式：'+$script:plan.format+'；目标实际宿主：'+$script:plan.host.version
      $view.result.Text=$script:plan|ConvertTo-Json -Depth 100;$view.coverage.Text='文件数：'+$script:plan.archiveIntegrity.files+[Environment]::NewLine+'路径映射：'+($script:plan.mappings|ConvertTo-Json -Depth 20)+[Environment]::NewLine+'待处理项目：'+($script:plan.issues|ConvertTo-Json -Depth 20)
      $view.targetFeedback.Text='Workspace：'+$script:plan.layout.workspace+[Environment]::NewLine+'自动 Home：'+$script:plan.layout.home
    }else{
      if($response.result.status -ne 'committed' -or $response.result.startupVerified -ne $true){throw 'ASSISTANT_RESULT_INVALID'}
      $view.outcome.Text=if($response.result.outcome -eq 'with-exceptions'){'恢复已提交（含明确例外）'}else{'恢复及启动重启验收通过'};$view.operationHint.Text='新环境已提交，可通过专用入口启动。';$view.result.Text=$response.result|ConvertTo-Json -Depth 10;$view.progress.Value=100;$view.stepResult.IsEnabled=$true;$script:plan=$null
    }
  }catch{$view.result.Text='ASSISTANT_RESULT_INVALID：无法确认完整结果，请保留隔离目录与诊断。';$script:plan=$null}
  finally{$script:worker.Dispose();$script:worker=$null;$script:busy=$false;$view.confirm.IsChecked=$false;$view.progress.IsIndeterminate=$false;Update-MigrationGate}
})
try{$timer.Start();Update-MigrationGate;[void]$view.form.ShowDialog()}finally{$timer.Stop()}
