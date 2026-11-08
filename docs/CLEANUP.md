# 卸载与清理规程（v0.7.0；保留既有安全边界）

v0.6.3 不改变暂存、任务目录或 ZIP 保留语义。恢复到新 Home 的 `plugins-local` 属于用户源码数据，不会被自动清理；是否保留由你决定。

本页是**最短手动规程**，不是自动清理工具。Packer 有意保留失败现场、不覆盖已有 ZIP、不自动删除暂存数据；任何删除都必须由你明确选择并在核对后执行。**绝不使用通配符一键删除整个目录**，也不要用清理掩盖失败。

## 0. 前置核对（每次都必须做）

1. 确认没有进行中的备份或恢复：独立助手窗口已关闭、相关 DSH 实例已正常退出、没有后台写入者。
2. 确认你要删除的是**哪一个**具体任务/目录，并记录其完整路径与创建时间。
3. 确认私人 ZIP、暂存数据和诊断已有你认可的唯一副本或已不再需要；ZIP 未加密，删除前也要考虑副本。
4. 区分 **回滚**（禁用激活入口、保留数据，`assets/migration-engine.cjs` 的 `rollback`）与 **删除**（本页）。回滚不会删除暂存 Home/Workspace，不能用「已回滚」推断「已删除」。

## 1. 已知残留位置

| 内容 | 位置 | 说明 |
|---|---|---|
| 冷备任务目录 | `<DSH_HOME>/.packer-cold/` 下以 32 位十六进制 ID 命名的子目录，以及 `active.lock` / `aborted-*.lock` / `operation.guard` | 含 `job.json`、`status.json`、`terminal.json`、`ui-result.json`、`dependency-check.json`、`lease-request.private.json`、`events.ndjson`、`tmp/` 等私人元数据 |
| 冷备目标 ZIP | 你在保存对话框中选择的路径（及因「不覆盖」而累积的旧 ZIP） | 未加密，可能含凭据、会话、Prompt |
| 迁移暂存环境 | 新 Workspace 同级目录下的 `.<Workspace 名>.dsh-state-<planId 前 12 位>/` | 含 `home/`、`agents/`、`electron/`、`data/`、`packages/`、`preferences/`、`logs/`、`transaction.json`、`plan.json`、`verification.json`、`Start-Restored-DSH.ps1` |
| 迁移 GUI 请求目录 | 目标父目录下的 `.packer-requests-<guid>/` | 含私有请求 JSON（可能含 ZIP 路径与完整计划） |
| 严格恢复暂存残留 | 目标父目录下的 `.*.private-*.tmp`、`.dsh-restore-*` | 仅硬退出/断电等异常情况留下 |
| 独立工具包工作目录 | 解压工具包下的 `work/`（`Open-Recovery.ps1` 重定向 TEMP/缓存用） | 可按需清理，不影响备份与恢复结果 |

## 2. 卸载 Packer 插件

1. 保存工作并正常退出所有 DSH 实例（含托盘）。
2. 先按第 1 节确认是否保留 `.packer-cold` 任务记录与已生成的 ZIP；卸载插件**不会**删除这些文件。
3. 使用当前 Desktop 随附的官方插件管理流程移除 `dsh-environment-packer`；已配置 CLI 时可用其官方移除子命令。不要手工删除 `node_modules` 中的目录或用包管理器重建整个 Profile。
4. 核对 Profile 的 `package.json` / lock 文件与其余插件条目未受影响，重新启动并做一次最小加载检查。
5. 若需回退版本，见 [UPGRADE-ROLLBACK.md](UPGRADE-ROLLBACK.md)：先停止相关进程，保留失败现场，只恢复上一个已核验的 Packer 载荷与其包管理元数据，不覆盖更新的会话或其他插件。

## 3. 手动删除单个任务或暂存目录

仅在通过第 0 节核对后，对**一个明确目标**执行：

1. 再次确认目标路径不是正式 Home、不是正式 Profile、不是正在使用的 Workspace，也不是目录链接（junction / reparse）。
2. 检查该目录内的 `transaction.json` / `terminal.json` / `ui-result.json` 状态：处于 `preparing`、`staged`、`verified` 或 `needs-attention` 的事务应先确认没有活动写入者，并保留诊断副本。
3. 先移动到一个隔离的保留目录（例如 `D:\PackerRetained\<日期>\`），而不是直接删除；确认一段时间无需取证后，再按本机常规方式删除。
4. 删除后核对：正式 Home、正式 Profile、其他插件、当前 Workspace 与仍在使用的 ZIP 均未变化。

> 单独删除 `active.lock` 不能替代安全恢复流程。异常任务请先在 Packer 设置页使用「检查并恢复异常任务」，见 [LEGACY-RECOVERY.md](LEGACY-RECOVERY.md)。

## 4. 不要做的事

- 不要用 `rm -rf` / `del /S /Q` / 通配符批量删除 `.packer-cold` 或 `.*.dsh-state-*`。
- 不要为了「让备份成功」而删除失败记录、缺口码、锁定文件或暂存目录。
- 不要把「回滚完成」当成「私人暂存数据已清除」。
- 不要在 DSH 或恢复器仍在运行时清理其工作目录。
- 不要把私人 ZIP 或原始诊断上传到公开渠道排错。

## 5. 容量提示

长期不清理会累积旧 ZIP 与暂存目录。单归档上限为 128 MiB/文件、2 GiB 总载荷、60,000 条目；恢复另需约 `载荷字节 × 3 + 128 MiB` 的可用空间预算（预算值，不代表已发生的残留量）。详见 [BUILD-TEST.md](BUILD-TEST.md)。
