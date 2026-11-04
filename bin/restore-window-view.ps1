# WPF presentation; the original Node verifier and restorer remain authoritative.
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,System.Xaml
function New-PackerRestoreView([string]$XamlFile='restore-window.xaml') {
  $xaml=Get-Content -LiteralPath (Join-Path $PSScriptRoot $XamlFile) -Raw -Encoding UTF8
  $window=[Windows.Markup.XamlReader]::Parse($xaml)
  if($XamlFile -eq 'migrate-window.xaml'){
    if(-not ('PackerWindowChrome.Native' -as [type])){Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;namespace PackerWindowChrome{public static class Native{[DllImport("dwmapi.dll")]public static extern int DwmSetWindowAttribute(IntPtr h,int a,ref int v,int s);}}'}
    $window.Add_SourceInitialized({try{if(-not [Windows.SystemParameters]::HighContrast){$handle=(New-Object Windows.Interop.WindowInteropHelper($window)).Handle;$round=2;[void][PackerWindowChrome.Native]::DwmSetWindowAttribute($handle,33,[ref]$round,4)}}catch{}}.GetNewClosure())
  }
  $names=@{zip='Zip';runtime='Runtime';target='Target';pickZip='PickZip';pickRuntime='PickRuntime';pickParent='PickParent';check='Check';result='Result';confirm='Confirm';restore='Restore';close='Close';progress='Progress';next='Next';back='Back';heading='Heading';subtitle='Subtitle';integrity='Integrity';compatibility='Compatibility';coverage='Coverage';backupInfo='BackupInfo';selection='Selection';targetFeedback='TargetFeedback';outcome='Outcome';operationHint='OperationHint';operationDetails='OperationDetails';startup='Startup';glyph='OutcomeGlyph';scroll='BodyScroll';closeCaption='CloseCaption';minimize='Minimize';maximize='Maximize';stepBackup='StepBackup';stepTarget='StepTarget';stepResult='StepResult';coverageTab='CoverageTab';detailsTab='DetailsTab';gateReason='GateReason'}
  $view=@{IsMigration=($XamlFile -eq 'migrate-window.xaml');form=$window;page=0;Busy=$false;Inspection=$null;Phase='idle';HasAttempted=$false}
  foreach($key in $names.Keys){$view[$key]=$window.FindName($names[$key]);if($null -eq $view[$key]){throw ('ASSISTANT_VIEW_INVALID: '+$key)}}
  $pages=@($window.FindName('PageBackup'),$window.FindName('PageTarget'),$window.FindName('PageOutcome'));$view.pages=$pages
  if($view.IsMigration){$window.MaxWidth=[Math]::Max(320,[Windows.SystemParameters]::WorkArea.Width-16);$window.MaxHeight=[Math]::Max(240,[Windows.SystemParameters]::WorkArea.Height-16);$window.MinWidth=[Math]::Min($window.MinWidth,$window.MaxWidth);$window.MinHeight=[Math]::Min($window.MinHeight,$window.MaxHeight);$window.Width=[Math]::Min($window.Width,$window.MaxWidth);$window.Height=[Math]::Min($window.Height,$window.MaxHeight)}
  if($view.IsMigration){foreach($key in 'PlanSummary','PlanDetails','Usability'){$view[$key]=$window.FindName($key)}}
  # Read-only system palette selection; no preference or global setting is written.
  $dark=$false;try{$pref=Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name AppsUseLightTheme -ErrorAction Stop;$dark=$pref.AppsUseLightTheme -eq 0}catch{}
  if($dark){foreach($item in @{Canvas='#20242C';Surface='#292E38';Layer='#242933';Soft='#343D4B';Ink='#F0F1F3';Muted='#A7ADB7';Line='#404957';Accent='#ECEEF2';OnAccent='#202124';Focus='#9BB5FF';Success='#86C8AC';Error='#F3A1A4';WarningBg='#353027'}.GetEnumerator()){$window.Resources[$item.Key]=New-Object Windows.Media.SolidColorBrush([Windows.Media.ColorConverter]::ConvertFromString($item.Value))}}
  if([Windows.SystemParameters]::HighContrast){foreach($item in @{Canvas=[Windows.SystemColors]::WindowColor;Surface=[Windows.SystemColors]::WindowColor;Success=[Windows.SystemColors]::WindowTextColor;Error=[Windows.SystemColors]::WindowTextColor;Layer=[Windows.SystemColors]::WindowColor;Soft=[Windows.SystemColors]::ControlColor;Ink=[Windows.SystemColors]::WindowTextColor;Muted=[Windows.SystemColors]::WindowTextColor;Line=[Windows.SystemColors]::WindowTextColor;Accent=[Windows.SystemColors]::HighlightColor;OnAccent=[Windows.SystemColors]::HighlightTextColor;Focus=[Windows.SystemColors]::HighlightColor;WarningBg=[Windows.SystemColors]::WindowColor}.GetEnumerator()){$window.Resources[$item.Key]=New-Object Windows.Media.SolidColorBrush($item.Value)}}
  $view.ShowPage={param([int]$Page)
    $view.page=$Page
    for($i=0;$i -lt 3;$i++){$pages[$i].Visibility=if($i -eq $Page){'Visible'}else{'Collapsed'};@($view.stepBackup,$view.stepTarget,$view.stepResult)[$i].Background=$window.FindResource($(if($i -eq $Page){'Soft'}else{'Layer'}))}
    $view.heading.Text=@('准备备份文件与 DSH 程序','选择新环境的保存位置','恢复进度与结果')[$Page]
    $view.subtitle.Text=@('先找到以前保存的环境备份，再选择电脑上的 DSH 程序用于核验。','核对来源与目标位置，然后明确确认私人恢复。','文件恢复和启动可用性分别确认，不会自动启动 DSH。')[$Page]
    if($view.IsMigration){$view.heading.Text=@('选择备份与新环境','核对迁移计划','恢复进度与结果')[$Page];$view.subtitle.Text=@('选择 ZIP、DSH 安装目录与一个尚不存在的 Workspace。','核对自动安排的目录、兼容性与待处理项目。','隔离恢复、数据读取和启动验收由恢复核心执行。')[$Page];$view.startup.Visibility='Collapsed'}
    $view.next.Visibility=if($Page -eq 0){'Visible'}else{'Collapsed'};$view.restore.Visibility=if($Page -eq 1){'Visible'}else{'Collapsed'};$view.back.Visibility=if($Page -gt 0){'Visible'}else{'Collapsed'}
    $view.confirm.Visibility=if($Page -eq 1){'Visible'}else{'Collapsed'}
    $view.scroll.ScrollToTop()
  }.GetNewClosure()
  $goTarget={if(-not $view.Busy -and $view.stepTarget.IsEnabled){$view.selection.Text=[IO.Path]::GetFileName($view.zip.Text)+[Environment]::NewLine+'ZIP：'+$view.zip.Text+[Environment]::NewLine+'运行时：'+$view.runtime.Text;& $view.ShowPage 1;[void]$view.target.Focus()}}.GetNewClosure()
  $view.next.Add_Click($goTarget);$view.stepTarget.Add_Click($goTarget)
  $view.back.Add_Click({if(-not $view.Busy){& $view.ShowPage ([Math]::Max(0,$view.page-1))}}.GetNewClosure())
  $view.stepBackup.Add_Click({if(-not $view.Busy){& $view.ShowPage 0}}.GetNewClosure())
  $view.stepResult.Add_Click({if(-not $view.Busy -and $view.HasAttempted){& $view.ShowPage 2}}.GetNewClosure())
  $view.coverageTab.Add_Click({$view.coverage.Visibility='Visible';$view.result.Visibility='Collapsed';$view.coverageTab.Background=$window.FindResource('Soft');$view.detailsTab.Background=$window.FindResource('Canvas')}.GetNewClosure())
  $view.detailsTab.Add_Click({$view.coverage.Visibility='Collapsed';$view.result.Visibility='Visible';$view.coverageTab.Background=$window.FindResource('Canvas');$view.detailsTab.Background=$window.FindResource('Soft')}.GetNewClosure())
  foreach($field in @($view.zip,$view.runtime,$view.target)){$field.Add_LostKeyboardFocus({param($sender,$event) $sender.CaretIndex=0;$sender.ScrollToHorizontalOffset(0)})}
  $view.result.Add_TextChanged({$view.operationDetails.Text=$view.result.Text}.GetNewClosure())
  $view.minimize.Add_Click({$window.WindowState='Minimized'}.GetNewClosure())
  $view.maximize.Add_Click({$window.WindowState=if($window.WindowState -eq 'Maximized'){'Normal'}else{'Maximized'}}.GetNewClosure())
  $view.closeCaption.Add_Click({$window.Close()}.GetNewClosure())
  $window.Add_SizeChanged({$window.FindName('RailColumn').Width=New-Object Windows.GridLength($(if($window.ActualWidth -lt 840){148}else{196}))}.GetNewClosure())
  $window.Add_ContentRendered({[void]$view.zip.Focus()}.GetNewClosure())
  & $view.ShowPage 0
  return $view
}
function Update-PackerRecoveryPresentation($View,[string]$Phase,$Report=$null) {
  $View.Phase=$Phase
  switch($Phase){
    'checking' {$View.coverage.Text='正在重新检查覆盖范围；先前报告不可用于本次恢复。';$View.integrity.Text='正在检查…';$View.compatibility.Text='等待存档检查';$View.backupInfo.Text='正在验证 ZIP、Manifest、CRC/SHA-256、依赖和宿主证明。';$View.check.Content='正在检查…'}
    'invalidated' {$View.integrity.Text='需要重新检查';$View.compatibility.Text='旧结果已失效';$View.backupInfo.Text='ZIP 或运行时已改变。';$View.coverage.Text='对象已改变，先前报告不能用于恢复。';& $View.ShowPage 0}
    'inspected' {
      $states=@{valid='校验通过';invalid='无效或已损坏';unsupported='格式不支持';compatible='符合恢复要求';blocked='不满足，禁止恢复';unavailable='运行时 / 证明不可用';'not-checked'='未检查'}
      $View.integrity.Text=$states[$Report.archiveIntegrity.state];$View.compatibility.Text=$states[$Report.recoveryCompatibility.state]
      $View.integrity.Foreground=$View.form.FindResource($(if($Report.archiveIntegrity.state -eq 'valid'){'Success'}else{'Error'}))
      $View.compatibility.Foreground=$View.form.FindResource($(if($Report.canRestore){'Success'}else{'Muted'}))
      $View.backupInfo.Text=if($Report.archiveIntegrity.state -eq 'valid'){$Report.archiveIntegrity.files.ToString('N0')+' 个文件 · '+([double]$Report.archiveIntegrity.bytes/1MB).ToString('0.##')+' MB · DSH '+$Report.backup.dshVersion+[Environment]::NewLine+$Report.backup.createdAt}else{'未通过的存档不能恢复。请查看检查详情。'}
      $full=Format-PackerInspection $Report;$marker=$full.IndexOf('覆盖范围：');$View.coverage.Text=if($marker -ge 0){$full.Substring($marker)}else{'未取得有效覆盖报告；不能认定业务数据已完整备份。'}
    }
    'restoring' {$View.HasAttempted=$true;$View.outcome.Text='正在恢复到全新 Home';$View.operationHint.Text='正在重新校验并恢复文件。请等待安全收尾；整体百分比未知。';$View.startup.Visibility='Collapsed';& $View.ShowPage 2}
    'complete' {$View.outcome.Text='文件已恢复并通过校验';$View.operationHint.Text='DSH 启动可用性尚未验证。请按下方清单验收新环境。';$View.glyph.Data=[Windows.Media.Geometry]::Parse('M 2,12 L 9,19 L 23,3');$View.glyph.Stroke=$View.form.FindResource('Success');$View.startup.Visibility='Visible';$View.progress.Value=100}
    'failed' {if($View.page -eq 0){$View.integrity.Text='检查未完成';$View.compatibility.Text='未获恢复许可';$View.backupInfo.Text='请查看检查详情中的错误说明。'};$View.outcome.Text='恢复未确认成功';$View.operationHint.Text='保留诊断，不要将目标或暂存目录当作可用环境。';$View.glyph.Data=[Windows.Media.Geometry]::Parse('M 4,4 L 21,21 M 21,4 L 4,21');$View.glyph.Stroke=$View.form.FindResource('Error');$View.startup.Visibility='Collapsed'}
  }
  if($Phase -ne 'checking'){$View.check.Content='重新检查备份'}
}
function Set-PackerRestoreGate($View,[bool]$Busy,$Inspection) {
  $View.Busy=$Busy;$View.Inspection=$Inspection
  foreach($name in 'zip','runtime','target','pickZip','pickRuntime','pickParent','confirm','close','closeCaption','back','stepBackup'){$View[$name].IsEnabled=-not $Busy}
  $View.check.IsEnabled=(-not $Busy -and -not [string]::IsNullOrWhiteSpace($View.zip.Text))
  $valid=$null -ne $Inspection -and $Inspection.canRestore -eq $true -and $Inspection.archiveIntegrity.state -eq 'valid' -and $Inspection.recoveryCompatibility.state -eq 'compatible' -and $Inspection.archiveIntegrity.sha256 -match '^[a-f0-9]{64}$'
  $parentExists=$false;try{$parent=[IO.Path]::GetDirectoryName($View.target.Text);$parentExists=-not [string]::IsNullOrWhiteSpace($parent) -and (Test-Path -LiteralPath $parent -PathType Container)}catch{}
  $fresh=$parentExists -and -not [string]::IsNullOrWhiteSpace($View.target.Text) -and [IO.Path]::IsPathRooted($View.target.Text) -and -not (Test-Path -LiteralPath $View.target.Text)
  $View.next.IsEnabled=(-not $Busy -and $valid -and -not [string]::IsNullOrWhiteSpace($View.runtime.Text));$View.stepTarget.IsEnabled=$View.next.IsEnabled
  $View.stepResult.IsEnabled=(-not $Busy -and $View.HasAttempted)
  $View.gateReason.Text=if($Busy){'正在检查或执行操作，请等待安全收尾。'}elseif([string]::IsNullOrWhiteSpace($View.zip.Text)){'先选择以前由 Packer 保存的备份文件。'}elseif($null -eq $Inspection){'点击“检查备份”，核对存档与当前恢复条件。'}elseif($valid){'检查通过，可以继续选择新环境的保存位置。'}elseif($Inspection.archiveIntegrity.state -ne 'valid'){'不能继续：备份未通过完整性检查，请查看检查详情。'}elseif([string]::IsNullOrWhiteSpace($View.runtime.Text)){'备份完整。请选择电脑安装目录中的 DeepSeek Harness.exe，再重新检查。'}else{'不能继续：所选 DSH 或依赖未满足备份要求，请查看检查详情。'}
  $View.check.Style=$View.form.FindResource($(if($valid){'Button'}else{'Primary'}))
  $View.targetFeedback.Text=if([string]::IsNullOrWhiteSpace($View.target.Text)){'直接填写新路径；不要提前创建这个文件夹。'}elseif(Test-Path -LiteralPath $View.target.Text){'目标已存在：不会覆盖或合并，请换一个新目录。'}elseif(-not [IO.Path]::IsPathRooted($View.target.Text)){'请输入完整的绝对路径。'}elseif(-not $parentExists){'上一级目录不存在，请先选择已有父目录。新文件夹本身无需创建。'}else{'这是一个不存在的新文件夹，恢复时将由助手创建；执行前仍会重新检查路径。'}
  $View.restore.IsEnabled=(-not $Busy -and $valid -and $fresh -and $View.confirm.IsChecked -eq $true -and -not [string]::IsNullOrWhiteSpace($View.runtime.Text))
}

function Format-PackerInspection($report) {
  $lines=New-Object 'System.Collections.Generic.List[string]'
  $states=@{valid='通过 ZIP、Manifest 和文件校验';invalid='无效或已损坏';unsupported='格式不受支持';compatible='满足当前恢复检查（不代表启动成功）';unavailable='运行时或宿主证明不可用';blocked='不满足，禁止恢复';'not-checked'='未检查'}
  $lines.Add('存档完整性：'+$states[$report.archiveIntegrity.state])
  if($report.archiveIntegrity.code){$lines.Add('存档检查代码：'+$report.archiveIntegrity.code+' — '+(Get-PackerRecoveryExplanation $report.archiveIntegrity.code))}
  if($report.archiveIntegrity.state -eq 'valid'){
    $lines.Add('文件数：'+$report.archiveIntegrity.files+'；载荷字节：'+$report.archiveIntegrity.bytes)
    $lines.Add('ZIP SHA-256：'+$report.archiveIntegrity.sha256)
    $lines.Add('备份格式：'+$report.backup.format+'；备份时间：'+$report.backup.createdAt)
    $lines.Add('所需 DSH：'+$report.backup.dshVersion+'；'+$report.backup.platform+'/'+$report.backup.arch+'；Node ABI '+$report.backup.nodeModules)
  }
  $lines.Add('恢复兼容性：'+$states[$report.recoveryCompatibility.state])
  if($report.recoveryCompatibility.code){$lines.Add('兼容检查代码：'+$report.recoveryCompatibility.code+' — '+(Get-PackerRecoveryExplanation $report.recoveryCompatibility.code))}
  if($report.recoveryCompatibility.hostProof -eq 'not-recorded-in-format-2'){$lines.Add('旧格式 2 未记录宿主构建证明；沿用该格式原有运行时/依赖检查，未验证跨设备迁移。')}
  $lines.Add('恢复后可用性：未验证；必须实际恢复并启动 DSH 验收。')
  if($report.coverage){
    $lines.Add('');$lines.Add('覆盖范围：'+$report.coverage.profile.note)
    $lines.Add('Home 白名单：'+(($report.coverage.home | ForEach-Object {$_.name+' ('+$_.files+')'}) -join '、'))
    $lines.Add('未收录 Home 项（需人工核对）：'+(($report.coverage.homeEntriesNotCaptured | Select-Object -First 20 | ForEach-Object {$_.name}) -join '、'))
    if($report.coverage.omissionInventoryRecorded -ne $true){$lines.Add('此存档未记录未收录项清单，不能据此认定 Home 没有遗漏。')}
    if(@($report.coverage.homeEntriesNotCaptured).Count -gt 20){$lines.Add('未收录项显示前 20 个，完整项目数：'+@($report.coverage.homeEntriesNotCaptured).Count)}
    foreach($item in @($report.coverage.exclusions | Select-Object -First 20)){$lines.Add('排除：'+$item.scope+' — '+$item.impact)}
    foreach($item in @($report.coverage.externalReferences | Select-Object -First 20)){$lines.Add('外部安装源：'+$item.name+' ('+$item.kind+')；原安装源是否收录：'+$item.originalInstallSourceIncluded)}
    if(@($report.coverage.externalReferences).Count -gt 20){$lines.Add('外部安装源显示前 20 个，完整项目数：'+@($report.coverage.externalReferences).Count)}
    $lines.Add($report.coverage.externalReferenceLimits)
    $lines.Add('文件哈希正确，不等于全部业务数据均已备份。')
  }
  return $lines -join [Environment]::NewLine
}
function Get-PackerRecoveryExplanation([string]$Code) {
  $messages=@{
    HOST_DESKTOP_REQUIRED='请选择已安装且可信的 DSH Desktop.exe；无需启动 DSH 界面。'
    HOST_SOURCE_UNTRUSTED='无法确认完整可信的 DSH 安装来源。'
    HOST_PROOF_UNAVAILABLE='当前环境不能取得所需宿主证明，禁止继续恢复。'
    HOST_PROOF_INVALID='备份所需宿主证明缺失或无效，不能跳过。'
    HOST_REQUIREMENTS_MISMATCH='当前 Desktop 构建与备份绑定的证明不一致；版本号相同仍可能不兼容。'
    INCOMPATIBLE_RUNTIME='DSH 版本、系统、架构、Node 主版本或 ABI 不匹配。'
    UNSUPPORTED_RECOVERY_FORMAT='不是受支持的私人恢复格式；安全配置 ZIP 不能恢复环境。'
    UNSUPPORTED_ZIP='ZIP 布局或压缩格式不受现有读取器支持。'
    HASH_MISMATCH='载荷与 Manifest 的字节数或 SHA-256 不一致。'
    ZIP_CRC_MISMATCH='ZIP 文件的 CRC 校验失败。'
    ARCHIVE_CHANGED='ZIP 在检查后或操作期间发生变化，请重新核对可信备份。'
    TARGET_EXISTS='目标已经存在；即使是空目录也不会覆盖或合并。'
    REPARSE_REFUSED='路径中存在目录链接或不受信任的路径重解析。'
    OFFICIAL_HOME_REFUSED='不能直接恢复到当前可识别的正式 Home 或其子目录。'
    RESTORE_CLEANUP_FAILED='暂存清理未完成；请保留现场，不要将其当作成功恢复。'
    ENOENT='所选文件或必需的父目录不存在。'
  }
  if($messages.ContainsKey($Code)){return $messages[$Code]}
  return '检查未通过，不能跳过；请核对恢复准备清单与工具包。'
}

function ConvertTo-PackerProcessArgument([string]$Value) {
  $buffer=New-Object Text.StringBuilder;[void]$buffer.Append('"');$slashes=0
  foreach($char in $Value.ToCharArray()){
    if($char -eq '\'){$slashes++;continue}
    if($char -eq '"'){[void]$buffer.Append(('\' * (2*$slashes+1)));[void]$buffer.Append('"')}else{[void]$buffer.Append(('\' * $slashes));[void]$buffer.Append($char)}
    $slashes=0
  }
  [void]$buffer.Append(('\' * (2*$slashes)));[void]$buffer.Append('"');return $buffer.ToString()
}
