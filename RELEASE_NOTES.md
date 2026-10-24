# v0.4.1

## 中文

Environment Packer 首个审查后的公开源码版本。完整私人 ZIP 与范围很小的安全配置导出分开；私人包可能含凭据、Prompt、会话与记忆，不加密，不适合分享。安全导出不能恢复完整环境。

0.4.1 修正无进度回调时返回与落盘恢复计数为 0 的问题，未改变 ZIP 格式、恢复范围、校验或提交逻辑。原生 Save As 由用户在实际 Windows 桌面完成取消、Unicode 路径、已有文件拒绝和安全导出；原生代码未为自动化改写。

恢复只写新 DSH_HOME。数据库一致性需停机冷备份。旧 0.3.4 目录/声明格式不兼容。实测 Windows x64 / DSH Desktop 0.2.1-rc.2 / Electron Node 24.21.0 / ABI 149；未验证跨机、真实私人数据库和全部外部依赖。

本公开 tgz 增加许可与公开说明，SHA 与早期未公开的私人候选不同；功能资源相同。请核对本 Release 的 SHA-256。第三方 js-yaml MIT 保留，维护者授权范围和历史来源限制见仓库说明。不发布 npm 或 dsh-market。

## English

First reviewed public snapshot. Full private backup and conservative safe export remain distinct. Private ZIPs may contain credentials, prompts, sessions and memory: they are not encrypted or suitable for public sharing. Safe export cannot restore an environment.

0.4.1 fixes callback-free restore counters and the written result report without changing extraction, verification, format or scope. Native Save As passed actual human desktop interactions; production dialog code was not rewritten for automation.

Restore only into a fresh home; cold backups are required for database consistency. Legacy 0.3.4 formats are incompatible. Tested on Windows x64, DSH Desktop 0.2.1-rc.2 and its Electron Node 24.21.0 / ABI 149. Another machine, real private database restoration and all external dependencies were not tested.

The public package adds licensing/documentation and differs in hash from earlier unpublished candidates while preserving functional resources. Verify this Release's checksum. js-yaml retains its MIT notice; license scope and incomplete historical provenance are documented. No npm or market publication.
