# dsh-environment-packer 0.4.3

[Current GitHub Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.4.3) · [使用说明 / Usage](README.md) · [Compatibility](docs/COMPATIBILITY.md)

Windows DSH Desktop RC5 cold backup, recovery/3 host compatibility, guarded abnormal-task recovery, an independent WinForms assistant, and terminal auto-exit. Private ZIPs remain unencrypted; restoration requires a fresh target and the exact compatible runtime/host contract.

当前发布状态以上述 Release 为准。下载 tgz 和同名 SHA-256 文件，核对后通过官方插件界面安装。下方保留此前版本的历史记录，不代表本轮重新验收。

Use the linked Release and matching tgz/checksum. The historical notes below retain their original validation scope; this documentation-only revision does not rerun acceptance.

## Historical 0.4.2 notes

## 中文

以完整离线冷备份为主要流程：选择 ZIP、私人确认、独立助手接管、**用户从菜单/托盘正常退出 DSH**，再点击“我已正常退出，检查后继续”。人工确认不能绕过进程检查；未完全退出、检测不明或超时均不开始。助手显示阶段、活动条和文件数，不自动退出或重启 DSH。

普通热备份 GUI 已移除，POST /create-full 返回 410。保留专家安全导出（不能恢复环境）和离线 CLI。Windows 载荷读锁、持续监测、完整清单/CRC/SHA-256 校验与无覆盖提交保护本地 ZIP。

私人 ZIP 可能包含 API Key、Token、密码、私人 Prompt、会话、记忆和附件；**不加密，不适合公开分享，不自动上传**。只包含当前 Profile 和声明的 home 范围；外部运行时/工作区/模型、系统凭据及其他 Profile 不完整迁移。GUI 需标准 DSH_HOME/profiles/<name>。恢复只写全新兼容 home。

保留 dsh-private-recovery/2，兼容 0.4.0/0.4.1 私人包；0.3.4 旧格式不兼容。已验证 Windows 11 x64 10.0.26300、DSH Desktop 0.2.1-rc.2、Electron Node 24.21.0 / ABI 149。单文件 128 MiB、约 2 GiB 载荷、59,999 项限制。跨机器/真实私人数据库业务恢复、全部外部依赖/杀软/DPI/网络盘未普遍验证。ZIP 校验不等于业务恢复，哈希不是签名。硬退出/断电可能留下私有残留或未确认结果。

发布包更新文档和“候选”显示标识，运行流程及助手/恢复核心与提交 4a797b11c070b53f7eadc1ccbea032155bce65ad 相同。其字节与旧 555e90… 候选不同，请使用本 Release 附带的完整校验值。MIT 授权范围、js-yaml 原作者与许可、PROVENANCE 早期来源披露保留。不发布 npm，不提交 dsh-market。

## English

Complete offline cold backup is now the main workflow: choose a new ZIP, approve private scope, wait for assistant handoff, **manually quit DSH through its menu/tray**, then confirm in the assistant. Confirmation cannot bypass process inspection. Unknown/live writers or timeout stop the job. The independent window displays phases, an activity bar and file counts; it neither quits nor restarts DSH automatically.

The ordinary hot-backup GUI is removed and POST /create-full returns 410. Narrow expert safe export cannot restore an environment; the offline CLI remains. Windows source read leases, restart monitoring, manifest/CRC/payload SHA-256 verification and no-replace commit protect the archive.

Private ZIPs may contain credentials, prompts, conversations, memories and attachments. **They are unencrypted, local-only and unsuitable for public sharing.** Scope is the selected standard Profile and declared home entries, not a universal migration of external runtimes, workspaces, models or OS credentials. Restore accepts only a fresh compatible home.

Format recovery/2 remains compatible with 0.4.0/0.4.1; legacy 0.3.4 formats are unsupported. Tested Windows 11 x64 build 10.0.26300, Desktop 0.2.1-rc.2, Electron Node 24.21.0 / ABI 149. Limits: 128 MiB/file, about 2 GiB payload, 59,999 entries. Cross-machine and real private database business restoration are not generally validated. Verification does not prove business operation, and hashes are not signatures. Hard exits can leave private residues or unconfirmed results.

Release packaging updates documentation and the visible candidate label only; backup/assistant/restore behavior matches reviewed commit 4a797b1. The artifact differs from the earlier 555e90… candidate: verify this Release's checksum. Scoped MIT, original js-yaml notices and provenance disclosures remain. No npm or marketplace publication.
