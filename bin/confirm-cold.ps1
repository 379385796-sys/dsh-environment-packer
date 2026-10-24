$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Windows.Forms
  $owner = New-Object Windows.Forms.Form
  $owner.ShowInTaskbar = $false; $owner.TopMost = $true; $owner.Opacity = 0
  $owner.Size = New-Object Drawing.Size(1,1)
  $owner.Show(); $owner.Activate()
  $text = "请先保存未完成的工作。`r`n`r`n确认后将启动独立助手。当前 DSH 没有受支持的插件退出接口：助手接管成功后，请通过菜单或托盘正常退出所有 DSH 实例；确认进程完全停止后才会备份。`r`n`r`n私人恢复包可能包含 API Key、Token、密码、私人 Prompt、会话、记忆及附件。ZIP 没有加密，仅本地保存，不适合公开分享。`r`n`r`n请确认相关外部数据库和其他写入程序也已正常停止；外部工作区、模型、程序和系统凭据不包含。文件校验通过不等于已证明恢复运行。`r`n`r`n是否明确授权本次完整私人离线备份？"
  $text += "`r`n`r`n退出后还需在助手中点击【我已正常退出，检查后继续】。未检测到完全退出，绝不开始备份。"
  $r = [Windows.Forms.MessageBox]::Show($owner,$text,'确认本次私人冷备份',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Warning,[Windows.Forms.MessageBoxDefaultButton]::Button2)
  $owner.Dispose()
  if ($r -eq [Windows.Forms.DialogResult]::Yes) { [Console]::Out.Write('YES') }
} catch { [Console]::Error.Write('COLD_CONFIRM_FAILED'); exit 1 }
