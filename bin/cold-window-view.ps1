# View only. This module never confirms exit, cancels a task, changes ownership or writes task records.
if (-not ('PackerViews.RoundButton' -as [type])) {
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing,Accessibility -TypeDefinition (@'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using System.Runtime.InteropServices;
namespace PackerViews {
  public class BufferedForm:Form {
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr h,int a,ref int v,int s);
    public Color CaptionText {get;set;}
    public BufferedForm(){DoubleBuffered=true;ResizeRedraw=true;CaptionText=Color.Empty;}
    public void FitWorkingArea(Size logical){
      float scale;using(Graphics g=CreateGraphics())scale=g.DpiX/96f;
      Rectangle area=Screen.FromControl(this).WorkingArea;int chromeWidth=Width-ClientSize.Width,chromeHeight=Height-ClientSize.Height;
      ClientSize=new Size(Math.Max(1,Math.Min((int)Math.Round(logical.Width*scale),area.Width-chromeWidth-24)),Math.Max(1,Math.Min((int)Math.Round(logical.Height*scale),area.Height-chromeHeight-24)));
      Location=new Point(area.Left+Math.Max(0,(area.Width-Width)/2),area.Top+Math.Max(0,(area.Height-Height)/2));
    }
    public void SetDarkChrome(bool dark){
      if(!IsHandleCreated||SystemInformation.HighContrast)return;
      try{int value=dark?1:0;if(DwmSetWindowAttribute(Handle,20,ref value,4)!=0)DwmSetWindowAttribute(Handle,19,ref value,4);}catch{}
      try{int border=ColorTranslator.ToWin32(BackColor);DwmSetWindowAttribute(Handle,34,ref border,4);}catch{}
      try{int caption=ColorTranslator.ToWin32(BackColor);DwmSetWindowAttribute(Handle,35,ref caption,4);int text=ColorTranslator.ToWin32(CaptionText==Color.Empty?(dark?Color.White:Color.Black):CaptionText);DwmSetWindowAttribute(Handle,36,ref text,4);}catch{}
    }
    protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);try{if(!SystemInformation.HighContrast){int round=2;DwmSetWindowAttribute(Handle,33,ref round,4);SetDarkChrome(BackColor.GetBrightness()<.4f);}}catch{}}
  }
  public class BufferedPanel:Panel { public BufferedPanel(){DoubleBuffered=true;ResizeRedraw=true;} }
  public class BufferedTableLayoutPanel:TableLayoutPanel { public BufferedTableLayoutPanel(){DoubleBuffered=true;ResizeRedraw=true;} }
  public static class DrawingTools {
    public static Color Blend(Color a,Color b,float amount){return Color.FromArgb((int)(a.R+(b.R-a.R)*amount),(int)(a.G+(b.G-a.G)*amount),(int)(a.B+(b.B-a.B)*amount));}
    public static GraphicsPath Round(RectangleF r,float radius) {
      GraphicsPath p=new GraphicsPath();float d=Math.Min(radius*2,Math.Min(r.Width,r.Height));
      if(d<1){p.AddRectangle(r);return p;}
      p.AddArc(r.Left,r.Top,d,d,180,90);p.AddArc(r.Right-d,r.Top,d,d,270,90);
      p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.Left,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;
    }
  }
  public class RoundSurface:Panel {
    public Color BorderColor {get;set;}
    public RoundSurface(){DoubleBuffered=true;ResizeRedraw=true;BorderColor=Color.Gainsboro;}
    protected override void OnPaintBackground(PaintEventArgs e){
      e.Graphics.Clear(Parent==null?SystemColors.Window:Parent.BackColor);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
      if(Width<2||Height<2)return;
      using(GraphicsPath p=DrawingTools.Round(new RectangleF(.5f,.5f,Width-1,Height-1),12*Font.Height/17f)){
        using(Brush b=new SolidBrush(BackColor))e.Graphics.FillPath(b,p);using(Pen pen=new Pen(BorderColor))e.Graphics.DrawPath(pen,p);
      }
    }
  }
  public class RoundButton:Button {
    private bool hover,pressed;
    private string measuredText;private Font measuredFont;private int measuredWidth=-1,measuredDpi;private Size measuredSize;
    public bool Primary {get;set;} public Color Accent {get;set;} public Color OnAccent {get;set;}
    public Color LineColor {get;set;} public bool Quiet {get;set;}
    public Color Surface {get;set;} public Color HoverFill {get;set;} public Color PressedFill {get;set;}
    public Color DisabledFill {get;set;} public Color DisabledText {get;set;} public Color FocusColor {get;set;}
    public RoundButton(){FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;DoubleBuffered=true;ResizeRedraw=true;AutoSize=true;Accent=Color.RoyalBlue;OnAccent=Color.White;LineColor=Color.Gainsboro;Padding=new Padding(12,8,12,8);Surface=Color.Empty;HoverFill=Color.Empty;PressedFill=Color.Empty;DisabledFill=Color.Empty;DisabledText=Color.Empty;FocusColor=Color.Empty;}
    protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
    protected override void OnMouseLeave(EventArgs e){hover=false;pressed=false;Invalidate();base.OnMouseLeave(e);}
    protected override void OnMouseDown(MouseEventArgs e){pressed=true;Invalidate();base.OnMouseDown(e);}
    protected override void OnMouseUp(MouseEventArgs e){pressed=false;Invalidate();base.OnMouseUp(e);}
    public override Size GetPreferredSize(Size proposed){
      int max=MaximumSize.Width>0?MaximumSize.Width:1600;
      if(measuredWidth==max&&measuredDpi==DeviceDpi&&measuredText==Text&&Object.ReferenceEquals(measuredFont,Font))return measuredSize;
      Size text;Size available=new Size(Math.Max(30,max-28),Int32.MaxValue);TextFormatFlags flags=TextFormatFlags.WordBreak|TextFormatFlags.NoPrefix;
      if(IsHandleCreated){using(Graphics g=CreateGraphics())text=TextRenderer.MeasureText(g,Text,Font,available,flags);}else text=TextRenderer.MeasureText(Text,Font,available,flags);
      measuredWidth=max;measuredDpi=DeviceDpi;measuredText=Text;measuredFont=Font;measuredSize=new Size(Math.Min(max,text.Width+28),Math.Max(38,text.Height+18));return measuredSize;
    }
    protected override void OnPaint(PaintEventArgs e){
      e.Graphics.Clear(Parent==null?BackColor:Parent.BackColor);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
      Color parent=Parent==null?BackColor:Parent.BackColor;
      Color fill=Primary?Accent:(Quiet?parent:(Surface!=Color.Empty?Surface:BackColor)),fg=Primary?OnAccent:ForeColor;
      if(!Enabled){fill=DisabledFill!=Color.Empty?DisabledFill:BackColor;fg=DisabledText!=Color.Empty?DisabledText:SystemColors.GrayText;}
      else if(pressed){fill=PressedFill!=Color.Empty?PressedFill:DrawingTools.Blend(fill,Primary?OnAccent:ForeColor,.16f);}
      else if(hover){fill=HoverFill!=Color.Empty?HoverFill:DrawingTools.Blend(fill,Primary?OnAccent:ForeColor,.07f);}
      using(GraphicsPath p=DrawingTools.Round(new RectangleF(.5f,.5f,Math.Max(1,Width-1),Math.Max(1,Height-1)),8*Font.Height/17f)){
        using(Brush b=new SolidBrush(fill))e.Graphics.FillPath(b,p);
        if(!Quiet&&!Primary)using(Pen pen=new Pen(LineColor))e.Graphics.DrawPath(pen,p);
      }
      TextRenderer.DrawText(e.Graphics,Text,Font,new Rectangle(10,5,Math.Max(1,Width-20),Math.Max(1,Height-10)),fg,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.WordBreak|TextFormatFlags.NoPrefix);
      if(Focused&&ShowFocusCues){
        Color ring=FocusColor!=Color.Empty?FocusColor:fg;
        using(GraphicsPath fp=DrawingTools.Round(new RectangleF(2.5f,2.5f,Math.Max(1,Width-5),Math.Max(1,Height-5)),6*Font.Height/17f))using(Pen pen=new Pen(ring,1.6f))e.Graphics.DrawPath(pen,fp);
      }
    }
  }
  public class WizardSteps:Control {
    public int Active {get;set;} public bool Complete {get;set;} public bool FailureKnown {get;set;}
    public Color Accent {get;set;} public Color Muted {get;set;} public Color LineColor {get;set;}
    public Color SoftAccent {get;set;} public Color ErrorColor {get;set;} public Color OnAccent {get;set;}
    private string[] names={"退出 DSH","环境检查","文件打包","完整性校验","完成"};
    public WizardSteps(){DoubleBuffered=true;ResizeRedraw=true;TabStop=false;Active=-1;Height=58;AccessibleRole=AccessibleRole.Grouping;OnAccent=Color.White;}
    protected override void OnPaint(PaintEventArgs e){
      base.OnPaint(e);Graphics g=e.Graphics;g.Clear(BackColor);g.SmoothingMode=SmoothingMode.AntiAlias;
      float cell=ClientSize.Width/5f,d=Math.Max(22,Font.Height*1.32f),cy=d/2+4;
      for(int i=0;i<5;i++){
        float x=cell*(i+.5f);bool done=Complete||(Active>=0&&i<Active),active=i==Active;
        if(i<4)using(Pen p=new Pen(done?DrawingTools.Blend(LineColor,Accent,.5f):LineColor,2)){p.StartCap=p.EndCap=LineCap.Round;g.DrawLine(p,x+d/2+7,cy,x+cell-d/2-7,cy);}
        Color color=active&&FailureKnown?ErrorColor:active||done?Accent:Muted;
        if(active)using(Brush halo=new SolidBrush(SoftAccent))g.FillEllipse(halo,x-d/2-4,cy-d/2-4,d+8,d+8);
        using(Brush b=new SolidBrush(active?(FailureKnown?ErrorColor:Accent):done?SoftAccent:BackColor))g.FillEllipse(b,x-d/2,cy-d/2,d,d);
        if(!active&&!done)using(Pen p=new Pen(LineColor))g.DrawEllipse(p,x-d/2,cy-d/2,d,d);
        if(done){using(Pen p=new Pen(Accent,1.7f))g.DrawLines(p,new PointF[]{new PointF(x-5,cy),new PointF(x-1,cy+4),new PointF(x+6,cy-4)});}
        else TextRenderer.DrawText(g,active&&FailureKnown?"!":(i+1).ToString(),Font,new Rectangle((int)(x-d/2),(int)(cy-d/2),(int)d,(int)d),active?OnAccent:color,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);
        TextRenderer.DrawText(g,names[i],Font,new Rectangle((int)(cell*i),(int)(cy+d/2+5),(int)cell,Math.Max(1,Height-(int)(cy+d/2+5))),color,TextFormatFlags.HorizontalCenter|TextFormatFlags.WordBreak|TextFormatFlags.NoPrefix);
      }
    }
  }
  public class PhaseGlyph:Control {
    public string Kind {get;set;} public Color Tint {get;set;} public Color SoftTint {get;set;}
    public PhaseGlyph(){DoubleBuffered=true;ResizeRedraw=true;TabStop=false;Size=new Size(44,44);Kind="waiting";}
    protected override void OnPaint(PaintEventArgs e){
      Graphics g=e.Graphics;GraphicsState saved=g.Save();try{g.Clear(Parent.BackColor);g.SmoothingMode=SmoothingMode.AntiAlias;
      using(GraphicsPath bg=DrawingTools.Round(new RectangleF(0,0,Width,Height),12))using(Brush b=new SolidBrush(SoftTint))g.FillPath(b,bg);
      float scale=Math.Min(Width,Height)/52f;g.TranslateTransform((Width-26*scale)/2,(Height-26*scale)/2);g.ScaleTransform(scale,scale);
      using(Pen p=new Pen(Tint,1.7f)){
        if(Kind=="success")g.DrawLines(p,new Point[]{new Point(4,13),new Point(10,19),new Point(23,5)});
        else if(Kind=="cancelled"){g.DrawEllipse(p,3,3,20,20);g.DrawLine(p,7,13,19,13);}
        else if(Kind=="failed"||Kind=="unknown"){g.DrawEllipse(p,3,3,20,20);g.DrawLine(p,9,9,17,17);g.DrawLine(p,17,9,9,17);}
        else if(Kind=="writing"){g.DrawPolygon(p,new Point[]{new Point(13,2),new Point(23,7),new Point(23,19),new Point(13,25),new Point(3,19),new Point(3,7)});g.DrawLines(p,new Point[]{new Point(3,7),new Point(13,13),new Point(23,7)});g.DrawLine(p,13,13,13,25);}
        else if(Kind=="waiting"||Kind=="initial"){g.DrawLines(p,new Point[]{new Point(11,3),new Point(3,3),new Point(3,23),new Point(11,23)});g.DrawLine(p,9,13,24,13);g.DrawLines(p,new Point[]{new Point(18,7),new Point(24,13),new Point(18,19)});}
        else{g.DrawPolygon(p,new Point[]{new Point(13,2),new Point(23,6),new Point(22,18),new Point(13,25),new Point(4,18),new Point(3,6)});g.DrawLines(p,new Point[]{new Point(8,13),new Point(12,17),new Point(19,9)});}
      }}finally{g.Restore(saved);}
    }
  }
  public class PhaseProgress:Control {
    private Timer timer; private ProgressBarStyle style; private int speed=30,value;private float offset;
    public Color Accent {get;set;} public Color Track {get;set;}
    public ProgressBarStyle Style{get{return style;}set{if(style==value)return;style=value;Pulse();Invalidate();}}
    public int MarqueeAnimationSpeed{get{return speed;}set{if(speed==value)return;speed=value;Pulse();}}
    public int Value{get{return value;}set{int next=Math.Max(0,Math.Min(100,value));if(this.value==next)return;this.value=next;Invalidate();}}
    public PhaseProgress(){DoubleBuffered=true;ResizeRedraw=true;Height=5;TabStop=false;AccessibleRole=AccessibleRole.ProgressBar;style=ProgressBarStyle.Marquee;timer=new Timer();timer.Interval=45;timer.Tick+=delegate{offset+=.022f;if(offset>1.35f)offset=0;Invalidate();};}
    private void Pulse(){if(timer!=null)timer.Enabled=speed>0&&style==ProgressBarStyle.Marquee&&Visible&&SystemInformation.UIEffectsEnabled;}
    protected override void OnVisibleChanged(EventArgs e){base.OnVisibleChanged(e);Pulse();}
    protected override void OnPaint(PaintEventArgs e){Graphics g=e.Graphics;g.Clear(Parent.BackColor);g.SmoothingMode=SmoothingMode.AntiAlias;
      using(GraphicsPath p=DrawingTools.Round(new RectangleF(0,0,Width,Height),2.5f))using(Brush b=new SolidBrush(Track))g.FillPath(b,p);
      float width=style==ProgressBarStyle.Marquee?Width*.3f:Width*value/100f,left=style==ProgressBarStyle.Marquee?(timer.Enabled?Width*(offset-.3f):Width*.35f):0;
      if(width>0)using(GraphicsPath p=DrawingTools.Round(new RectangleF(left,0,width,Height),2.5f))using(Brush b=new SolidBrush(Accent))g.FillPath(b,p);
    }
    protected override AccessibleObject CreateAccessibilityInstance(){return new ProgressAccessible(this);}
    private class ProgressAccessible:ControlAccessibleObject{private PhaseProgress owner;public ProgressAccessible(PhaseProgress c):base(c){owner=c;}public override string Value{get{return owner.Style==ProgressBarStyle.Marquee?"进行中，百分比未知":owner.Value.ToString()+"%";}set{}}}
    protected override void Dispose(bool disposing){if(disposing&&timer!=null)timer.Dispose();base.Dispose(disposing);}
  }
}
'@ + (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'assistant-controls.cs') -Raw -Encoding UTF8))
}

