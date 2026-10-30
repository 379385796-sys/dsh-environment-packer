# View only. This module never confirms exit, cancels a task, changes ownership or writes task records.
if (-not ('PackerViews.RoundButton' -as [type])) {
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing,Accessibility -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
namespace PackerViews {
  public class BufferedForm:Form { public BufferedForm(){DoubleBuffered=true;ResizeRedraw=true;} }
  public class BufferedPanel:Panel { public BufferedPanel(){DoubleBuffered=true;ResizeRedraw=true;} }
  public class BufferedTableLayoutPanel:TableLayoutPanel { public BufferedTableLayoutPanel(){DoubleBuffered=true;ResizeRedraw=true;} }
  public static class DrawingTools {
    public static GraphicsPath Round(RectangleF r,float radius) {
      GraphicsPath p=new GraphicsPath();float d=Math.Min(radius*2,Math.Min(r.Width,r.Height));
      if(d<1){p.AddRectangle(r);return p;}
      p.AddArc(r.Left,r.Top,d,d,180,90);p.AddArc(r.Right-d,r.Top,d,d,270,90);
      p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.Left,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;
    }
  }
  public class RoundSurface:Panel {
    public Color BorderColor {get;set;}
    public RoundSurface(){DoubleBuffered=true;BorderColor=Color.Gainsboro;}
    protected override void OnPaintBackground(PaintEventArgs e){
      e.Graphics.Clear(Parent==null?SystemColors.Window:Parent.BackColor);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
      if(Width<2||Height<2)return;
      using(GraphicsPath p=DrawingTools.Round(new RectangleF(.5f,.5f,Width-1,Height-1),11)){
        using(Brush b=new SolidBrush(BackColor))e.Graphics.FillPath(b,p);using(Pen pen=new Pen(BorderColor))e.Graphics.DrawPath(pen,p);
      }
    }
  }
  public class RoundButton:Button {
    public bool Primary {get;set;} public Color Accent {get;set;} public Color OnAccent {get;set;}
    public Color LineColor {get;set;} public bool Quiet {get;set;}
    public RoundButton(){FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;DoubleBuffered=true;AutoSize=true;Accent=Color.RoyalBlue;OnAccent=Color.White;LineColor=Color.Gainsboro;Padding=new Padding(12,8,12,8);}
    public override Size GetPreferredSize(Size proposed){
      int max=MaximumSize.Width>0?MaximumSize.Width:1600;
      Size text=TextRenderer.MeasureText(Text,Font,new Size(Math.Max(30,max-28),Int32.MaxValue),TextFormatFlags.WordBreak|TextFormatFlags.NoPrefix);
      return new Size(Math.Min(max,text.Width+28),Math.Max(38,text.Height+18));
    }
    protected override void OnPaint(PaintEventArgs e){
      e.Graphics.Clear(Parent==null?BackColor:Parent.BackColor);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
      Color fill=Primary?Accent:BackColor,fg=Primary?OnAccent:ForeColor;
      if(!Enabled){fill=BackColor;fg=SystemColors.GrayText;}
      using(GraphicsPath p=DrawingTools.Round(new RectangleF(.5f,.5f,Math.Max(1,Width-1),Math.Max(1,Height-1)),9)){
        using(Brush b=new SolidBrush(fill))e.Graphics.FillPath(b,p);
        if(!Quiet&&!Primary)using(Pen pen=new Pen(LineColor))e.Graphics.DrawPath(pen,p);
      }
      TextRenderer.DrawText(e.Graphics,Text,Font,new Rectangle(10,6,Math.Max(1,Width-20),Math.Max(1,Height-12)),fg,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.WordBreak|TextFormatFlags.NoPrefix);
      if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(e.Graphics,new Rectangle(5,5,Math.Max(1,Width-10),Math.Max(1,Height-10)),fg,fill);
    }
  }
  public class WizardSteps:Control {
    public int Active {get;set;} public bool Complete {get;set;} public bool FailureKnown {get;set;}
    public Color Accent {get;set;} public Color Muted {get;set;} public Color LineColor {get;set;}
    public Color SoftAccent {get;set;} public Color ErrorColor {get;set;}
    private string[] names={"退出 DSH","环境检查","文件打包","完整性校验","完成"};
    public WizardSteps(){DoubleBuffered=true;TabStop=false;Active=-1;Height=70;AccessibleRole=AccessibleRole.Grouping;}
    protected override void OnPaint(PaintEventArgs e){
      base.OnPaint(e);Graphics g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
      float cell=ClientSize.Width/5f,d=Math.Max(25,Font.Height*1.45f),cy=d/2+5;
      for(int i=0;i<5;i++){
        float x=cell*(i+.5f);bool done=Complete||(Active>=0&&i<Active),active=i==Active;
        if(i<4)using(Pen p=new Pen(LineColor))g.DrawLine(p,x+d/2+4,cy,x+cell-d/2-4,cy);
        Color color=active&&FailureKnown?ErrorColor:active||done?Accent:Muted;
        using(Brush b=new SolidBrush(active?color:done?SoftAccent:BackColor))g.FillEllipse(b,x-d/2,cy-d/2,d,d);
        if(!active&&!done)using(Pen p=new Pen(LineColor))g.DrawEllipse(p,x-d/2,cy-d/2,d,d);
        if(done){using(Pen p=new Pen(color,1.6f))g.DrawLines(p,new PointF[]{new PointF(x-5,cy),new PointF(x-1,cy+4),new PointF(x+6,cy-4)});}
        else TextRenderer.DrawText(g,active&&FailureKnown?"!":(i+1).ToString(),Font,new Rectangle((int)(x-d/2),(int)(cy-d/2),(int)d,(int)d),active?BackColor:color,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);
        TextRenderer.DrawText(g,names[i],Font,new Rectangle((int)(cell*i), (int)(cy+d/2+6),(int)cell,Height-(int)(cy+d/2+6)),color,TextFormatFlags.HorizontalCenter|TextFormatFlags.WordBreak|TextFormatFlags.NoPrefix);
      }
    }
  }
  public class PhaseGlyph:Control {
    public string Kind {get;set;} public Color Tint {get;set;} public Color SoftTint {get;set;}
    public PhaseGlyph(){DoubleBuffered=true;TabStop=false;Size=new Size(52,52);Kind="waiting";}
    protected override void OnPaint(PaintEventArgs e){
      Graphics g=e.Graphics;g.Clear(Parent.BackColor);g.SmoothingMode=SmoothingMode.AntiAlias;
      using(GraphicsPath bg=DrawingTools.Round(new RectangleF(0,0,Width,Height),15))using(Brush b=new SolidBrush(SoftTint))g.FillPath(b,bg);
      float scale=Math.Min(Width,Height)/52f;g.TranslateTransform((Width-26*scale)/2,(Height-26*scale)/2);g.ScaleTransform(scale,scale);
      using(Pen p=new Pen(Tint,1.7f)){
        if(Kind=="success")g.DrawLines(p,new Point[]{new Point(4,13),new Point(10,19),new Point(23,5)});
        else if(Kind=="failed"||Kind=="unknown"){g.DrawEllipse(p,3,3,20,20);g.DrawLine(p,9,9,17,17);g.DrawLine(p,17,9,9,17);}
        else if(Kind=="writing"){g.DrawPolygon(p,new Point[]{new Point(13,2),new Point(23,7),new Point(23,19),new Point(13,25),new Point(3,19),new Point(3,7)});g.DrawLines(p,new Point[]{new Point(3,7),new Point(13,13),new Point(23,7)});g.DrawLine(p,13,13,13,25);}
        else if(Kind=="waiting"||Kind=="initial"){g.DrawLines(p,new Point[]{new Point(11,3),new Point(3,3),new Point(3,23),new Point(11,23)});g.DrawLine(p,9,13,24,13);g.DrawLines(p,new Point[]{new Point(18,7),new Point(24,13),new Point(18,19)});}
        else{g.DrawPolygon(p,new Point[]{new Point(13,2),new Point(23,6),new Point(22,18),new Point(13,25),new Point(4,18),new Point(3,6)});g.DrawLines(p,new Point[]{new Point(8,13),new Point(12,17),new Point(19,9)});}
      }
    }
  }
  public class PhaseProgress:Control {
    private Timer timer; private ProgressBarStyle style; private int speed=30,value;private float offset;
    public Color Accent {get;set;} public Color Track {get;set;}
    public ProgressBarStyle Style{get{return style;}set{if(style==value)return;style=value;Pulse();Invalidate();}}
    public int MarqueeAnimationSpeed{get{return speed;}set{if(speed==value)return;speed=value;Pulse();}}
    public int Value{get{return value;}set{int next=Math.Max(0,Math.Min(100,value));if(this.value==next)return;this.value=next;Invalidate();}}
    public PhaseProgress(){DoubleBuffered=true;Height=7;TabStop=false;AccessibleRole=AccessibleRole.ProgressBar;style=ProgressBarStyle.Marquee;timer=new Timer();timer.Interval=45;timer.Tick+=delegate{offset+=.022f;if(offset>1.35f)offset=0;Invalidate();};}
    private void Pulse(){if(timer!=null)timer.Enabled=speed>0&&style==ProgressBarStyle.Marquee&&Visible&&SystemInformation.UIEffectsEnabled;}
    protected override void OnVisibleChanged(EventArgs e){base.OnVisibleChanged(e);Pulse();}
    protected override void OnPaint(PaintEventArgs e){Graphics g=e.Graphics;g.Clear(Parent.BackColor);g.SmoothingMode=SmoothingMode.AntiAlias;
      using(GraphicsPath p=DrawingTools.Round(new RectangleF(0,0,Width,Height),3))using(Brush b=new SolidBrush(Track))g.FillPath(b,p);
      float width=style==ProgressBarStyle.Marquee?Width*.3f:Width*value/100f,left=style==ProgressBarStyle.Marquee?(timer.Enabled?Width*(offset-.3f):Width*.35f):0;
      if(width>0)using(GraphicsPath p=DrawingTools.Round(new RectangleF(left,0,width,Height),3))using(Brush b=new SolidBrush(Accent))g.FillPath(b,p);
    }
    protected override AccessibleObject CreateAccessibilityInstance(){return new ProgressAccessible(this);}
    private class ProgressAccessible:ControlAccessibleObject{private PhaseProgress owner;public ProgressAccessible(PhaseProgress c):base(c){owner=c;}public override string Value{get{return owner.Style==ProgressBarStyle.Marquee?"进行中，百分比未知":owner.Value.ToString()+"%";}set{}}}
    protected override void Dispose(bool disposing){if(disposing&&timer!=null)timer.Dispose();base.Dispose(disposing);}
  }
}
'@
}

