[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$toolRoot=Split-Path -Parent $PSScriptRoot
foreach($required in 'package.json','bin\restore-window.xaml','bin\restore-window-view.ps1','assets\recovery-assistant.cjs','assets\verify-private.cjs','assets\backup-coverage.cjs','assets\restore-private.cjs','assets\recovery-core.cjs','assets\dependency-contract.cjs','assets\host-proof.cjs','assets\provider-runtime.cjs','assets\browser-contract.cjs','vendor\semver\index.js'){
  if(-not (Test-Path -LiteralPath (Join-Path $toolRoot $required) -PathType Leaf)){throw 'TRUSTED_TOOL_PACKAGE_REQUIRED：请从完整可信的 Packer 工具包启动。'}
}
$package=Get-Content -LiteralPath (Join-Path $toolRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($package.name -ne 'dsh-environment-packer'){throw 'TRUSTED_TOOL_PACKAGE_REQUIRED'}
. (Join-Path $PSScriptRoot 'restore-window-view.ps1')
$view=New-PackerRestoreView
$script:inspection=$null;$script:zipChecked=$null;$script:runtimeChecked=$null;$script:busy=$false;$script:worker=$null;$script:action=$null
$node=Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$script:standaloneNode=if($node){$node.Source}else{$null}
function Update-Gate { Set-PackerRestoreGate $view $script:busy $script:inspection }
function Invalidate-Inspection {
  $script:inspection=$null;$view.confirm.IsChecked=$false
  $view.result.Text='检查对象已改变，请重新执行只读检查。未检查的对象不能恢复。'
  Update-PackerRecoveryPresentation $view 'invalidated'
  Update-Gate
}
function Start-RecoveryOperation([string]$Action) {
  if($script:busy){return}
  $runtime=if(-not [string]::IsNullOrWhiteSpace($view.runtime.Text)){$view.runtime.Text}else{$script:standaloneNode}
  if(-not $runtime -or -not (Test-Path -LiteralPath $runtime -PathType Leaf)){$view.result.Text='RUNTIME_REQUIRED：检查需要可信 Node 或已安装的 DSH Desktop.exe；本助手不会安装或下载运行时。';return}
  $arguments=@('--expose-internals',(Join-Path $toolRoot 'assets\recovery-assistant.cjs'),'--action',$Action,'--zip',$view.zip.Text)
  if($Action -eq 'restore'){
    Update-Gate
    if(-not $view.restore.IsEnabled -or $view.zip.Text -cne $script:zipChecked -or $view.runtime.Text -cne $script:runtimeChecked){return}
    $arguments+=@('--home',$view.target.Text,'--zip-sha256',$script:inspection.archiveIntegrity.sha256,'--confirm-private')
  }else{$script:inspection=$null;$view.confirm.IsChecked=$false}
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$runtime;$info.WorkingDirectory=$toolRoot;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$info.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
  $info.Arguments=($arguments | ForEach-Object {ConvertTo-PackerProcessArgument ([string]$_)}) -join ' '
  $info.EnvironmentVariables['ELECTRON_RUN_AS_NODE']='1'
  $process=New-Object Diagnostics.Process;$process.StartInfo=$info
  $started=$false
  try{
    if(-not $process.Start()){throw 'ASSISTANT_WORKER_FAILED'}
    $started=$true;$script:worker=$process;$script:busy=$true;$script:protocolFailed=$false;$script:output=$process.StandardOutput.ReadToEndAsync();$script:errors=$process.StandardError.ReadToEndAsync()
    $script:busy=$true;$script:action=$Action;$script:operationZip=$view.zip.Text;$script:operationRuntime=$view.runtime.Text
    Update-PackerRecoveryPresentation $view $(if($Action -eq 'inspect'){'checking'}else{'restoring'})
    $view.progress.Value=0;$view.progress.IsIndeterminate=[Windows.SystemParameters]::ClientAreaAnimation;[Windows.Automation.AutomationProperties]::SetName($view.progress,('正在'+$(if($Action -eq 'inspect'){'只读检查'}else{'恢复'})+'；总体进度百分比未知'))
    $view.result.Text=if($Action -eq 'inspect'){'正在校验 ZIP、Manifest、CRC/SHA-256、文件范围及当前运行时/宿主证明……'}else{'执行前重新验证 ZIP 与目标，随后调用原恢复器写入全新 Home。请等待安全收尾。'}
  }catch{
    $script:inspection=$null
    if($started){$script:worker=$process;$script:busy=$true;$script:protocolFailed=$true;$view.result.Text='ASSISTANT_RESULT_INVALID：后台操作已启动，界面结果暂不可确认。正在等待工作进程安全退出；不要强行关闭。'}
    else{$view.result.Text='ASSISTANT_WORKER_FAILED：未启动恢复；请检查运行时和工具包。';Update-PackerRecoveryPresentation $view 'failed';$process.Dispose()}
  }
  Update-Gate
}
$view.zip.Add_TextChanged({Invalidate-Inspection});$view.runtime.Add_TextChanged({Invalidate-Inspection})
$view.target.Add_TextChanged({Update-Gate});$view.confirm.Add_Checked({Update-Gate});$view.confirm.Add_Unchecked({Update-Gate})
$view.pickZip.Add_Click({
  $dialog=New-Object Microsoft.Win32.OpenFileDialog;$dialog.Filter='Packer 环境恢复备份 (*.zip)|*.zip';$dialog.CheckFileExists=$true
  try{if($dialog.ShowDialog($view.form) -eq $true){$view.zip.Text=$dialog.FileName}}finally{}
})
$view.pickRuntime.Add_Click({
  $dialog=New-Object Microsoft.Win32.OpenFileDialog;$dialog.Title='选择电脑安装目录中的 DeepSeek Harness.exe（需与备份兼容）';$dialog.Filter='DSH Desktop 可执行文件 (*.exe)|*.exe';$dialog.CheckFileExists=$true
  try{if($dialog.ShowDialog($view.form) -eq $true){$view.runtime.Text=$dialog.FileName}}finally{}
})
$view.pickParent.Add_Click({
  Add-Type -AssemblyName System.Windows.Forms
  if(-not ('PackerFolderOwner' -as [type])){Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition 'using System; using System.Windows.Forms; public class PackerFolderOwner : IWin32Window { public IntPtr Handle {get;set;} }'}
  $owner=New-Object PackerFolderOwner;$owner.Handle=(New-Object Windows.Interop.WindowInteropHelper($view.form)).Handle
  $dialog=New-Object Windows.Forms.FolderBrowserDialog;$dialog.Description='选择已存在的父目录，目标必须是其中不存在的新 Home。';$dialog.ShowNewFolderButton=$false
  try{if($dialog.ShowDialog($owner) -eq 'OK'){$view.target.Text=Join-Path $dialog.SelectedPath 'DSH-Restored'}}finally{$dialog.Dispose()}
})
$view.check.Add_Click({Start-RecoveryOperation 'inspect'});$view.restore.Add_Click({Start-RecoveryOperation 'restore'});$view.close.Add_Click({$view.form.Close()})
$view.form.Add_Closing({param($sender,$event) if($script:busy){$event.Cancel=$true;$view.result.AppendText([Environment]::NewLine+'操作尚未结束，请等待。强行结束进程可能留下私人暂存目录，不能视为恢复完成。')}})
$timer=New-Object Windows.Threading.DispatcherTimer;$timer.Interval=[TimeSpan]::FromMilliseconds(200)
$timer.Add_Tick({
  if(-not $script:busy -or -not $script:worker.HasExited){return}
  if(-not $script:protocolFailed -and (-not $script:output.IsCompleted -or -not $script:errors.IsCompleted)){return}
  try{
    if($script:protocolFailed){throw 'ASSISTANT_RESULT_INVALID'}
    $stdout=$script:output.GetAwaiter().GetResult()
    if($stdout.Length -gt 4194304){throw 'ASSISTANT_RESULT_INVALID'}
    $response=$stdout.Trim() | ConvertFrom-Json
    if($response.ok -ne $true){
      $code=if($response.code -match '^[A-Z0-9_]{1,100}$'){$response.code}else{'ASSISTANT_WORKER_FAILED'}
      $script:inspection=$null;$view.result.Text=$code+'：'+(Get-PackerRecoveryExplanation $code)+[Environment]::NewLine+'操作未成功。恢复错误按原恢复器清理规则处理；清理失败或强行终止时请保留诊断和暂存目录，不要启动它。'
      Update-PackerRecoveryPresentation $view 'failed'
    }elseif($script:action -eq 'inspect'){
      $script:inspection=$response.result;$script:zipChecked=$script:operationZip;$script:runtimeChecked=$script:operationRuntime
      if(($script:worker.ExitCode -eq 0) -ne ($script:inspection.canRestore -eq $true)){throw 'ASSISTANT_RESULT_INVALID'}
      $view.result.Text=Format-PackerInspection $script:inspection
      Update-PackerRecoveryPresentation $view 'inspected' $script:inspection
    }elseif($script:worker.ExitCode -eq 0 -and $response.result.ok -eq $true -and $response.result.requiresStartupValidation -eq $true){
      $script:inspection=$null;$view.result.Text='文件恢复并校验完成。文件数：'+$response.result.verifiedFiles+[Environment]::NewLine+'目标 Home：'+$view.target.Text+[Environment]::NewLine+'恢复后可用性：尚未验证。请使用这个新 DSH_HOME 和独立 agents 目录手动启动兼容的 DSH，验证插件、数据和外部路径。不会自动启动 DSH 或迁移到正式环境。'
      Update-PackerRecoveryPresentation $view 'complete'
    }else{throw 'ASSISTANT_RESULT_INVALID'}
  }catch{Update-PackerRecoveryPresentation $view 'failed';$script:inspection=$null;$view.result.Text='ASSISTANT_RESULT_INVALID：无法确认完整结果。不要把目标或暂存目录当作可用环境；请保留现场核对。'}
  finally{$script:worker.Dispose();$script:worker=$null;$script:busy=$false;$view.confirm.IsChecked=$false;$view.progress.IsIndeterminate=$false;Update-Gate}
})
try{$timer.Start();Update-Gate;[void]$view.form.ShowDialog()}finally{$timer.Stop()}
