# Cold backup and fresh-home restoration

> **v0.7.0 当前入口**：Packer 0.6.0 起生成的冷备归档为 `dsh-private-recovery/4`（迁移通道）。本页前 12 条与「全新 Home」相关的段落描述的是 **recovery/2、/3 严格恢复通道**，只适用于旧格式归档；`/4` 使用**新 DSH 安装目录 + 全新 Workspace 根**，见 [MIGRATION.md](MIGRATION.md)。v0.6.3 起 `/4` 归档可含 `home-data/plugins-local/` 源码树；恢复时仅落到新 Home 的 `plugins-local` 作为数据，不激活为插件。历史段落按当时版本保留，不代表当前默认流程。

1. Install the same compatible DSH/runtime first. Completely exit DSH, including tray and Host, before a database-consistent backup.
2. Read the private-data warning. Choose a local existing output directory and a new ZIP name. Confirm private scope and quiescence only when true.
3. Use the CLI commands in README with explicit absolute paths. For the DSH executable, set ELECTRON_RUN_AS_NODE=1 only for that process invocation and pass --expose-internals before the script path. Restore the prior environment afterwards; do not change global environment variables or system PowerShell policy.
4. On the destination, use the trusted package's assets/restore-private.cjs with a nonexistent new DSH_HOME. Existing targets, even empty directories, are refused. The parent must exist. Do not pass the official Profile as a target.
5. The helper validates all entries and hashes before staging, verifies written bytes, and commits a new home. No lifecycle script or package manager runs. A reported verified file count is not a substitute for subsequent business validation.
6. Start DSH with the new DSH_HOME and a separate agents directory; check plugin activation, configuration, databases, models and external paths before deciding on manual migration.

Legacy 0.3.4 full directories and declaration ZIPs are not compatible. Older private ZIPs use dsh-private-recovery/2. Since 0.4.3, archives use recovery/3 when installation peers are required; old readers reject it. Use the complete trusted release package, including assets and vendor/semver. It checks dependency metadata and, for host peers, the exact Desktop executable, archive, unpacked payload and provider bindings before staging and again before commit. A matching displayed DSH version alone is insufficient. See HOST-PEERS.md. Safe-config ZIPs cannot restore an environment.

On ordinary errors/cooperative cancellation, staging is cleaned. Hard process exit or power loss can leave private .*.private-*.tmp or .dsh-restore-* residue. It is not a completed artifact and is not automatically merged or resumed. Verify ownership and active processes before manually cleaning it. No automatic broad deletion is performed.

Treat private ZIPs and copied credentials as secrets. The ACL is not encryption and can change when copied. Do not upload a backup for troubleshooting. Use only trusted backups: hashes do not authenticate their author.

## Independent read-only inspection / 独立只读检查

### recovery/4（v0.6.0 起的当前备份格式）—— 规范入口

使用**完整可信的 Packer 工具包**和受支持的 Node 运行时。它不要求运行中的 DSH 或 AI Agent，不启动主程序界面，不创建恢复目录、不解压、不执行归档中的插件，也不写任何恢复 state：

1. 在私有工具工作目录保存一个 UTF-8 请求文件（例如 `inspect-request.json`），内容仅为：

```json
{"zipFile":"D:\\Backups\\private.zip"}
```

2. 运行：

```text
node <完整工具包>\assets\migration-cli.cjs inspect --request <绝对路径>\inspect-request.json
```

输出 `{ok:true,result}`，其中 `archiveIntegrity` 是 ZIP 结构/清单/全量哈希的校验结果，`coverage` 含 `missing`/`excluded` 与关键缺口码，`postRestoreUsability.state` 恒为 `not-verified`。**`ok:true` 只表示检查操作完成**：inspect 没有目标宿主、不返回经过目标验证的 `canRestore`，更不等于恢复可以提交。存在 `critical` 覆盖缺口时，受支持完整恢复流程会被阻断。

输出可能包含源路径等元数据，请保存在私有目录，不要当作可随意外发的脱敏材料。扫描部分数据格式需要运行时具备相应适配能力，不承诺任意 Node 版本都支持所有载荷；必要时用可信 DSH Desktop 可执行文件以 `ELECTRON_RUN_AS_NODE=1` 的 Node 模式运行同一命令（仅进程内设置，之后恢复环境）。

### recovery/2、/3（旧严格恢复格式）

`assets/verify-private.cjs --zip <私人备份.zip>` **只接受 /2 与 /3**。对 `/4` 归档它会返回 `unsupported / UNSUPPORTED_RECOVERY_FORMAT`；这表示入口不匹配，**不表示载荷哈希损坏**。该命令把归档完整性与当前恢复兼容性、恢复后可用性分开报告；退出码 1 也可能只是当前恢复条件不足。带 `ELECTRON_RUN_AS_NODE=1` 的可信 Desktop 调用、`--dsh-version` 选项及不改变全局环境的要求按原说明保留，但不要用它检查 `/4`。