function New-PackerAssistantView([string]$Target) {
  $form=New-Object PackerViews.BufferedForm
  $form.Text='环境恢复包 · 独立助手';$form.StartPosition='CenterScreen';$form.TopMost=$true
  $form.AutoScaleMode='Dpi';$form.AutoScaleDimensions=$form.CurrentAutoScaleDimensions
  $form.Size=New-Object Drawing.Size(760,700);$form.MinimumSize=New-Object Drawing.Size(560,600)
  $form.Font=New-Object Drawing.Font('Microsoft YaHei UI',10.5)
  $form.AccessibleName='环境恢复包独立备份助手'
  $hostPanel=New-Object PackerViews.BufferedPanel;$hostPanel.Dock='Fill';$hostPanel.AutoScroll=$true;$form.Controls.Add($hostPanel)
  $root=New-Object PackerViews.BufferedTableLayoutPanel;$root.Dock='Top';$root.AutoSize=$true;$root.AutoSizeMode='GrowAndShrink'
  $root.ColumnCount=1;$root.RowCount=13;$root.Padding=New-Object Windows.Forms.Padding(28,20,28,16)
  [void]$root.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)))
  for($i=0;$i -lt 13;$i++){[void]$root.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))}
  $hostPanel.Controls.Add($root)
  function New-Text([string]$Text,[bool]$Centered=$false){
    $c=New-Object Windows.Forms.Label;$c.Text=$Text;$c.AutoSize=$true;$c.Dock='Fill';$c.Margin=New-Object Windows.Forms.Padding(0)
    if($Centered){$c.TextAlign='MiddleCenter'};return $c
  }
  $header=New-Object Windows.Forms.Panel;$header.Dock='Fill';$header.Height=34;$header.Margin=New-Object Windows.Forms.Padding(0,0,0,18)
  $brand=New-Text '环境恢复包  ·  独立助手';$brand.Dock='Fill';$header.Controls.Add($brand)
  $gear=New-Object PackerViews.RoundButton;$gear.Text='外观';$gear.Quiet=$true;$gear.Dock='Right';$gear.AccessibleName='助手外观设置';$header.Controls.Add($gear)
  $root.Controls.Add($header,0,0)
  $prefs=New-Object Windows.Forms.FlowLayoutPanel;$prefs.Dock='Fill';$prefs.AutoSize=$true;$prefs.WrapContents=$true;$prefs.Visible=$false
  $prefs.Margin=New-Object Windows.Forms.Padding(0,0,0,14)
  $prefs.Controls.Add((New-Text '外观'))
  $theme=New-Object Windows.Forms.ComboBox;$theme.DropDownStyle='DropDownList';$theme.Width=120;$theme.AccessibleName='助手主题'
  [void]$theme.Items.AddRange(@('跟随系统','浅色','深色'));$theme.SelectedIndex=0;$prefs.Controls.Add($theme)
  $prefs.Controls.Add((New-Text '字号'))
  $size=New-Object Windows.Forms.NumericUpDown;$size.Minimum=9;$size.Maximum=22;$size.DecimalPlaces=1;$size.Increment=.5;$size.Value=10.5;$size.Width=70;$size.AccessibleName='助手字号';$prefs.Controls.Add($size)
  $root.Controls.Add($prefs,0,1)
  $steps=New-Object PackerViews.WizardSteps;$steps.Dock='Fill';$steps.Margin=New-Object Windows.Forms.Padding(0,0,0,20);$root.Controls.Add($steps,0,2)
  $glyph=New-Object PackerViews.PhaseGlyph;$glyph.Anchor='None';$glyph.Margin=New-Object Windows.Forms.Padding(0,0,0,12);$root.Controls.Add($glyph,0,3)
  $title=New-Text '正在连接独立助手' $true;$root.Controls.Add($title,0,4)
  $subtitle=New-Text '请暂时保持 DSH 运行，等待接管完成。' $true;$subtitle.Margin=New-Object Windows.Forms.Padding(0,6,0,20);$root.Controls.Add($subtitle,0,5)
  $summary=New-Object PackerViews.RoundSurface;$summary.AutoSize=$true;$summary.AutoSizeMode='GrowAndShrink';$summary.Dock='Fill';$summary.Padding=New-Object Windows.Forms.Padding(14);$summary.Margin=New-Object Windows.Forms.Padding(0,0,0,12)
  $summaryTable=New-Object Windows.Forms.TableLayoutPanel;$summaryTable.ColumnCount=1;$summaryTable.RowCount=3;$summaryTable.AutoSize=$true;$summaryTable.Dock='Top'
  [void]$summaryTable.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)))
  for($i=0;$i -lt 3;$i++){[void]$summaryTable.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))}
  $count=New-Text '—';$unit=New-Text '等待任务记录';$instructions=New-Text '助手确认接管后，再正常退出 DSH。' $true
  $summaryTable.Controls.Add($count,0,0);$summaryTable.Controls.Add($unit,0,1);$summaryTable.Controls.Add($instructions,0,2);$summary.Controls.Add($summaryTable);$root.Controls.Add($summary,0,6)
  $progress=New-Object PackerViews.PhaseProgress;$progress.Dock='Fill';$progress.AccessibleName='当前阶段进度，非整体百分比';$progress.Margin=New-Object Windows.Forms.Padding(0,0,0,7);$root.Controls.Add($progress,0,7)
  $hint=New-Text '尚未开始备份';$hint.Margin=New-Object Windows.Forms.Padding(0,0,0,18);$root.Controls.Add($hint,0,8)
  $targetPanel=New-Object Windows.Forms.TableLayoutPanel;$targetPanel.AutoSize=$true;$targetPanel.AutoSizeMode='GrowAndShrink';$targetPanel.Dock='Fill';$targetPanel.ColumnCount=1;$targetPanel.RowCount=2;$targetPanel.Padding=New-Object Windows.Forms.Padding(0,12,0,12)
  [void]$targetPanel.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')));[void]$targetPanel.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))
  [void]$targetPanel.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)))
  $targetCaption=New-Text '保存位置';$destination=New-Object Windows.Forms.TextBox;$destination.ReadOnly=$true;$destination.Multiline=$true;$destination.WordWrap=$true;$destination.BorderStyle='None';$destination.Dock='Fill';$destination.Text=$Target;$destination.AccessibleName='备份 ZIP 保存位置';$destination.TabIndex=2
  $targetPanel.Controls.Add($targetCaption,0,0);$targetPanel.Controls.Add($destination,0,1);$root.Controls.Add($targetPanel,0,9)
  $detailsBar=New-Object Windows.Forms.Panel;$detailsBar.Dock='Fill';$detailsBar.Height=34
  $resultCaption=New-Text '尚未开始备份';$resultCaption.Dock='Fill';$detailsBar.Controls.Add($resultCaption)
  $toggle=New-Object PackerViews.RoundButton;$toggle.Text='任务详情 ▾';$toggle.Quiet=$true;$toggle.Dock='Right';$toggle.TabIndex=3;$detailsBar.Controls.Add($toggle);$root.Controls.Add($detailsBar,0,10)
  $logs=New-Object Windows.Forms.Panel;$logs.Dock='Fill';$logs.Height=180;$logs.Visible=$false
  $label=New-Object Windows.Forms.TextBox;$label.Multiline=$true;$label.ReadOnly=$true;$label.WordWrap=$true;$label.ScrollBars='Vertical';$label.Dock='Fill';$label.BorderStyle='None';$label.AccessibleName='完整任务详情，只读';$label.TabIndex=4;$logs.Controls.Add($label);$root.Controls.Add($logs,0,11)
  $footer=New-Object Windows.Forms.TableLayoutPanel;$footer.Dock='Fill';$footer.AutoSize=$true;$footer.AutoSizeMode='GrowAndShrink';$footer.ColumnCount=2;$footer.Padding=New-Object Windows.Forms.Padding(0,16,0,0)
  [void]$footer.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',30)));[void]$footer.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',70)))
  $warning=New-Text "私人 ZIP 未加密`r`n请保存在可信位置";$footer.Controls.Add($warning,0,0)
  $actions=New-Object Windows.Forms.FlowLayoutPanel;$actions.AutoSize=$true;$actions.AutoSizeMode='GrowAndShrink';$actions.Dock='Fill';$actions.WrapContents=$true;$actions.FlowDirection='RightToLeft'
  $confirmExit=New-Object PackerViews.RoundButton;$confirmExit.Text='我已正常退出，检查后继续';$confirmExit.Enabled=$false
  $cancel=New-Object PackerViews.RoundButton;$cancel.Text='取消任务'
  $open=New-Object PackerViews.RoundButton;$open.Text='打开所在文件夹';$open.Enabled=$false
  $actions.Controls.Add($open);$actions.Controls.Add($confirmExit);$actions.Controls.Add($cancel);$footer.Controls.Add($actions,1,0);$root.Controls.Add($footer,0,12)
  $gear.TabIndex=0;$prefs.TabIndex=1;$theme.TabIndex=0;$size.TabIndex=1;$targetPanel.TabIndex=2;$detailsBar.TabIndex=3;$logs.TabIndex=4;$footer.TabIndex=5;$open.TabIndex=0;$confirmExit.TabIndex=0;$cancel.TabIndex=1
  $view=@{form=$form;label=$label;progress=$progress;confirmExit=$confirmExit;cancel=$cancel;open=$open;root=$root;hostPanel=$hostPanel;title=$title;subtitle=$subtitle;steps=$steps;glyph=$glyph;summary=$summary;count=$count;unit=$unit;instructions=$instructions;hint=$hint;destination=$destination;targetCaption=$targetCaption;resultCaption=$resultCaption;warning=$warning;theme=$theme;size=$size;brand=$brand;gear=$gear;prefs=$prefs;toggle=$toggle;logs=$logs;actions=$actions;footer=$footer;Phase='initial';LastPhase=$null;LastFiles=$null;FailureKnown=$false;LayingOut=$false;OwnFonts=@()}
  $layout={
    if($view.LayingOut){return}
    $layoutKey=@($hostPanel.ClientSize.Width,$form.Font.Height,$prefs.Visible,$logs.Visible,$title.Text,$subtitle.Text,$unit.Text,$instructions.Text,$hint.Text,$resultCaption.Text,$cancel.Text,$confirmExit.Text) -join [char]31
    if($view.LayoutKey -ceq $layoutKey){return};$view.LayoutKey=$layoutKey;$view.LayingOut=$true
    $root.SuspendLayout();$form.SuspendLayout()
    try{
      $width=[Math]::Max(200,$hostPanel.ClientSize.Width-$root.Padding.Horizontal-12)
      foreach($c in @($title,$subtitle,$hint,$destination,$resultCaption)){$c.MaximumSize=New-Object Drawing.Size($width,0)}
      foreach($c in @($count,$unit,$instructions)){$c.MaximumSize=New-Object Drawing.Size([Math]::Max(100,$width-30),0)}
      $steps.Height=[Math]::Max(70,$form.Font.Height*4+8)
      $destination.Height=[Math]::Max($form.Font.Height+4,[Windows.Forms.TextRenderer]::MeasureText($destination.Text,$destination.Font,(New-Object Drawing.Size($width,1000)),[Windows.Forms.TextFormatFlags]::WordBreak).Height+6)
      $actionWidth=[Math]::Max(180,[int]($width*.7)-12)
      $actions.MaximumSize=New-Object Drawing.Size($actionWidth,0)
      foreach($b in @($open,$confirmExit,$cancel)){$b.MaximumSize=New-Object Drawing.Size(($actionWidth-8),0)}
    }finally{$root.ResumeLayout($true);$form.ResumeLayout($true);$view.LayingOut=$false}
  }.GetNewClosure()
  $view.Layout=$layout
  $sync={
    $buttonKey=@($view.Phase,$open.Enabled,$confirmExit.Enabled,$cancel.Enabled,$open.Text,$confirmExit.Text,$cancel.Text) -join [char]31
    if($view.ButtonKey -ceq $buttonKey){return};$view.ButtonKey=$buttonKey
    $confirmExit.Visible=$view.Phase -in @('waiting','initial');$open.Visible=$view.Phase -eq 'success'
    $confirmExit.Primary=$true;$open.Primary=$true;$cancel.Primary=$view.Phase -in @('failed','unknown');$cancel.Quiet=-not $cancel.Primary
    foreach($b in @($open,$confirmExit,$cancel)){$b.Invalidate()}; & $view.Layout
  }.GetNewClosure();$view.SyncButtons=$sync
  $applyTheme={
    try{
      $dark=$theme.SelectedIndex -eq 2
      if($theme.SelectedIndex -eq 0){$setting=Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name AppsUseLightTheme -ErrorAction SilentlyContinue;$dark=$null -ne $setting -and $setting.AppsUseLightTheme -eq 0}
      $themeKey=@($dark,[Windows.Forms.SystemInformation]::HighContrast,[Windows.Forms.SystemInformation]::UIEffectsEnabled) -join '|'
      if($view.ThemeKey -ceq $themeKey){return}
      $p=@{Bg=[Drawing.Color]::FromArgb(255,255,255);Layer=[Drawing.Color]::FromArgb(246,247,249);Text=[Drawing.Color]::FromArgb(36,39,46);Muted=[Drawing.Color]::FromArgb(99,107,120);Line=[Drawing.Color]::FromArgb(231,233,238);Accent=[Drawing.Color]::FromArgb(69,105,212);Soft=[Drawing.Color]::FromArgb(237,241,254);OnAccent=[Drawing.Color]::White;Error=[Drawing.Color]::FromArgb(190,70,81);Success=[Drawing.Color]::FromArgb(38,128,92)}
      if($dark){$p=@{Bg=[Drawing.Color]::FromArgb(28,30,35);Layer=[Drawing.Color]::FromArgb(36,39,46);Text=[Drawing.Color]::FromArgb(231,233,238);Muted=[Drawing.Color]::FromArgb(164,171,184);Line=[Drawing.Color]::FromArgb(52,56,66);Accent=[Drawing.Color]::FromArgb(145,170,255);Soft=[Drawing.Color]::FromArgb(42,52,76);OnAccent=[Drawing.Color]::FromArgb(28,40,71);Error=[Drawing.Color]::FromArgb(243,151,160);Success=[Drawing.Color]::FromArgb(123,203,170)}}
      if([Windows.Forms.SystemInformation]::HighContrast){$p.Bg=[Drawing.SystemColors]::Window;$p.Layer=$p.Bg;$p.Text=[Drawing.SystemColors]::WindowText;$p.Muted=$p.Text;$p.Line=$p.Text;$p.Accent=[Drawing.SystemColors]::Highlight;$p.OnAccent=[Drawing.SystemColors]::HighlightText;$p.Soft=$p.Bg;$p.Error=$p.Text;$p.Success=$p.Text}
      $view.Palette=$p;$view.Dark=$dark;$form.BackColor=$p.Bg
      $queue=New-Object 'System.Collections.Generic.Queue[Windows.Forms.Control]';$queue.Enqueue($hostPanel)
      while($queue.Count){$c=$queue.Dequeue();$c.BackColor=if($c -eq $summary -or $c -eq $footer -or $c -eq $logs){$p.Layer}else{$c.Parent.BackColor};$c.ForeColor=$p.Text
        if($c -is [PackerViews.RoundSurface]){$c.BorderColor=$p.Line}
        if($c -is [PackerViews.RoundButton]){$c.Accent=$p.Accent;$c.OnAccent=$p.OnAccent;$c.LineColor=$p.Line}
        foreach($child in $c.Controls){$queue.Enqueue($child)};$c.Invalidate()
      }
      foreach($c in @($subtitle,$unit,$hint,$targetCaption,$resultCaption,$warning)){$c.ForeColor=$p.Muted}
      $steps.Accent=$p.Accent;$steps.Muted=$p.Muted;$steps.LineColor=$p.Line;$steps.SoftAccent=$p.Soft;$steps.ErrorColor=$p.Error
      & $view.PaintPhase
      $progress.Accent=$p.Accent;$progress.Track=$p.Layer
      $progress.MarqueeAnimationSpeed=if([Windows.Forms.SystemInformation]::UIEffectsEnabled){30}else{0}
      $glyph.Invalidate();$steps.Invalidate()
      $view.ThemeKey=$themeKey
    }catch{ # Display preferences must never cancel an active backup.
    }
  }.GetNewClosure();$view.ApplyTheme=$applyTheme
  $view.PaintPhase={
    $paintKey=@($view.Phase,$view.Dark,[Windows.Forms.SystemInformation]::HighContrast,$steps.Active,$steps.Complete,$steps.FailureKnown) -join '|'
    if($view.PhasePaintKey -ceq $paintKey){return};$view.PhasePaintKey=$paintKey
    $p=$view.Palette
    $glyph.Tint=if($view.Phase -eq 'success'){$p.Success}elseif($view.Phase -in @('failed','unknown')){$p.Error}else{$p.Accent}
    $glyph.SoftTint=if([Windows.Forms.SystemInformation]::HighContrast){$p.Bg}elseif($view.Phase -eq 'success'){if($view.Dark){[Drawing.Color]::FromArgb(37,58,50)}else{[Drawing.Color]::FromArgb(237,247,242)}}elseif($view.Phase -in @('failed','unknown')){if($view.Dark){[Drawing.Color]::FromArgb(61,41,47)}else{[Drawing.Color]::FromArgb(255,240,241)}}else{$p.Soft}
    $glyph.Invalidate();$steps.Invalidate()
  }.GetNewClosure()
  $setFonts={
    $old=$view.OwnFonts;$new=@((New-Object Drawing.Font('Microsoft YaHei UI',[single]$size.Value)),(New-Object Drawing.Font('Microsoft YaHei UI',([single]$size.Value+7),[Drawing.FontStyle]::Bold)),(New-Object Drawing.Font('Microsoft YaHei UI',([single]$size.Value+8),[Drawing.FontStyle]::Bold)),(New-Object Drawing.Font('Microsoft YaHei UI',([single]$size.Value+1),[Drawing.FontStyle]::Bold)))
    $form.Font=$new[0];$title.Font=$new[1];$count.Font=$new[2];$brand.Font=$new[3];$view.OwnFonts=$new;& $view.Layout
    foreach($font in $old){$font.Dispose()}
  }.GetNewClosure()
  $size.Add_ValueChanged($setFonts);$theme.Add_SelectedIndexChanged($applyTheme)
  $gear.Add_Click({$prefs.Visible=-not $prefs.Visible;$gear.AccessibleDescription=if($prefs.Visible){'外观设置已展开'}else{'外观设置已收起'};& $view.Layout}.GetNewClosure())
  $toggle.Add_Click({$logs.Visible=-not $logs.Visible;$toggle.Text=if($logs.Visible){'收起任务详情 ▴'}else{'任务详情 ▾'};& $view.Layout}.GetNewClosure())
  foreach($button in @($confirmExit,$cancel,$open)){$button.Add_EnabledChanged($sync);$button.Add_TextChanged($sync)}
  $hostPanel.Add_SizeChanged($layout)
  $label.Add_TextChanged({
    # The original text remains available verbatim. Only unexpected UI/lifecycle messages need a fallback view.
    if($label.Text -match '^(已请求取消|助手工作进程异常退出|任务已退出，但状态记录损坏|助手状态读取失败)'){
      $title.Text=if($label.Text -match '^已请求取消'){'正在等待安全清理'}else{'任务结果未确认'}
      $subtitle.Text=($label.Text -split "\r?\n")[0];$title.AccessibleName=$title.Text
      if($label.Text -notmatch '^已请求取消'){$view.Phase='unknown';$view.steps.Active=-1;$view.steps.FailureKnown=$false;& $view.SyncButtons;& $view.ApplyTheme}
    }
  }.GetNewClosure())
  $appearanceTimer=New-Object Windows.Forms.Timer;$appearanceTimer.Interval=3000;$appearanceTimer.Add_Tick($applyTheme);$appearanceTimer.Start()
  $form.Add_FormClosed({$appearanceTimer.Dispose();foreach($font in $view.OwnFonts){$font.Dispose()}}.GetNewClosure())
  $form.Add_Shown({& $view.Layout;$height=[Math]::Min([Windows.Forms.Screen]::FromControl($form).WorkingArea.Height-100,[Math]::Max(550,$root.PreferredSize.Height+12));$form.ClientSize=New-Object Drawing.Size($form.ClientSize.Width,$height)}.GetNewClosure())
  & $setFonts;& $sync;& $applyTheme
  $label.Text="正在初始化独立助手…`r`n请暂时不要退出 DSH。"
  Update-PackerAssistantState $view @{phase='initial';files=$null}
  return $view
}

