# Packer v0.7.3 · Known plugin Home data / 已知插件 Home 数据

v0.7.2 把白名单外的 Home 顶层目录统一视为待确认数据：采集到 `home-data/<name>/`，但不分类、不自动放回 Home，并持续阻断恢复。实际归档里因此出现了三个已知条目的 `HOME_ITEM_UNCLASSIFIED`：`.dsh-paper-reader`、`dsham-move-backup` 和 `music`。

v0.7.3 增加一张窄而明确的注册表，只处理这三个已知目录：

| Home 目录 | 归属 | 识别证据 |
|---|---|---|
| `.dsh-paper-reader` | `@ggboy123/dsh-paper-reader` | 保留目录名；主题、嵌入、翻译等配置与 `bin/uv.exe` 共用该目录 |
| `dsham-move-backup` | `@michengai/dsh-archive-manager` | 保留目录名；会话移动前的备份根 |
| `music` | 已卸载的音乐插件的用户数据 | `settings.json.roots` 为数组，`stats.json.version === 2` 且 `tracks` 为对象 |

新备份把它们记录为 `coverage.excluded[].reason = "captured-plugin-data"`，`needsReview = false`，并在清单的可选 `pluginHomes` 中写入归属、证据、`archivePrefix`、文件数与字节数。数据仍采集到 `home-data/<name>/`，恢复时回到新 Home 的同一路径，`activation = "data-only"`。不属于注册表的未知目录不受影响，仍是 `HOME_ITEM_UNCLASSIFIED` critical。

旧版 /4 归档没有 `pluginHomes`。规划器会检查 `pendingReview` 条目：只有 `complete === true`、没有同名 `coverage.missing`、且内容标记匹配注册表时，才转成 `pluginData` 并映射回新 Home；其余条目继续映射到 `pending-review/<name>/` 并保持阻断。计划同时给出 `coverageReview`，把归档记录的 `recoveryBlocked` 原样展示，并列明已归类和未解决项，不修改归档摘要，也不把阻断伪装成成功。

## 真实归档验证

对现有 1.05 GB、43,331 文件的 v0.7.2 归档做只读规划：

- `pluginData = 3`，全部来自 `legacy-pending-review`，目标为新 Home 的原路径；
- `pendingReview = []`，3 个 `HOME_ITEM_UNCLASSIFIED` 不再出现；
- 与 v0.7.2 使用同一宿主 proof 的规划相比，issue 从 24 个降为 21 个，未新增 issue；
- 剩余 21 个是 20 个 `HOST_BROWSER_PEER_UNPROVEN` 和 1 个 `TRANSITIVE_DEPENDENCY_MISSING (react)`，属于既有门禁，因此 `canApply` 仍为 `false`；
- 本轮没有执行覆盖式恢复，也没有修改归档或用户原始数据。

## 英文摘要

v0.7.2 treated every non-whitelisted Home entry as pending review, which left three known plugin directories (`.dsh-paper-reader`, `dsham-move-backup`, `music`) permanently unclassified and blocking. v0.7.3 adds a narrow registry for exactly those three, records them as `captured-plugin-data` with an optional `pluginHomes` manifest block, and restores them to the same Home path as `data-only`. Legacy /4 archives are resolved during planning only when the pending entry is complete, has no matching missing-tree gap, and its content matches the registry; unresolved entries still go to `pending-review/` and stay blocking. The plan reports the archive's recorded `recoveryBlocked` unchanged via `coverageReview`.

On the existing 1.05 GB / 43,331-file archive, read-only planning classifies all three and removes the three `HOME_ITEM_UNCLASSIFIED` issues without adding new ones. Twenty-one pre-existing critical issues remain (20 browser peer proofs, 1 missing `react` transitive dependency), so `canApply` stays `false`; no apply was performed.

[Upgrade and rollback](UPGRADE-ROLLBACK.md) · [Changelog](../CHANGELOG.md)
