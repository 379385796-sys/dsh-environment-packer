# 冷备份与全新目标恢复 / Restore guide

[返回首页](../README.md) · [兼容范围](COMPATIBILITY.md) · [宿主 peer 契约](HOST-PEERS.md)

本指南面向已发布 **0.4.3**。普通备份使用首页的桌面流程；下面的命令供了解 DSH 运行时与目录布局的操作者使用。CLI 不跳过私人确认、源静止、依赖或目标检查。

This guide covers released **0.4.3**. Use the Desktop workflow for ordinary backups. The expert commands below do not bypass private confirmation, quiescence, dependency, or target checks.

## 恢复前准备 / Before restoring

- 只使用可信备份和完整可信 Packer 包，包括 `assets/`、`lib/`、`vendor/`；单独复制 `restore-private.cjs` 不够。哈希校验不认证备份作者。
- 安装与备份契约匹配的 Windows DSH Desktop。基本要求为同平台、架构、精确 DSH 版本、Node 主版本及 ABI；宿主 peer 备份还核验精确运行时、Desktop 可执行文件、ASAR、unpacked 文件和 provider 证明。显示版本相同不等于通过。
- 正常退出 DSH，停止外部数据库和其他相关写入者。不要在正式 Profile 上试恢复。
- 选择**不存在**的新 home；即使已存在的空目录也会拒绝。父目录必须存在，路径不能经由不允许的链接。

Use a trusted backup and the complete trusted package. Install the matching Desktop/runtime first. Host-peer archives pin runtime and installation bytes beyond the base version contract. Normally exit DSH and external writers. Select a nonexistent new home with an existing parent; never use your production Profile as the target.

## PowerShell 参数示例 / Command examples

先将完整包解开到自己选择的工具目录。以下路径都是示例，必须替换；`--dsh-version` 必须与源备份和实际运行时一致，不是绕过检查的开关。请使用本机已有 DSH Desktop 可执行文件，不使用任意普通 Node 代替宿主证明。

Extract the complete package to a chosen tools directory. Replace every sample path and version with your actual values. `--dsh-version` must match both source and runtime; it does not override checks. Use the installed Desktop executable, not an arbitrary Node runtime for host-proof archives.

```powershell
$desktopExe = 'D:\Apps\DSH\DSH.exe'                 # 替换 / replace
$packerRoot = 'D:\Tools\dsh-environment-packer'       # 完整解包目录 / complete package
$backupZip = 'D:\Backups\dsh-private.zip'            # 可信备份 / trusted backup
$newHome = 'D:\Recovered\dsh-home-new'               # 不得已存在 / must not exist
$dshVersion = '0.2.1-rc.5'                            # 与源和运行时一致 / match source/runtime
$savedElectronMode = $env:ELECTRON_RUN_AS_NODE
try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    & $desktopExe --expose-internals (Join-Path $packerRoot 'assets\restore-private.cjs') `
        --zip $backupZip --home $newHome --profile-name desktop `
        --dsh-version $dshVersion --confirm-private
    if ($LASTEXITCODE -ne 0) { throw 'Restore failed; inspect the reported error code.' }
} finally {
    $env:ELECTRON_RUN_AS_NODE = $savedElectronMode
}
```

`--profile-name` 是新 home 下的 Profile 名（默认 `desktop`），不是原有 Profile 的路径。示例只暂时调整当前 PowerShell 进程的 Electron 模式，不更改全局环境或执行策略。独立 Node/CLI 的额外缓存和临时目录按自己的工作区配置。

`--profile-name` names the Profile inside the new home (default `desktop`); it is not an existing Profile path. The example restores the process-local Electron setting and changes no global environment or execution policy. Configure temporary/cache paths for your own workspace separately.

专家离线备份入口为 `bin/backup-private.mjs`，使用相同的进程级运行时准备，将上例中的脚本与参数替换为：

For expert offline backup, use the same process-local runtime preparation, replacing the restore invocation with:

```powershell
& $desktopExe --expose-internals (Join-Path $packerRoot 'bin\backup-private.mjs') `
    --home 'D:\Source\dsh-home' --profile 'D:\Source\dsh-home\profiles\desktop' `
    --zip 'D:\Backups\dsh-private-new.zip' --dsh-version $dshVersion `
    --confirm-private --source-quiescent
```

只能在已阅读私人范围、真实停止所有源写入者后传入这些确认参数；选择新的 ZIP 名称，不覆盖旧包。普通用户不需要此命令。

Pass confirmation flags only after reviewing private scope and genuinely stopping all source writers. Choose a new ZIP name. Ordinary Desktop users do not need this command.

## 格式与结果 / Formats and results

无宿主 peer 的备份使用 `dsh-private-recovery/2`；需要宿主 peer 时使用 `/3`。旧 `/2` 恢复器不能读取 `/3`。0.4.0/0.4.1 私人包仍按原格式检查，同时接受当前依赖契约校验；0.3.4 旧目录包与声明 ZIP 不支持，安全配置摘要包不能恢复环境。

Archives without host peers use recovery/2; host-peer archives use recovery/3, which older readers reject. Older private archives retain format checks plus current dependency validation. Legacy 0.3.4 directory/declaration archives and safe-config summaries cannot restore an environment.

恢复器在建立暂存目录前校验清单、条目、哈希和依赖，写入后再次核对，并在提交前复查宿主证明。它不运行插件生命周期脚本，不联网安装依赖，不合并或覆盖既有目标。结果中的 `requiresStartupValidation: true` 表示仍需启动验证。

The restorer validates before staging, checks written bytes, and rechecks host proof before commit. It runs no plugin install scripts or online package manager and does not merge/overwrite a target. `requiresStartupValidation: true` means startup validation remains required.

## 恢复后检查 / After restoration

在隔离环境中，按当前宿主的启动方式指定新 `DSH_HOME` 与独立 agents 目录。检查插件启用、配置、数据库、模型和外部路径，再正常关闭、重启验证；确认后再决定正式迁移。本文不承诺跨机器或真实私人数据库的通用业务恢复。

Start the host in isolation using the restored home and a separate agents directory through the host's supported launch configuration. Check plugins, settings, databases, models, external paths, and normal restart before deciding on migration. Cross-machine and real private database business recovery are not universally certified.

恢复端普通错误或协作取消会尝试清理本次暂存；清理失败会报告 `RESTORE_CLEANUP_FAILED`。硬退出或断电可能留下私有临时文件或 `.dsh-restore-*`，不能当作完成结果，也不自动合并或续传。先检查归属与活动进程再人工处理。桌面备份助手另会保留失败/未确认 ZIP 和诊断，勿与恢复暂存清理混淆。

Ordinary restore errors/cooperative cancellation attempt to remove current staging; cleanup failure reports `RESTORE_CLEANUP_FAILED`. Hard exits can leave private temporary files or `.dsh-restore-*` residues. They are not completed results and are not automatically merged or resumed. Verify ownership and active processes before manual cleanup. Desktop backup failures separately preserve failed/unconfirmed ZIPs and diagnostics.