function New-PackerAssistantView([string]$Target) {
  $form=New-Object PackerViews.BufferedForm
  $form.Text='环境恢复包 · 独立助手';$form.StartPosition='CenterScreen';$form.TopMost=$true
  $form.AutoScaleMode='Dpi';$form.AutoScaleDimensions=New-Object Drawing.SizeF(96,96)
  $form.Size=New-Object Drawing.Size(780,558);$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$true;$form.SizeGripStyle='Hide'
  $form.Font=New-Object Drawing.Font('Microsoft YaHei UI',10.5)
  $form.AccessibleName='环境恢复包独立备份助手'
  $viewport=New-Object PackerViews.ScrollViewport;$viewport.Dock='Fill';$form.Controls.Add($viewport);$hostPanel=$viewport.Content
  $root=New-Object PackerViews.BufferedTableLayoutPanel;$root.Dock='Top';$root.AutoSize=$true;$root.AutoSizeMode='GrowAndShrink'
  $root.ColumnCount=1;$root.RowCount=7;$root.Padding=New-Object Windows.Forms.Padding(24,14,24,12)
  [void]$root.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)))
  for($i=0;$i -lt 7;$i++){[void]$root.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))}
  $hostPanel.Controls.Add($root)
  function New-Text([string]$Text,[bool]$Centered=$false){
    $c=New-Object Windows.Forms.Label;$c.Text=$Text;$c.AutoSize=$true;$c.Dock='Fill';$c.Margin=New-Object Windows.Forms.Padding(0)
    if($Centered){$c.TextAlign='MiddleCenter'};return $c
  }
  $header=New-Object Windows.Forms.Panel;$header.Dock='Fill';$header.Height=32;$header.Margin=New-Object Windows.Forms.Padding(0,0,0,10)
  $brand=New-Text '环境恢复包  ·  独立助手';$brand.AutoSize=$false;$brand.AutoEllipsis=$true;$brand.TextAlign='MiddleLeft';$brand.Dock='Fill';$header.Controls.Add($brand)
  $secondaryGroup=New-Object Windows.Forms.FlowLayoutPanel;$secondaryGroup.Dock='Right';$secondaryGroup.AutoSize=$true;$secondaryGroup.AutoSizeMode='GrowAndShrink';$secondaryGroup.WrapContents=$false;$secondaryGroup.FlowDirection='RightToLeft';$secondaryGroup.Margin=New-Object Windows.Forms.Padding(0);$secondaryGroup.AccessibleName='次级操作'
  $gear=New-Object PackerViews.RoundButton;$gear.Text='外观 ▾';$gear.Quiet=$true;$gear.AutoSize=$true;$gear.Margin=New-Object Windows.Forms.Padding(4,0,0,0);$gear.AccessibleName='助手外观设置'
  $toggle=New-Object PackerViews.RoundButton;$toggle.Text='任务详情 ▾';$toggle.Quiet=$true;$toggle.AutoSize=$true;$toggle.Margin=New-Object Windows.Forms.Padding(4,0,0,0);$toggle.AccessibleName='展开或收起任务详情'
  $secondaryGroup.Controls.Add($gear);$secondaryGroup.Controls.Add($toggle);$header.Controls.Add($secondaryGroup)
  $root.Controls.Add($header,0,0)
  $prefs=New-Object PackerViews.RoundSettingsBar;$prefs.Dock='Fill';$prefs.AutoSize=$true;$prefs.WrapContents=$true;$prefs.Visible=$false;$prefs.Padding=New-Object Windows.Forms.Padding(12,9,12,9)
  $prefs.Margin=New-Object Windows.Forms.Padding(0,0,0,10)
  $appearanceLabel=New-Text '主题';$appearanceLabel.Margin=New-Object Windows.Forms.Padding(0,10,10,0);$prefs.Controls.Add($appearanceLabel)
  $theme=New-Object PackerViews.RoundChoice;$theme.DropDownStyle='DropDownList';$theme.Width=148;$theme.AccessibleName='助手主题'
  [void]$theme.Items.AddRange(@('跟随系统','浅色','深色'));$theme.SelectedIndex=0;$prefs.Controls.Add($theme)
  $fontLabel=New-Text '字号';$fontLabel.Margin=New-Object Windows.Forms.Padding(18,10,10,0);$prefs.Controls.Add($fontLabel)
  $size=New-Object PackerViews.RoundNumber;$size.Minimum=9;$size.Maximum=22;$size.DecimalPlaces=1;$size.Increment=.5;$size.Value=10.5;$size.Width=176;$size.AccessibleName='助手字号';$prefs.Controls.Add($size)
  $root.Controls.Add($prefs,0,1)
  $steps=New-Object PackerViews.WizardSteps;$steps.Dock='Fill';$steps.Height=60;$steps.Margin=New-Object Windows.Forms.Padding(0,0,0,12);$root.Controls.Add($steps,0,2)

  $summary=New-Object PackerViews.RoundSurface;$summary.AutoSize=$false;$summary.Dock='Fill';$summary.Padding=New-Object Windows.Forms.Padding(14);$summary.Margin=New-Object Windows.Forms.Padding(0,0,0,12)
  $summaryTable=New-Object Windows.Forms.TableLayoutPanel;$summaryTable.ColumnCount=3;$summaryTable.RowCount=5;$summaryTable.AutoSize=$true;$summaryTable.AutoSizeMode='GrowAndShrink';$summaryTable.Dock='Top'
  [void]$summaryTable.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Absolute',56)))
  [void]$summaryTable.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)))
  [void]$summaryTable.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('AutoSize')))
  for($i=0;$i -lt 5;$i++){[void]$summaryTable.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))}
  $glyph=New-Object PackerViews.PhaseGlyph;$glyph.Size=New-Object Drawing.Size(44,44);$glyph.Anchor='Top,Left';$glyph.Margin=New-Object Windows.Forms.Padding(0,2,12,0)
  $title=New-Text '正在连接独立助手';$title.AutoSize=$true;$title.Margin=New-Object Windows.Forms.Padding(0,0,8,2)
  $statusPill=New-Object PackerViews.RoundSurface;$statusPill.AutoSize=$true;$statusPill.AutoSizeMode='GrowAndShrink';$statusPill.Anchor='Top,Right';$statusPill.Padding=New-Object Windows.Forms.Padding(10,3,10,3);$statusPill.Margin=New-Object Windows.Forms.Padding(4,2,0,0)
  $resultCaption=New-Text '尚未开始备份';$resultCaption.AutoSize=$true;$resultCaption.Margin=New-Object Windows.Forms.Padding(0);$statusPill.Controls.Add($resultCaption)
  $subtitle=New-Text '请暂时保持 DSH 运行，等待接管完成。';$subtitle.AutoSize=$true;$subtitle.Margin=New-Object Windows.Forms.Padding(0,4,0,0);$subtitle.Padding=New-Object Windows.Forms.Padding(0,1,0,1)
  $progress=New-Object PackerViews.PhaseProgress;$progress.Dock='Fill';$progress.Height=5;$progress.Margin=New-Object Windows.Forms.Padding(0,11,0,0);$progress.AccessibleName='当前阶段进度，非整体百分比'
  $instructions=New-Text '';$instructions.AutoSize=$true;$instructions.Margin=New-Object Windows.Forms.Padding(0,4,8,0);$instructions.Padding=New-Object Windows.Forms.Padding(0,1,0,1)
  $countGroup=New-Object Windows.Forms.FlowLayoutPanel;$countGroup.AutoSize=$true;$countGroup.AutoSizeMode='GrowAndShrink';$countGroup.WrapContents=$false;$countGroup.FlowDirection='LeftToRight';$countGroup.Anchor='Top,Right';$countGroup.Margin=New-Object Windows.Forms.Padding(4,2,0,0)
  $count=New-Text '—';$count.AutoSize=$true;$count.Margin=New-Object Windows.Forms.Padding(0,0,4,0)
  $unit=New-Text '等待任务记录';$unit.AutoSize=$true;$unit.Margin=New-Object Windows.Forms.Padding(0,2,0,0)
  $countGroup.Controls.Add($count);$countGroup.Controls.Add($unit)
  $hint=New-Text '尚未开始备份';$hint.AutoSize=$true;$hint.Margin=New-Object Windows.Forms.Padding(0,5,0,0);$hint.Padding=New-Object Windows.Forms.Padding(0,1,0,1)
  $summaryTable.Controls.Add($glyph,0,0);$summaryTable.SetRowSpan($glyph,2)
  $summaryTable.Controls.Add($title,1,0);$summaryTable.Controls.Add($statusPill,2,0)
  $summaryTable.Controls.Add($subtitle,1,1)
  $summaryTable.Controls.Add($progress,0,2);$summaryTable.SetColumnSpan($progress,3)
  $summaryTable.Controls.Add($instructions,0,3);$summaryTable.SetColumnSpan($instructions,2)
  $summaryTable.Controls.Add($countGroup,2,3)
  $summaryTable.Controls.Add($hint,0,4);$summaryTable.SetColumnSpan($hint,3)
  $summary.Controls.Add($summaryTable);$root.Controls.Add($summary,0,3)

  $saveCard=New-Object PackerViews.RoundSurface;$saveCard.AutoSize=$false;$saveCard.Dock='Fill';$saveCard.Padding=New-Object Windows.Forms.Padding(14);$saveCard.Margin=New-Object Windows.Forms.Padding(0,0,0,12)
  $saveTable=New-Object Windows.Forms.TableLayoutPanel;$saveTable.ColumnCount=2;$saveTable.RowCount=2;$saveTable.AutoSize=$true;$saveTable.Dock='Top'
  [void]$saveTable.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)))
  [void]$saveTable.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('AutoSize')))
  [void]$saveTable.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')));[void]$saveTable.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))
  $targetCaption=New-Text '保存位置';$targetCaption.AutoSize=$true;$targetCaption.Margin=New-Object Windows.Forms.Padding(0,0,0,0)
  $copyPath=New-Object PackerViews.RoundButton;$copyPath.Text='复制路径';$copyPath.Quiet=$true;$copyPath.AutoSize=$true;$copyPath.Margin=New-Object Windows.Forms.Padding(8,0,0,0);$copyPath.AccessibleName='复制 ZIP 保存路径';$copyPath.Tag='复制路径'
  $pathBox=New-Object PackerViews.RoundSurface;$pathBox.AutoSize=$false;$pathBox.Height=34;$pathBox.Dock='Fill';$pathBox.Padding=New-Object Windows.Forms.Padding(8,7,8,7);$pathBox.Margin=New-Object Windows.Forms.Padding(0,6,0,0)
  $destination=New-Object Windows.Forms.TextBox;$destination.ReadOnly=$true;$destination.Multiline=$false;$destination.WordWrap=$false;$destination.BorderStyle='None';$destination.Dock='Fill';$destination.Text=$Target;$destination.AccessibleName='备份 ZIP 保存位置';$destination.TabIndex=2;$destination.ShortcutsEnabled=$true
  $pathBox.Controls.Add($destination)
  $tip=New-Object Windows.Forms.ToolTip;$tip.SetToolTip($destination,$Target)
  $saveTable.Controls.Add($targetCaption,0,0);$saveTable.Controls.Add($copyPath,1,0)
  $saveTable.Controls.Add($pathBox,0,1);$saveTable.SetColumnSpan($pathBox,2)
  $saveCard.Controls.Add($saveTable);$root.Controls.Add($saveCard,0,4)

  $resultCard=New-Object PackerViews.RoundSurface;$resultCard.AutoSize=$false;$resultCard.Dock='Fill';$resultCard.Padding=New-Object Windows.Forms.Padding(16);$resultCard.Margin=New-Object Windows.Forms.Padding(0,0,0,12);$resultCard.Visible=$false
  $resultTable=New-Object Windows.Forms.TableLayoutPanel;$resultTable.ColumnCount=2;$resultTable.RowCount=6;$resultTable.AutoSize=$true;$resultTable.AutoSizeMode='GrowAndShrink';$resultTable.Dock='Top'
  [void]$resultTable.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Absolute',78)))
  [void]$resultTable.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)))
  for($i=0;$i -lt 6;$i++){[void]$resultTable.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))}
  $resultTitle=New-Text '备份成功';$resultTitle.AutoSize=$true;$resultTitle.Visible=$false;$resultTitle.Margin=New-Object Windows.Forms.Padding(0)
  $resultHead=New-Object Windows.Forms.TableLayoutPanel;$resultHead.ColumnCount=2;$resultHead.RowCount=1;$resultHead.AutoSize=$true;$resultHead.Dock='Fill';$resultHead.Margin=New-Object Windows.Forms.Padding(0,0,0,2)
  [void]$resultHead.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)));[void]$resultHead.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('AutoSize')))
  [void]$resultHead.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))
  $resultSummary=New-Text '';$resultSummary.AutoSize=$true;$resultSummary.Dock='Fill';$resultSummary.Margin=New-Object Windows.Forms.Padding(0,1,0,1);$resultSummary.Padding=New-Object Windows.Forms.Padding(0,1,0,1)
  $resultTime=New-Text '';$resultTime.AutoSize=$true;$resultTime.Anchor='Right';$resultTime.TextAlign='MiddleRight';$resultTime.Margin=New-Object Windows.Forms.Padding(8,0,0,0);$resultTime.Padding=New-Object Windows.Forms.Padding(0,1,0,1)
  $resultHead.Controls.Add($resultSummary,0,0);$resultHead.Controls.Add($resultTime,1,0)
  $resultPathCaption=New-Text 'ZIP 路径';$resultPathCaption.AutoSize=$true;$resultPathCaption.Margin=New-Object Windows.Forms.Padding(0,8,8,0)
  $resultPathPanel=New-Object Windows.Forms.TableLayoutPanel;$resultPathPanel.ColumnCount=2;$resultPathPanel.RowCount=1;$resultPathPanel.AutoSize=$true;$resultPathPanel.Dock='Fill';$resultPathPanel.Margin=New-Object Windows.Forms.Padding(0,4,0,0)
  [void]$resultPathPanel.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)));[void]$resultPathPanel.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('AutoSize')))
  [void]$resultPathPanel.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))
  $resultPathBox=New-Object PackerViews.RoundSurface;$resultPathBox.Height=32;$resultPathBox.Dock='Fill';$resultPathBox.Padding=New-Object Windows.Forms.Padding(8,6,8,6);$resultPathBox.Margin=New-Object Windows.Forms.Padding(0)
  $resultPath=New-Object Windows.Forms.TextBox;$resultPath.ReadOnly=$true;$resultPath.Multiline=$false;$resultPath.WordWrap=$false;$resultPath.BorderStyle='None';$resultPath.Dock='Fill';$resultPath.AccessibleName='备份 ZIP 路径';$resultPath.ShortcutsEnabled=$true
  $resultPathBox.Controls.Add($resultPath)
  $copyPathResult=New-Object PackerViews.RoundButton;$copyPathResult.Text='复制';$copyPathResult.Quiet=$true;$copyPathResult.AutoSize=$true;$copyPathResult.Margin=New-Object Windows.Forms.Padding(6,0,0,0);$copyPathResult.AccessibleName='复制备份 ZIP 路径';$copyPathResult.Tag='复制'
  $resultPathPanel.Controls.Add($resultPathBox,0,0);$resultPathPanel.Controls.Add($copyPathResult,1,0)
  $resultHashCaption=New-Text 'SHA-256';$resultHashCaption.AutoSize=$true;$resultHashCaption.Margin=New-Object Windows.Forms.Padding(0,8,8,0)
  $resultHashPanel=New-Object Windows.Forms.TableLayoutPanel;$resultHashPanel.ColumnCount=2;$resultHashPanel.RowCount=1;$resultHashPanel.AutoSize=$true;$resultHashPanel.Dock='Fill';$resultHashPanel.Margin=New-Object Windows.Forms.Padding(0,4,0,0)
  [void]$resultHashPanel.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)));[void]$resultHashPanel.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('AutoSize')))
  [void]$resultHashPanel.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))
  $resultHashBox=New-Object PackerViews.RoundSurface;$resultHashBox.Height=32;$resultHashBox.Dock='Fill';$resultHashBox.Padding=New-Object Windows.Forms.Padding(8,6,8,6);$resultHashBox.Margin=New-Object Windows.Forms.Padding(0)
  $resultHash=New-Object Windows.Forms.TextBox;$resultHash.ReadOnly=$true;$resultHash.Multiline=$false;$resultHash.WordWrap=$false;$resultHash.BorderStyle='None';$resultHash.Dock='Fill';$resultHash.AccessibleName='备份 ZIP SHA-256';$resultHash.ShortcutsEnabled=$true
  $resultHashBox.Controls.Add($resultHash)
  $copyHash=New-Object PackerViews.RoundButton;$copyHash.Text='复制';$copyHash.Quiet=$true;$copyHash.AutoSize=$true;$copyHash.Margin=New-Object Windows.Forms.Padding(6,0,0,0);$copyHash.AccessibleName='复制备份 ZIP SHA-256';$copyHash.Tag='复制'
  $resultHashPanel.Controls.Add($resultHashBox,0,0);$resultHashPanel.Controls.Add($copyHash,1,0)
  $resultIntegrity=New-Text '';$resultIntegrity.AutoSize=$true;$resultIntegrity.Margin=New-Object Windows.Forms.Padding(0,6,0,0);$resultIntegrity.Padding=New-Object Windows.Forms.Padding(0,1,0,1)
  $compatWarning=New-Object PackerViews.RoundSurface;$compatWarning.AutoSize=$false;$compatWarning.Dock='Fill';$compatWarning.Padding=New-Object Windows.Forms.Padding(12,9,12,9);$compatWarning.Margin=New-Object Windows.Forms.Padding(0,8,0,0);$compatWarning.Visible=$false
  $compatWarningTable=New-Object Windows.Forms.TableLayoutPanel;$compatWarningTable.ColumnCount=1;$compatWarningTable.RowCount=2;$compatWarningTable.AutoSize=$true;$compatWarningTable.AutoSizeMode='GrowAndShrink';$compatWarningTable.Dock='Top'
  [void]$compatWarningTable.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)))
  [void]$compatWarningTable.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')));[void]$compatWarningTable.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))
  $compatWarningTitle=New-Text '';$compatWarningTitle.AutoSize=$true;$compatWarningTitle.Margin=New-Object Windows.Forms.Padding(0);$compatWarningTitle.Padding=New-Object Windows.Forms.Padding(0,1,0,1)
  $compatWarningBody=New-Text '';$compatWarningBody.AutoSize=$true;$compatWarningBody.Margin=New-Object Windows.Forms.Padding(0,4,0,0);$compatWarningBody.Padding=New-Object Windows.Forms.Padding(0,1,0,1)
  $compatWarningTable.Controls.Add($compatWarningTitle,0,0);$compatWarningTable.Controls.Add($compatWarningBody,0,1)
  $compatWarning.Controls.Add($compatWarningTable)
  $resultNote=New-Text '';$resultNote.AutoSize=$true;$resultNote.Margin=New-Object Windows.Forms.Padding(0,7,0,0);$resultNote.Padding=New-Object Windows.Forms.Padding(0,1,0,1)
  $resultTable.Controls.Add($resultHead,0,0);$resultTable.SetColumnSpan($resultHead,2)
  $resultTable.Controls.Add($resultPathCaption,0,1);$resultTable.Controls.Add($resultPathPanel,1,1)
  $resultTable.Controls.Add($resultHashCaption,0,2);$resultTable.Controls.Add($resultHashPanel,1,2)
  $resultTable.Controls.Add($resultIntegrity,0,3);$resultTable.SetColumnSpan($resultIntegrity,2)
  $resultTable.Controls.Add($compatWarning,0,4);$resultTable.SetColumnSpan($compatWarning,2)
  $resultTable.Controls.Add($resultNote,0,5);$resultTable.SetColumnSpan($resultNote,2)
  $resultCard.Controls.Add($resultTable);$resultCard.Controls.Add($resultTitle);$root.Controls.Add($resultCard,0,5)

  $logs=New-Object PackerViews.RoundSurface;$logs.Dock='Fill';$logs.Height=180;$logs.Visible=$false;$logs.Padding=New-Object Windows.Forms.Padding(12)
  $label=New-Object PackerViews.LogTextBox;$label.Multiline=$true;$label.ReadOnly=$true;$label.WordWrap=$true;$label.ScrollBars='None';$label.Dock='Fill';$label.BorderStyle='None';$label.AccessibleName='完整任务详情，只读';$label.TabIndex=11
  $logScroll=New-Object PackerViews.LogScrollBar;$logScroll.Editor=$label;$logScroll.Dock='Right';$logScroll.Width=12;$logScroll.AccessibleName='任务详情滚动位置';$logScroll.TabIndex=12
  $logs.Controls.Add($label);$logs.Controls.Add($logScroll);$root.Controls.Add($logs,0,6)

  $footer=New-Object Windows.Forms.TableLayoutPanel;$footer.Dock='Bottom';$footer.AutoSize=$true;$footer.AutoSizeMode='GrowAndShrink';$footer.ColumnCount=2;$footer.Padding=New-Object Windows.Forms.Padding(24,14,24,16)
  [void]$footer.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',30)));[void]$footer.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',70)))
  $warning=New-Text "私人 ZIP 未加密`r`n请保存在可信位置";$footer.Controls.Add($warning,0,0)
  $actions=New-Object Windows.Forms.FlowLayoutPanel;$actions.AutoSize=$true;$actions.AutoSizeMode='GrowAndShrink';$actions.Dock='Fill';$actions.WrapContents=$true;$actions.FlowDirection='RightToLeft'
  $confirmExit=New-Object PackerViews.RoundButton;$confirmExit.Text='我已正常退出，检查后继续';$confirmExit.Enabled=$false
  $cancel=New-Object PackerViews.RoundButton;$cancel.Text='取消任务'
  $open=New-Object PackerViews.RoundButton;$open.Text='打开所在文件夹';$open.Enabled=$false
  $actions.Controls.Add($open);$actions.Controls.Add($confirmExit);$actions.Controls.Add($cancel);$footer.Controls.Add($actions,1,0);$form.Controls.Add($footer)
  $prefs.TabIndex=8;$theme.TabIndex=0;$size.TabIndex=1;$toggle.TabIndex=0;$gear.TabIndex=1;$destination.TabIndex=2;$copyPath.TabIndex=3;$resultPath.TabIndex=4;$copyPathResult.TabIndex=5;$resultHash.TabIndex=6;$copyHash.TabIndex=7;$logs.TabIndex=9;$footer.TabIndex=10;$open.TabIndex=0;$confirmExit.TabIndex=0;$cancel.TabIndex=1
  $view=@{form=$form;label=$label;logScroll=$logScroll;viewport=$viewport;pageScroll=$viewport.ScrollBar;progress=$progress;confirmExit=$confirmExit;cancel=$cancel;open=$open;root=$root;header=$header;hostPanel=$hostPanel;title=$title;subtitle=$subtitle;steps=$steps;glyph=$glyph;summary=$summary;statusPill=$statusPill;count=$count;unit=$unit;instructions=$instructions;hint=$hint;destination=$destination;targetCaption=$targetCaption;resultCaption=$resultCaption;warning=$warning;theme=$theme;size=$size;brand=$brand;gear=$gear;toggle=$toggle;secondaryGroup=$secondaryGroup;prefs=$prefs;logs=$logs;actions=$actions;footer=$footer;saveCard=$saveCard;pathBox=$pathBox;copyPath=$copyPath;resultCard=$resultCard;resultTitle=$resultTitle;resultTime=$resultTime;resultSummary=$resultSummary;resultPathCaption=$resultPathCaption;resultPathPanel=$resultPathPanel;resultPathBox=$resultPathBox;resultPath=$resultPath;copyPathResult=$copyPathResult;resultHashCaption=$resultHashCaption;resultHashPanel=$resultHashPanel;resultHashBox=$resultHashBox;resultHash=$resultHash;copyHash=$copyHash;resultIntegrity=$resultIntegrity;compatWarning=$compatWarning;compatWarningTitle=$compatWarningTitle;compatWarningBody=$compatWarningBody;resultNote=$resultNote;Tip=$tip;Phase='initial';LastPhase=$null;LastFiles=$null;FailureKnown=$false;LayingOut=$false;OwnFonts=@()}
  $layout={
    if($view.LayingOut -or $view.Fitting){return}
    $layoutKey=@($hostPanel.ClientSize.Width,$hostPanel.ClientSize.Height,$form.Font.Height,$prefs.Visible,$logs.Visible,$saveCard.Visible,$resultCard.Visible,$compatWarning.Visible,$hint.Visible,$instructions.Visible,$title.Text,$subtitle.Text,$unit.Text,$instructions.Text,$hint.Text,$resultCaption.Text,$resultTitle.Text,$resultSummary.Text,$resultIntegrity.Text,$compatWarningTitle.Text,$compatWarningBody.Text,$resultNote.Text,$cancel.Text,$confirmExit.Text) -join [char]31
    if($view.LayoutKey -ceq $layoutKey){return};$view.LayoutKey=$layoutKey;$view.LayingOut=$true
    $root.SuspendLayout();$form.SuspendLayout()
    try{
      $width=[Math]::Max(200,$hostPanel.ClientSize.Width-$root.Padding.Horizontal-12)
      foreach($c in @($title,$subtitle,$hint,$instructions,$resultSummary,$resultIntegrity,$resultNote)){$c.MaximumSize=New-Object Drawing.Size($width,0)}
      foreach($c in @($compatWarningTitle,$compatWarningBody)){$c.MaximumSize=New-Object Drawing.Size([Math]::Max(120,$width-20),0)}
      foreach($c in @($count,$unit)){$c.MaximumSize=New-Object Drawing.Size([Math]::Max(100,$width-30),0)}
      $steps.Height=if($form.Font.Height -le 20){60}else{$form.Font.Height*3+20}
      $destinationHeight=[Math]::Max($form.Font.Height+6,$destination.PreferredHeight)
      $pathBox.Height=$destinationHeight+14;$destination.MinimumSize=New-Object Drawing.Size(0,$destinationHeight)
      $resultPathBox.Height=[Math]::Max(34,$resultPath.Font.Height+14);$resultHashBox.Height=[Math]::Max(34,$resultHash.Font.Height+14)
      $resultPath.MaximumSize=New-Object Drawing.Size([Math]::Max(80,$width-150),0)
      $resultHash.MaximumSize=New-Object Drawing.Size([Math]::Max(80,$width-150),0)
      $actionWidth=[Math]::Max(160,[int](($form.ClientSize.Width-$footer.Padding.Horizontal)*.7)-12)
      $actions.MaximumSize=New-Object Drawing.Size($actionWidth,0)
      foreach($button in @($open,$confirmExit,$cancel)){$button.MaximumSize=New-Object Drawing.Size(($actionWidth-8),0)}
      if($logs.Visible){$logs.Height=180}
      $header.Height=[Math]::Max(32,$secondaryGroup.PreferredSize.Height+4)
      $summaryTable.PerformLayout();$summary.PerformLayout();$resultTable.PerformLayout();$compatWarningTable.PerformLayout();$compatWarning.PerformLayout();$resultCard.PerformLayout()
      $summary.Height=[Math]::Max(60,$summaryTable.Height+$summary.Padding.Vertical)
      $saveCard.Height=[Math]::Max(50,$saveTable.Height+$saveCard.Padding.Vertical)
      $compatWarning.Height=[Math]::Max(0,$compatWarningTable.Height+$compatWarning.Padding.Vertical)
      $resultCard.Height=[Math]::Max(60,$resultTable.Height+$resultCard.Padding.Vertical)
      $statusPill.PerformLayout()
    }finally{$root.ResumeLayout($true);$form.ResumeLayout($true);$view.LayingOut=$false}
    if($null -ne $view.FitHeight){& $view.FitHeight}
  }.GetNewClosure()
  $view.Layout=$layout
  $view.FitHeight={
    if($view.Fitting -or $view.LayingOut){return}
    $view.Fitting=$true
    try{
      $target=$root.Height+$footer.Height+2
      $scale=$form.DeviceDpi/96.0
      $area=[Windows.Forms.Screen]::FromControl($form).WorkingArea
      $chrome=$form.Height-$form.ClientSize.Height
      $max=[Math]::Max(320,$area.Height-$chrome-24)
      $target=[Math]::Max([int](430*$scale),[Math]::Min($max,$target))
      if([Math]::Abs($form.ClientSize.Height-$target) -gt 2){$form.ClientSize=New-Object Drawing.Size($form.ClientSize.Width,$target)}
    }finally{$view.Fitting=$false}
  }.GetNewClosure()
  $sync={
    $buttonKey=@($view.Phase,$open.Enabled,$confirmExit.Enabled,$cancel.Enabled,$open.Text,$confirmExit.Text,$cancel.Text) -join [char]31
    if($view.ButtonKey -ceq $buttonKey){return};$view.ButtonKey=$buttonKey
    $confirmExit.Visible=$view.Phase -in @('waiting','initial');$open.Visible=$view.Phase -eq 'success'
    $confirmExit.Primary=$true;$open.Primary=$view.Phase -eq 'success';$cancel.Primary=$view.Phase -in @('failed','cancelled','unknown');$cancel.Quiet=$false
    $copyPath.Enabled=-not [string]::IsNullOrWhiteSpace($destination.Text)
    foreach($b in @($open,$confirmExit,$cancel)){$b.Invalidate();$b.Parent.Invalidate()}
    $actions.PerformLayout();$actions.Invalidate();$footer.Invalidate()
    & $view.Layout
  }.GetNewClosure();$view.SyncButtons=$sync
  $applyTheme={
    try{
      $dark=$theme.SelectedIndex -eq 2
      if($theme.SelectedIndex -eq 0){$setting=Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name AppsUseLightTheme -ErrorAction SilentlyContinue;$dark=$null -ne $setting -and $setting.AppsUseLightTheme -eq 0}
      $themeKey=@($dark,[Windows.Forms.SystemInformation]::HighContrast,[Windows.Forms.SystemInformation]::UIEffectsEnabled) -join '|'
      if($view.ThemeKey -ceq $themeKey){return}
      $p=@{Bg=[Drawing.Color]::FromArgb(246,248,251);Layer=[Drawing.Color]::FromArgb(255,255,255);Inset=[Drawing.Color]::FromArgb(243,246,250);Text=[Drawing.Color]::FromArgb(27,30,36);Muted=[Drawing.Color]::FromArgb(91,99,112);Line=[Drawing.Color]::FromArgb(220,225,233);Accent=[Drawing.Color]::FromArgb(15,108,189);AccentHover=[Drawing.Color]::FromArgb(17,94,163);AccentPressed=[Drawing.Color]::FromArgb(13,79,140);Soft=[Drawing.Color]::FromArgb(229,241,251);OnAccent=[Drawing.Color]::White;Error=[Drawing.Color]::FromArgb(196,43,28);SoftError=[Drawing.Color]::FromArgb(253,231,233);Success=[Drawing.Color]::FromArgb(15,123,15);SoftSuccess=[Drawing.Color]::FromArgb(223,246,221);Warn=[Drawing.Color]::FromArgb(138,83,0);SoftWarn=[Drawing.Color]::FromArgb(255,244,206);WarnBorder=[Drawing.Color]::FromArgb(232,195,106);WarnText=[Drawing.Color]::FromArgb(107,78,0);Disabled=[Drawing.Color]::FromArgb(232,235,240);DisabledText=[Drawing.Color]::FromArgb(118,126,138);Focus=[Drawing.Color]::FromArgb(15,108,189)}
      if($dark){$p=@{Bg=[Drawing.Color]::FromArgb(24,26,31);Layer=[Drawing.Color]::FromArgb(32,35,41);Inset=[Drawing.Color]::FromArgb(27,30,36);Text=[Drawing.Color]::FromArgb(235,237,242);Muted=[Drawing.Color]::FromArgb(166,173,185);Line=[Drawing.Color]::FromArgb(56,61,72);Accent=[Drawing.Color]::FromArgb(145,170,255);AccentHover=[Drawing.Color]::FromArgb(163,185,255);AccentPressed=[Drawing.Color]::FromArgb(128,153,240);Soft=[Drawing.Color]::FromArgb(40,50,74);OnAccent=[Drawing.Color]::FromArgb(20,30,55);Error=[Drawing.Color]::FromArgb(243,151,160);SoftError=[Drawing.Color]::FromArgb(61,41,47);Success=[Drawing.Color]::FromArgb(123,203,170);SoftSuccess=[Drawing.Color]::FromArgb(37,58,50);Warn=[Drawing.Color]::FromArgb(242,198,97);SoftWarn=[Drawing.Color]::FromArgb(58,46,20);WarnBorder=[Drawing.Color]::FromArgb(107,85,34);WarnText=[Drawing.Color]::FromArgb(247,217,139);Disabled=[Drawing.Color]::FromArgb(45,49,58);DisabledText=[Drawing.Color]::FromArgb(140,148,162);Focus=[Drawing.Color]::FromArgb(145,170,255)}}
      if([Windows.Forms.SystemInformation]::HighContrast){$p.Bg=[Drawing.SystemColors]::Window;$p.Layer=$p.Bg;$p.Inset=$p.Bg;$p.Text=[Drawing.SystemColors]::WindowText;$p.Muted=$p.Text;$p.Line=$p.Text;$p.Accent=[Drawing.SystemColors]::Highlight;$p.AccentHover=$p.Accent;$p.AccentPressed=$p.Accent;$p.OnAccent=[Drawing.SystemColors]::HighlightText;$p.Soft=$p.Bg;$p.Error=$p.Text;$p.SoftError=$p.Bg;$p.Success=$p.Text;$p.SoftSuccess=$p.Bg;$p.Warn=$p.Text;$p.SoftWarn=$p.Bg;$p.WarnBorder=$p.Line;$p.WarnText=$p.Text;$p.Disabled=$p.Bg;$p.DisabledText=$p.Text;$p.Focus=[Drawing.SystemColors]::Highlight}
      $view.Palette=$p;$view.Dark=$dark;$form.BackColor=$p.Bg;$form.ForeColor=$p.Text;$form.CaptionText=$p.Text;$form.SetDarkChrome($dark)
      $viewport.BackColor=$p.Bg;$root.BackColor=$p.Bg;$header.BackColor=$p.Bg;$footer.BackColor=$p.Bg;$secondaryGroup.BackColor=$p.Bg;$actions.BackColor=$p.Bg;$countGroup.BackColor=$p.Layer
      foreach($t in @($summaryTable,$saveTable,$resultTable,$resultHead,$resultPathPanel,$resultHashPanel)){$t.BackColor=$p.Layer}
      foreach($card in @($summary,$saveCard,$resultCard,$logs)){$card.BackColor=$p.Layer;$card.BorderColor=$p.Line}
      $prefs.BackColor=$p.Layer;$prefs.LineColor=$p.Line
      foreach($box in @($pathBox,$resultPathBox,$resultHashBox)){$box.BackColor=$p.Inset;$box.BorderColor=$p.Line}
      $compatWarning.BackColor=$p.SoftWarn;$compatWarning.BorderColor=$p.WarnBorder;$compatWarningTable.BackColor=$p.SoftWarn
      foreach($c in @($brand,$title,$count,$instructions,$resultTitle,$resultIntegrity)){$c.ForeColor=$p.Text}
      foreach($c in @($subtitle,$hint,$targetCaption,$warning,$appearanceLabel,$fontLabel,$unit,$resultTime,$resultSummary,$resultPathCaption,$resultHashCaption,$resultNote)){$c.ForeColor=$p.Muted}
      $compatWarningTitle.ForeColor=$p.Warn;$compatWarningBody.ForeColor=$p.WarnText
      foreach($c in @($destination,$resultPath,$resultHash)){$c.BackColor=$p.Inset;$c.ForeColor=$p.Text}
      $label.BackColor=$p.Inset;$label.ForeColor=$p.Text
      foreach($c in @($confirmExit,$cancel,$open,$copyPath,$copyPathResult,$copyHash,$toggle,$gear)){$c.Accent=$p.Accent;$c.OnAccent=$p.OnAccent;$c.LineColor=$p.Line;$c.Surface=$p.Layer;$c.ForeColor=$p.Text;$c.HoverFill=[Drawing.Color]::Empty;$c.PressedFill=[Drawing.Color]::Empty;$c.DisabledFill=$p.Disabled;$c.DisabledText=$p.DisabledText;$c.FocusColor=$p.Focus;$c.BackColor=if($c -in @($toggle,$gear)){$p.Bg}else{$p.Layer}}
      foreach($c in @($theme,$size)){$c.BackColor=$p.Layer;$c.ForeColor=$p.Text;$c.LineColor=$p.Line;$c.SoftColor=$p.Soft}
      $steps.Accent=$p.Accent;$steps.Muted=$p.Muted;$steps.LineColor=$p.Line;$steps.SoftAccent=$p.Soft;$steps.ErrorColor=$p.Error;$steps.OnAccent=$p.OnAccent
      $progress.Accent=$p.Accent;$progress.Track=$p.Line
      $logScroll.BackColor=$p.Layer;$logScroll.ThumbColor=$p.Muted;$logScroll.TrackColor=$p.Layer
      $progress.MarqueeAnimationSpeed=if([Windows.Forms.SystemInformation]::UIEffectsEnabled){30}else{0}
      & $view.PaintPhase
      $glyph.Invalidate();$steps.Invalidate();$statusPill.Invalidate();$summary.Invalidate();$saveCard.Invalidate();$resultCard.Invalidate()
      $view.ThemeKey=$themeKey
    }catch{ # Display preferences must never cancel an active backup.
    }
  }.GetNewClosure();$view.ApplyTheme=$applyTheme
  $view.PaintPhase={
    $paintKey=@($view.Phase,$view.Dark,[Windows.Forms.SystemInformation]::HighContrast,$steps.Active,$steps.Complete,$steps.FailureKnown) -join '|'
    if($view.PhasePaintKey -ceq $paintKey){return};$view.PhasePaintKey=$paintKey
    $p=$view.Palette
    $glyph.Tint=if($view.Phase -eq 'success'){$p.Success}elseif($view.Phase -in @('failed','unknown')){$p.Error}elseif($view.Phase -eq 'cancelled'){$p.Muted}else{$p.Accent}
    $glyph.SoftTint=if([Windows.Forms.SystemInformation]::HighContrast){$p.Bg}elseif($view.Phase -eq 'success'){$p.SoftSuccess}elseif($view.Phase -in @('failed','unknown')){$p.SoftError}else{$p.Soft}
    $pill=if($view.Phase -eq 'success'){@{Back=$p.SoftSuccess;Fore=$p.Success}}elseif($view.Phase -in @('failed','unknown')){@{Back=$p.SoftError;Fore=$p.Error}}elseif($view.Phase -eq 'cancelled'){@{Back=$p.Soft;Fore=$p.Muted}}else{@{Back=$p.Soft;Fore=$p.Accent}}
    $statusPill.BackColor=$pill.Back;$statusPill.BorderColor=$pill.Back;$resultCaption.ForeColor=$pill.Fore
    $resultTitle.ForeColor=if($view.Phase -eq 'success'){$p.Success}elseif($view.Phase -in @('failed','unknown')){$p.Error}else{$p.Text}
    $glyph.Invalidate();$steps.Invalidate();$statusPill.Invalidate();$statusPill.PerformLayout();$resultTitle.Invalidate()
  }.GetNewClosure()
  $setFonts={
    $old=$view.OwnFonts;$new=@((New-Object Drawing.Font('Microsoft YaHei UI',[single]$size.Value)),(New-Object Drawing.Font('Microsoft YaHei UI',([single]$size.Value+6.5),[Drawing.FontStyle]::Bold)),(New-Object Drawing.Font('Microsoft YaHei UI',([single]$size.Value+1.5),[Drawing.FontStyle]::Bold)),(New-Object Drawing.Font('Microsoft YaHei UI',([single]$size.Value+1),[Drawing.FontStyle]::Bold)),(New-Object Drawing.Font('Microsoft YaHei UI',([single]$size.Value+2),[Drawing.FontStyle]::Bold)),(New-Object Drawing.Font('Consolas',[single][Math]::Max(8,$size.Value-1.5))),(New-Object Drawing.Font('Microsoft YaHei UI',([single]$size.Value+.5),[Drawing.FontStyle]::Bold)))
    $form.Font=$new[0];$title.Font=$new[1];$count.Font=$new[2];$brand.Font=$new[3];$resultTitle.Font=$new[4];$resultPath.Font=$new[5];$resultHash.Font=$new[5];$compatWarningTitle.Font=$new[6];$view.OwnFonts=$new;& $view.Layout
    foreach($font in $old){$font.Dispose()}
  }.GetNewClosure()
  $size.Add_ValueChanged($setFonts);$theme.Add_SelectedIndexChanged($applyTheme)
  $gear.Add_Click({$prefs.Visible=-not $prefs.Visible;$gear.Text=if($prefs.Visible){'外观 ▴'}else{'外观 ▾'};$gear.AccessibleDescription=if($prefs.Visible){'外观设置已展开'}else{'外观设置已收起'};& $view.Layout;$hostPanel.ScrollControlIntoView($summary)}.GetNewClosure())
  $toggle.Add_Click({$logs.Visible=-not $logs.Visible;$toggle.Text=if($logs.Visible){'收起任务详情 ▴'}else{'任务详情 ▾'};& $view.Layout}.GetNewClosure())
  $copyTimer=New-Object Windows.Forms.Timer;$copyTimer.Interval=1400
  $copyTimer.Add_Tick({if($null -ne $view.CopyButton){$view.CopyButton.Text=[string]$view.CopyButton.Tag;$view.CopyButton=$null};$copyTimer.Stop()})
  $copyAction={
    param($button,$text)
    try{[Windows.Forms.Clipboard]::SetText([string]$text);$button.Text='已复制'}
    catch{$button.Text='复制失败'}
    $view.CopyButton=$button;$copyTimer.Stop();$copyTimer.Start()
  }
  $copyPath.Add_Click({& $copyAction $copyPath $destination.Text}.GetNewClosure())
  $copyPathResult.Add_Click({& $copyAction $copyPathResult $resultPath.Text}.GetNewClosure())
  $copyHash.Add_Click({& $copyAction $copyHash $resultHash.Text}.GetNewClosure())
  foreach($pair in @(@($destination,$pathBox),@($resultPath,$resultPathBox),@($resultHash,$resultHashBox))){
    $textBox=$pair[0];$surface=$pair[1]
    $textBox.Add_Enter({if($null -ne $view.Palette){$surface.BorderColor=$view.Palette.Accent;$surface.Invalidate()}}.GetNewClosure())
    $textBox.Add_Leave({if($null -ne $view.Palette){$surface.BorderColor=$view.Palette.Line;$surface.Invalidate()}}.GetNewClosure())
  }
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
  $form.Add_FormClosed({$appearanceTimer.Dispose();$copyTimer.Dispose();$tip.Dispose();foreach($font in $view.OwnFonts){$font.Dispose()}}.GetNewClosure())
  $form.Add_Shown({$form.FitWorkingArea((New-Object Drawing.Size(780,538)));& $view.Layout}.GetNewClosure())
  & $setFonts;& $sync;& $applyTheme
  $label.Text="正在初始化独立助手…`r`n请暂时不要退出 DSH。"
  Update-PackerAssistantState $view @{phase='initial';files=$null}
  return $view
}

