# DSH Environment Packer

> 当前开发分支是 **v0.6.0 Phase 2 未发布候选**。新增完整环境迁移归档、两个路径的独立恢复及真实启动验证，使用方法与安全边界见 [迁移通道说明](docs/MIGRATION.md)。旧 strict-restore 保持原语义。下方 v0.5.0 下载、校验及旧恢复步骤记录的是已发布基线，不是本分支的发布声明。正式环境尚未安装本候选。

[English](README.en.md) · [下载 v0.5.0](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.5.0) · [恢复指南](docs/RESTORE.zh-CN.md) · [兼容范围](docs/COMPATIBILITY.md)

**DSH 的本地离线冷备份与灾难恢复工具。** 在 DSH 正常退出后备份当前 Profile 和指定 Home 数据；通过独立检查和恢复助手，将备份恢复到全新、兼容的环境。不是日常配置管理或同步工具。

**私人 ZIP 可能包含密钥、Token、密码、Prompt、会话和附件；没有加密，请勿公开分享或上传到 issue。**

## 下载、校验与安装

适用的已验收环境：Windows 11 x64 / DSH Desktop **0.2.1-rc.5**。不保证任意 DSH 版本或任意电脑都能恢复。

1. 从 [v0.5.0 Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.5.0) 下载 `dsh-environment-packer-0.5.0.tgz` 和同名 `.sha256`。
2. 使用 PowerShell 校验下载文件，与 Release 校验文件比对：

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath '<下载的 tgz 完整路径>'
   ```

3. 先在隔离 Profile 验证。升级正式环境前正常退出所有 DSH，备份现有 Profile 和旧版本包。使用已配置的官方 CLI：

   ```text
   dsh plugin --profile <profile> add <tgz 完整路径>
   ```

4. 重启后打开 **设置 → 环境恢复包**，确认版本为 `0.5.0`。不需要另外安装其他三个插件。不发布 npm。

已验收安装包 SHA-256：

```text
b301efa06bcb2b589e382c5a7c20ee07292e9899b4f34a452e1fd6faac84db11
```

## 正常备份

1. 点击“创建完整环境备份（离线）”，选择已存在的文件夹和新的 ZIP 文件名。
2. 保存工作，阅读私人数据提示，确认备份；等待独立冷备份助手接管。
3. 通过菜单或托盘**正常退出所有 DSH 实例**；仅关闭窗口可能仍在后台运行。
4. 在助手点击“我已正常退出，检查后继续”。助手仍会检查进程、静止状态和文件读锁；不能强行跳过。
5. 等待写入、CRC/清单/逐文件 SHA-256 校验和安全收尾，保存结果中的 ZIP 与校验值。不会自动重启 DSH。

已有 ZIP 不覆盖；锁定失败、活动写入者、无法证明安全或超时都会停止。异常任务处理保留日志和未确认产物，不自动删除备份。详见[异常任务恢复](docs/LEGACY-RECOVERY.md)。

## DSH 无法启动时如何恢复

提前保存**私人 ZIP、完整 Packer 工具包、匹配的 DSH 安装版本，以及未收录的外部资源**。仅有 ZIP 不保证将来可恢复。

将可信 tgz 解开（Windows 的 tar 可用 `tar -xzf <tgz> -C <已有工具目录>`），保留整个 `package` 文件夹。双击其中 **`bin/restore-assistant.exe`**。不要只复制 EXE。助手依赖 Windows 已有的 .NET Framework/WPF 和 PowerShell 引擎，不需要先运行 DSH，不下载运行时，也不打开 PowerShell 控制台。

![v0.5.0 独立 WPF 恢复助手实机截图；未选择私人文件](assets/restore-assistant.png)

1. 选择以前由 Packer 保存的 ZIP；只读检查不解压、不安装、不执行插件。
2. 选择安装目录中可信的 `DeepSeek Harness.exe`，用于后台核验运行时和精确宿主证明；不会打开 DSH 界面。
3. 检查通过后，选择尚不存在的全新 Home，核对范围并明确确认私人恢复。
4. 恢复器执行前再次检查源 ZIP、宿主、依赖、路径与目标状态。不会覆盖、合并已有 Home，也不直接恢复到可识别正式 Home。
5. 文件恢复完成后，仍需使用匹配 DSH 和独立 agents 目录启动、正常退出并重启，验证插件、会话及外部路径。

**存档完整性、恢复兼容性、恢复后可用性分别判断。** 哈希正确不表示所有业务数据都已备份，文件恢复成功也不代表 DSH 已可用。检查失败不能跳过。详见[中文指南](docs/RESTORE.zh-CN.md)、[独立 CLI](docs/RESTORE.md)和[准备清单](docs/RECOVERY-PREPARATION.md)。

## 备份覆盖什么

| 范围 | 说明 |
| --- | --- |
| 当前 Profile | 常规文件、插件、依赖、本地安装包；不重复收集 `.pnpm` 虚拟存储。安装包根链接物化，危险数据链接拒绝。 |
| Home 白名单 | 存在的 `storages`、`sessions`、`attachments`、`memory`、`skills`、`AGENTS.md`、`.credentials.yaml/.yml`。 |
| 不包含 | 其他 Profile、未知 Home 项、外部工作区/模型/数据库、DSH 安装程序、系统/浏览器凭据、原 ACL/所有者/ADS。 |

覆盖报告显示实际收录、遗漏项、排除项和识别到的外部引用；不能识别所有业务依赖。外部数据库和其他写入程序需正常停止。GUI 要求 Profile 位于 `DSH_HOME/profiles/<name>`。单文件上限 128 MiB，载荷约 2 GiB，文件加目录 59,999 项；超限或复杂链接布局安全失败。

## 兼容性、验证与许可

支持既有私人格式 `recovery/2` 和 `recovery/3`；需要匹配平台、架构、精确 DSH 版本、Node 主版本和 ABI。`recovery/3` 还核验精确宿主文件及依赖证明；仅版本号相同不够。旧 0.3.4 声明 ZIP 和安全配置导出不能完整恢复。

已完成合成数据的真实冷备份、独立 WPF 恢复、新 Home 的 Desktop 启动及重启、四插件联合验收。**跨设备、真实私人数据库业务恢复、网络盘及所有 DPI/杀软组合未验证。** Windows ACL 不是加密，哈希不是签名。

[兼容与验收边界](docs/COMPATIBILITY.md) · [升级回退](docs/UPGRADE-ROLLBACK.md) · [构建测试](docs/BUILD-TEST.md) · [更新记录](CHANGELOG.md)

[MIT](LICENSE) 适用于维护者可授权贡献；保留 js-yaml MIT、semver ISC 及[第三方声明](THIRD_PARTY_NOTICES.md)。[来源说明](docs/PROVENANCE.md)保留历史来源限制，不声称完整复原早期开发历史。
