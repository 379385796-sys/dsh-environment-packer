param([Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
foreach($name in 'restore-assistant.ps1','restore-window-view.ps1'){
  $tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot ('..\bin\'+$name)),[ref]$tokens,[ref]$errors)
  if($errors.Count){throw ('PowerShell syntax error: '+$name)}
}
. (Join-Path $PSScriptRoot '..\bin\restore-window-view.ps1')
function Pump-View {
  $frame=New-Object Windows.Threading.DispatcherFrame
  [void][Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background,[Action]{$frame.Continue=$false}.GetNewClosure())
  [Windows.Threading.Dispatcher]::PushFrame($frame)
}
function Click-Control($Button){if(-not $Button.IsEnabled){throw 'Test cannot click a disabled operation'};$Button.RaiseEvent((New-Object Windows.RoutedEventArgs([Windows.Controls.Primitives.ButtonBase]::ClickEvent)));Pump-View}
$checks=New-Object 'System.Collections.Generic.List[string]';$view=New-PackerRestoreView
try{
  $view.form.ShowInTaskbar=$false;$view.form.Opacity=0;$view.form.Show();Pump-View;Set-PackerRestoreGate $view $false $null
  if($view.restore.IsEnabled -or $view.next.IsEnabled -or $view.restore.IsDefault -or $view.restore.IsCancel){throw 'Unsafe default confirmation'}
  $checks.Add('No forward navigation or default-key recovery without inspection')
  $view.zip.Text=Join-Path $TestRoot 'synthetic.zip';$view.runtime.Text='D:\Synthetic\DSH.exe';$view.target.Text=Join-Path $TestRoot ('new-home-'+[guid]::NewGuid().ToString('N'));$view.confirm.IsChecked=$true
  $report=@{canRestore=$true;archiveIntegrity=@{state='valid';sha256=('a'*64);files=12;bytes=48};recoveryCompatibility=@{state='compatible'};backup=@{format='dsh-private-recovery/2';dshVersion='0.2.1-rc.5';platform='win32';arch='x64';createdAt='2026-11-02T00:00:00Z'}}
  Set-PackerRestoreGate $view $false $report;if(-not $view.restore.IsEnabled -or -not $view.next.IsEnabled){throw 'Explicit valid recovery not enabled'}
  foreach($state in 'unavailable','blocked','not-checked'){$report.recoveryCompatibility.state=$state;Set-PackerRestoreGate $view $false $report;if($view.restore.IsEnabled -or $view.next.IsEnabled){throw 'Compatibility bypass'}}
  $report.recoveryCompatibility.state='compatible';$report.archiveIntegrity.state='invalid';Set-PackerRestoreGate $view $false $report;if($view.restore.IsEnabled){throw 'Archive bypass'}
  $report.archiveIntegrity.state='valid';$report.canRestore=$false;Set-PackerRestoreGate $view $false $report;if($view.restore.IsEnabled){throw 'Report bypass'}
  $report.canRestore=$true;Set-PackerRestoreGate $view $true $report
  if($view.restore.IsEnabled -or $view.close.IsEnabled -or $view.closeCaption.IsEnabled -or $view.zip.IsEnabled -or $view.next.IsEnabled -or $view.stepBackup.IsEnabled){throw 'Busy state did not freeze operation/navigation'}
  $checks.Add('Archive, compatibility and busy gates remain independent')
  Set-PackerRestoreGate $view $false $report;$view.confirm.IsChecked=$false;Set-PackerRestoreGate $view $false $report;if($view.restore.IsEnabled){throw 'Private confirmation bypass'}
  $view.confirm.IsChecked=$true;$view.target.Text=$TestRoot;Set-PackerRestoreGate $view $false $report;if($view.restore.IsEnabled){throw 'Existing target enabled'}
  $view.target.Text=Join-Path $TestRoot ('missing-parent-'+[guid]::NewGuid().ToString('N')+'\child');Set-PackerRestoreGate $view $false $report;if($view.restore.IsEnabled -or $view.targetFeedback.Text -notmatch '上一级目录不存在'){throw 'Missing parent not explained/refused'}
  $checks.Add('Private consent and fresh target required; existing targets and missing parents refused')
  $view.runtime.Text='';$report.canRestore=$false;$report.recoveryCompatibility.state='unavailable';Set-PackerRestoreGate $view $false $report
  if($view.next.IsEnabled -or $view.gateReason.Text -notmatch 'DeepSeek Harness.exe'){throw 'Missing Desktop program did not explain blocked navigation'}
  $view.runtime.Text='D:\Synthetic\DSH.exe';$report.canRestore=$true;$report.recoveryCompatibility.state='compatible'
  $checks.Add('Archive-only inspection explains the separate Desktop program requirement')
  if((Format-PackerInspection $report) -notmatch '恢复后可用性：未验证'){throw 'Verification states conflated'}
  Update-PackerRecoveryPresentation $view 'inspected' $report;$checks.Add('Integrity/compatibility do not imply startup usability')
  foreach($size in @(@(1020,860),@(720,600))){$view.form.Width=$size[0];$view.form.Height=$size[1];foreach($page in 0,1,2){& $view.ShowPage $page;$view.form.UpdateLayout();Pump-View
    if($view.scroll.ScrollableWidth -gt 1){throw 'Horizontal overflow'}
    if($page -eq 1 -and -not $view.confirm.IsVisible){throw 'Private confirmation hidden off-page'}
    foreach($button in @($view.next,$view.restore,$view.close,$view.back,$view.confirm)){if($button.IsVisible){$at=$button.TranslatePoint((New-Object Windows.Point(0,0)),$view.form);if($at.X -lt 0 -or $at.X+$button.ActualWidth -gt $view.form.ActualWidth -or $at.Y+$button.ActualHeight -gt $view.form.ActualHeight){throw 'Footer action clipped'}}}
  }}
  & $view.ShowPage 0;$checks.Add('All stages reflow at 1020x860 and 720x600 with fixed actions reachable')
  if((ConvertTo-PackerProcessArgument 'D:\space path\') -ne '"D:\space path\\"' -or (ConvertTo-PackerProcessArgument 'a"b') -ne '"a\"b"'){throw 'Worker quoting failed'}
  $checks.Add('Worker argv preserves spaces, quotes and trailing slashes')
}finally{$view.form.Close()}
$state=Get-Content -LiteralPath (Join-Path $TestRoot 'acceptance-state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$driver=Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\bin\restore-assistant.ps1') -Raw -Encoding UTF8
$entry=$driver.IndexOf('try{$timer.Start();Update-Gate;[void]$view.form.ShowDialog()}');if($entry -lt 0){throw 'Controller entry changed'}
$bin=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\bin'))
. ([scriptblock]::Create($driver.Substring(0,$entry).Replace('$PSScriptRoot',("'"+$bin.Replace("'","''")+"'"))))
function Wait-Worker {
  $deadline=[DateTime]::UtcNow.AddSeconds(120)
  while($script:busy -and [DateTime]::UtcNow -lt $deadline){Pump-View;Start-Sleep -Milliseconds 30}
  if($script:busy){throw 'Worker timeout'}
}
try{
  $view.form.ShowInTaskbar=$false;$view.form.Opacity=0;$view.form.Show();$timer.Start();Pump-View
  $view.zip.Text=$state.zip;$view.runtime.Text='D:\DeepSeek Harness\DeepSeek Harness.exe';$view.target.Text=Join-Path $TestRoot ('wpf-controller-'+[guid]::NewGuid().ToString('N'))
  $originalPresentation=(Get-Item Function:Update-PackerRecoveryPresentation).ScriptBlock
  $script:injectDisplayFailure=$true
  function Update-PackerRecoveryPresentation($View,[string]$Phase,$Report=$null){if($script:injectDisplayFailure -and $Phase -eq 'checking'){$script:injectDisplayFailure=$false;throw 'SYNTHETIC_DISPLAY_FAILURE'};& $originalPresentation $View $Phase $Report}
  Click-Control $view.check
  if(-not $script:busy -or $null -eq $script:worker){throw 'Started worker tracking lost after display failure'}
  Wait-Worker
  if($view.restore.IsEnabled -or $null -ne $script:inspection){throw 'Unconfirmed display failure authorized restore'}
  Set-Item Function:Update-PackerRecoveryPresentation -Value $originalPresentation
  $checks.Add('Presentation failure after worker start retains process tracking and closes recovery gate')
  Click-Control $view.check
  if($script:busy){$view.form.Close();if(-not $view.form.IsVisible){throw 'Busy window was closed'}}
  Wait-Worker
  if($script:inspection.canRestore -ne $true -or $view.result.Text -notmatch '文件哈希正确，不等于全部业务数据均已备份'){throw 'Real inspection failed'}
  Click-Control $view.next;$view.confirm.IsChecked=$true;$view.zip.Text=$state.zip+'.changed'
  if($view.restore.IsEnabled -or $view.next.IsEnabled -or $script:inspection -or $view.page -ne 0 -or $view.confirm.IsChecked){throw 'Changed source retained approval/consent'}
  $checks.Add('Real worker inspection; busy window close refused; changed ZIP revokes consent/navigation')
  $view.zip.Text=$state.zip;Click-Control $view.check;Wait-Worker;Click-Control $view.next;$view.confirm.IsChecked=$true;Click-Control $view.restore;Wait-Worker
  if(-not(Test-Path -LiteralPath (Join-Path $view.target.Text 'PACKER-RESTORE-RESULT.json')) -or $view.result.Text -notmatch '尚未验证' -or $view.page -ne 2){throw 'Real restore completion failed'}
  $checks.Add('Original restore worker writes fresh synthetic Home; startup remains unverified')
  $output=if($env:DSH_PACKER_EVIDENCE_DIR){$env:DSH_PACKER_EVIDENCE_DIR}else{$TestRoot}
  @{status='PASS';ui='WPF/XAML';checks=@($checks);controllerAndWorker=$true;humanDesktopAcceptance=$false} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'restore-view-results.json') -Encoding UTF8
  Write-Output "PASS WPF view/controller: $($checks.Count) focused checks"
}finally{$timer.Stop();$script:busy=$false;$view.form.Close()}
