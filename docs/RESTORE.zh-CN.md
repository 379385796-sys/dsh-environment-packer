# 独立检查与全新 Home 恢复

[English](RESTORE.md) · [恢复准备清单](RECOVERY-PREPARATION.md)

请先保存四类材料：私人备份 ZIP、与之兼容的完整 Packer 工具包、满足宿主证明要求的 DSH Desktop 安装版本，以及 ZIP 没有收录的外部文件和依赖。ZIP **不包含 DSH 安装程序、外部模型或外部工作区**。仅有 ZIP 不保证能在任意电脑、任意版本上恢复。

## 使用恢复助手

从完整、可信且已解开的 Packer 工具包双击 `bin/restore-assistant.exe`，不会额外打开 PowerShell 控制台。需要诊断时仍可使用下方专家脚本入口。助手使用 Windows 已有的 .NET Framework WPF，DSH 界面无需运行；不捆绑或下载桌面运行时。

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

```text
node <完整工具包>/assets/verify-private.cjs --zip <备份.zip>
```

普通 Node 可以检查存档字节。要核对当前 Desktop 兼容性，在该次进程环境中设置 `ELECTRON_RUN_AS_NODE=1`，使用可信 Desktop 可执行文件调用同一检查器：

```text
<DSH Desktop.exe> --expose-internals <完整工具包>/assets/verify-private.cjs --zip <备份.zip>
```

这不会创建恢复目录、解压、安装依赖或执行备份中的插件。退出码 1 也可能表示存档完整但当前恢复条件不足，须同时阅读三个状态。执行后恢复原进程环境，不修改全局环境。

## 恢复后仍须验收

使用新 `DSH_HOME` 和独立 agents 目录启动匹配 DSH，核对插件、模板、工作区覆盖、会话、附件与相关数据库，再正常关闭并重启确认持久化。外部绝对路径、模型和工作区须另行核对；不要直接用新 Home 覆盖正式数据。

继续兼容受支持的 `dsh-private-recovery/2` 与 `/3`，不修改白名单或格式。格式 3 固定精确宿主证明，相同显示版本不一定兼容；格式 2 未记录的证明不会被伪造为已验证。旧 CLI `assets/restore-private.cjs` 保留原参数、安全检查和事务机制。

ZIP 未加密，可能包含凭据、私人 Prompt 和数据库。哈希不能证明来源可信。不要将私人 ZIP 或原始诊断上传到公开渠道。真正跨设备迁移、任意外部业务数据及所有 DPI/多显示器组合仍须单独验证。

## v0.5.0 toolkit / 恢复工具包

Download the complete tgz and checksum from [GitHub Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.5.0), verify SHA-256, then extract into a separate existing tools folder. Keep the entire `package` directory, including `bin`, `assets` and `vendor`; do not copy the EXE alone. / 下载完整 tgz 与校验文件，校验后解开到独立工具目录，保留整个 package 文件夹。备份 ZIP 不含 DSH 安装程序及未收录的外部资源。
