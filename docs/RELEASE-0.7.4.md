# Packer v0.7.4 — NTFS 目录身份精度 / Exact NTFS directory identity

Windows 上备份在“扫描文件”阶段直接失败、报 `PACKAGE_LINK_CYCLE`、不生成任何 ZIP，且界面只给出错误码、看不到具体路径。

## 根因

`inventory()` 用“目录身份”（`dev:ino`）判断是否又走回了祖先目录，命中就报循环。0.7.3 及更早用 `lstat` 的 **Number** 结果拼这个身份。

NTFS 的文件编号是 64 位，实际取值经常超过 2^53（`9007199254740992`）。超过之后 JavaScript 的 Number 无法逐 1 表示，相邻两个编号会读成同一个值，于是两个真实存在、互不相同的父子目录被判成“同一个目录”，扫描阶段抛 `PACKAGE_LINK_CYCLE`。这不是联接点或符号链接的问题：出事的两个目录都是普通目录，被扫的整棵树里一个联接点都没有。

本机实测：

| 目录 | `fsutil file queryfileid` | Number 形式 | bigint 形式 |
|---|---|---|---|
| `node_modules/d3-sankey/node_modules/internmap` | `…00048750` | `9288674231748432` | `9288674231748432` |
| 上者 `src` 子目录 | `…00048751` | `9288674231748432` | `9288674231748433` |

被扫的 3988 个目录里有 2038 个编号超过 2^53，Number 形式只剩 3979 个不同值：8 组碰撞、涉及 17 个目录，其中唯一“祖先—后代”的一对就是上表这一处。`d3-sankey` 由 `mermaid` 引入，安装于 2026-11-13；11-12 的备份仍然成功，时间线与症状完全吻合。

## 修复

- `assets/recovery-core.cjs` 新增 `identityExact(target)`：用 `lstat(target, { bigint: true })` 取精确编号，导出供上层使用。
- `lib/private-backup.js` 的祖先判重改为 `C.identityExact(actual)`。`identity()` 保持原样，只用于同一路径、同一句柄的前后比对——那种比对两边同时舍入，不会产生新误判。

修复不改变任何可观察的安全语义：

- 真实循环（包根链接指回祖先）仍报 `PACKAGE_LINK_CYCLE`；
- 包内链接仍报 `SOURCE_LINK_REFUSED`；
- 经重解析点到达的 Profile 或目标仍报 `REPARSE_REFUSED`；
- 合法包根链接仍被物化并记录一次；
- `node_modules/.pnpm` 仍不重复打包。

归档格式（recovery/2、/3、/4）、清单字段、容量限制（128 MiB/文件、2 GiB/包、60,000 条目）与 verify/commit 门禁一律未改。

## 验证

合成数据定向测试 `test/v074-inode-precision.cjs`（7 checks）：

- 两个相邻编号在 Number 形式下相同、在精确形式下不同（测试自身复现旧缺陷的触发条件）；
- 该碰撞树现在能被完整走完，父子目录都在清单里；
- 真实的包根回指链接仍以 `PACKAGE_LINK_CYCLE` 失败；
- 合法包根链接仍物化，文件与链接记录齐全；
- 包内链接仍 `SOURCE_LINK_REFUSED`，链接形式的 Profile 根仍 `REPARSE_REFUSED`；
- 整树目录枚举数量与人工遍历一致，精确编号互不重复。

同一测试在 0.7.3 上以 `PACKAGE_LINK_CYCLE` 失败，可作为长期回归护栏。

真实目录只读复跑（本机 Profile + Home 白名单）对比：

| 代码 | 结果 |
|---|---|
| 已安装 0.7.3 | `PACKAGE_LINK_CYCLE`（复现用户故障） |
| 0.7.4 | 3990 个目录 / 46,513 个文件 / 798,369,162 字节 / 0 个链接，约 8.4 s 完成 |

最终构建在同一台机器上再次只读复跑：3993 个目录 / 47,207 个文件 / 0 个链接，7.4 s 完成。

## 附带修复 1：`dsh-chat-import` 扫描缓存被报成未知 Home 数据

原 Bug 修好之后，真实备份第一次成功，但归档自带 `coverage.summary.state = critical-gaps`，`recoveryBlocked = true`，唯一原因是 `~/.dsh/dsh-chat-import` 被判为“未分类 Home 目录”。该目录是 `dsh-chat-import` 插件的会话扫描缓存（`scan-cache.json`，按来源格式记录已扫描源文件的大小、签名与会话条目），属于已知插件数据，不是未知用户数据。

