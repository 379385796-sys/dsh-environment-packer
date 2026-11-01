# v0.5.0 — Offline disaster recovery / 离线灾难恢复

## 中文

- 新增保守的备份覆盖报告和独立 ZIP 只读检查，分别显示完整性、恢复兼容性和待启动验收状态。
- 新增独立 WPF 恢复助手及无控制台启动器；保留完整工具包即可在 DSH 界面无法启动时使用。
- 复用原恢复核心；私人确认、精确宿主证明、依赖、路径、防覆盖及执行前重新验证保持严格。
- 修复 Windows PowerShell 5.1 对已验证长会话路径的读锁问题，保持原有锁定语义。
- 已用合成数据完成真实冷备份、独立助手恢复、全新 Home 启动/重启和四插件联合验收。未验证跨设备及真实私人数据库业务恢复。

## English

- Add conservative coverage reporting and standalone read-only ZIP inspection, separating integrity, compatibility and post-restore usability.
- Add a standalone WPF recovery assistant with a console-free launcher; retain the complete toolkit for recovery without a working DSH interface.
- Reuse the original recovery core and retain private consent, exact host proof, dependency/path/no-overwrite checks and execution-time revalidation.
- Fix PowerShell 5.1 read leases for validated long session paths without relaxing locking semantics.
- Synthetic acceptance covers real cold backup, independent GUI restoration, fresh-Home startup/restart and four-plugin joint operation. Cross-device and real private-database business recovery remain unverified.

## Download and safety / 下载与安全

Windows x64; tested DSH Desktop 0.2.1-rc.5. Recovery requires the matching proven runtime, not merely any installed DSH. The ZIP contains no DSH installer or excluded external resources. Private ZIPs are unencrypted and must not be shared.

下载 tgz 与 `.sha256`，校验后使用官方 `dsh plugin --profile <profile> add <tgz>` 安装；升级前正常退出并备份。恢复助手需解开并保留整个工具包。

`dsh-environment-packer-0.5.0.tgz` SHA-256:

```text
b301efa06bcb2b589e382c5a7c20ee07292e9899b4f34a452e1fd6faac84db11
```

This is the exact accepted and installed package. Repository documentation/screenshots were finalized separately; no same-version payload was replaced. / 沿用已验收安装包；仓库文档和截图后续整理，没有替换同版本安装载荷。

MIT and third-party notices retained. No npm publication. See README and compatibility/restore guides for limits.
