# Packer v0.7.5 — 四组遗留问题收口 / Four leftover defects closed

本版只处理上一轮质量报告里的四组问题及其直接关联缺陷：存储所有权验证、回归清单漂移、DSH 退出相关的 native/probe 测试、两项 PowerShell UI 测试。归档格式（recovery/2、/3、/4）、容量限制、事务、依赖契约与 verify/commit 门禁均未改变。

## 1. 恢复验证 `STORAGE_OWNER_UNAVAILABLE`

上一轮隔离恢复的 plan / apply / 文件逐字节校验都通过（51,999 个文件一致），运行时验证却以 `RUNTIME_BOOT_FAILED` 结束，底层是 `STORAGE_OWNER_UNAVAILABLE`。这次在源码和真实运行时里定位到三个独立原因，不是单一的“懒加载”：

1. **幻影存储域**：`scanData` 把 `home-data/storages/**` 下任何带 `version` + `value` 的 JSON 都登记成存储域。`cost-meter/ledger.json.details-cache/*.json` 是 cost-meter 插件的详情缓存（`{version:2,key,generatedAt,source,value}`），因此被登记成 `cost-meter` v2 关键域——一个任何插件都不会 `open()` 的域。上一轮计划里的 6 个关键域中，它是唯一从不存在的一个。
2. **启动时没有属主打开**：`archive_manager_favorites` 与 `token_total_history` 在当前 Profile 里没有活跃属主（前者在首次读取收藏时才打开，后者所属插件已不在依赖里）。旧检查把“loader 返回时未观察到 open”直接当成数据不可用。
3. **异步打开竞态**：`dsh_prompt` 的存储在插件 `apply()` 里通过 `sharedStore()` 异步初始化，`loader.await()` 返回时 `DomainFacility.open()` 可能仍在进行中；`observedStorage` 要等 open 完成才记录，于是验证循环会与插件抢同一个 handle，报 `already open`。

修复分两层：

- **识别**（`assets/migration-plan.cjs`）：只承认文档化的三种介质形态——顶层 `unit:{name,version}`、顶层 `{version,value}` 旧格式、含 `global.json` 的 per-record 目录。插件私有缓存/账本仍全量入档，但不再进入关键域门禁。真实归档的域从“6 个（含 1 个幻影）”变成 7 个：5 个关键（`archive_manager_favorites` v1、`dsh_prompt` v0、`schedule` v2、`token_total_history` v1、`workspace` v2）+ 2 个非关键 `session_projcache*`（per-record）。
- **验证**（`assets/migration-runtime.cjs`）：在任何插件打开之前先验证介质本身——文件/目录存在、JSON 可解析、`unit.name` 与路径一致、版本与计划一致、逐表记录数正确、per-record 每条记录版本一致。缺失仍报 `STORAGE_OWNER_UNAVAILABLE`；损坏、身份不符、版本漂移分别报 `STORAGE_DATA_INVALID`、`STORAGE_UNIT_IDENTITY_MISMATCH`、`STORAGE_VERSION_UNSUPPORTED`。随后区分「已由属主打开」（含启动瞬间仍在进行的 open，最多等 5 秒）、「属主打开中」、「仅归档可读」；没有属主的域由目标自己的 JSON 后端 `kv.open → loadAll` 读一遍并核对记录数，写入 `verification.json` 的 `owner/engine` 字段，而不是假装有活跃属主。

`STORAGE_OWNER_UNAVAILABLE` 没有被删除或降级：它现在只在介质真的缺失时出现。

**真实归档验证**（v0.7.4 归档，只读 plan → 隔离 apply → 两轮运行时 verify）：

| 项 | 结果 |
|---|---|
| 计划 | `canApply=true`，0 issue，5 个关键域 |
| apply | `phase=staged`，52,060 条目，51,999 逐字节一致，0 缺失、0 哈希不符，55 个会话可读 |
| verify 第 1/2 轮 | 通过；`storage-owner-read` + `storage-medium-read-without-owner` + `actual-session-owner-read` + `known-preference-bootstrap` + `ai-exporter-session-list/snapshots` + `packer-settings-service` |
| 域归属 | `dsh_prompt`、`schedule`、`workspace`：属主打开；`archive_manager_favorites`、`token_total_history`：`archived-only`，由后端读取（0 / 114 条记录核对一致） |
| 反向：移走 `workspace.json` | 运行时在加载插件前失败，`STORAGE_OWNER_UNAVAILABLE` |
| 反向：把 `dsh_prompt.unit.version` +1 | `STORAGE_VERSION_UNSUPPORTED` |
| 反向：把文件改回原字节 | 完整 verify 再次通过 |