修复：

- `KNOWN_PLUGIN_HOME` 增加 `dsh-chat-import`，证据标记为 `scan-cache-v1`；
- 新增 `scan-cache-v1` 归证：要求 JSON 的 `version` 为 ≥1 的整数、`bookmarks` 为对象、其下再有一层条目含 `entries` 数组；任一条不满足就回落为 `unclassified-home-entry` + `needsReview`，恢复仍被阻断；
- 采集不缩水：该目录仍作为 `captured-plugin-data` 全量入档（`home-data/dsh-chat-import/`），清单记录 owner、evidence、文件数与字节数。

真实 Home 只读复核：`dsh-chat-import` 现为 `captured-plugin-data`、`needsReview: false`、`pluginEvidence: 'scan-cache-v1'`，`HOME_ITEM_UNCLASSIFIED` 归零。

## 附带修复 2：独立助手成功时不重绘结果卡片

同一轮实测暴露：ZIP 已成功（51,384 文件 / 1,015,987,666 字节 / SHA-256 已记录），窗口却停在第 4 步“完整性校验”，标题为“结果未确认”，并提示“存在未确认文件，请勿当作成功备份”。

原因在 `bin/cold-window.ps1` 的 `Complete-AssistantView`：轮询循环在 worker 退出前只能渲染 `unknown`（`ASSISTANT_TERMINAL_UNCONFIRMED`），而收尾时只有 `unknown`、`cancelled` 两个分支会调用 `Update-PackerAssistantState`；成功分支直接写 `ui-result.json` 并结束，界面因此停留在上一次的 `unknown` 画面。

修复：成功分支同样调用 `Update-PackerAssistantState`，用已确认的终态（files/bytes/sha256/coverage/target）重绘整张卡片，第 5 步“完成”点亮。只影响显示，不改任何终态判定、提交或校验逻辑。

## 验证（补充）

`test/v074-chat-import-home.cjs`（8 checks，合成数据）：

- 真实标记的 `scan-cache.json` → 归类为 `captured-plugin-data`、入档到 `home-data/dsh-chat-import/scan-cache.json`、`recoveryBlocked: false`、严格归档校验通过；
- 同名目录但没有标记 → 仍在 `pendingReview`、报 `HOME_ITEM_UNCLASSIFIED`、`recoveryBlocked: true`；
- 标记损坏（`version` 非整数、`bookmarks` 为数组、条目缺 `entries`、非 JSON）→ 四种情形都仍阻断。

同一测试在未修复代码上以断言失败告终，可长期作为回归护栏。


## English summary

Cold backup failed during scanning with `PACKAGE_LINK_CYCLE` and produced no ZIP. The walk used a Number-based `dev:ino` identity to detect re-entering an ancestor. NTFS file ids are 64-bit and frequently exceed 2^53, where a double stops being lossless: the parent `internmap` directory and its `src` child (ids `…048750` and `…048751`) both read as `9288674231748432` and were treated as one directory. Neither directory is a junction, symlink or hard link. v0.7.4 adds `identityExact()` (bigint `lstat`) in `assets/recovery-core.cjs` and uses it only for the ancestor stack; `identity()` keeps its original meaning for same-object comparisons. Real cycle detection, reparse refusal, package-link materialization, archive formats and all size gates are unchanged. A new synthetic test fails on 0.7.3 with the reported code and passes on 0.7.4, and a read-only scan of the real Profile now completes with 3990 directories and 46,513 files where the installed 0.7.3 still fails.

Two follow-ups came out of the first successful real backup. `~/.dsh/dsh-chat-import` (the `dsh-chat-import` transcript scan index) was reported as an unclassified Home entry and kept the archive recovery-blocked; it is now declared known plugin data with a `scan-cache-v1` evidence check (integer `version`, object `bookmarks`, entry objects with an `entries` array), captured in full as `captured-plugin-data`, and any lookalike or corrupted marker still falls back to `pendingReview`. The assistant window also stopped at step 4 claiming “result unconfirmed” although the ZIP had been verified; `Complete-AssistantView` now repaints the success state through `Update-PackerAssistantState` instead of leaving the earlier `unknown` render in place. A second synthetic test (`v074-chat-import-home.cjs`, 8 checks) covers both the classification and the fallbacks.


[Upgrade and rollback](UPGRADE-ROLLBACK.md) · [Changelog](../CHANGELOG.md)
