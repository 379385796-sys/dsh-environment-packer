# DSH Environment Packer

[English](README.en.md) · [下载 v0.4.3](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.4.3) · [恢复指南](docs/RESTORE.md) · [兼容范围](docs/COMPATIBILITY.md)

面向重装、迁移和灾难恢复的 **本地离线冷备份工具**。由独立 Windows 助手在 DSH 正常退出后打包所选 Profile 和声明的 home 数据，并校验 ZIP；恢复只写入全新、兼容的目标目录。

**私人 ZIP 可能包含 API Key、Token、密码、私人 Prompt、会话、记忆和附件。ZIP 没有加密，不适合公开分享。** 工具不上传云端；不要把备份或任务私有记录附在 issue。

## 当前版本与安装

当前发布版为 **0.4.3**。源码与旧文档中的“本地候选”是开发阶段记录；[v0.4.3 Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.4.3) 已提供 tgz 与校验文件，并记录 Windows x64、DSH Desktop **0.2.1-rc.5** 的验证目标。早期 RC2 证据不等于所有宿主版本都兼容。

1. 下载 `dsh-environment-packer-0.4.3.tgz` 和同名 `.sha256`。
2. 用 `Get-FileHash -Algorithm SHA256 -LiteralPath '<tgz完整路径>'` 计算哈希，与校验文件比较。
3. 先在隔离 Profile 通过 DSH 插件管理器安装本地包。若已配置 CLI，可使用：

   ```text
   dsh plugin --profile <你的Profile> add <tgz完整路径>
   ```

4. 重启后核对包名 `dsh-environment-packer`、入口 ID `environment-packer` 和版本 `0.4.3`。打开“设置 → 环境恢复包”。

包随附 JavaScript、js-yaml 和 semver，不附带 DSH/Node 运行时或原生二进制，不需要安装期脚本。桌面助手依赖 Windows PowerShell 5.1 / STA WinForms 及相应 Desktop 运行时。不依赖另外三款插件；备份其他插件时会检查其真实依赖契约。包保持 `private: true`，不提供 npm 发布安装路径。

升级、回滚与卸载前的注意事项见[升级回滚](docs/UPGRADE-ROLLBACK.md)。

## 创建备份：桌面流程

1. 在设置页点击“创建完整环境备份（离线）”，使用 Windows Save As 选择已有本地文件夹和新的 ZIP 文件名。
2. 保存未完成工作，阅读私人范围和外部写入者提示，确认本次备份。取消不会创建任务。
3. 等待“独立助手已接管”及独立进度窗口。交接失败时保持 DSH 运行。
4. **手动通过菜单或托盘正常退出所有 DSH 实例。** 仅关窗口可能隐藏到托盘；插件不会强杀或自动退出 DSH。
5. 在助手中点击“我已正常退出，检查后继续”。人工确认不能绕过进程检测：相关进程须完全退出并持续静止，无法确认或十分钟超时就停止。
6. 助手锁定载荷防止写入/删除，打包后核对条目集合、CRC、清单和全部载荷 SHA-256。界面显示阶段、文件数及活动条，不显示虚构百分比。
7. 确认成功结果中的路径、大小、哈希和清理状态。不会自动重启 DSH；助手可按界面的终态倒计时退出。

原生保存窗口不可用时才提供完整 ZIP 路径输入后备。现有目标拒绝覆盖，重复点击不会创建竞争任务。

以下为仓库已有的 **合成组件预览，不是真实桌面验收截图**：

![离线冷备份组件预览](assets/cold-backup.png)

建议后续补充实际 RC5 设置页和独立助手的脱敏截图，标明宿主版本与阶段。

## 备份范围

| 包含 | 不包含或不保证迁移 |
| --- | --- |
| 当前 Profile 常规文件、插件、已安装依赖、本地 tgz | 其他 Profile、未声明 home 项 |
| 所选 DSH_HOME 的 storages、sessions、attachments、memory、skills | 外部工作区、模型、程序和运行时 |
| 存在时的 AGENTS.md、.credentials.yaml/.yml | 系统/浏览器凭据、原 ACL/所有者/ADS、外部数据库事务状态 |

