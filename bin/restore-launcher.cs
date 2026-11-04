// Maintainer contribution under the repository MIT license.
// A Windows GUI host for the packaged WPF/PowerShell controller. No console,
// profiles, downloads or recovery implementation lives in this launcher.
using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Management.Automation;
using System.Management.Automation.Runspaces;

internal static class RecoveryLauncher {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  private static extern int MessageBox(IntPtr owner,string text,string title,uint flags);
  [STAThread]
  private static int Main() {
    string bin=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
    string script=Path.Combine(bin,"restore-entry.ps1");
    if(!File.Exists(script)||!File.Exists(Path.Combine(bin,"restore-window.xaml"))) {
      MessageBox(IntPtr.Zero,"恢复工具包不完整。请保留 EXE、脚本、XAML 和原恢复核心，勿只复制一个文件。","环境恢复包",0x10);
      return 1;
    }
    try {
      AppContext.SetSwitch("Switch.System.Windows.DoNotScaleForDpiChanges",false);
      AppContext.SetSwitch("Switch.System.Windows.DoNotUsePresentationDpiCapabilityTier2OrGreater",false);
      InitialSessionState state=InitialSessionState.CreateDefault();
      // Local runspace only; never changes user/machine execution policy.
      state.ExecutionPolicy=Microsoft.PowerShell.ExecutionPolicy.Bypass;
      using(Runspace runspace=RunspaceFactory.CreateRunspace(state)) {
        runspace.ApartmentState=ApartmentState.STA;
        runspace.ThreadOptions=PSThreadOptions.UseCurrentThread;
        runspace.Open();Runspace.DefaultRunspace=runspace;
        using(PowerShell shell=PowerShell.Create()) {
          shell.Runspace=runspace;shell.AddCommand(script);shell.Invoke();
          if(shell.HadErrors) {
            MessageBox(IntPtr.Zero,"恢复助手出现未处理错误，结果不能确认。请保留目标和诊断，不要将暂存目录当作成功恢复。","环境恢复包",0x10);
            return 1;
          }
        }
      }
      return 0;
    } catch {
      MessageBox(IntPtr.Zero,"恢复助手未能正常启动。请检查完整工具包和 Windows .NET Framework / PowerShell 组件。不会自动下载或绕过恢复检查。","环境恢复包",0x10);
      return 1;
    }
  }
}