定向测试 `test/v075-storage-ownership.cjs`（9 checks）固定了上述正反场景，并对真实归档断言 7 个域、5 个关键、无 `cost-meter`。

## 2. 全量回归清单漂移

`run-regressions.mjs` 的 `nodeEntries` 漏登记三个真实测试，末尾 `UNCLASSIFIED_TEST_ENTRY` 让 `result.json` 根本写不出来。现在清单是单一声明表 `test/regression-manifest.mjs`：

- 补登记 `cold-target-path-test.mjs`、`cold-retention-test.mjs`、`cold-migration-native.mjs`；同时登记此前未进入套件的 `appearance-controls-test.ps1`、`cold-paint-log-test.ps1`、`final-layout-test.ps1`（均通过）；
- 新增 `v075-regression-manifest.mjs`：新增未登记文件 → `UNCLASSIFIED_TEST_ENTRY`，登记文件消失 → `MISSING_TEST_ENTRY`，重复登记 → `DUPLICATE_TEST_ENTRY`；分类工具必须写明理由且不能与正式条目重叠；
- 清单被拒、DSH 未关闭、或任何条目失败时，仍然写出 `result.json`（含 `error`/`detail`、manifest 摘要、源码哈希）；
- 在需要停机测试的条目之前做 DSH 预检：有进程时立即 `DSH_MUST_BE_CLOSED` 并给出数量，不靠超时掩盖。

## 3. DSH 退出与 native/probe 测试

DSH 关闭由本机协调完成：先确认会话已空闲（最后一次会话写入在 1 小时前）、保存关闭前 Profile/锁/插件清单快照，再通过应用自己的 `session-end` 路径退出（不是强杀），确认 6 个宿主/渲染进程全部为 0。随后在同一次停机窗口内运行全部 native/probe 测试：

- `cold-native-test.mjs`：8 个场景全部通过（含成功、依赖失败、超时、崩溃恢复、取消、状态替换、host/browser peer）；
- `cold-migration-native.mjs`：暴露并修掉两个真实测试缺陷——它等待终态页面的 UI 属主消失，但产品从 0.6.1 起就要求终态页保留到用户关闭；且它在关闭 UI 之后才读 `ui-result.json`，与回执写入竞态。现在先等回执、断言页面仍打开、只关闭本测试的 UI，再核对租约释放；失败时直接报子进程退出码与 stderr，不再只给 “deadline”；
- `host-probe-native-test.mjs` / `host-probe-cim-test.mjs`：均通过（CIM 的“部分/陈旧行”只在独立测试进程内替换快照，产品无 mock 开关）；
- `cold-recovery-test.mjs`：所有断言通过，但结果写入固定 `../evidence`，在独立目录运行时目录不存在。现在优先写 `DSH_PACKER_EVIDENCE_DIR` 并递归创建目录。

没有延长任何超时来换通过：冷备 10 分钟、迁移冷备 10 分钟、probe 6 分钟、其余 4 分钟，均按真实工作量设定。

## 4. 两项 PowerShell UI 测试

