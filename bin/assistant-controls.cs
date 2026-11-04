// Presentation only. Native numeric validation and popup keyboard handling remain in WinForms.
namespace PackerViews {
  public class RoundSettingsBar:FlowLayoutPanel {
    public Color LineColor{get;set;}
    public RoundSettingsBar(){DoubleBuffered=true;ResizeRedraw=true;LineColor=Color.Gainsboro;}
    protected override void OnPaintBackground(PaintEventArgs e){e.Graphics.Clear(Parent.BackColor);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(GraphicsPath p=DrawingTools.Round(new RectangleF(.5f,.5f,Width-1,Height-1),12)){using(Brush b=new SolidBrush(BackColor))e.Graphics.FillPath(b,p);using(Pen pen=new Pen(LineColor))e.Graphics.DrawPath(pen,p);}}
  }
  public class ChoiceItems:System.Collections.ObjectModel.Collection<string> {
    public void AddRange(object[] values){foreach(object value in values)Add(System.Convert.ToString(value));}
  }
  public class RoundChoice:Control {
    public ChoiceItems Items{get;private set;}
    public ComboBoxStyle DropDownStyle{get;set;}
    public Color LineColor{get;set;} public Color SoftColor{get;set;}
    private int selected=-1; private bool hover; private ToolStripDropDown popup; private ListBox list;
    public event EventHandler SelectedIndexChanged;
    public int SelectedIndex{get{return selected;}set{if(value<0||value>=Items.Count)throw new ArgumentOutOfRangeException("value");if(selected==value)return;selected=value;Invalidate();if(SelectedIndexChanged!=null)SelectedIndexChanged(this,EventArgs.Empty);}}
    public RoundChoice(){Items=new ChoiceItems();DoubleBuffered=true;ResizeRedraw=true;TabStop=true;Size=new Size(140,38);AccessibleRole=AccessibleRole.ComboBox;LineColor=Color.Gainsboro;SoftColor=Color.AliceBlue;Cursor=Cursors.Hand;}
    protected override void OnFontChanged(EventArgs e){base.OnFontChanged(e);Height=Math.Max(38,Font.Height+18);}
    protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
    protected override void OnMouseLeave(EventArgs e){hover=false;Invalidate();base.OnMouseLeave(e);}
    protected override void OnGotFocus(EventArgs e){base.OnGotFocus(e);Invalidate();}
    protected override void OnLostFocus(EventArgs e){base.OnLostFocus(e);Invalidate();}
    protected override void OnClick(EventArgs e){base.OnClick(e);Focus();if(popup!=null&&popup.Visible)popup.Close();else OpenList();}
    protected override bool IsInputKey(Keys key){return key==Keys.Up||key==Keys.Down||key==Keys.Home||key==Keys.End||base.IsInputKey(key);}
    protected override void OnKeyDown(KeyEventArgs e){
      if(e.KeyCode==Keys.Space||e.KeyCode==Keys.Enter||(e.Alt&&e.KeyCode==Keys.Down)){OpenList();e.Handled=true;e.SuppressKeyPress=true;}
      else if(Items.Count>0&&(e.KeyCode==Keys.Down||e.KeyCode==Keys.Up||e.KeyCode==Keys.Home||e.KeyCode==Keys.End)){SelectedIndex=e.KeyCode==Keys.Home?0:e.KeyCode==Keys.End?Items.Count-1:Math.Max(0,Math.Min(Items.Count-1,selected+(e.KeyCode==Keys.Down?1:-1)));e.Handled=true;}
      base.OnKeyDown(e);
    }
    private void Accept(){if(list.SelectedIndex>=0)SelectedIndex=list.SelectedIndex;popup.Close();Focus();}
    public void OpenList(){
      if(!Enabled||Items.Count==0)return;if(popup!=null){popup.Dispose();popup=null;}
      list=new ListBox{BorderStyle=BorderStyle.None,DrawMode=DrawMode.OwnerDrawFixed,IntegralHeight=false,Font=Font,BackColor=BackColor,ForeColor=ForeColor,ItemHeight=Font.Height+18,TabStop=true};
      foreach(string item in Items)list.Items.Add(item);list.SelectedIndex=selected;list.Size=new Size(Math.Max(Width-12,120),list.ItemHeight*Items.Count);
      list.DrawItem+=delegate(object sender,DrawItemEventArgs e){if(e.Index<0)return;using(Brush background=new SolidBrush(BackColor))e.Graphics.FillRectangle(background,e.Bounds);bool active=(e.State&DrawItemState.Selected)!=0;using(GraphicsPath p=DrawingTools.Round(new RectangleF(1,e.Bounds.Y+1,e.Bounds.Width-2,e.Bounds.Height-2),8))using(Brush b=new SolidBrush(active?SoftColor:BackColor))e.Graphics.FillPath(b,p);TextRenderer.DrawText(e.Graphics,Items[e.Index]+(e.Index==selected?"  ✓":""),Font,new Rectangle(e.Bounds.X+10,e.Bounds.Y,e.Bounds.Width-18,e.Bounds.Height),ForeColor,TextFormatFlags.VerticalCenter|TextFormatFlags.NoPrefix);};
      list.MouseClick+=delegate{Accept();};list.KeyDown+=delegate(object sender,KeyEventArgs e){if(e.KeyCode==Keys.Enter||e.KeyCode==Keys.Space){Accept();e.Handled=true;e.SuppressKeyPress=true;}else if(e.KeyCode==Keys.Escape||e.KeyCode==Keys.Tab){popup.Close();Focus();if(e.KeyCode==Keys.Tab)Parent.SelectNextControl(this,!e.Shift,true,true,true);e.Handled=true;e.SuppressKeyPress=true;}};
      ToolStripControlHost host=new ToolStripControlHost(list){AutoSize=false,Size=list.Size,Margin=Padding.Empty,Padding=Padding.Empty};
      popup=new ToolStripDropDown{Padding=new Padding(6),BackColor=BackColor,DropShadowEnabled=true,AutoSize=true};popup.Items.Add(host);
      popup.Opened+=delegate{list.Focus();};popup.Closed+=delegate{Invalidate();};
      int below=Screen.FromControl(this).WorkingArea.Bottom-PointToScreen(new Point(0,Height+4)).Y;
      if(list.Height+12>below)popup.Show(this,new Point(0,-4),ToolStripDropDownDirection.AboveRight);else popup.Show(this,new Point(0,Height+4));
      using(GraphicsPath p=DrawingTools.Round(new RectangleF(0,0,popup.Width,popup.Height),10)){popup.Region=new Region(p);}
    }
    protected override void OnPaint(PaintEventArgs e){e.Graphics.Clear(Parent.BackColor);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(GraphicsPath p=DrawingTools.Round(new RectangleF(.5f,.5f,Width-1,Height-1),10)){using(Brush b=new SolidBrush(hover?SoftColor:BackColor))e.Graphics.FillPath(b,p);using(Pen pen=new Pen(Focused?ForeColor:LineColor,Focused?1.5f:1))e.Graphics.DrawPath(pen,p);}Color fg=Enabled?ForeColor:SystemColors.GrayText;TextRenderer.DrawText(e.Graphics,selected>=0?Items[selected]:"",Font,new Rectangle(12,0,Width-38,Height),fg,TextFormatFlags.VerticalCenter|TextFormatFlags.NoPrefix);using(Pen pen=new Pen(fg,1.4f))e.Graphics.DrawLines(pen,new Point[]{new Point(Width-23,Height/2-2),new Point(Width-18,Height/2+3),new Point(Width-13,Height/2-2)});}
    protected override AccessibleObject CreateAccessibilityInstance(){return new ChoiceAccessible(this);}
    private class ChoiceAccessible:ControlAccessibleObject{private RoundChoice owner;public ChoiceAccessible(RoundChoice c):base(c){owner=c;}public override string Value{get{return owner.SelectedIndex<0?"":owner.Items[owner.SelectedIndex];}set{}}public override string DefaultAction{get{return "展开主题列表";}}public override void DoDefaultAction(){owner.OpenList();}}
    protected override void Dispose(bool disposing){if(disposing&&popup!=null){Region r=popup.Region;popup.Dispose();if(r!=null)r.Dispose();}base.Dispose(disposing);}
  }
  internal class BorderlessNumber:NumericUpDown {
    private bool arranging;
    protected override void OnLayout(LayoutEventArgs e){
      base.OnLayout(e);if(arranging)return;arranging=true;
      try{foreach(Control child in Controls){if(child is TextBox)child.SetBounds(0,child.Top,Parent==null?ClientSize.Width:Parent.ClientSize.Width,child.Height);else child.Visible=false;}}finally{arranging=false;}
    }
  }
  public class RoundNumber:UserControl {
    private NumericUpDown number; private Panel numberClip; private RoundButton minus,plus;
    public Color LineColor{get;set;}public Color SoftColor{get;set;}
    public event EventHandler ValueChanged;
    public decimal Minimum{get{return number.Minimum;}set{number.Minimum=value;}}
    public decimal Maximum{get{return number.Maximum;}set{number.Maximum=value;}}
    public decimal Increment{get{return number.Increment;}set{number.Increment=value;}}
    public int DecimalPlaces{get{return number.DecimalPlaces;}set{number.DecimalPlaces=value;}}
    public decimal Value{get{return number.Value;}set{number.Value=value;}}
    public RoundNumber(){DoubleBuffered=true;ResizeRedraw=true;TabStop=false;LineColor=Color.Gainsboro;SoftColor=Color.AliceBlue;Size=new Size(176,38);AccessibleRole=AccessibleRole.Grouping;
      number=new BorderlessNumber{BorderStyle=BorderStyle.None,TextAlign=HorizontalAlignment.Center,AccessibleName="助手字号数值",TabIndex=0};
      minus=new RoundButton{Text="−",Quiet=true,AutoSize=false,AccessibleName="减小字号",TabIndex=0};plus=new RoundButton{Text="+",Quiet=true,AutoSize=false,AccessibleName="增大字号",TabIndex=2};
      numberClip=new Panel{TabStop=false,TabIndex=1};numberClip.Controls.Add(number);
      Controls.Add(numberClip);Controls.Add(minus);Controls.Add(plus);minus.Click+=delegate{number.DownButton();};plus.Click+=delegate{number.UpButton();};number.ValueChanged+=delegate{if(ValueChanged!=null)ValueChanged(this,EventArgs.Empty);};
    }
    protected override void OnLayout(LayoutEventArgs e){base.OnLayout(e);if(numberClip==null)return;int side=Math.Max(28,Font.Height+12);minus.SetBounds(4,3,side,Height-6);plus.SetBounds(Width-side-4,3,side,Height-6);numberClip.SetBounds(side+8,Math.Max(4,(Height-number.PreferredHeight)/2),Math.Max(24,Width-2*side-16),number.PreferredHeight);number.SetBounds(0,0,numberClip.Width+SystemInformation.VerticalScrollBarWidth+4,number.PreferredHeight);}
    protected override void OnFontChanged(EventArgs e){base.OnFontChanged(e);Height=Math.Max(38,Font.Height+18);PerformLayout();}
    protected override void OnPaintBackground(PaintEventArgs e){e.Graphics.Clear(Parent.BackColor);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(GraphicsPath p=DrawingTools.Round(new RectangleF(.5f,.5f,Width-1,Height-1),10)){using(Brush b=new SolidBrush(BackColor))e.Graphics.FillPath(b,p);using(Pen pen=new Pen(ContainsFocus?ForeColor:LineColor))e.Graphics.DrawPath(pen,p);}if(number!=null){number.BackColor=BackColor;number.ForeColor=ForeColor;}}
    protected override void OnEnter(EventArgs e){base.OnEnter(e);Invalidate();}protected override void OnLeave(EventArgs e){base.OnLeave(e);number.Validate();Invalidate();}
  }
  // Keep the native read-only EDIT control (text, selection, keyboard and copy).
  // Only its scroll presentation is replaced; no log data is transformed.
  public class LogTextBox:TextBox {
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l);
    private int wheelRemainder;
    public event EventHandler ViewChanged;
    public int FirstVisibleLine{get{return IsHandleCreated?(int)SendMessage(Handle,0xCE,IntPtr.Zero,IntPtr.Zero):0;}}
    public int DisplayLineCount{get{return IsHandleCreated?(int)SendMessage(Handle,0xBA,IntPtr.Zero,IntPtr.Zero):1;}}
    public int VisibleLineCount{get{return Math.Max(1,(ClientSize.Height-4)/Math.Max(1,Font.Height));}}
    public int MaximumFirstLine{get{return Math.Max(0,DisplayLineCount-VisibleLineCount);}}
    public void ScrollToLine(int line){if(!IsHandleCreated)return;line=Math.Max(0,Math.Min(MaximumFirstLine,line));SendMessage(Handle,0xB6,IntPtr.Zero,new IntPtr(line-FirstVisibleLine));}
    private void NotifyView(){if(ViewChanged!=null)ViewChanged(this,EventArgs.Empty);}
    protected override void WndProc(ref Message m){
      if(m.Msg==0x20A){wheelRemainder+=(short)((m.WParam.ToInt64()>>16)&0xffff);int ticks=wheelRemainder/120;wheelRemainder-=ticks*120;int lines=SystemInformation.MouseWheelScrollLines;ScrollToLine(FirstVisibleLine-ticks*(lines<0?VisibleLineCount:lines));m.Result=IntPtr.Zero;return;}
      base.WndProc(ref m);if(m.Msg==0x115||m.Msg==0x101||m.Msg==0x202||m.Msg==0x5||m.Msg==0xB6||m.Msg==0xB7)NotifyView();
    }
  }
  public class LogScrollBar:Control {
    private LogTextBox editor;private ScrollableControl scrollPanel;private EventHandler changed;private ScrollEventHandler panelScroll;private LayoutEventHandler panelLayout;private bool dragging;private int anchorY,anchorLine;
    public Color ThumbColor{get;set;}public Color TrackColor{get;set;}
    public LogScrollBar(){DoubleBuffered=true;ResizeRedraw=true;TabStop=true;AccessibleRole=AccessibleRole.ScrollBar;Width=12;changed=delegate{Invalidate();};panelScroll=delegate{Invalidate();};panelLayout=delegate{Invalidate();};ThumbColor=Color.Gray;TrackColor=SystemColors.Control;}
    public LogTextBox Editor{get{return editor;}set{if(editor!=null){editor.ViewChanged-=changed;editor.TextChanged-=changed;editor.Resize-=changed;editor.FontChanged-=changed;editor.HandleCreated-=changed;}editor=value;if(editor!=null){editor.ViewChanged+=changed;editor.TextChanged+=changed;editor.Resize+=changed;editor.FontChanged+=changed;editor.HandleCreated+=changed;}Invalidate();}}
    public ScrollableControl ScrollPanel{get{return scrollPanel;}set{if(scrollPanel!=null){scrollPanel.Scroll-=panelScroll;scrollPanel.Layout-=panelLayout;scrollPanel.SizeChanged-=changed;}scrollPanel=value;if(scrollPanel!=null){scrollPanel.Scroll+=panelScroll;scrollPanel.Layout+=panelLayout;scrollPanel.SizeChanged+=changed;}Invalidate();}}
    public int Position{get{return editor!=null?editor.FirstVisibleLine:scrollPanel==null?0:-scrollPanel.AutoScrollPosition.Y;}}
    public int PageSize{get{return editor!=null?editor.VisibleLineCount:scrollPanel==null?1:Math.Max(1,scrollPanel.ClientSize.Height);}}
    public int MaximumPosition{get{return editor!=null?editor.MaximumFirstLine:scrollPanel==null?0:Math.Max(0,scrollPanel.DisplayRectangle.Height-scrollPanel.ClientSize.Height);}}
    private int Step{get{return editor!=null?1:Math.Max(1,Font.Height);}}
    public void ScrollTo(int position){if(editor!=null)editor.ScrollToLine(position);else if(scrollPanel!=null)scrollPanel.AutoScrollPosition=new Point(0,Math.Max(0,Math.Min(MaximumPosition,position)));Invalidate();}
    private Rectangle ThumbBounds(){int maximum=MaximumPosition;if(maximum==0)return Rectangle.Empty;int h=Math.Min(Height,Math.Max(24,(int)((long)Height*PageSize/(maximum+PageSize))));int y=(int)((long)Math.Min(Position,maximum)*(Height-h)/maximum);return new Rectangle(3,y,Math.Max(1,Width-6),h);}
    protected override void OnPaint(PaintEventArgs e){e.Graphics.Clear(BackColor);e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;Rectangle thumb=ThumbBounds();if(!thumb.IsEmpty){using(GraphicsPath track=DrawingTools.Round(new RectangleF(3,0,Math.Max(1,Width-6),Height),3))using(Brush b=new SolidBrush(TrackColor))e.Graphics.FillPath(b,track);using(GraphicsPath p=DrawingTools.Round(thumb,3))using(Brush b=new SolidBrush(Enabled?ThumbColor:SystemColors.GrayText))e.Graphics.FillPath(b,p);}if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(e.Graphics,ClientRectangle);}
    protected override void OnMouseDown(MouseEventArgs e){base.OnMouseDown(e);if(e.Button!=MouseButtons.Left||MaximumPosition==0)return;Focus();Rectangle thumb=ThumbBounds();if(thumb.Contains(e.Location)){dragging=true;anchorY=e.Y;anchorLine=Position;Capture=true;}else ScrollTo(Position+(e.Y<thumb.Y?-PageSize:PageSize));}
    protected override void OnMouseMove(MouseEventArgs e){base.OnMouseMove(e);if(dragging){int travel=Height-ThumbBounds().Height;if(travel>0)ScrollTo(anchorLine+(int)((long)(e.Y-anchorY)*MaximumPosition/travel));}}
    protected override void OnMouseUp(MouseEventArgs e){base.OnMouseUp(e);dragging=false;Capture=false;}
    protected override void OnMouseCaptureChanged(EventArgs e){base.OnMouseCaptureChanged(e);if(!Capture)dragging=false;}
    protected override bool IsInputKey(Keys key){Keys code=key&Keys.KeyCode;return code==Keys.Up||code==Keys.Down||code==Keys.PageUp||code==Keys.PageDown||code==Keys.Home||code==Keys.End||base.IsInputKey(key);}
    protected override void OnKeyDown(KeyEventArgs e){base.OnKeyDown(e);int line=Position;switch(e.KeyCode){case Keys.Up:line-=Step;break;case Keys.Down:line+=Step;break;case Keys.PageUp:line-=PageSize;break;case Keys.PageDown:line+=PageSize;break;case Keys.Home:line=0;break;case Keys.End:line=MaximumPosition;break;default:return;}ScrollTo(line);e.Handled=true;}
    protected override void OnMouseWheel(MouseEventArgs e){base.OnMouseWheel(e);int lines=SystemInformation.MouseWheelScrollLines;ScrollTo(Position-e.Delta/120*(lines<0?PageSize:lines*Step));}
    protected override AccessibleObject CreateAccessibilityInstance(){return new ScrollAccessible(this);}
    private class ScrollAccessible:ControlAccessibleObject{private LogScrollBar owner;public ScrollAccessible(LogScrollBar c):base(c){owner=c;}public override string Value{get{return owner.Position+" / "+owner.MaximumPosition;}set{int line;if(int.TryParse(value,out line))owner.ScrollTo(line);}}}
    protected override void Dispose(bool disposing){if(disposing){Editor=null;ScrollPanel=null;}base.Dispose(disposing);}
  }
  // The existing AutoScroll panel still owns layout, wheel and focus scrolling.
  // Clip only its native non-client scrollbar, exposing the same position through the themed track.
  public class ScrollViewport:Panel {
    private BufferedPanel clip;private bool arranging;
    public BufferedPanel Content{get;private set;}public LogScrollBar ScrollBar{get;private set;}
    public ScrollViewport(){DoubleBuffered=true;ResizeRedraw=true;clip=new BufferedPanel{Dock=DockStyle.Fill};Content=new BufferedPanel{AutoScroll=true};clip.Controls.Add(Content);ScrollBar=new LogScrollBar{Dock=DockStyle.Right,Width=12,ScrollPanel=Content,AccessibleName="页面滚动位置"};Controls.Add(clip);Controls.Add(ScrollBar);Content.Layout+=delegate{ArrangeContent();};Content.ClientSizeChanged+=delegate{ArrangeContent();};}
    private void ArrangeContent(){if(arranging||IsDisposed)return;arranging=true;try{for(int pass=0;pass<3;pass++){int native=Content.VerticalScroll.Visible?Math.Max(0,Content.Width-Content.ClientSize.Width):0;int width=Math.Max(1,clip.ClientSize.Width+native),height=Math.Max(1,clip.ClientSize.Height);if(Content.Width==width&&Content.Height==height)break;Content.SetBounds(0,0,width,height);}}finally{arranging=false;}}
    protected override void OnLayout(LayoutEventArgs e){base.OnLayout(e);if(Content!=null)ArrangeContent();}
  }
}