function Set-PackerRecordDurability([hashtable]$View,[bool]$Durable) {
  # Every terminal outcome must report persistence truthfully. ZIP integrity
  # and the durability of ui-result.json are independent facts.
  if($Durable){return}
  $View.hint.Visible=$true
  $View.hint.Text='结果记录写入失败（ui-result.json 未持久保存）；请保留此窗口并检查任务目录中的原始记录。ZIP 完整性与本次结果记录的持久性分别判断。'
  $View.resultNote.Text=$View.resultNote.Text+' 结果记录未持久保存，请勿仅凭本页认定结果已留档。'
  $View.resultNote.AccessibleName=$View.resultNote.Text
}

function Update-PackerAssistantState([hashtable]$View,$State) {
  # Existing records are observations, not new safety decisions. Missing failure stages stay unknown.
  try {
    # Coverage is a bounded, code-only projection of the archive's capture gaps.
    # A missing/malformed summary is 'unknown' for old records, never a clean result.
    $covState='unknown';$covCount=0;$covCodes=@();$covBlocked=$false
    if($null -ne $State.coverage -and $State.coverage.schema -eq 1 -and $State.coverage.state -in @('critical-gaps','no-known-critical-gaps')){
      $covState=[string]$State.coverage.state
      try{$covCount=[int]$State.coverage.criticalCount}catch{$covCount=0}
      if($null -ne $State.coverage.criticalCodes){$covCodes=@($State.coverage.criticalCodes|Where-Object{$_ -match '^[A-Z0-9_]{1,64}$'}|Select-Object -Unique -First 8)}
      $covBlocked=($covState -eq 'critical-gaps')
      if($covState -eq 'no-known-critical-gaps' -and ($null -eq $State.coverage.criticalCount -or $State.coverage.criticalCount -ne 0 -or $null -eq $State.coverage.criticalCodes -or @($State.coverage.criticalCodes).Count -ne 0 -or $State.coverage.recoveryBlocked -ne $false -or $null -ne $State.coverage.blockReason -or $State.coverage.truncated -ne $false)){$covState='unknown';$covCount=0;$covCodes=@()}
    }
    $covLabel=$covCodes -join '、'
    $renderKey=@($State.phase,$State.files,$State.bytes,$State.error,$State.failurePhase,$State.failedPhase,$State.writers,$State.exitConfirmed,$State.quitVerified,$State.target,$State.sha256,$State.dependencyIssues,$State.at,$State.zipPresent,$covState,$covCount,$covLabel) -join [char]31
    if($View.RenderKey -ceq $renderKey){return}
    $phase=[string]$State.phase;$map=@{'waiting'=0;'exit-verified'=1;'scanning'=1;'checking-dependencies'=1;'writing'=2;'verifying'=3;'success'=4}
    if($phase -notin @('failed','success','cancelled','unknown','initial') -and $map.ContainsKey($phase)){$View.LastPhase=$phase}
    $number=0L;$valid=$null -ne $State.files -and [long]::TryParse([string]$State.files,[ref]$number) -and $number -ge 0
    if($valid -and $phase -ne 'failed'){$View.LastFiles=$number}
    $View.Phase=$phase;$View.FailureKnown=$false;$failurePhase=$null
    if($phase -eq 'failed'){
      if($State.failurePhase -and $map.ContainsKey([string]$State.failurePhase)){$failurePhase=[string]$State.failurePhase;$View.FailureKnown=$true}
      elseif($State.failedPhase -and $map.ContainsKey([string]$State.failedPhase)){$failurePhase=[string]$State.failedPhase;$View.FailureKnown=$true}
    }
    $phaseLabels=@{'initial'='等待助手接管';'waiting'='等待退出 DSH';'exit-verified'='环境检查';'scanning'='环境检查 / 扫描文件';'checking-dependencies'='环境检查 / 依赖检查';'writing'='文件打包';'verifying'='完整性校验';'success'='完成';'cancelled'='已取消';'unknown'='结果未确认'}
    $View.steps.Complete=$phase -eq 'success';$View.steps.FailureKnown=$View.FailureKnown
    $View.steps.Active=if($phase -eq 'failed'){if($View.FailureKnown){$map[$failurePhase]}else{-1}}elseif($phase -eq 'cancelled' -or $phase -eq 'unknown'){if($View.LastPhase){$map[$View.LastPhase]}else{-1}}elseif($map.ContainsKey($phase)){$map[$phase]}else{-1}
    $View.glyph.Kind=$phase
    $View.title.Text=switch($phase){'waiting'{if($State.exitConfirmed){'等待相关进程正常退出'}else{'请先正常退出 DSH'}} 'initial'{'正在连接独立助手'} 'exit-verified'{'正在检查备份环境'} 'scanning'{'正在扫描环境文件'} 'checking-dependencies'{'正在检查依赖兼容性'} 'writing'{'正在打包环境'} 'verifying'{'正在验证备份完整性'} 'success'{if($covBlocked){'归档完成；恢复受阻'}elseif($covState -eq 'unknown'){'归档完成（覆盖状态未记录）'}else{'归档完成'}} 'failed'{'备份失败'} 'cancelled'{'任务已取消'} 'unknown'{'结果未确认'} default{'任务状态未知'}}
    $View.subtitle.Text=switch($phase){'waiting'{'助手已接管。保存工作后，正常退出所有 DSH 实例（包括托盘）。'} 'initial'{'请暂时保持 DSH 运行，等待接管完成。'} 'success'{if($covBlocked){'ZIP 已写入并通过完整性校验；已知关键数据未采集，受支持恢复流程被阻断。'}elseif($covState -eq 'unknown'){'ZIP 已写入并通过完整性校验；本次记录未含覆盖摘要。'}else{'ZIP 已写入并通过完整性校验；恢复仍需目标检查。'}} 'failed'{if($View.FailureKnown){'失败阶段：'+$phaseLabels[$failurePhase]}elseif($View.LastPhase){'失败阶段未记录；最后观察到：'+$phaseLabels[$View.LastPhase]}else{'失败阶段未记录；不能确认错误发生在哪一步。'}} 'cancelled'{'任务在完成前被取消；未生成有效 ZIP。'} 'unknown'{'助手或协调器未留下完整终态；不能视为成功。'} default{'保持电脑开启，等待现有安全检查和任务流程完成。'}}
    $View.count.Visible=$phase -notin @('waiting','initial');$View.unit.Visible=$View.count.Visible
    $displayCount=if($phase -eq 'failed'){if($valid -and $number -gt 0){$number}else{$View.LastFiles}}elseif($valid){$number}else{$null}
    $View.count.Text=if($null -ne $displayCount){$displayCount.ToString('N0')}else{'—'}
    $View.unit.Text=if($phase -eq 'success'){'个文件已验证'+$(if($State.bytes){' · '+([double]$State.bytes/1MB).ToString('0.##')+' MB'}else{''})}elseif($phase -eq 'failed'){if($valid -and $number -gt 0){'终态记录的处理数'}elseif($null -ne $View.LastFiles){'最后观察到的处理数；不代表最终处理总量'}else{'失败记录未保留处理数'}}elseif($phase -eq 'cancelled' -or $phase -eq 'unknown'){'最后观察到的处理数'}else{'个文件已处理'}
    $View.instructions.Visible=$phase -in @('waiting','initial')
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
      '^TARGET_EXISTS$'{'目标 ZIP 已存在；没有覆盖文件。';break}
      '^SOURCE_CHANGED$'{'备份期间源文件发生变化。';break}
      '^HASH_MISMATCH$'{'归档校验失败；ZIP 未通过完整性验证。';break}
      '^ARCHIVE_LIMIT$'{'数据量超过单个归档上限。';break}
      default{'任务未能完成，请查看保留的诊断。'}
    }
    $View.instructions.Text=switch($phase){'waiting'{if($State.exitConfirmed){'已收到人工确认，等待检测通过。相关进程：'+$State.writers}else{'1  正常退出 DSH     →     2  回到这里确认'}} 'initial'{'助手确认接管后，再正常退出 DSH。'} 'failed'{$reason+$(if($State.error){' ['+$State.error+']'}else{''})} 'cancelled'{'已标记为取消，不会显示为成功。'} 'unknown'{'未确认的 ZIP 不得当作成功备份。'} 'success'{if($covBlocked){'已知关键覆盖缺口阻断受支持恢复流程；本包仅用于数据保全。'}else{'文件校验通过不等于恢复业务通过；恢复后仍需独立验收。'}} default{''}}
    $View.progress.Visible=$phase -in @('exit-verified','scanning','checking-dependencies','writing','verifying')
    $View.hint.Text=if($phase -eq 'waiting'){'人工确认不能绕过检测；超时将安全取消。'}elseif($phase -eq 'failed'){'请自行启动 DSH，在 Packer 查看诊断并检查异常任务，再使用新 ZIP 名称重试。'}elseif($phase -eq 'success'){'不会自动重启 DSH；结果会保留到你主动关闭。'}elseif($phase -eq 'cancelled'){'如仍需备份，请重新发起。'}elseif($phase -eq 'unknown'){'请在 Packer 的“任务与恢复”中查看最近记录。'}elseif($phase -eq 'initial'){'尚未开始备份。'}else{'当前阶段进行中 · 不估算整体百分比'}
    $View.hint.Visible=$phase -notin @('success','failed','cancelled','unknown')
    $View.targetCaption.Text=if($phase -eq 'success'){'已保存到'}else{'保存位置'}
    $View.resultCaption.Text=if($phase -in @('initial','waiting')){'尚未开始备份'}elseif($phase -eq 'success'){'ZIP 完整性通过'}elseif($phase -eq 'failed'){'未确认成功备份'}elseif($phase -eq 'cancelled'){'已取消'}elseif($phase -eq 'unknown'){'结果未确认'}else{$phaseLabels[$phase]}
    $terminal=$phase -in @('success','failed','cancelled','unknown')
    $View.saveCard.Visible=-not $terminal;$View.resultCard.Visible=$terminal
    if($terminal){
      $target=if($State.target){[string]$State.target}else{$View.destination.Text}
      $bytes=$null;if($State.bytes -and [double]$State.bytes -gt 0){$bytes=[double]$State.bytes}
      $sha=if([string]$State.sha256 -match '^[a-f0-9]{64}$'){[string]$State.sha256}else{''}
      $at=$null;if($State.at){try{$at=[DateTimeOffset]::FromUnixTimeMilliseconds([long]$State.at).ToLocalTime()}catch{}}
      $conflicts=0;if($null -ne $State.dependencyIssues){try{$conflicts=[int]$State.dependencyIssues}catch{$conflicts=0}}
      $View.resultTitle.Text=if($phase -eq 'success'){if($covBlocked){'归档完成；恢复受阻'}elseif($covState -eq 'unknown'){'归档完成（覆盖状态未记录）'}else{'归档完成'}}elseif($phase -eq 'failed'){'备份失败'}elseif($phase -eq 'cancelled'){'任务已取消'}else{'结果未确认'}
      $View.resultTime.Text=if($null -ne $at){'完成时间 '+$at.ToString('yyyy-MM-dd HH:mm:ss')}else{''}
      $View.resultSummary.Text=if($phase -eq 'success'){(@($(if($displayCount){$displayCount.ToString('N0')+' 个文件'}),$(if($bytes){($bytes/1MB).ToString('0.##')+' MB'}))|Where-Object {$_}) -join ' · '}elseif($phase -eq 'failed'){'失败原因：'+$reason}elseif($phase -eq 'cancelled'){'任务在完成前被取消。'}else{'助手或协调器未留下完整终态。'}
      $View.resultPathCaption.Visible=$phase -eq 'success';$View.resultPathPanel.Visible=$phase -eq 'success'
      $View.resultHashCaption.Visible=$phase -eq 'success';$View.resultHashPanel.Visible=$phase -eq 'success'
      $View.resultPath.Text=if($target){[string]$target}else{''};$View.resultHash.Text=$sha
      $View.resultIntegrity.Text=if($phase -eq 'success'){'ZIP 完整性：结构、CRC、清单与全部载荷哈希通过。'}elseif($State.zipPresent -eq $true){'有效 ZIP：存在未确认文件，请勿当作成功备份。'}elseif($phase -eq 'unknown'){'有效 ZIP：无法确认。'}else{'有效 ZIP：未生成。'}
      $View.compatWarning.Visible=$phase -eq 'success' -and ($conflicts -gt 0 -or $covBlocked)
      if($covBlocked){
        $View.compatWarningTitle.Text='恢复受阻：'+$covCount+' 项关键覆盖缺口'+$(if($conflicts -gt 0){' · 另有 '+$conflicts+' 项依赖冲突'}else{''})
        $View.compatWarningBody.Text='已知关键数据未采集（'+$(if($covLabel){$covLabel}else{'未列明代码'})+'）；ZIP 完整性仍通过，本包作为数据保全产物保留。当前受支持恢复流程被阻断；源环境可用时请另建新备份，不要修改原 ZIP。'
      }elseif($View.compatWarning.Visible){
        $View.compatWarningTitle.Text='恢复兼容性：存在 '+$conflicts+' 项依赖冲突'
        $View.compatWarningBody.Text='ZIP 完整性已通过；恢复计划会重新检查依赖、宿主与数据 schema，未解决的关键问题会阻断提交。'
      }else{$View.compatWarningTitle.Text='';$View.compatWarningBody.Text=''}
      $View.resultNote.Text=if($phase -eq 'success'){
        if($covBlocked){'已知关键覆盖缺口会阻断受支持恢复流程；本包仅作数据保全，不能据此认定可恢复。源环境可用时请另建新备份。不会自动重启 DSH。'}
        else{
          $base=if($conflicts -gt 0){'文件校验通过不等于恢复业务通过；不会自动重启 DSH。'}else{'未记录依赖冲突；恢复时仍会重新检查依赖、宿主与数据 schema。文件校验通过不等于恢复业务通过；不会自动重启 DSH。'}
          $base+$(if($covState -eq 'unknown'){' 本次记录未含覆盖摘要，不能据此判断恢复可用性。'}else{' 本次未记录关键覆盖缺口；恢复仍须目标宿主检查。'})
        }
      }elseif($phase -eq 'failed'){'请使用新的 ZIP 名称重新备份。'+$(if($State.error){' 错误码：'+$State.error}else{''})}elseif($phase -eq 'cancelled'){'如仍需备份，请重新发起。'}else{'请在 Packer 的“任务与恢复”中查看记录；未确认的 ZIP 不得当作成功备份。'}
    }
    $View.title.AccessibleName=$View.title.Text;$View.subtitle.AccessibleName=$View.subtitle.Text
    $View.count.AccessibleName=$View.count.Text+'，'+$View.unit.Text;$View.instructions.AccessibleName=$View.instructions.Text
    $View.steps.AccessibleName='备份阶段：'+$View.subtitle.Text
    $View.resultTitle.AccessibleName=$View.resultTitle.Text
    $View.resultSummary.AccessibleName=$View.resultSummary.Text
    $View.resultIntegrity.AccessibleName=$View.resultIntegrity.Text
    $View.compatWarningTitle.AccessibleName=$View.compatWarningTitle.Text
    $View.compatWarningBody.AccessibleName=$View.compatWarningBody.Text
    $View.resultNote.AccessibleName=$View.resultNote.Text
    try{$View.Tip.SetToolTip($View.destination,[string]$View.destination.Text);$View.Tip.SetToolTip($View.resultPath,[string]$View.resultPath.Text)}catch{}
    & $View.SyncButtons;& $View.PaintPhase;& $View.Layout
    $View.RenderKey=$renderKey
  } catch {
    $View.title.Text='阶段显示暂不可用';$View.subtitle.Text='请展开完整任务详情；本显示错误不改变任务状态。'
  }
}
