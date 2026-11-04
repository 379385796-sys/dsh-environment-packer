# v0.6.0 — 完整环境备份与跨版本迁移

- 新增 recovery/4 私人冷备份，覆盖插件载荷与配置、Session、Workspace、已识别外部记忆/SQLite、Skills 和客户端偏好。
- 独立 Windows 恢复器接受 ZIP、新 DSH 安装目录和新 Workspace，按 inspect → plan → apply → verify → commit/rollback 执行。
- 版本号不一致本身不拒绝 migrate；仍检查实际依赖、ABI、数据 schema 和目标宿主的启动、会话读取及重启持久性。
- 修复 Node 24 多帧 Session 解码/分帧、rc.1 HTTP 偏好验证及 SQLite 扩展名识别。旧 recovery/2、recovery/3 严格恢复限制不放宽。

## 验证范围

Windows x64 / DSH 0.2.1-rc.5 → 0.2.2-rc.1 的受控合成迁移、异常阻断及回滚通过。

**未认证**：真实 17 插件完整组合、rc.1 原生 Mnemon 业务恢复、设置页 DOM 自动化、真实 150% DPI及其他未测宿主组合。归档内容正确、提交成功与完整业务可用分别报告；未知关键项不得完整提交。

私人 ZIP 未加密；不打包 DSH 安装程序或工程源码。只使用可信归档。

## 附件

- dsh-environment-packer-0.6.0.tgz — 插件包，SHA256 `66749d37feda20076178196f7dc240911bbe9d82fe73e21c882d027386d6527c`
- Packer-v0.6.0-Standalone-Recovery.zip — 完整独立恢复工具，SHA256 `36dd51ff4f85b88060530cc1fee5b00188bb21cb0293718304ee201505a77fe7`
- 同名 .sha256 校验文件。

功能代码基线 ae441043444491c2bfb1e0b67cafc5da453bb1fc。经用户批准，仅更新随包文档再封装，132 个非文档文件与已验收候选完全一致，未重新编译功能代码。正式安装已核对，用户确认页面正常；其他 16 个插件未变更。

GitHub 主页与随包 README 均为完整的 0.6.0 说明。旧 v0.5.0 Release 保留作为历史回退，不是当前下载入口。
