param([Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
. (Join-Path $PSScriptRoot '..\bin\cold-window-view.ps1')
$target='D:\合成\含中文的备份目录\private.zip'
$v=New-PackerAssistantView $target
$checks=New-Object 'System.Collections.Generic.List[string]'
function Lum([Drawing.Color]$c){$parts=@($c.R,$c.G,$c.B)|ForEach-Object {$x=$_/255.0;if($x -le .03928){$x/12.92}else{[Math]::Pow((($x+.055)/1.055),2.4)}};0.2126*$parts[0]+0.7152*$parts[1]+0.0722*$parts[2]}
function Ratio([Drawing.Color]$a,[Drawing.Color]$b){$l1=Lum $a;$l2=Lum $b;([Math]::Max($l1,$l2)+.05)/([Math]::Min($l1,$l2)+.05)}
function Assert-Contrast([Drawing.Color]$a,[Drawing.Color]$b,[double]$min,[string]$name){$r=Ratio $a $b;if($r -lt $min){throw ("CONTRAST_$name="+$r.ToString('0.00'))};$r}
try{
  $v.form.ShowInTaskbar=$false;$v.form.Opacity=0;$v.form.Show();$v.theme.SelectedIndex=1;&$v.ApplyTheme;[Windows.Forms.Application]::DoEvents()
  $lightPrimary=Assert-Contrast $v.confirmExit.Accent $v.confirmExit.OnAccent 4.5 'LIGHT_PRIMARY'
  $lightText=Assert-Contrast $v.title.ForeColor $v.summary.BackColor 4.5 'LIGHT_TEXT'
  $lightMuted=Assert-Contrast $v.subtitle.ForeColor $v.summary.BackColor 4.5 'LIGHT_MUTED'
  $lightDisabled=Assert-Contrast $v.confirmExit.DisabledText $v.confirmExit.DisabledFill 3.0 'LIGHT_DISABLED'
  if(($v.confirmExit.Accent.R + $v.confirmExit.Accent.G + $v.confirmExit.Accent.B) -lt 220){throw 'LIGHT_PRIMARY_STILL_DARK'}
  $checks.Add(('light palette: primary contrast {0:0.00}, text {1:0.00}, muted {2:0.00}, disabled {3:0.00}; primary is not a dark block' -f $lightPrimary,$lightText,$lightMuted,$lightDisabled))
  $v.theme.SelectedIndex=2;&$v.ApplyTheme;[Windows.Forms.Application]::DoEvents()
  $darkPrimary=Assert-Contrast $v.confirmExit.Accent $v.confirmExit.OnAccent 4.5 'DARK_PRIMARY'
  $darkText=Assert-Contrast $v.title.ForeColor $v.summary.BackColor 4.5 'DARK_TEXT'
  $darkMuted=Assert-Contrast $v.subtitle.ForeColor $v.summary.BackColor 4.5 'DARK_MUTED'
  $checks.Add(('dark palette: primary contrast {0:0.00}, text {1:0.00}, muted {2:0.00}' -f $darkPrimary,$darkText,$darkMuted))
  $darkHeader=Assert-Contrast $v.toggle.ForeColor $v.header.BackColor 4.5 'DARK_HEADER_BUTTON'
  $darkCopy=Assert-Contrast $v.copyPath.ForeColor $v.saveCard.BackColor 4.5 'DARK_COPY_BUTTON'
  $darkCancel=Assert-Contrast $v.cancel.ForeColor $v.cancel.BackColor 4.5 'DARK_CANCEL'
  $darkChoice=Assert-Contrast $v.theme.ForeColor $v.theme.BackColor 4.5 'DARK_CHOICE'
  $darkDisabled=Assert-Contrast $v.confirmExit.DisabledText $v.confirmExit.DisabledFill 3.0 'DARK_DISABLED'
  $v.logs.Visible=$true;&$v.Layout;[Windows.Forms.Application]::DoEvents()
  $darkLog=Assert-Contrast $v.label.ForeColor $v.label.BackColor 4.5 'DARK_LOG_TEXT'
  $v.logs.Visible=$false;&$v.Layout
  $checks.Add(('dark controls: header {0:0.00}, copy {1:0.00}, cancel {2:0.00}, choice {3:0.00}, disabled {4:0.00}, log {5:0.00}' -f $darkHeader,$darkCopy,$darkCancel,$darkChoice,$darkDisabled,$darkLog))
  $v.theme.SelectedIndex=1;&$v.ApplyTheme

  Update-PackerAssistantState $v @{phase='success';files=21064;bytes=50960793;sha256=('a'*64);target=$target;at=1793853731000;dependencyIssues=1;verified=$true;cleanup=$true}
  if($v.title.Text -ne '归档完成（覆盖状态未记录）' -or -not $v.resultCard.Visible -or $v.saveCard.Visible){throw 'SUCCESS_PAGE_INVALID'}
  if($v.resultTitle.Text -ne '归档完成（覆盖状态未记录）' -or $v.resultNote.Text -notmatch '本次记录未含覆盖摘要'){throw 'OLD_RECORD_COVERAGE_UNKNOWN_MISSING'}
  if($v.resultPath.Text -ne $target -or $v.resultHash.Text -ne ('a'*64) -or $v.resultIntegrity.Text -notmatch 'ZIP 完整性.*通过' -or $v.resultTime.Text -notmatch '完成时间'){throw 'SUCCESS_DETAILS_MISSING'}
  if(-not $v.compatWarning.Visible -or $v.compatWarningTitle.Text -notmatch '1 项依赖冲突' -or $v.compatWarningBody.Text -notmatch 'ZIP 完整性已通过'){throw 'SUCCESS_COMPAT_WARNING_MISSING'}
  if($v.resultNote.Text -match '依赖冲突'){throw 'CONFLICT_NOTE_NOT_SEPARATED'}
  if($v.resultCaption.Text -ne 'ZIP 完整性通过'){throw 'SUCCESS_PILL_INVALID'}
  $lightWarn=Assert-Contrast $v.compatWarningTitle.ForeColor $v.compatWarning.BackColor 4.5 'LIGHT_WARNING'
  $lightWarnBody=Assert-Contrast $v.compatWarningBody.ForeColor $v.compatWarning.BackColor 4.5 'LIGHT_WARNING_BODY'
  $lightPill=Assert-Contrast $v.resultCaption.ForeColor $v.statusPill.BackColor 4.5 'LIGHT_PILL'
  $checks.Add(('light success: warning {0:0.00}/{1:0.00}, integrity pill {2:0.00}' -f $lightWarn,$lightWarnBody,$lightPill))
  $checks.Add('success page separates ZIP integrity from a restrained recovery-compatibility warning; save card is replaced by the result card')

  Update-PackerAssistantState $v @{phase='success';files=21064;bytes=50960793;sha256=('a'*64);target=$target;at=1793853731000;dependencyIssues=0;verified=$true;cleanup=$true}
  if($v.compatWarning.Visible -or $v.resultNote.Text -notmatch '未记录依赖冲突'){throw 'CLEAN_SUCCESS_WARNING_INVALID'}
  $checks.Add('clean success hides the compatibility warning and states that no dependency conflict was recorded')

  $covGap=@{schema=1;state='critical-gaps';criticalCount=1;criticalCodes=@('CLIENT_PREFERENCE_NOT_CAPTURED');truncated=$false;recoveryBlocked=$true;blockReason='CRITICAL_COVERAGE_GAPS'}
  $covClean=@{schema=1;state='no-known-critical-gaps';criticalCount=0;criticalCodes=@();truncated=$false;recoveryBlocked=$false;blockReason=$null}
  Update-PackerAssistantState $v @{phase='success';files=21064;bytes=50960793;sha256=('a'*64);target=$target;at=1793853731000;dependencyIssues=1;verified=$true;cleanup=$true;coverage=$covGap}
  if($v.title.Text -ne '归档完成；恢复受阻' -or $v.resultTitle.Text -ne '归档完成；恢复受阻'){throw 'BLOCKED_SUCCESS_TITLE_INVALID'}
  if($v.resultCaption.Text -ne 'ZIP 完整性通过' -or $v.resultIntegrity.Text -notmatch '通过'){throw 'BLOCKED_SUCCESS_INTEGRITY_NOT_SEPARATE'}
  if(-not $v.compatWarning.Visible -or $v.compatWarningTitle.Text -notmatch '恢复受阻' -or $v.compatWarningTitle.Text -notmatch '1 项关键覆盖缺口'){throw 'BLOCKED_SUCCESS_WARNING_INVALID'}
  if($v.compatWarningBody.Text -notmatch 'CLIENT_PREFERENCE_NOT_CAPTURED' -or $v.compatWarningBody.Text -notmatch '数据保全'){throw 'BLOCKED_SUCCESS_CODES_MISSING'}
  if($v.resultNote.Text -notmatch '阻断' -or $v.resultNote.Text -notmatch '另建新备份'){throw 'BLOCKED_SUCCESS_NOTE_INVALID'}
  $checks.Add('known critical gaps show 归档完成；恢复受阻 with stable codes while ZIP integrity stays separate')

  Update-PackerAssistantState $v @{phase='success';files=21064;bytes=50960793;sha256=('a'*64);target=$target;at=1793853731000;dependencyIssues=0;verified=$true;cleanup=$true;coverage=$covClean}
  if($v.title.Text -ne '归档完成' -or $v.compatWarning.Visible -or $v.resultNote.Text -notmatch '本次未记录关键覆盖缺口'){throw 'CLEAN_COVERAGE_INVALID'}
  if($v.resultNote.Text -match '恢复已通过' -or $v.resultNote.Text -match '兼容成功'){throw 'CLEAN_COVERAGE_CLAIMS_COMPAT_SUCCESS'}
  $checks.Add('a clean coverage summary never claims recovery compatibility success without a target check')

  foreach($terminalPhase in @('success','failed','cancelled','unknown')){
    Update-PackerAssistantState $v @{phase=$terminalPhase;files=0;error='ASSISTANT_COORDINATOR_EXITED';target=$target;at=1793853731000;zipPresent=$false;coverage=$covClean}
    Set-PackerRecordDurability $v $false
    if(-not $v.hint.Visible -or $v.hint.Text -match '结果已保留' -or $v.resultNote.Text -notmatch '结果记录未持久保存'){throw ('DURABLE_FAILURE_NOT_SHOWN_'+$terminalPhase)}
    if($v.resultIntegrity.Text -notmatch 'ZIP|有效 ZIP'){throw ('ZIP_INTEGRITY_NOT_SEPARATE_'+$terminalPhase)}
  }
  $before=$v.resultNote.Text;Set-PackerRecordDurability $v $true;if($v.resultNote.Text -ne $before){throw 'DURABLE_TRUE_CHANGED_RESULT'}
  $checks.Add('ui-result write failure is reported for all four terminal outcomes; ZIP integrity stays a separate fact')

  Update-PackerAssistantState $v @{phase='failed';files=0;error='PEER_VERSION_MISMATCH';failurePhase='checking-dependencies';target=$target;at=1793853731000;zipPresent=$false}
  if($v.title.Text -ne '备份失败' -or $v.resultTitle.Text -ne '备份失败' -or $v.resultIntegrity.Text -notmatch '未生成' -or $v.resultNote.Text -notmatch '重新备份' -or $v.compatWarning.Visible){throw 'FAILURE_PAGE_INVALID'}
  if($v.resultCaption.Text -ne '未确认成功备份' -or $v.steps.Active -ne 1 -or -not $v.steps.FailureKnown){throw 'FAILURE_STATE_INVALID'}
  $checks.Add('failure page states the reason, no valid ZIP, retry requirement and the exact failed stage')

  Update-PackerAssistantState $v @{phase='cancelled';files=0;error='BACKUP_ABORTED';target=$target;at=1793853731000;zipPresent=$false}
  if($v.title.Text -ne '任务已取消' -or $v.resultTitle.Text -ne '任务已取消' -or $v.resultCaption.Text -ne '已取消' -or $v.resultIntegrity.Text -notmatch '未生成'){throw 'CANCEL_PAGE_INVALID'}
  if($v.resultCaption.Text -match '成功' -or $v.resultIntegrity.Text -match '通过'){throw 'CANCEL_SHOWN_AS_SUCCESS'}
  $checks.Add('cancelled page is explicitly marked cancelled and never reuses success styling or text')

  Update-PackerAssistantState $v @{phase='unknown';files=0;error='ASSISTANT_COORDINATOR_EXITED';target=$target;at=1793853731000;zipPresent=$true}
  if($v.title.Text -ne '结果未确认' -or $v.resultCaption.Text -ne '结果未确认' -or $v.resultIntegrity.Text -notmatch '未确认'){throw 'UNKNOWN_PAGE_INVALID'}
  if($v.resultNote.Text -notmatch '任务与恢复'){throw 'UNKNOWN_RECORD_PATH_MISSING'}
  $checks.Add('interrupted/unknown page keeps an unconfirmed state and points to the persistent Packer record')

  $v.form.Width=560;$v.size.Value=15.75;&$v.Layout;[Windows.Forms.Application]::DoEvents()
  if($v.hostPanel.DisplayRectangle.Width -gt $v.hostPanel.ClientSize.Width){throw 'HORIZONTAL_OVERFLOW_150'}
  foreach($b in @($v.cancel,$v.confirmExit,$v.open)){if($b.Visible -and $b.Right -gt $b.Parent.ClientSize.Width){throw 'ACTION_CLIPPED_150'}}
  $checks.Add('simulated 150% font/width retains no horizontal overflow or clipped actions (real 150% DPI not exercised)')

  $v.size.Value=10.5;$v.form.Width=780;$v.theme.SelectedIndex=2;&$v.ApplyTheme;[Windows.Forms.Application]::DoEvents()
  Update-PackerAssistantState $v @{phase='success';files=21064;bytes=50960793;sha256=('a'*64);target=$target;at=1793853731000;dependencyIssues=1;verified=$true;cleanup=$true}
  $darkWarn=Assert-Contrast $v.compatWarningTitle.ForeColor $v.compatWarning.BackColor 4.5 'DARK_WARNING'
  $darkWarnBody=Assert-Contrast $v.compatWarningBody.ForeColor $v.compatWarning.BackColor 4.5 'DARK_WARNING_BODY'
  $darkPill=Assert-Contrast $v.resultCaption.ForeColor $v.statusPill.BackColor 4.5 'DARK_PILL'
  $checks.Add(('dark success: warning {0:0.00}/{1:0.00}, integrity pill {2:0.00}' -f $darkWarn,$darkWarnBody,$darkPill))
  $bmp=New-Object Drawing.Bitmap($v.summary.Width,$v.summary.Height)
  try{$v.summary.DrawToBitmap($bmp,(New-Object Drawing.Rectangle(0,0,$bmp.Width,$bmp.Height)));$darkInk=0;for($x=0;$x -lt $bmp.Width;$x+=3){for($y=0;$y -lt $bmp.Height;$y+=3){$p=$bmp.GetPixel($x,$y);if(($p.R+$p.G+$p.B)/3 -gt 90){$darkInk++}}};if($darkInk -lt 20){throw 'DARK_CARD_TEXT_MISSING'}}finally{$bmp.Dispose()}
  $checks.Add('dark status card paints readable light text on the layer surface')

  @{status='PASS';checks=@($checks);real150DPITested=$false;syntheticOnly=$true}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $TestRoot 'result-state-result.json') -Encoding UTF8
  Write-Output ('PASS result states: '+$checks.Count)
}finally{$v.form.Close();$v.form.Dispose()}
