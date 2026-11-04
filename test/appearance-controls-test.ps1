param([Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
. (Join-Path $PSScriptRoot '..\bin\cold-window-view.ps1')
$view=New-PackerAssistantView 'D:\含中文的隔离验收路径\完整环境.zip'
$checks=New-Object 'System.Collections.Generic.List[string]'
try{
  $view.form.ShowInTaskbar=$false;$view.form.Opacity=0;$view.form.Show();$view.prefs.Visible=$true
  foreach($theme in 1,2){
    $view.theme.SelectedIndex=$theme;&$view.Layout;[Windows.Forms.Application]::DoEvents()
    if($view.destination.Height -lt $view.destination.Font.Height){throw 'EXPANDED_SETTINGS_HIDES_DESTINATION'}
    if($view.destination.Bottom -gt $view.destination.Parent.ClientSize.Height-$view.destination.Parent.Padding.Bottom){throw 'DESTINATION_CLIPPED_BY_PARENT'}
    $numeric=$view.size.Controls|ForEach-Object {$_.Controls}|Where-Object {$_ -is [Windows.Forms.NumericUpDown]}
    if($numeric.Right -le $numeric.Parent.ClientSize.Width){throw 'SPINNER_CLIP_GUARD_MISSING'}
    foreach($part in $numeric.Controls){if($part -isnot [Windows.Forms.TextBox] -and $part.Visible){throw 'NATIVE_SPINNER_REAPPEARED'}}
    $view.theme.OpenList();[Windows.Forms.Application]::DoEvents()
    $list=$view.theme.GetType().GetField('list',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($view.theme)
    $bitmap=New-Object Drawing.Bitmap($list.Width,$list.Height)
    try{$list.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$list.Width,$list.Height)))
      foreach($row in 0,1,2){$ink=0;for($x=10;$x -lt $bitmap.Width-15;$x++){for($y=$row*$list.ItemHeight+4;$y -lt ($row+1)*$list.ItemHeight-4;$y++){$pixel=$bitmap.GetPixel($x,$y);if([Math]::Abs($pixel.R-$list.BackColor.R)+[Math]::Abs($pixel.G-$list.BackColor.G)+[Math]::Abs($pixel.B-$list.BackColor.B) -gt 180){$ink++}}};if($ink -lt 10){throw 'POPUP_ROW_WAS_ERASED'}}
    }finally{$bitmap.Dispose();$popup=$view.theme.GetType().GetField('popup',[Reflection.BindingFlags]'Instance,NonPublic').GetValue($view.theme);$popup.Close()}
  }
  $checks.Add('all three real owner-drawn popup rows retain text in both palettes')
  $checks.Add('expanded settings retain visible destination text height')
  if($view.size.Minimum -ne 9 -or $view.size.Maximum -ne 22 -or $view.size.Increment -ne .5 -or $view.size.DecimalPlaces -ne 1){throw 'NUMERIC_CONTRACT_CHANGED'}
  $native=$view.size.Controls|ForEach-Object {$_.Controls}|Where-Object {$_ -is [Windows.Forms.NumericUpDown]}
  $native.Text='999';if($view.size.Value -ne 22){throw 'MAXIMUM_NOT_CLAMPED'}
  $native.Text='1';if($view.size.Value -ne 9){throw 'MINIMUM_NOT_CLAMPED'}
  $native.Text='10.5';if($view.size.Value -ne 10.5){throw 'DECIMAL_INPUT_FAILED'}
  $native.UpButton();if($view.size.Value -ne 11 -or $view.form.Font.Size -ne 11){throw 'LIVE_INCREMENT_FAILED'}
  $native.Text='invalid';if($view.size.Value -ne 11){throw 'INVALID_INPUT_CHANGED_VALUE'}
  $checks.Add('native decimal validation, range, half-point step and immediate font update retained')
  foreach($width in 560,780){foreach($font in 9,10.5,22){$view.form.Width=$width;$view.size.Value=$font;&$view.Layout;[Windows.Forms.Application]::DoEvents();if($view.hostPanel.DisplayRectangle.Width -gt $view.hostPanel.ClientSize.Width){throw 'HORIZONTAL_OVERFLOW'}}}
  $checks.Add('expanded bar wraps at narrow widths and original supported font extremes')
  @{status='PASS';checks=@($checks);actualDPI=$view.form.CreateGraphics().DpiX;real150DPITested=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $TestRoot 'appearance-controls-result.json') -Encoding UTF8
  Write-Output ('PASS appearance controls: '+$checks.Count)
}finally{$view.form.Close();$view.form.Dispose()}
