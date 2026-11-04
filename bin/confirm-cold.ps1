$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $owner = New-Object Windows.Forms.Form
  # Keep a real, discoverable owner: a transparent 1px owner has no taskbar
  # entry and can leave the Host waiting on a confirmation the user cannot find.
  $owner.Text = 'Packer - 私人冷备份确认'
  $owner.ShowInTaskbar = $true; $owner.TopMost = $true
  $owner.StartPosition = 'CenterScreen'
  $owner.FormBorderStyle = 'FixedDialog'; $owner.MaximizeBox = $false; $owner.MinimizeBox = $false
  $owner.ClientSize = New-Object Drawing.Size(420,96)
  $label = New-Object Windows.Forms.Label
  $label.Dock = 'Fill'; $label.TextAlign = 'MiddleCenter'
  $label.Text = '请在确认窗口选择“是”或“否”。未确认不会开始备份。'
  $owner.Controls.Add($label)
  $owner.Show(); $owner.Activate(); $owner.BringToFront()
  [Windows.Forms.Application]::DoEvents()
  $text = "请先保存未完成的工作。`r`n`r`n确认后将启动独立助手。当前 DSH 没有受支持的插件退出接口：助手接管成功后，请通过菜单或托盘正常退出所有 DSH 实例；确认进程完全停止后才会备份。`r`n`r`n私人恢复包可能包含 API Key、Token、密码、私人 Prompt、会话、记忆及附件。ZIP 没有加密，仅本地保存，不适合公开分享。`r`n`r`n请确认相关外部数据库和其他写入程序也已正常停止；已识别的外部记忆、Skills、工作区配置、插件载荷和偏好将进入新版迁移归档；未知或缺失项目须核对清单。不打包工程源码与 DSH 安装程序，不承诺系统绑定凭据跨机可用。文件校验通过不等于已证明恢复运行。`r`n`r`n是否明确授权本次完整私人离线备份？"
  $text += "`r`n`r`n退出后还需在助手中点击【我已正常退出，检查后继续】。未检测到完全退出，绝不开始备份。"
  $r = [Windows.Forms.MessageBox]::Show($owner,$text,'确认本次私人冷备份',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Warning,[Windows.Forms.MessageBoxDefaultButton]::Button2)
  $owner.Dispose()
  if ($r -eq [Windows.Forms.DialogResult]::Yes) { [Console]::Out.Write('YES') }
} catch { [Console]::Error.Write('COLD_CONFIRM_FAILED'); exit 1 }
