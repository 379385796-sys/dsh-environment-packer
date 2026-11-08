param([Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
. (Join-Path $PSScriptRoot '..\bin\cold-window-view.ps1')
$v=New-PackerAssistantView ('D:\Synthetic\'+('long-path\'*12)+'private.zip')
$checks=New-Object 'System.Collections.Generic.List[string]'
function Pump([int]$Milliseconds){$watch=[Diagnostics.Stopwatch]::StartNew();while($watch.ElapsedMilliseconds -lt $Milliseconds){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 10}}
try{
 $v.form.ShowInTaskbar=$false;$v.form.Opacity=0;$v.form.Show();Pump 50
 $button=$v.confirmExit;$before=$v.form.Bounds;$buttonBounds=$button.Bounds
 $flags=[Reflection.BindingFlags]'Instance,NonPublic'
 $args=New-Object object[] 1;$args[0]=[EventArgs]::Empty
 [void]$button.GetType().GetMethod('OnMouseEnter',$flags).Invoke($button,$args)
 Pump 240
 $motion=$button.GetType().GetField('hoverMotion',$flags).GetValue($button)
 if($motion.Running -or $motion.Value -ne 1 -or $v.form.Bounds -ne $before -or $button.Bounds -ne $buttonBounds){throw 'HOVER_DID_NOT_SETTLE_WITH_FIXED_BOUNDS'}
 $checks.Add('finite hover settles within 240ms without resizing button or window')
 $button.ReducedMotion=$true
 [void]$button.GetType().GetMethod('OnMouseLeave',$flags).Invoke($button,$args)
 if($motion.Running -or $motion.Value -ne 0){throw 'REDUCED_MOTION_NOT_IMMEDIATE'}
 $checks.Add('reduced motion snaps immediately and stops timer')
 foreach($theme in 1,2){
  $v.theme.SelectedIndex=$theme
  foreach($phase in 'waiting','scanning','writing','verifying','success','failed','cancelled','unknown'){
   Update-PackerAssistantState $v @{phase=$phase;files=123;writers=0;exitConfirmed=$false;target='D:\Synthetic\private.zip';sha256=('a'*64);bytes=456;error=$(if($phase -eq 'failed'){'SOURCE_CHANGED'}else{''});failurePhase='writing';coverage=@{schema=1;state='no-known-critical-gaps';criticalCount=0;criticalCodes=@();truncated=$false;recoveryBlocked=$false;blockReason=$null}}
   Pump 240
   foreach($key in 'steps','glyph'){$m=$v[$key].GetType().GetField('stateMotion',$flags).GetValue($v[$key]);if($m.Running){throw 'STATE_TIMER_DID_NOT_STOP'}}
   if($v.footer.Bottom -gt $v.form.ClientSize.Height -or $v.hostPanel.DisplayRectangle.Width -gt $v.hostPanel.ClientSize.Width){throw 'STATE_OVERFLOW'}
   $bmp=New-Object Drawing.Bitmap($v.form.Width,$v.form.Height)
   try{$v.form.DrawToBitmap($bmp,(New-Object Drawing.Rectangle(0,0,$bmp.Width,$bmp.Height)));$bmp.Save((Join-Path $TestRoot ('v070-theme'+$theme+'-'+$phase+'.png')))}finally{$bmp.Dispose()}
  }
 }
 $checks.Add('both palettes and all eight task states render, settle and retain footer/long-path layout')
 $v.steps.ReducedMotion=$true;$v.steps.Active=2
 if($v.steps.GetType().GetField('stateMotion',$flags).GetValue($v.steps).Running){throw 'STEP_REDUCED_MOTION_FAILED'}
 $checks.Add('step updates preserve immediate actual state with reduced motion')
 $stable=@{phase='waiting';files=123;writers=0;exitConfirmed=$false}
 Update-PackerAssistantState $v $stable;Pump 240
 $script:stepInvalidations=0;$v.steps.Add_Invalidated({$script:stepInvalidations++})
 Update-PackerAssistantState $v $stable;Pump 230
 if($script:stepInvalidations -ne 0){throw 'IDENTICAL_STATE_RESTARTED_REPAINT'}
 $checks.Add('identical state polling does not restart animations or step repaint')
}finally{$v.form.Close();$v.form.Dispose()}
@{status='PASS';checks=@($checks);syntheticOnly=$true;real150DPITested=$false}|ConvertTo-Json -Depth 4|Set-Content -Encoding UTF8 (Join-Path $TestRoot 'v070-motion-result.json')
Write-Output ('PASS v0.7 motion: '+$checks.Count+' groups')
