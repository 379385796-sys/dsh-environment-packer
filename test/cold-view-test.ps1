param([Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot '..\bin\cold-window-view.ps1')
$view=New-PackerAssistantView 'D:\Synthetic\private.zip'
$checks=New-Object 'System.Collections.Generic.List[string]'
try {
  if($view.confirmExit.Enabled -or $view.open.Enabled){throw 'Unsafe initial actions'}
  if($null -ne $view.form.AcceptButton -or $null -ne $view.form.CancelButton){throw 'Unsafe default shortcut'}
  $checks.Add('existing readiness gate retained; no default Enter/Escape confirmation')
  $view.form.Show();$view.form.PerformLayout()
  foreach($mode in 0,1,2){$view.theme.SelectedIndex=$mode;$view.form.PerformLayout();if($view.form.BackColor -eq $view.form.ForeColor){throw 'Invisible theme'}}
  $checks.Add('system/light/dark render actual native controls')
  foreach($width in 560,760){foreach($font in 10.5,18,22){
    $view.form.Width=$width;$view.size.Value=$font
    Update-PackerAssistantState $view @{phase='waiting';files=0;writers=0;exitConfirmed=$false}
    $view.form.PerformLayout()
    if($view.hostPanel.DisplayRectangle.Width -gt $view.hostPanel.ClientSize.Width){throw "Horizontal overflow ${width}px ${font}pt"}
    foreach($button in @($view.confirmExit,$view.cancel)){
      if($button.Right -gt $button.Parent.ClientSize.Width){throw "Action clipped ${width}px ${font}pt"}
    }
  }}
  $checks.Add('narrow window / large font: no horizontal overflow or clipped actions; vertical scrolling allowed')
  $view.form.Width=760;$view.size.Value=10.5
  foreach($phase in 'waiting','scanning','writing','verifying'){
    Update-PackerAssistantState $view @{phase=$phase;files=12640;writers=0;exitConfirmed=$false}
    if($view.confirmExit.Enabled -or $view.open.Enabled){throw 'Presentation bypassed readiness gate'}
    $step=$view.steps.Active
    Update-PackerAssistantState $view @{phase='failed';failurePhase=$phase;files=0;error='SYNTHETIC_FAILURE'}
    if($view.steps.Active -ne $step -or -not $view.steps.FailureKnown){throw "Wrong explicit failure stage: $phase"}
  }
  $checks.Add('explicit failure stage maps to exit/check/packing/verification, never fixed to environment check')
  Update-PackerAssistantState $view @{phase='writing';files=12640}
  Update-PackerAssistantState $view @{phase='failed';files=0;error='SYNTHETIC_FAILURE'}
  if($view.subtitle.Text -notmatch '失败阶段未记录.*文件打包' -or $view.steps.FailureKnown -or $view.steps.Active -ne -1){throw 'Missing failure stage presented as known'}
  if($view.count.Text -notmatch '12,640' -or $view.unit.Text -notmatch '最后观察'){throw 'Real observed count lost on terminal reset'}
  $checks.Add('missing failure phase stays unknown; last observed packing and count retained with qualifiers')
  Update-PackerAssistantState $view @{phase='verifying';files=21064}
  if($view.progress.AccessibilityObject.Value -notmatch '百分比未知'){throw 'False overall percentage'}
  Update-PackerAssistantState $view @{phase='success';files=21064;bytes=50960793}
  if($view.count.AccessibilityObject.Name -notmatch '21,064' -or $view.instructions.AccessibilityObject.Name -notmatch '恢复业务'){throw 'Success accessibility or business distinction lost'}
  $view.cancel.Text='关闭'
  if($view.cancel.AccessibilityObject.Name -ne '关闭'){throw 'Stale action accessible name'}
  foreach($control in @($view.confirmExit,$view.cancel,$view.open,$view.label,$view.progress)){
    if([string]::IsNullOrWhiteSpace($control.AccessibilityObject.Name)){throw 'Missing accessible name'}
  }
  $checks.Add('indeterminate progress, true counts and file/business verification distinction accessible')
  @{status='PASS';checks=@($checks);actualScreenReaderSpeech=$false;nativeControls=$true} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $TestRoot 'cold-view-results.json') -Encoding UTF8
  Write-Output "PASS cold-view: $($checks.Count) focused checks"
} finally {$view.form.Close();$view.form.Dispose()}
