param([Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
. (Join-Path $PSScriptRoot '..\bin\cold-window-view.ps1')
$v=New-PackerAssistantView 'D:\合成\含中文的备份目录\private.zip';$checks=New-Object 'System.Collections.Generic.List[string]'
try{
  $v.form.ShowInTaskbar=$false;$v.form.Opacity=0;$v.form.Show();Update-PackerAssistantState $v @{phase='waiting';files=0;writers=0;exitConfirmed=$false};[Windows.Forms.Application]::DoEvents()
  if($v.form.FormBorderStyle -ne 'FixedDialog' -or $v.form.MaximizeBox -or -not $v.form.MinimizeBox -or $v.form.SizeGripStyle -ne 'Hide'){throw 'WINDOW_NOT_FIXED'}
  $area=[Windows.Forms.Screen]::FromControl($v.form).WorkingArea;if(-not $area.Contains($v.form.Bounds)){throw 'WINDOW_OUTSIDE_WORK_AREA'}
  if($v.prefs.Visible -or $v.logs.Visible -or $v.footer.Parent -ne $v.form){throw 'FOOTER_OR_DEFAULT_STATE_INVALID'}
  if($v.pageScroll.MaximumPosition -ne 0){throw 'DEFAULT_FLOW_REQUIRES_PAGE_SCROLL'}
  $checks.Add('fixed dialog disables resize/maximize, retains minimize, fits current work area, and default flow fits one page')
  foreach($theme in 1,2){$v.theme.SelectedIndex=$theme;foreach($font in 10.5,22){$v.size.Value=$font;foreach($expanded in $false,$true){$v.logs.Visible=$expanded;$v.prefs.Visible=$expanded;&$v.Layout;[Windows.Forms.Application]::DoEvents();$v.pageScroll.ScrollTo($v.pageScroll.MaximumPosition);if($v.footer.Bottom -gt $v.form.ClientSize.Height -or $v.footer.Top -lt 0 -or $v.footer.Top -lt $v.viewport.Bottom){throw 'FOOTER_NOT_FIXED_VISIBLE'};if($v.hostPanel.DisplayRectangle.Width -gt $v.hostPanel.ClientSize.Width){throw 'HORIZONTAL_OVERFLOW'}}}}
  $checks.Add('both palettes, details/settings and large fonts retain a visible fixed footer with internal scroll fallback')
}finally{$v.form.Close();$v.form.Dispose()}
. (Join-Path $PSScriptRoot '..\bin\restore-window-view.ps1')
$w=New-PackerRestoreView 'migrate-window.xaml'
try{
  $w.form.ShowInTaskbar=$false;$w.form.Opacity=0;$w.form.Show();$w.form.UpdateLayout()
  foreach($key in 'zip','runtime','target','check'){$c=$w[$key];$r=$c.TransformToAncestor($w.scroll).TransformBounds((New-Object Windows.Rect(0,0,$c.ActualWidth,$c.ActualHeight)));if($r.Top -lt 0 -or $r.Bottom -gt $w.scroll.ViewportHeight){throw ('WPF_PRIMARY_OPERATION_OFFSCREEN '+$key)}}
  if($w.form.FindName('InspectionDetails').IsExpanded){throw 'DETAILS_NOT_COLLAPSED'}
  $checks.Add('default WPF ZIP/install/Workspace/check controls fit the viewport; long diagnostics are collapsed and internally scrollable')
}finally{$w.form.Close()}
$bin=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\bin'));$driver=Get-Content (Join-Path $bin 'migrate-assistant.ps1') -Raw -Encoding UTF8;$entry=$driver.IndexOf('try{$timer.Start();Update-MigrationGate;[void]$view.form.ShowDialog()}');if($entry -lt 0){throw 'CONTROLLER_ENTRY_CHANGED'}
. ([scriptblock]::Create($driver.Substring(0,$entry).Replace('$PSScriptRoot',("'"+$bin.Replace("'","''")+"'"))))
$previous=$env:DSH_HOME
try{
  $fake=Join-Path $TestRoot ('synthetic-official-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory((Join-Path $fake 'child'));$env:DSH_HOME=$fake
  $view.zip.Text=Join-Path $TestRoot 'synthetic.zip';$view.runtime.Text='D:\DeepSeek Harness';$view.target.Text=Join-Path $fake 'child\new-workspace';Invoke-MigrationOperation 'plan'
  if($script:worker -or $script:requestDir -or $view.result.Text -notmatch 'OFFICIAL_HOME_REFUSED' -or @(Get-ChildItem -LiteralPath (Join-Path $fake 'child') -Force).Count){throw 'GUI_WROTE_BEFORE_HOME_REFUSAL'}
  $checks.Add('GUI refuses a formal-Home parent before creating requests or spawning a worker, verified with a synthetic Home')
}finally{$env:DSH_HOME=$previous;$timer.Stop();$view.form.Close()}
@{status='PASS';checks=@($checks);real150DPITested=$false;syntheticOnly=$true}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $TestRoot 'final-layout-result.json') -Encoding UTF8
Write-Output ('PASS final layout/gate: '+$checks.Count)
