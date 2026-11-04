param([Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
. (Join-Path $PSScriptRoot '..\bin\cold-window-view.ps1')
$v=New-PackerAssistantView ('D:\合成\'+('长中文路径\'*8)+'private.zip')
$checks=New-Object 'System.Collections.Generic.List[string]'
try{
  $v.form.ShowInTaskbar=$false;$v.form.Opacity=0;$v.form.Show();[Windows.Forms.Application]::DoEvents()
  $style=[Windows.Forms.Control].GetMethod('GetStyle',[Reflection.BindingFlags]'Instance,NonPublic')
  foreach($key in 'steps','summary','glyph','progress','prefs','theme','size','logScroll'){if(-not $style.Invoke($v[$key],@([Windows.Forms.ControlStyles]::ResizeRedraw))){throw ('SIZE_DEPENDENT_PAINT_NOT_INVALIDATED '+$key)}}
  $steps=New-Object 'System.Collections.Generic.List[Drawing.Rectangle]';$cards=New-Object 'System.Collections.Generic.List[Drawing.Rectangle]'
  $v.steps.Add_Invalidated({param($sender,$e)$steps.Add($e.InvalidRect)}.GetNewClosure());$v.summary.Add_Invalidated({param($sender,$e)$cards.Add($e.InvalidRect)}.GetNewClosure())
  $before=$v.steps.Width;$v.form.Width=940;[Windows.Forms.Application]::DoEvents()
  if($v.steps.Width -eq $before -or -not @($steps|Where-Object {$_.Contains($v.steps.ClientRectangle)}).Count -or -not @($cards|Where-Object {$_.Contains($v.summary.ClientRectangle)}).Count){throw 'RESIZE_RETAINS_OLD_GEOMETRY'}
  $checks.Add('real size changes invalidate the complete step/card geometry, not only exposed strips')
  $bitmap=New-Object Drawing.Bitmap(80,80);$g=[Drawing.Graphics]::FromImage($bitmap)
  try{$paint=New-Object Windows.Forms.PaintEventArgs($g,(New-Object Drawing.Rectangle(0,0,80,80)));$arguments=New-Object object[] 1;$arguments[0]=$paint.PSObject.BaseObject;[void]$v.glyph.GetType().GetMethod('OnPaint',[Reflection.BindingFlags]'Instance,NonPublic').Invoke($v.glyph,$arguments);if(-not $g.Transform.IsIdentity){throw 'PAINT_TRANSFORM_LEAK'}}finally{$g.Dispose();$bitmap.Dispose()}
  $checks.Add('glyph painting restores the shared Graphics transform')
  $log=(1..100|ForEach-Object {'合成只读日志 '+$_+'：路径与检查信息，内容不转换。'}) -join "`r`n"
  $v.label.Text=$log;$v.logs.Visible=$true
  foreach($theme in 1,2){$v.theme.SelectedIndex=$theme
    foreach($expanded in $false,$true){$v.prefs.Visible=$expanded
      foreach($width in 560,940,660,820,780){$v.form.Width=$width;&$v.Layout;[Windows.Forms.Application]::DoEvents();if($v.hostPanel.DisplayRectangle.Width -gt $v.hostPanel.ClientSize.Width){throw 'HORIZONTAL_OVERFLOW'};if($v.hostPanel.VerticalScroll.Visible -and $v.hostPanel.ClientSize.Width -lt $v.hostPanel.Parent.ClientSize.Width){throw 'NATIVE_SCROLLBAR_EXPOSED'}}
    }
  }
  $checks.Add('both palettes and settings/details states survive repeated narrow/wide layout with a long Chinese path')
  $v.pageScroll.ScrollTo($v.pageScroll.MaximumPosition);if(-$v.hostPanel.AutoScrollPosition.Y -le 0){throw 'PAGE_SCROLL_FAILED'};$v.hostPanel.ScrollControlIntoView($v.brand);$brandRect=$v.hostPanel.RectangleToClient($v.brand.RectangleToScreen($v.brand.ClientRectangle));if($brandRect.Top -lt 0 -or $brandRect.Bottom -gt $v.hostPanel.ClientSize.Height){throw 'NATIVE_FOCUS_SCROLL_FAILED'}
  $checks.Add('outer native scrollbar is clipped while AutoScroll position and focus scrolling remain authoritative')
  $button=New-Object PackerViews.RoundButton;$button.Font=$v.form.Font;$button.Text='短按钮';$button.MaximumSize=New-Object Drawing.Size(100,0);$first=$button.GetPreferredSize([Drawing.Size]::Empty);if($button.GetPreferredSize([Drawing.Size]::Empty) -ne $first){throw 'PREFERRED_SIZE_UNSTABLE'};$button.Text='很长的中文按钮用于验证文字改变后的尺寸更新';$long=$button.GetPreferredSize([Drawing.Size]::Empty);if($long.Height -le $first.Height){throw 'TEXT_CACHE_NOT_INVALIDATED'};$button.MaximumSize=New-Object Drawing.Size(400,0);$wide=$button.GetPreferredSize([Drawing.Size]::Empty);if($wide.Height -ge $long.Height){throw 'WIDTH_CACHE_NOT_INVALIDATED'};$font=New-Object Drawing.Font('Microsoft YaHei UI',22);try{$button.Font=$font;if($button.GetPreferredSize([Drawing.Size]::Empty).Height -le $wide.Height){throw 'FONT_CACHE_NOT_INVALIDATED'}}finally{$button.Dispose();$font.Dispose()}
  $checks.Add('button measurement cache retains output and invalidates for text, width and font changes')
  if(-not $v.label.ReadOnly -or -not $v.label.ShortcutsEnabled -or $v.label.ScrollBars -ne 'None' -or $v.label.Text -cne $log){throw 'LOG_CONTRACT_CHANGED'}
  $v.label.Select(0,12);$selected=$v.label.SelectedText;$v.label.ScrollToLine(50)
  if($v.label.FirstVisibleLine -le 0 -or $v.label.SelectedText -cne $selected -or $v.label.Text -cne $log){throw 'LOG_SCROLL_CHANGED_TEXT_OR_SELECTION'}
  $v.label.ScrollToLine(0);if($v.label.FirstVisibleLine -ne 0 -or $v.logScroll.AccessibilityObject.Value -notmatch '^0 / '){throw 'LOG_SCROLL_OR_ACCESSIBILITY_STALE'}
  $checks.Add('native read-only text, exact CRLF content, selection and copy shortcuts retained while scrolling')
  if($v.logScroll.Editor -ne $v.label -or $v.logScroll.AccessibilityObject.Role -ne 'ScrollBar'){throw 'SCROLL_BINDING_INVALID'}
  $v.logScroll.Dispose();if($null -ne $v.logScroll.Editor){throw 'SCROLL_SUBSCRIPTIONS_RETAINED'}
  $checks.Add('themed scrollbar follows native edit line state and detaches subscriptions on disposal')
  $g=$v.form.CreateGraphics();try{$dpi=$g.DpiX}finally{$g.Dispose()}
  @{status='PASS';checks=@($checks);actualDPI=$dpi;real150DPITested=$false;coreRecoveryTestsRepeated=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $TestRoot 'cold-paint-log-result.json') -Encoding UTF8
  Write-Output ('PASS cold paint/log: '+$checks.Count)
}finally{$v.form.Close();$v.form.Dispose()}