function Update-PackerAssistantState([hashtable]$View,$State) {
  # Existing records are observations, not new safety decisions. Missing failure stages stay unknown.
  try {
    $renderKey=@($State.phase,$State.files,$State.bytes,$State.error,$State.failurePhase,$State.failedPhase,$State.writers,$State.exitConfirmed,$State.quitVerified) -join [char]31
    if($View.RenderKey -ceq $renderKey){return}
    $phase=[string]$State.phase;$map=@{'waiting'=0;'exit-verified'=1;'scanning'=1;'checking-dependencies'=1;'writing'=2;'verifying'=3;'success'=4}
    if($phase -notin @('failed','success','initial') -and $map.ContainsKey($phase)){$View.LastPhase=$phase}
    $number=0L;$valid=$null -ne $State.files -and [long]::TryParse([string]$State.files,[ref]$number) -and $number -ge 0
    if($valid -and $phase -ne 'failed'){$View.LastFiles=$number}
    $View.Phase=$phase;$View.FailureKnown=$false;$failurePhase=$null
    if($phase -eq 'failed'){
      if($State.failurePhase -and $map.ContainsKey([string]$State.failurePhase)){$failurePhase=[string]$State.failurePhase;$View.FailureKnown=$true}
      elseif($State.failedPhase -and $map.ContainsKey([string]$State.failedPhase)){$failurePhase=[string]$State.failedPhase;$View.FailureKnown=$true}
    }
    $phaseLabels=@{'initial'='等待助手接管';'waiting'='等待退出 DSH';'exit-verified'='环境检查';'scanning'='环境检查 / 扫描文件';'checking-dependencies'='环境检查 / 依赖检查';'writing'='文件打包';'verifying'='完整性校验';'success'='完成'}
    $View.steps.Complete=$phase -eq 'success';$View.steps.FailureKnown=$View.FailureKnown
    $View.steps.Active=if($phase -eq 'failed'){if($View.FailureKnown){$map[$failurePhase]}else{-1}}elseif($map.ContainsKey($phase)){$map[$phase]}else{-1}
    $View.glyph.Kind=$phase
    $View.title.Text=switch($phase){'waiting'{if($State.exitConfirmed){'等待相关进程正常退出'}else{'请先正常退出 DSH'}} 'initial'{'正在连接独立助手'} 'exit-verified'{'正在检查备份环境'} 'scanning'{'正在扫描环境文件'} 'checking-dependencies'{'正在检查依赖兼容性'} 'writing'{'正在打包环境'} 'verifying'{'正在验证备份完整性'} 'success'{'完整备份已生成'} 'failed'{'备份未完成'} default{'任务状态未知'}}
    $View.subtitle.Text=switch($phase){'waiting'{'助手已接管。保存工作后，正常退出所有 DSH 实例（包括托盘）。'} 'initial'{'请暂时保持 DSH 运行，等待接管完成。'} 'success'{'文件完整性验证通过。私人恢复包已保存在下方位置。'} 'failed'{if($View.FailureKnown){'失败阶段：'+$phaseLabels[$failurePhase]}elseif($View.LastPhase){'失败阶段未记录；最后观察到：'+$phaseLabels[$View.LastPhase]}else{'失败阶段未记录；不能确认错误发生在哪一步。'}} default{'保持电脑开启，等待现有安全检查和任务流程完成。'}}
    $View.count.Visible=$phase -notin @('waiting','initial');$View.unit.Visible=$View.count.Visible
    $displayCount=if($phase -eq 'failed'){if($valid -and $number -gt 0){$number}else{$View.LastFiles}}elseif($valid){$number}else{$null}
    $View.count.Text=if($null -ne $displayCount){$displayCount.ToString('N0')}else{'—'}
    $View.unit.Text=if($phase -eq 'success'){'个文件已验证'+$(if($State.bytes){' · '+([double]$State.bytes/1MB).ToString('0.##')+' MB'}else{''})}elseif($phase -eq 'failed'){if($valid -and $number -gt 0){'终态记录的处理数'}elseif($null -ne $View.LastFiles){'最后观察到的处理数；不代表最终处理总量'}else{'失败记录未保留处理数'}}else{'个文件已处理'}
    $View.instructions.Visible=$phase -in @('waiting','initial','failed','success')
    $reason=switch -Regex ([string]$State.error){
      '^DECLARED_DEPENDENCY_MISSING$'{'当前 Profile 有声明但未完整安装的依赖。';break}
      '^TRANSITIVE_DEPENDENCY_MISSING$'{'有必需的传递依赖缺失或无法核验。';break}
      '^HOST_BROWSER_PEER_UNPROVEN$'{'浏览器依赖的兼容性证据不足。';break}
      '^(PEER_VERSION_MISMATCH|HOST_PEER_VERSION_MISMATCH)$'{'依赖版本不满足要求。';break}
      '^DSH_EXIT_TIMEOUT$'{'未在期限内完成正常退出与人工确认。';break}
      '^BACKUP_TIMEOUT$'{'备份执行超时，已请求安全停止。';break}
      '^BACKUP_ABORTED$'{'任务已取消或中止。';break}
      '^(SOURCE_NOT_QUIESCENT|SOURCE_LEASE_FAILED|SOURCE_LEASE_TIMEOUT)$'{'源文件仍在写入或无法取得读锁。';break}
      '^WRITERS_RESTARTED$'{'检测到写入进程重新启动。';break}
      '^ENOSPC$'{'目标磁盘空间不足。';break}
      '^(EACCES|EPERM)$'{'文件访问被拒绝，请检查权限与文件占用。';break}
      default{'任务未能完成，请查看保留的诊断。'}
    }
    $View.instructions.Text=switch($phase){'waiting'{if($State.exitConfirmed){'已收到人工确认，等待检测通过。相关进程：'+$State.writers}else{'1  正常退出 DSH     →     2  回到这里确认'}} 'initial'{'助手确认接管后，再正常退出 DSH。'} 'failed'{$reason+$(if($State.error){' ['+$State.error+']'}else{''})} 'success'{'文件校验通过不等于恢复业务通过；恢复后仍需独立验收。'} default{''}}
    $View.progress.Visible=$phase -in @('exit-verified','scanning','checking-dependencies','writing','verifying')
    $View.hint.Text=if($phase -eq 'waiting'){'人工确认不能绕过检测；超时将安全取消。'}elseif($phase -eq 'failed'){'请自行启动 DSH，在 Packer 查看诊断并检查异常任务，再使用新 ZIP 名称重试。'}elseif($phase -eq 'success'){'不会自动重启 DSH。'}elseif($phase -eq 'initial'){'尚未开始备份。'}else{'当前阶段进行中 · 不估算整体百分比'}
    $View.targetCaption.Text=if($phase -eq 'success'){'已保存到'}else{'保存位置'}
    $View.resultCaption.Text=if($phase -in @('initial','waiting')){'尚未开始备份'}elseif($phase -eq 'success'){'文件完整性通过'}elseif($phase -eq 'failed'){'未确认成功备份'}else{$phaseLabels[$phase]}
    $View.title.AccessibleName=$View.title.Text;$View.subtitle.AccessibleName=$View.subtitle.Text
    $View.count.AccessibleName=$View.count.Text+'，'+$View.unit.Text;$View.instructions.AccessibleName=$View.instructions.Text
    $View.steps.AccessibleName='备份阶段：'+$View.subtitle.Text
    & $View.SyncButtons;& $View.PaintPhase;& $View.Layout
    $View.RenderKey=$renderKey
  } catch {
    $View.title.Text='阶段显示暂不可用';$View.subtitle.Text='请展开完整任务详情；本显示错误不改变任务状态。'
  }
}
