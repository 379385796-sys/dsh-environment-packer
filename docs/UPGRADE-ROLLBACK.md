# 升级、回滚与卸载 / Upgrade, rollback, and removal

[返回首页](../README.md) · [恢复指南](RESTORE.md)

当前发布版为 [v0.4.3](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.4.3)。旧版 0.4.1→0.4.2 部署记录不能替代当前包的安装和校验步骤。保留旧可信包、校验值、配置及安装记录，不覆盖历史 Release。

Current release: v0.4.3. Historical 0.4.1-to-0.4.2 deployment notes are not current installation instructions. Retain trusted previous packages, checksums, configuration, and installation records.

## 升级 / Upgrade

1. 确认没有活动备份/恢复任务。正常退出相关 DSH 实例，保存当前 Packer 版本与需要的配置。
2. 下载目标版本 tgz 与同名 SHA-256 文件，核对本地哈希；先在隔离 Profile 验证。
3. 使用 DSH 官方插件管理器或已配置 CLI 的本地包安装入口，指定正确 Profile。不要覆盖整个 Profile、会话、宿主核心或无关插件，不手改安装链接/Junction。
4. 重启核对包名、入口与版本。检查取消、原生路径、助手接管、正常退出检测和独立合成备份/全新目标恢复；不得用真实私人 Profile 做破坏性测试。

Ensure no task is active, quit normally, preserve the current state, verify the target tgz checksum, and test in isolation. Use the official local plugin installer for the correct Profile. Do not overwrite a whole Profile or alter host core, sessions, unrelated plugins, or installation links. Verify the installed version and cold-backup/restore workflow separately.

## 兼容变化 / Compatibility changes

- 完整备份只走冷备份；旧 `/create-full` 返回 410。专家 `/create` 摘要不能恢复环境。
- 0.4.3 增加有保护的异常任务恢复及宿主/浏览器 peer 证明，不是跳过依赖或进程检查。
- 没有宿主 peer 的私人包使用 recovery/2；需要宿主 peer 的包使用 recovery/3，不能交给旧恢复器。0.3.4 旧格式仍不兼容。
- 保留与备份匹配的完整恢复包；回滚插件不等于降级转换已有 ZIP。

Complete backups require cold exit. Version 0.4.3 adds guarded task recovery and host/browser peer proof without bypassing dependency/process checks. Keep the matching complete restore package: rolling back the plugin does not convert recovery/3 archives for old readers. Legacy 0.3.4 formats remain incompatible.

## 回滚与卸载 / Rollback and removal

先正常退出并保留失败现场，确认没有后续用户工作会被旧配置覆盖，再通过官方安装流程恢复此前可信插件包。若旧版本拒绝新格式，应使用匹配的恢复工具，不删除证明或改格式号。不要手动抢占活动锁。

卸载使用官方插件管理器或 `dsh plugin --profile <profile> remove dsh-environment-packer`。先确保没有活动助手/恢复任务；已生成的私人 ZIP、任务记录和需要保留的恢复工具应单独管理，卸载不等于安全擦除。

Quit normally and preserve the failed state before reinstalling a trusted previous plugin package. Do not overwrite newer user work, strip proofs, change archive format labels, or seize active locks. Uninstall through the manager or the CLI command above after tasks have ended. Manage private ZIPs, task records, and required restore tools separately; uninstall is not secure erasure.