- **对比度**：浅色主按钮 `#4D6BFE` + 白字实测 4.33:1，低于 WCAG AA 4.5。改为同色系 `#4664F0`，实测 4.86:1，RGB 和 410（仍明确是蓝色，不是深色块）；冷备份助手与两个 WPF 助手同步，深色主题不变。阈值没有下调。
- **夹具**：`restore-view-test.ps1` 不再依赖上次私有验收留下的 `acceptance-state.json`。新增 `test/make-restore-fixture.mjs`，用产品自己的 `createPrivateBackup` 在本次运行的独立目录生成格式 2 夹具（必须由 Desktop 运行时生成，ABI 才匹配），测试结束在 `finally` 删除；显式 `DSH_PACKER_LEGACY_FIXTURE` 仍可覆盖。测试不再读取真实 Profile。
- **附带真实缺陷**：两个独立助手在 Windows PowerShell 5.1 上首次读取 `ProcessStartInfo.EnvironmentVariables` 会得到 `$null`，随后才实例化，点击「检查备份 / 开始恢复」会抛 `Cannot index into a null array`——独立恢复助手在这台机器上根本发不出 worker。`restore-assistant.ps1` 与 `migrate-assistant.ps1` 改为先读一次、为空再读一次，再追加 `ELECTRON_RUN_AS_NODE`/`TEMP`/`TMP`，保留继承环境。修复后 WPF 控制器测试 11 项全通过，`result-state-test.ps1` 15 项全通过。

## 5. 全量回归

最终套件 **47 项**（38 Node + 9 PowerShell），在 NTFS 工作副本、干净 Node 26 下运行：**47 PASS / 0 FAIL / 0 SKIP**。测试环境注意事项（exFAT 硬链接、Node 22 私有验收崩溃、ACL 权限、注入式 `--require` 钩子）已写入 `docs/BUILD-TEST.md`，没有把失败归为“环境问题”而不记录。

v0.7.4 已有的 NTFS inode 精度、chat-import 归类、PowerShell BOM 三项回归继续通过；此前失败的 5 项（3 个 native/probe + 2 个 UI）全部转绿；`v062-clean-path`、`v063-clean-path` 两项既有失败也随干净环境消失。

## 6. 冷备份与隔离恢复（最终构建）

- 真实 recovery/4 冷备份：**53,187 个归档条目，1,020,783,578 字节**，SHA-256 `42d175ce8029f7ef44469ab5301e085d32d2807310c8f04f1b5448664d875b11`；覆盖摘要 `no-known-critical-gaps`、`recoveryBlocked=false`、无缺失项；ZIP 清单、CRC 与全部载荷哈希通过。
- 隔离恢复：plan `canApply=true`、0 issue；apply 逐文件字节校验；两轮真实 DSH 启动、HTTP、插件业务读、会话属主读与存储介质读全部通过；commit 生成启动器，rollback 可撤回且不动原环境。
- 生产 Profile 只发生 Packer 版本一处变化：24 个依赖、bundles、其他插件文件与锁文件其余条目均未变。

## 7. 仍未覆盖

真实 DPI、屏幕阅读器、跨设备迁移、恶意同用户重放、断电/内核挂起仍不在合成验收范围内；ZIP 完整性不等于私人业务数据完整。`pack-test` 在 Node 22.22.2 上仍会以 `0xC0000409` 退出（既有运行时限制），本版在 Node 24/26 下通过，未修改该测试的断言。

## English summary

v0.7.5 closes the four leftovers. Storage verification no longer treats “no plugin opened this domain at boot” as data loss: domain classification now accepts only the documented media shapes (a plugin's `details-cache` JSON is no longer mistaken for a `cost-meter` domain), each critical medium is validated before any plugin can open it (missing → `STORAGE_OWNER_UNAVAILABLE`, damaged → `STORAGE_DATA_INVALID`, identity drift → `STORAGE_UNIT_IDENTITY_MISMATCH`, version drift → `STORAGE_VERSION_UNSUPPORTED`), and a domain without a live owner is read once through the target's own JSON backend and recorded as `archived-only`. The regression manifest is a single table with a self-audit, registers three previously unlisted tests plus three existing UI tests, and always writes `result.json`; native tests run only after a coordinated normal DSH exit. The light primary button now meets 4.5:1 (4.33 → 4.86), the restore view builds and removes its own fixture, and both standalone assistants no longer crash on the first `EnvironmentVariables` read in Windows PowerShell 5.1. Final suite: 47/47 PASS. Real cold backup: 53,187 entries / 1,020,783,578 bytes, verified; isolated plan, apply, two runtime rounds, commit and rollback pass.

[Upgrade and rollback](UPGRADE-ROLLBACK.md) · [Changelog](../CHANGELOG.md)
