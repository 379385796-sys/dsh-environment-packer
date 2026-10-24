# DSH Environment Packer 0.4.1

[English](README.en.md) · [版本说明](CHANGELOG.md) · [兼容范围](docs/COMPATIBILITY.md) · [来源与许可](docs/PROVENANCE.md)

DSH 的本地环境备份与隔离恢复插件。支持完整私人恢复 ZIP，以及范围很小的安全配置导出。它不是所有 DSH 环境通用的一键无损迁移器。

## 两种模式

| 模式 | 保存内容 | 恢复能力 |
|---|---|---|
| 完整私人备份 | 当前 Profile 的原始配置、插件、依赖、本地包、必要数据；指定 DSH_HOME 的已声明目录 | 在兼容环境中写入全新 DSH_HOME，先验完整性再提交 |
| 安全配置导出 | 计数与严格布尔/有限数字设置 | **不能恢复完整环境**，没有插件、凭据或私人正文 |

**私人 ZIP 可能包含 API Key、Token、密码、私人 Prompt、会话、附件与记忆。ZIP 不加密，不适合公开分享。** 每次都需要确认，只保存本地；不要将它附在 issue 或上传到公开仓库。

完整范围：当前 Profile 全部常规文件/目录；已装依赖的包根链接会物化，循环/数据链接安全失败。另包括所选 DSH_HOME 下的 storages、sessions、attachments、memory、skills、AGENTS.md、.credentials.yaml/.yml（存在时）。外部工作区/模型/程序、其他 Profile、浏览器/系统凭据、运行时、原 ACL/NTFS ADS 等不包含。清单列出实际文件、哈希、排除和恢复限制。

安全导出排除全部原始配置、任意标识/路径/版本字符串、Prompt、文档、会话、附件、记忆、插件文件与 tgz。仅保留依赖/Bundle 计数、smooth-stream.enabled 布尔和 ui-appearance.fontSize 8–48 数字；未知值排除。它不声称对任意用户文件做了可靠脱敏。

## 安装

从 [v0.4.1 Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.4.1) 下载 tgz 与 .sha256，核对哈希后，用 DSH 插件管理器的本地安装功能选中 tgz。安装后重启宿主，在设置中找到“环境恢复包”。本项目不发布 npm，package.json 的 private:true 防止误发布。

若当前通过 link/Junction 使用开发目录，先完全退出 DSH 并备份该源码、链接目标及文件清单，逐项部署已验证文件；不要在运行中修改链接目标，也不要覆盖整个 Profile。见 [升级与回滚](docs/UPGRADE-ROLLBACK.md)。

## 使用

选择模式，填写已存在的目标目录；私人模式阅读范围警告并确认本次备份和暂停写入。每次确认会重置，同名 ZIP 拒绝覆盖。手动目录输入是原生窗口不可用时的后备。原生 Save As 在真实 Windows 用户桌面通过取消、中文/空格/Ω/emoji 路径、已有文件拒绝和安全导出测试；自动化工具未枚举到窗口不等于窗口未打开。

![私人备份界面](assets/private-backup.png)

![安全配置导出界面](assets/safe-export.png)

**可靠数据库备份需完全退出 DSH 后运行离线 CLI。** GUI 的暂停写入确认及文件变化检测不能证明跨文件数据库事务一致。

## 离线恢复

使用可信安装包中的恢复器，不运行陌生 ZIP 内脚本。恢复目标必须是**不存在的新 DSH_HOME**，父目录须存在；没有覆盖或合并开关。先安装匹配的 DSH 和外部依赖。

在与源 DSH 相同的 Node 主版本/ABI 中运行：

```text
node bin/backup-private.mjs --home <SOURCE_HOME> --profile <SOURCE_PROFILE> --zip <EXISTING_FOLDER/private.zip> --dsh-version 0.2.1-rc.2 --confirm-private --source-quiescent
node assets/restore-private.cjs --zip <PRIVATE_ZIP> --home <NEW_HOME> --profile-name restored --dsh-version 0.2.1-rc.2 --confirm-private
```

这里的 node 是兼容运行时，不保证系统 Node 可以替代 DSH 内置运行时。实测 Windows x64、DSH Desktop 0.2.1-rc.2、其 Electron Node 24.21.0 / ABI 149。可用 DSH 可执行程序，在进程级 ELECTRON_RUN_AS_NODE=1 下配合 --expose-internals 运行以上脚本；不要为此修改全局变量。详细步骤和限制见 [恢复说明](docs/RESTORE.md)。

恢复会验证 ZIP 条目集合、路径、CRC 与所有 SHA-256，在私有 staging 写入并再次验证后提交新 home；不联网、不用 pnpm/tar.exe、不运行安装脚本。恢复后仍需以新 home 启动宿主，检查插件、模型与外部路径。文件恢复成功不自动等于业务恢复成功。

## 必须接受的限制

- 0.3.4 的旧完整目录包/声明 ZIP 与新恢复器不兼容；没有自动转换。0.4.0/0.4.1 私人 ZIP 格式相同，已验证由 0.4.1 恢复 0.4.0 包。
- 私人备份权限在 Windows 收紧至当前用户/SYSTEM，这不是加密；管理员或跨文件系统复制仍有风险。
- 单文件 128 MiB、载荷约 2 GiB、文件+目录 59,999 项；超限失败，不静默截断。循环依赖链接等复杂 pnpm 布局可能安全失败。
- 外部 file/link 来源和绝对路径可能需人工迁移；原 lockfile 不代表可直接 pnpm frozen 离线重装。
- 第二台电脑/VM、真实私人数据库恢复、任意版本、网络盘/OneDrive、多屏/DPI/所有杀软与所有外部依赖未验证。哈希不是签名，用户态 TOCTOU 与断电残留限制仍在。

## 测试与许可

已验证合成备份—恢复—宿主启动/重启、逐文件哈希、路径/损坏/权限/中断等失败路径；0.4.1 修正无进度回调时恢复计数为 0 的问题。见 [构建测试](docs/BUILD-TEST.md)。

维护者可授权的贡献采用 [MIT](LICENSE)，js-yaml 保留原作者版权及 MIT；[THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)。早期创作记录不完整，不声称独占全部历史作者身份；见来源说明。请勿提交含私人 ZIP、配置或凭据的 issue。