GUI 要求 Profile 位于 `DSH_HOME/profiles/<name>`，非标准外置 Profile 会被拒绝。安装包根链接可物化，循环或不支持的数据链接会安全失败。实际范围、排除与逐文件哈希写入清单。

外部数据库和其他写入程序须正常停止。检测会保守等待同 Desktop 运行时实例、已跟踪后代、引用源 home 的进程及已知数据库进程；无法取得源文件读锁时停止。

任务参数与载荷请求使用私人 ACL；ACL 不是加密。任务记录在 `DSH_HOME/.packer-cold`，不进入备份。故障诊断可能包含私人路径，应仅在本地处理。

## 恢复与兼容边界

使用 **完整可信包**中的 `assets/restore-private.cjs`，不要只复制单个脚本。目标 home 必须不存在，父目录须存在；不支持覆盖、合并、在线补依赖或执行安装脚本。运行时准备、参数与后续启动检查见[恢复指南](docs/RESTORE.md)。

- 基本契约要求同平台、架构、精确 DSH 版本、Node 主版本及 ABI。使用宿主 peer 的备份还固定 Desktop 可执行文件、ASAR、unpacked 文件与更严格的运行时/依赖证明；仅版本号相同不够。详见[宿主 peer 契约](docs/HOST-PEERS.md)。
- 无宿主 peer 的包使用 `dsh-private-recovery/2`；需要宿主 peer 的包使用 `/3`，旧恢复器会拒绝。旧私人包仍按原格式验证并补查依赖；0.3.4 旧目录包和声明 ZIP 不自动转换。
- 单文件上限 128 MiB、载荷约 2 GiB、文件加目录 59,999 项；超限或复杂链接布局可能失败。
- 第二台机器/VM、真实私人数据库业务恢复、任意第三方依赖图、网络盘/OneDrive、全部杀软和 DPI 组合未普遍验证。

**ZIP 校验成功不等于环境已恢复可用。** 恢复后必须另行验证宿主、插件、数据库、模型及外部路径。哈希用于完整性检查，不是来源签名。

## 常见问题

**为什么不能运行中完整备份？** 为避免写入中的数据不一致，普通完整备份只提供冷备份流程。旧 `POST /create-full` 固定返回 `410 HOT_BACKUP_DISABLED`。专家兼容接口 `/create` 仅导出严格限制的少量配置摘要，不能恢复环境，也不导出原始配置、Prompt、插件或 tgz。

**依赖预检为什么拒绝？** 缺失普通依赖、错误版本、来源不明或无法证明浏览器/Node 使用范围都会阻止备份。0.4.3 支持有证据的宿主和浏览器 peer，并非跳过 peer 检查；任意插件图不保证通过。

**异常任务或锁残留怎么办？** 先查看独立助手，已结束的窗口关闭后使用“检查并恢复异常任务”。活动句柄与精确进程身份仍会阻止恢复。旧 0.4.2 任务需额外[完整启动证明](docs/LEGACY-RECOVERY.md)，不能仅因超时或 PID 消失就强解锁。

**失败 ZIP 会被删除吗？** 独立助手的失败、取消或异常中断会保留故障记录和失败/未确认 ZIP。正常终态退役自己的锁，崩溃可能留锁。ZIP 原子提交可能早于成功状态写入；没有明确成功状态的产物应保留检查，用新名称重试，不自动认定可恢复。恢复端的暂存清理规则另见[恢复指南](docs/RESTORE.md)。

## 维护与许可

专家备份 CLI 为 `bin/backup-private.mjs`，要求显式路径及私人/静止确认；普通桌面备份无需 Node 命令。维护流程见[构建测试](docs/BUILD-TEST.md)，历史见 [CHANGELOG](CHANGELOG.md)。

维护者可授权的贡献沿用 [MIT](LICENSE)。js-yaml / semver 的许可及早期来源边界见[第三方声明](THIRD_PARTY_NOTICES.md)与[来源记录](docs/PROVENANCE.md)。
