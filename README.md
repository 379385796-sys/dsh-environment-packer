# DSH Environment Packer · v0.6.0

**环境恢复包：为 DSH 创建私人冷备份，并在新路径、新兼容宿主上恢复环境。**

[下载 v0.6.0](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.6.0) · [English](README.en.md) · [迁移与兼容说明](docs/MIGRATION.md)

## 能保存什么

- 当前 Profile 的插件安装载荷、依赖、来源信息与配置。
- Session、Workspace 登记、历史 cwd 及必要路径引用。
- 已识别的外部记忆、SQLite 文件、Skills、工作区配置和支持的客户端偏好。
- 已知插件的 Home 状态。缺失、未知或不兼容项目会明确报告。

不打包 DSH 安装程序，不递归打包工程源码。**私人 ZIP 未加密，可能包含凭据和私人会话，请保存在可信位置，不要上传到公开渠道。**

## 下载与安装

从 [v0.6.0 Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.6.0) 下载：

| 文件 | 用途 |
|---|---|
| `dsh-environment-packer-0.6.0.tgz` | DSH 插件安装包 |
| `Packer-v0.6.0-Standalone-Recovery.zip` | 完整独立 Windows 恢复工具 |
| 同名 `.sha256` | 下载校验值 |

保存当前环境并正常退出 DSH，使用当前 Desktop 随附的官方插件管理流程安装本地 TGZ。已配置 CLI 时可用：

```text
dsh plugin --profile desktop add "<TGZ 绝对路径>" --offline --ignore-scripts
```

升级已有 Profile 时沿用其原 pnpm store，不为更新 Packer 重装整个 Profile。重新启动后确认版本为 0.6.0。独立恢复工具请保留完整目录，不能只复制 EXE。

## 备份与恢复

**A 电脑备份**

1. 从 Packer 的备份入口选择新的 ZIP 路径，确认私人数据提示。
2. 等待独立冷备份助手接管，再保存工作并正常退出全部 DSH 实例，包括托盘。
3. 回到助手确认继续，等待进程检查、文件锁、一致性检查和 ZIP 校验完成。已有 ZIP 不覆盖。

**B 电脑恢复**

1. 先安装可信、兼容的 DSH；解压完整恢复工具，运行 `Open-Recovery.ps1` 或 `package/bin/restore-assistant.exe`。
2. 选择 ZIP、**新 DSH 安装目录**和**新 Workspace 根目录**。
3. 核对自动生成的迁移计划，确认后执行。Home、Profile、agents 与必要数据由计划安排。
4. 恢复器在独立新目录暂存，验证依赖、数据及宿主启动/重启后才提交；失败保留诊断并安全回退。

迁移按 `inspect → plan → apply → verify → commit / rollback` 执行。旧电脑和新电脑不需要相同路径；多个历史 cwd 保持稳定的独立映射。只修改已识别结构化路径，不盲目替换会话正文或 Prompt。

## 兼容范围

已验证 Windows x64 上的 DSH **0.2.1-rc.5 → 0.2.2-rc.1** 受控合成迁移，包括插件配置、实际 Session owner 读取、Workspace v2、Skills、外部记忆、重启持久性和失败阻断。

- Packer/DSH 版本号不同本身不构成 migrate 拒绝理由；实际 engines、peer、依赖、ABI 和数据 schema 仍要检查。
- 未认证：真实 17 插件完整组合、rc.1 原生 Mnemon 业务恢复、设置页 DOM 自动化及真实 150% DPI。
- SQLite 文件被收录不等于 owner/schema 兼容。未知关键数据或插件不能提交为完整成功。
- 旧 recovery/2、recovery/3 的 strict-restore 仍保持原精确运行时和证明限制。
- 隔离目录与进程内限制不是恶意原生插件的操作系统沙箱，只使用可信归档。

详见 [迁移通道](docs/MIGRATION.md)、[变更记录](CHANGELOG.md) 和 [v0.6.0 发布说明](docs/RELEASE-0.6.0.md)。
