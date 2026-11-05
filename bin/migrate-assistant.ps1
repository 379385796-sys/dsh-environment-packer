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
  $view.stepResult.IsEnabled=-not $script:busy -and $view.HasAttempted
  $view.form.FindName('StrictRestore').IsEnabled=-not $script:busy
  $view.restore.IsEnabled=-not $script:busy -and $valid -and $view.confirm.IsChecked -eq $true
  $blockingCodes=@()
  if($null -ne $script:plan){$blockingCodes=@($script:plan.issues|Where-Object{$_.critical -ne $false -and $_.code -match '^[A-Z0-9_]{1,64}$'}|ForEach-Object{$_.code}|Select-Object -Unique)}
  $view.gateReason.Text=if($script:busy){'正在执行，请等待后台安全收尾。'}elseif(-not $filled){'选择 ZIP、DSH 安装目录及新 Workspace 根目录。'}elseif($null -eq $script:plan){'点击检查并生成计划；关键异常不会自动提交。'}elseif($valid){'计划可以在隔离目录执行；提交前仍会重新核验依赖、宿主、数据与启动。'}elseif($blockingCodes.Count -gt 0){'计划含已知关键阻断项（依赖或关键数据），不能执行恢复：'+($blockingCodes -join '、')}else{'计划包含不兼容项。可以查看报告，不能执行恢复。'}
}
function Invalidate-Migration {
  $script:plan=$null;$view.HasAttempted=$false;$view.confirm.IsChecked=$false;$view.PlanSummary.Text='等待生成计划';$view.PlanDetails.Text='';$view.Usability.Text='待启动验收';$view.result.Text='输入已改变，请重新检查。';Update-PackerRecoveryPresentation $view 'invalidated';Update-MigrationGate
}
function Pick-MigrationFolder([string]$Kind){
  Add-Type -AssemblyName System.Windows.Forms
  $dialog=New-Object Windows.Forms.FolderBrowserDialog;$dialog.ShowNewFolderButton=$false
  try{if($dialog.ShowDialog() -eq 'OK'){if($Kind -eq 'installation'){$view.runtime.Text=$dialog.SelectedPath}else{$view.target.Text=Join-Path $dialog.SelectedPath 'Restored-Workspace'}}}finally{$dialog.Dispose()}
}
function Assert-MigrationRequestParent([string]$Parent){
  $absolute=[IO.Path]::GetFullPath($Parent).TrimEnd('\')
  foreach($known in @((Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh'),$env:DSH_HOME)){
    if([string]::IsNullOrWhiteSpace($known)){continue};$knownHomePath=[IO.Path]::GetFullPath($known).TrimEnd('\')
    if($absolute.Equals($knownHomePath,[StringComparison]::OrdinalIgnoreCase) -or $absolute.StartsWith($knownHomePath+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'OFFICIAL_HOME_REFUSED'}
  }
  $cursor=[IO.DirectoryInfo]$Parent
  while($null -ne $cursor){if($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_REFUSED'};$cursor=$cursor.Parent}
}
function Start-MigrationOperation([string]$Action){
  if($script:busy){return}
  if($Action -eq 'restore' -and (-not $view.restore.IsEnabled -or $null -eq $script:plan)){return}
  $exe=Join-Path $view.runtime.Text 'DeepSeek Harness.exe'
  if(-not(Test-Path -LiteralPath $exe -PathType Leaf)){$view.result.Text='TARGET_HOST_INSPECTION_FAILED：安装目录中没有可信的 DSH 程序。';$view.backupInfo.Text=$view.result.Text;return}
  $parent=[IO.Path]::GetDirectoryName($view.target.Text);if(-not(Test-Path -LiteralPath $parent -PathType Container)){$view.result.Text='目标父目录不存在。';$view.backupInfo.Text=$view.result.Text;return}
  Assert-MigrationRequestParent $parent
  if(-not $script:requestDir){
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
  try{if(-not $process.Start()){throw 'ASSISTANT_WORKER_FAILED'}}catch{$process.Dispose();throw}
  $script:worker=$process;$script:busy=$true;$script:operation=$Action;$script:stdout=$process.StandardOutput.ReadToEndAsync();$script:stderr=$process.StandardError.ReadToEndAsync()
  if($Action -eq 'restore'){$view.HasAttempted=$true;$view.outcome.Text='正在恢复到隔离环境';$view.operationHint.Text='自动校验数据与插件，并验证启动、正常关闭和再次启动。';$view.glyph.Stroke=$view.form.FindResource('Ink');& $view.ShowPage 2}else{$view.integrity.Text='检查中…';$view.compatibility.Text='等待核验';$view.backupInfo.Text='正在读取归档与实际宿主证明。'}
  $view.progress.Value=0;$view.progress.IsIndeterminate=$true;$view.result.Text='正在'+$(if($Action -eq 'plan'){'只读检查并生成确定性计划'}else{'隔离恢复、业务读取、正常关闭及重启验证'})+'。总体百分比未知。';Update-MigrationGate
}
function Invoke-MigrationOperation([string]$Action){
  try{Start-MigrationOperation $Action}catch{if(-not $script:busy){if($script:worker){$script:worker.Dispose();$script:worker=$null};$script:plan=$null;$code=if($_.Exception.Message -cmatch '^[A-Z0-9_]{1,100}$'){$_.Exception.Message}else{'ASSISTANT_WORKER_FAILED'};$view.result.Text=$code+'：无法启动后台操作，未获恢复成功证明。';$view.backupInfo.Text=$view.result.Text;Update-MigrationGate}}
}
$view.zip.Add_TextChanged({Invalidate-Migration});$view.runtime.Add_TextChanged({Invalidate-Migration});$view.target.Add_TextChanged({Invalidate-Migration})
$view.confirm.Add_Checked({Update-MigrationGate});$view.confirm.Add_Unchecked({Update-MigrationGate})
$view.pickZip.Add_Click({$d=New-Object Microsoft.Win32.OpenFileDialog;$d.Filter='Packer ZIP|*.zip';if($d.ShowDialog($view.form)){$view.zip.Text=$d.FileName}})
$view.pickRuntime.Add_Click({Pick-MigrationFolder 'installation'});$view.pickParent.Add_Click({Pick-MigrationFolder 'workspace'})
$view.check.Add_Click({Invoke-MigrationOperation 'plan'});$view.restore.Add_Click({Invoke-MigrationOperation 'restore'});$view.close.Add_Click({$view.form.Close()})
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
      $view.result.Text=$code+'：迁移未提交。原环境和 ZIP 未被覆盖；隔离数据及诊断保留。'+$(if($response.rollbackCode){[Environment]::NewLine+'回退未确认：'+$response.rollbackCode}else{''});$script:plan=$null;Update-PackerRecoveryPresentation $view 'failed';$view.backupInfo.Text=$view.result.Text
    }elseif($script:operation -eq 'plan'){
      if($response.result.mode -ne 'migrate' -or $response.result.planSHA256 -cnotmatch '^[a-f0-9]{64}$' -or $response.result.archiveIntegrity.state -ne 'valid' -or $response.result.canApply -isnot [bool]){throw 'ASSISTANT_RESULT_INVALID'}
      $script:plan=$response.result
      $view.Inspection=@{canRestore=$true};$view.integrity.Text='归档校验通过';$view.compatibility.Text=if($script:plan.canApply){'允许隔离验证'}else{'存在已知阻断项'}
      $view.backupInfo.Text='源格式：'+$script:plan.format+'；目标实际宿主：'+$script:plan.host.version
      $gapCodes=@($script:plan.issues|Where-Object{$_.critical -ne $false -and $_.code -match '^[A-Z0-9_]{1,64}$'}|ForEach-Object{$_.code}|Select-Object -Unique)
      $gapText=if($gapCodes.Count -gt 0){$gapCodes -join '、'}else{'无'}
      $view.result.Text=$script:plan|ConvertTo-Json -Depth 100;$view.coverage.Text='文件数：'+$script:plan.archiveIntegrity.files+[Environment]::NewLine+'关键阻断码：'+$gapText+[Environment]::NewLine+'路径映射：'+($script:plan.mappings|ConvertTo-Json -Depth 20)+[Environment]::NewLine+'待处理项目：'+($script:plan.issues|ConvertTo-Json -Depth 20)
      $view.PlanSummary.Text=('{0:N0} 个文件 · {1:N1} MB · {2} 个安装载荷'+[Environment]::NewLine+'{3} 个工作目录映射 · {4} 项待处理'+[Environment]::NewLine+'目标宿主：DSH {5}') -f $script:plan.archiveIntegrity.files,([double]$script:plan.archiveIntegrity.bytes/1MB),@($script:plan.plugins).Count,@($script:plan.mappings).Count,@($script:plan.issues).Count,$script:plan.host.version
      $view.PlanDetails.Text=$view.coverage.Text
      $view.targetFeedback.Text='Workspace：'+$script:plan.layout.workspace+[Environment]::NewLine+'自动 Home：'+$script:plan.layout.home
    }else{
      if($response.result.status -ne 'committed' -or $response.result.startupVerified -ne $true){throw 'ASSISTANT_RESULT_INVALID'}
      $view.outcome.Text=if($response.result.outcome -eq 'with-exceptions'){'恢复已提交（含明确例外）'}else{'恢复及启动重启验收通过'};$view.operationHint.Text='数据读取、正常关闭与再次启动已通过。使用结果中的专用入口启动新环境。';$view.Usability.Text='启动重启已通过';$view.glyph.Data=[Windows.Media.Geometry]::Parse('M 2,12 L 9,19 L 23,3');$view.glyph.Stroke=$view.form.FindResource('Success');$view.startup.Visibility='Collapsed';$view.result.Text=$response.result|ConvertTo-Json -Depth 10;$view.progress.Value=100;$view.stepResult.IsEnabled=$true;$script:plan=$null
    }
  }catch{$view.result.Text='ASSISTANT_RESULT_INVALID：无法确认完整结果，请保留隔离目录与诊断。';$view.backupInfo.Text=$view.result.Text;$script:plan=$null;Update-PackerRecoveryPresentation $view 'failed'}
  finally{$script:worker.Dispose();$script:worker=$null;$script:busy=$false;$view.confirm.IsChecked=$false;$view.progress.IsIndeterminate=$false;Update-MigrationGate}
})
try{$timer.Start();Update-MigrationGate;[void]$view.form.ShowDialog()}finally{$timer.Stop()}
