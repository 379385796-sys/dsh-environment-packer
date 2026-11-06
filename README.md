# DSH Environment Packer · v0.6.3（候选）

**环境恢复包：为 DSH 创建私人冷备份，并在新路径、新兼容宿主上恢复环境。**

[已发布 v0.6.2](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.6.2) · [English](README.en.md) · [迁移与兼容说明](docs/MIGRATION.md) · [恢复准备](docs/RECOVERY-PREPARATION.md) · [卸载与清理](docs/CLEANUP.md)

> **v0.6.3 是候选，尚未发布。** 已发布版本仍为 v0.6.2；本候选的范围、测试与剩余边界见 [RELEASE-0.6.3.md](docs/RELEASE-0.6.3.md)，精确哈希以同目录 `SHA256SUMS.txt` 为准。不覆盖 v0.6.2 的 Release、附件、Market 条目或正式备份。

## 0.6.3 覆盖分类与恢复诊断

- **本地插件源码树**：`~/.dsh/plugins-local` 不是 DSH 运行时路径，也没有配置引用；其中的包是用户本地源码。v0.6.3 把它作为**惰性数据**采集到 `home-data/plugins-local/`，明确排除 `node_modules` 安装产物，并在清单 `sourceTrees` 记录文件数、字节数、排除项与 `complete`。恢复计划给出到新 Home 的确定映射（`<新Home>/plugins-local`），`apply` 暂存后 `verify` 重新计算文件/字节/摘要，不一致即 `SOURCE_TREE_CHANGED`。源码树只恢复为数据，不会被激活为插件，也不会改写配置。
- **缓存备份文件**：`.dshw-usage.json.before-recharge-fix.bak` 经代码引用、生命周期与元数据核对，确认是已采集的 `.dshw-usage.json` 的手工前置快照，无运行时读取方。仅当同名 live 文件存在且为普通文件时，`.dshw-{usage,size,turn}.json.<qualifier>.bak` 被**明确排除**为 `superseded-runtime-cache-backup`，并记录 `supersededBy`；live 文件缺失时仍按 critical 缺口保留，不默认排除。
- **peer 冲突记录与门禁**：正式归档中的记录为 `dsh-rewind-plugin → @deepseek-ai/schemastery ^3.19.0`（实际 `3.18.5`），包名、范围和实际版本准确，不存在 `@//` 形式的重写名。恢复计划重新分析后仍将其标为 `blocked/critical` 并阻止 `apply`/`commit`。本轮没有修改第三方插件、生产依赖或 peer 声明，也没有因为告警数量而放宽门禁。
- recovery/2、/3 的严格语义未改；recovery/4 的 `verify`/`commit` 门禁未放宽。新增字段对旧归档可选，旧 `dsh-private-recovery/4` 归档仍可读取。

## 0.6.2 最小可靠性修正（已发布）

- **采集状态与结果闭环**：客户端偏好字段的 `absent / present-valid / invalid` 状态被明确记录；关键覆盖缺口以有界、仅含稳定错误码的摘要从归档结果传到 worker 终态、`ui-result.json`、Packer 任务历史与成功页。字段缺失仍允许保全可读取的数据，但绝不显示为采集成功。
- **「归档完成；恢复受阻」**：存在已知关键缺口时，成功页、任务记录明确显示该结论与缺口码；ZIP 完整性、恢复兼容性、恢复后业务可用性仍然分开表述。没有目标宿主检查时不宣称兼容成功；旧记录缺摘要按未知处理。
- **必败恢复不暂存**：计划与 `apply` 预检都拒绝当前流程无法解除的 critical 问题，在创建 state/workspace 之前结束；`verify/commit` 的纵深防御保留。
- **结果持久化失败可见**：`ui-result.json` 写入失败时，成功/失败/取消/中断四种终态都不再显示「结果已保留」。
- **独立检查入口**：recovery/4 使用 `assets/migration-cli.cjs inspect`；`verify-private.cjs` 仅适用于 recovery/2、/3。检查成功不等于恢复可提交。
- 补齐容量上限、最短卸载/清理规程，以及 recovery/2、/3 与 recovery/4 的入口区分。

**本版不修复旧归档**：v0.6.1 正式验证 ZIP 仍有 `CLIENT_PREFERENCE_NOT_CAPTURED` 关键覆盖缺口与已记录依赖冲突。该包完整性通过，可作为数据保全产物保留，但现有受支持完整恢复流程不能提交；当前工具不支持对原包补录偏好。源环境仍可用时，请用 v0.6.2 另建新备份并验证，不要修改原 ZIP。

## 0.6.1 定向修复

- recovery/4 冷备允许在依赖版本/peer 冲突存在时归档可完整读取的源文件；真实冲突写入归档元数据与备份报告，恢复计划仍会重新检查并阻断未解决的关键问题。recovery/2、recovery/3 的严格语义不变。
- 独立助手改用协调的 Fluent 浅色/深色配色；浅色主按钮不再使用深色大块。按钮、边框、圆角、悬停、禁用和焦点状态统一，深色页眉操作/复制按钮/日志文本显式提升对比度，标题栏在支持时与内容背景协调。
- 助手改为紧凑的向导布局：五步流程、运行状态、保存位置和结果分区；任务详情与外观收进顶部次级操作组；路径可复制；窗口高度按当前内容收紧，等待页不再保留大面积空白。
- 备份结束不再自动关闭。成功页显示 ZIP 路径、大小、SHA-256、ZIP 完整性结果和完成时间；存在依赖冲突时用独立琥珀色提示条区分“ZIP 完整性通过”与“恢复兼容性待检查”，不改变成功判定或恢复门禁。失败、取消、中断分别显示，结果持久保留并可在 Packer 任务记录中查看。

