# 独立检查与全新 Home 恢复

> **v0.6.2 当前入口**：本页主体描述的是 **recovery/2、/3 严格恢复通道**（旧格式、全新 Home）。Packer 0.6.0 起生成的当前归档是 `dsh-private-recovery/4`，使用**新 DSH 安装目录 + 全新 Workspace 根**，见 [迁移通道](MIGRATION.md)。历史段落按当时版本保留，不代表当前默认流程。

[English](RESTORE.md) · [恢复准备清单](RECOVERY-PREPARATION.md) · [卸载与清理](CLEANUP.md)

请先保存四类材料：私人备份 ZIP、与之兼容的完整 Packer 工具包、满足宿主证明要求的 DSH Desktop 安装版本，以及 ZIP 没有收录的外部文件和依赖。ZIP **不包含 DSH 安装程序、外部模型或外部工作区**。仅有 ZIP 不保证能在任意电脑、任意版本上恢复。

## 使用恢复助手

从完整、可信且已解开的 Packer 工具包双击 `bin/restore-assistant.exe`（或工具包根目录的 `Open-Recovery.ps1`），不会额外打开 PowerShell 控制台。**在 v0.6.x 中，这个 EXE 进入的是 `bin/migrate-assistant.ps1`，即 recovery/4 迁移界面**：需要选择 ZIP、已安装的可信 DSH 安装目录和**全新 Workspace 根**，并生成迁移计划。旧严格恢复（/2、/3、全新 Home）通过该界面内的「严格恢复」按钮进入，打开 `bin/restore-assistant.ps1`。不要期望 EXE 直接显示下方描述的旧版全新 Home 向导。助手使用 Windows 已有的 .NET Framework WPF，DSH 界面无需运行；不捆绑或下载桌面运行时。

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "<完整工具包>\bin\restore-assistant.ps1"
```

这里的执行选项仅作用于这个可信脚本进程，不改变用户或系统级 PowerShell 策略，也不会跳过任何恢复检查。

1. **要恢复的环境备份**：选择以前由 Packer 生成的私人 `.zip`，无需先解压。安全配置导出 ZIP 不能用于完整恢复。
2. **用于恢复的 DSH 程序**：选择电脑安装目录中的可信 `DeepSeek Harness.exe`。它用于后台核验运行时和精确宿主证明，不会打开 DSH 界面。只检查文件可暂不选择；继续恢复前必须选择符合备份要求的安装版本。助手不会代为下载或安装。
3. 点击“检查备份”，分别查看存档完整性、恢复兼容性和覆盖范围。检查未通过、版本或证明不足时不能继续。完整性通过不表示全部业务数据均被收录，更不表示 DSH 已成功启动。
4. 继续后选择已有父目录，填写其中**尚不存在的全新 Home**。已有目录即使为空也拒绝，不覆盖、不合并，不直接恢复到当前可识别的正式 Home。
5. 核对来源、目标与私人范围后，明确勾选私人确认并开始恢复。执行时会重新打开 ZIP，重新验证 Manifest、CRC/SHA-256、依赖、宿主证明和路径；之前的检查结果不能替代重新验证。
6. 等待安全收尾。操作期间不能通过关闭窗口强杀后台写入者。普通失败沿用原暂存清理规则；清理失败、断电或强杀后应保留现场，不能把暂存目录当成已恢复环境。

选择其他 ZIP 或 DSH 程序会撤销先前检查和私人确认。恢复完成只表示文件已写入并通过校验；助手不会自动启动 DSH 或迁移正式配置。

## 独立只读检查

### recovery/4（当前备份格式）—— 规范入口

使用完整可信工具包与受支持的 Node 运行时；不需要运行中的 DSH 或 AI Agent，不启动主程序界面、不创建恢复目录、不解压、不执行归档插件、不写恢复 state。

在私有工具工作目录保存 UTF-8 请求文件，例如 `inspect-request.json`：

```json
{"zipFile":"D:\\Backups\\private.zip"}
```

然后运行：

```text
node <完整工具包>\assets\migration-cli.cjs inspect --request <绝对路径>\inspect-request.json
```

输出 `{ok:true,result}`：`archiveIntegrity` 是 ZIP 结构/清单/全量哈希校验结果，`coverage` 含 `missing`/`excluded` 与关键缺口码，`postRestoreUsability.state` 恒为 `not-verified`。**`ok:true` 只表示检查操作完成**，inspect 没有目标宿主，不返回经过目标验证的 `canRestore`，也不等于恢复可以提交。存在 `critical` 覆盖缺口时，受支持完整恢复流程被阻断。输出可能含源路径等元数据，请保存在私有目录，不要当作可随意外发的脱敏材料；扫描部分数据格式需要运行时具备相应适配能力，必要时用可信 DSH Desktop 以 `ELECTRON_RUN_AS_NODE=1` 的 Node 模式运行同一命令（仅进程内设置，之后恢复环境）。

### recovery/2、/3（旧严格格式）

`node <完整工具包>/assets/verify-private.cjs --zip <备份.zip>` **只接受 /2、/3**。对 `/4` 会返回 `unsupported / UNSUPPORTED_RECOVERY_FORMAT`，这表示入口不匹配，**不表示载荷哈希损坏**。退出码 1 也可能只是当前恢复条件不足，须同时阅读三个状态。要核对当前 Desktop 兼容性时，在该次进程环境中设置 `ELECTRON_RUN_AS_NODE=1` 使用可信 Desktop 可执行文件调用同一检查器；执行后恢复原进程环境，不修改全局环境。严格通道的 `restore-private.cjs` / `recovery-assistant.cjs` 保持原参数、精确证明与事务语义，不受 `/4` 分流影响。

## 恢复后仍须验收

使用新 `DSH_HOME` 和独立 agents 目录启动匹配 DSH，核对插件、模板、工作区覆盖、会话、附件与相关数据库，再正常关闭并重启确认持久化。外部绝对路径、模型和工作区须另行核对；不要直接用新 Home 覆盖正式数据。

**严格通道**继续兼容 `dsh-private-recovery/2` 与 `/3`，不修改白名单或格式。格式 3 固定精确宿主证明，相同显示版本不一定兼容；格式 2 未记录的证明不会被伪造为已验证。旧 CLI `assets/restore-private.cjs` 保留原参数、安全检查和事务机制。**当前备份是 `/4`**，使用 `assets/migration-cli.cjs` 与迁移助手；见 [迁移通道](MIGRATION.md)。

ZIP 未加密，可能包含凭据、私人 Prompt 和数据库。哈希不能证明来源可信。不要将私人 ZIP 或原始诊断上传到公开渠道。真正跨设备迁移、任意外部业务数据及所有 DPI/多显示器组合仍须单独验证。

## 当前工具包（v0.6.2）

从 [v0.6.2 Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.6.2) 下载 `Packer-v0.6.2-Standalone-Recovery.zip` 与 `SHA256SUMS.txt`，校验后解开到独立、已存在的工具目录。保留完整 `package` 目录（含 `bin`、`assets`、`vendor`）以及 `Open-Recovery.ps1`、`READ-FIRST.txt`、`TOOLKIT-FILES.sha256`；不要只复制 EXE。备份 ZIP 不含 DSH 安装程序、外部模型或未收录的外部资源。容量上限与残留位置见 [BUILD-TEST.md](BUILD-TEST.md)、[CLEANUP.md](CLEANUP.md)。