严格通道的 `assets/restore-private.cjs` 与 `assets/recovery-assistant.cjs` 保持原参数、精确运行时/宿主证明与事务语义，不受 `/4` 分流影响。

## Independent Windows assistant / 独立 Windows 恢复助手

From the complete trusted package, double-click **bin/restore-assistant.exe**（或工具包根目录的 `Open-Recovery.ps1`）. It opens the WPF assistant without a PowerShell console, using installed Windows assemblies. **In v0.6.x this EXE starts `bin/migrate-assistant.ps1`, i.e. the recovery/4 migration interface**: it asks for the ZIP, an already installed trusted DSH installation directory and a **new Workspace root**, then generates a plan. The old strict restore (/2, /3, fresh Home) is reached through the **「严格恢复」button inside that interface**, which opens `bin/restore-assistant.ps1`. Do not expect the EXE to show the legacy fresh-Home wizard described above. Keep the EXE, XAML, scripts and core together. The advanced script entry remains:

```text
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File <完整工具包>/bin/restore-assistant.ps1
```

The WPF interface opens independently of DSH. Choose a trusted ZIP and run read-only inspection. A standalone Node installation can check archive bytes; to clear recovery compatibility and execute the assistant's restore, select an already installed, trusted DSH Desktop executable. The helper runs it in Node mode, without opening DSH, installing or downloading anything. Missing/incompatible runtime or inadequate host proof blocks restoration.

Choose an existing parent directory and a new, nonexistent Home name, review the coverage report, and explicitly confirm the private recovery. The assistant passes the inspected ZIP SHA-256 to the original restorer. Execution reopens the ZIP and repeats manifest, path, hash, dependency and runtime/host checks before staging; it does not trust a cached UI approval. The archive identity is checked again before commit. Editing the ZIP or runtime field invalidates the UI result. Existing directories, directory links and the current known official Home/subdirectories are refused. No Profile contents or lifecycle scripts are executed.

The helper waits for safe completion; it does not kill an active writer when its close button is pressed. Completion means files were restored and verified, **not** that DSH or its business data is usable. Start the new Home manually with an independent agents directory, validate the environment and restart it before any manual migration. Do not restore into or merge with the formal Home.

The **strict** channel still supports only `dsh-private-recovery/2` and `/3`, with no format or Home whitelist change in that channel. Format 2 retains its original runtime/dependency checks and does not acquire a fabricated format-3 proof. ZIP64, compressed or otherwise unsupported ZIP layouts remain refused under the existing reader limits. The original `assets/restore-private.cjs` CLI stays available with the same arguments and safety gates. **Current backups are `/4`** and use `assets/migration-cli.cjs` / the migration assistant instead; see [MIGRATION.md](MIGRATION.md).

See the [恢复准备清单](RECOVERY-PREPARATION.md): a ZIP alone cannot guarantee future or cross-device recovery.

For 0.4.2 desktop backups use the native workflow in README, including manual exit and assistant confirmation. The expert offline backup CLI remains available; ordinary users need no Node command to create a backup.

The launcher uses the Windows .NET Framework WPF assemblies already present in the tested Windows environment; no Electron/WebView runtime is bundled. Keep `bin/restore-window.xaml`, both restore PowerShell files and the original Node core together. The process-local PowerShell execution option above does not change global policy or any archive/host validation.

In the assistant, **environment backup** means the ZIP previously created by Packer, not a DSH installer. **DSH program used for recovery** means the trusted installed `DeepSeek Harness.exe`, not a file extracted from the backup. Selecting it performs background Node/host checks without opening DSH. It is optional for archive-only inspection, but required and must satisfy the recorded proof before recovery. The ZIP contains neither the DSH installer nor external models/workspaces.

## 当前工具包（v0.7.0）

从 [v0.7.0 Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.7.0) 下载 `Packer-v0.7.0-Standalone-Recovery.zip` 与 `SHA256SUMS.txt`，核对哈希；范围与边界见 [RELEASE-0.7.0.md](RELEASE-0.7.0.md)。解开到独立、已存在的工具目录，保留完整 `package` 目录（含 `bin`、`assets`、`vendor`）以及 `Open-Recovery.ps1`、`READ-FIRST.txt`、`TOOLKIT-FILES.sha256`；不要只复制 EXE。备份 ZIP 不含 DSH 安装程序、外部模型或未收录的外部资源。

容量与残留位置见 [BUILD-TEST.md](BUILD-TEST.md) 与 [CLEANUP.md](CLEANUP.md)。本页中的 v0.5.0 下载说明已移除；历史验收段落按当时版本保留。