## 能保存什么

- 当前 Profile 的插件安装载荷、依赖、来源信息与配置。
- Session、Workspace 登记、历史 cwd 及必要路径引用。
- 已识别的外部记忆、SQLite 文件、Skills、工作区配置和支持的客户端偏好。
- `plugins-local` 下的本地插件源码（排除 `node_modules` 安装产物）；恢复为新 Home 中的数据，不激活为插件。
- 已知插件的 Home 状态。缺失、未知或不兼容项目会明确报告。

不打包 DSH 安装程序，也不递归打包任意工程源码；仅按显式规则采集 `plugins-local` 本地插件源码（排除 `node_modules`），恢复时作为数据保留、不激活。**私人 ZIP 未加密，可能包含凭据和私人会话，请保存在可信位置，不要上传到公开渠道。**

## 下载与安装

**已发布版本**：从 [v0.6.2 Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.6.2) 下载：

| 文件 | 用途 |
|---|---|
| `dsh-environment-packer-0.6.2.tgz` | DSH 插件安装包 |
| `Packer-v0.6.2-Standalone-Recovery.zip` | 完整独立 Windows 恢复工具 |
| `SHA256SUMS.txt` / 同名 `.sha256` | 下载校验值 |

**v0.6.3 候选**：TGZ、独立恢复 ZIP 与 `SHA256SUMS.txt` 已在隔离工作区构建，测试与边界见 [RELEASE-0.6.3.md](docs/RELEASE-0.6.3.md)，哈希以 `SHA256SUMS.txt` 为准；尚未上传 GitHub Release。安装候选包前请核对哈希；候选与已发布版本不要混用。安装方式与回退边界见 [UPGRADE-ROLLBACK.md](docs/UPGRADE-ROLLBACK.md)。

保存当前环境并正常退出 DSH，使用当前 Desktop 随附的官方插件管理流程安装本地 TGZ。已配置 CLI 时可用：

```text
dsh plugin --profile desktop add "<TGZ 绝对路径>" --offline --ignore-scripts
```

升级已有 Profile 时沿用其原 pnpm store，不为更新 Packer 重装整个 Profile。重新启动后确认版本为 **0.6.3（候选）**；已发布版本仍应为 0.6.2。独立恢复工具请保留完整目录，不能只复制 EXE。

## 备份与恢复

**A 电脑备份**

1. 从 Packer 的备份入口选择新的 ZIP 路径，确认私人数据提示。
2. 等待独立冷备份助手接管，再保存工作并正常退出全部 DSH 实例，包括托盘。
3. 回到助手确认继续，等待进程检查、文件锁、一致性检查和 ZIP 校验完成。已有 ZIP 不覆盖。
4. **看清终态结论**：「归档完成」只说明已收录文件的完整性通过；若显示「归档完成；恢复受阻」，说明存在已知关键覆盖缺口，现有受支持完整恢复流程不能提交，请保留该包作数据保全并在源环境可用时重新备份。

**B 电脑恢复**

1. 先安装可信、兼容的 DSH；解压完整恢复工具，运行 `Open-Recovery.ps1` 或 `package/bin/restore-assistant.exe`。该 EXE 进入 **recovery/4 迁移界面**；旧严格恢复（recovery/2、/3）在界面内的「严格恢复」按钮中。
2. 选择 ZIP、**新 DSH 安装目录**和**新 Workspace 根目录**。
3. 只想只读检查归档（不需要运行中的 DSH）时，使用 `package/assets/migration-cli.cjs inspect --request <私有目录>/inspect-request.json`，请求文件为 `{"zipFile":"<ZIP 绝对路径>"}`。详见 [RESTORE.md](docs/RESTORE.md)。
4. 核对自动生成的迁移计划与「关键阻断码」，确认后执行。计划或 `apply` 会在写盘前拒绝当前流程无法解除的关键问题。
5. 恢复器在独立新目录暂存，验证依赖、数据及宿主启动/重启后才提交；失败保留诊断并安全回退。

迁移按 `inspect → plan → apply → verify → commit / rollback` 执行。旧电脑和新电脑不需要相同路径；多个历史 cwd 保持稳定的独立映射。只修改已识别结构化路径，不盲目替换会话正文或 Prompt。

## 兼容范围

已验证 Windows x64 上的 DSH **0.2.1-rc.5 → 0.2.2-rc.1** 受控合成迁移，包括插件配置、实际 Session owner 读取、Workspace v2、Skills、外部记忆、重启持久性和失败阻断。

- Packer/DSH 版本号不同本身不构成 migrate 拒绝理由；实际 engines、peer、依赖、ABI 和数据 schema 仍要检查。
- 未认证：真实 17 插件完整组合、rc.1 原生 Mnemon 业务恢复、设置页 DOM 自动化及真实 150% DPI。
- SQLite 文件被收录不等于 owner/schema 兼容。未知关键数据或插件不能提交为完整成功。
- 旧 recovery/2、recovery/3 的 strict-restore 仍保持原精确运行时和证明限制。
- 隔离目录与进程内限制不是恶意原生插件的操作系统沙箱，只使用可信归档。

**容量上限**：单文件 128 MiB、单个归档总载荷 2 GiB、最多 60,000 个条目（含清单与目录保留空间）；超出会在冷备时明确失败。恢复另需约 `载荷字节 × 3 + 128 MiB` 的可用空间预算。详见 [BUILD-TEST.md](docs/BUILD-TEST.md)。

详见 [迁移通道](docs/MIGRATION.md)、[恢复与独立检查](docs/RESTORE.md)、[卸载与清理](docs/CLEANUP.md)、[变更记录](CHANGELOG.md) 和 [v0.6.2 发布说明](docs/RELEASE-0.6.2.md)。
