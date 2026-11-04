param([Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
$bin=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\bin'))
foreach($name in 'migrate-assistant.ps1','restore-window-view.ps1','restore-entry.ps1','cold-processes.ps1'){
  $tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile((Join-Path $bin $name),[ref]$tokens,[ref]$errors);if($errors.Count){throw ('POWERSHELL_PARSE_FAILED '+$name)}
}
$driver=Get-Content -LiteralPath (Join-Path $bin 'migrate-assistant.ps1') -Raw -Encoding UTF8
$entry=$driver.IndexOf('try{$timer.Start();Update-MigrationGate;[void]$view.form.ShowDialog()}');if($entry -lt 0){throw 'CONTROLLER_ENTRY_CHANGED'}
. ([scriptblock]::Create($driver.Substring(0,$entry).Replace('$PSScriptRoot',("'"+$bin.Replace("'","''")+"'"))))
function Pump { $frame=New-Object Windows.Threading.DispatcherFrame;[void][Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background,[Action]{$frame.Continue=$false}.GetNewClosure());[Windows.Threading.Dispatcher]::PushFrame($frame) }
function Click($button){if(-not $button.IsEnabled){throw 'DISABLED_OPERATION'};$button.RaiseEvent((New-Object Windows.RoutedEventArgs([Windows.Controls.Primitives.ButtonBase]::ClickEvent)));Pump}
function Wait-Worker { $until=[DateTime]::UtcNow.AddSeconds(240);while($script:busy -and [DateTime]::UtcNow -lt $until){Pump;Start-Sleep -Milliseconds 60};if($script:busy){throw 'WPF_WORKER_TIMEOUT'} }
$checks=New-Object 'System.Collections.Generic.List[string]'
try{
  $fixture=Get-Content -LiteralPath (Join-Path $TestRoot 'migration-smoke-result.json') -Raw -Encoding UTF8|ConvertFrom-Json
  $view.form.ShowInTaskbar=$false;$view.form.Opacity=0;$view.form.Show();$timer.Start();Pump
  $view.zip.Text=Join-Path $fixture.dir 'backup.zip';$view.runtime.Text='D:\DeepSeek Harness';$view.target.Text=Join-Path $fixture.dir ('WPF Workspace Ω '+[guid]::NewGuid().ToString('N'))
  Update-MigrationGate;if($view.restore.IsEnabled){throw 'UNPLANNED_APPLY_ENABLED'}
  Click $view.check;Wait-Worker;if($null -eq $script:plan -or $script:plan.canApply -ne $true){throw ('PLAN_FAILED '+$view.result.Text)}
  $first=$script:plan.planSHA256;$view.confirm.IsChecked=$true;$view.target.Text=Join-Path $fixture.dir ('WPF new Workspace 中文 '+[guid]::NewGuid().ToString('N'))
  if($script:plan -or $view.confirm.IsChecked -or $view.restore.IsEnabled){throw 'STALE_PLAN_ALLOWED'};$checks.Add('ZIP and both user paths; changing workspace revokes plan and consent')
  Click $view.check;Wait-Worker;if($null -eq $script:plan){throw ('REPLAN_FAILED '+$view.result.Text)}
  Click $view.next;$view.confirm.IsChecked=$true;Update-MigrationGate;Click $view.restore
  $view.form.Close();if(-not $view.form.IsVisible){throw 'BUSY_CLOSE_ALLOWED'};Wait-Worker
  if($view.result.Text -notmatch 'committed' -or $view.result.Text -notmatch 'startupVerified'){throw ('RESTORE_FAILED '+$view.result.Text)}
  $checks.Add('Real WPF handlers and migration worker complete apply, two starts, verify and commit');$checks.Add('Busy close refused and no stale confirmation reuse')
  $output=@{status='PASS';syntheticOnly=$true;componentInvisible=$true;checks=@($checks);result=($view.result.Text|ConvertFrom-Json)}
  $output|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $TestRoot 'migration-wpf-result.json') -Encoding UTF8
  Write-Output ('PASS migration WPF: '+$checks.Count)
}finally{$timer.Stop();if(-not $script:busy){$view.form.Close()}}
