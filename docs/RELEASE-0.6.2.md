# v0.6.2 — 最小可靠性修正

基线：`v0.6.1`（tag `v0.6.1` / commit `2c9d20d`）。本版继续沿用 `dsh-private-recovery/4`，**不新增恢复格式、服务、框架、数据库或 UI 美术**。发布状态以实际 Release 为准。

依据：`Packer_v0.6.1_Codex_Audit_Verdict.md` 第 6、7 节。Hy4 原始独立审计报告仅作补充证据，凡与裁决冲突处以裁决为准。

## 1. 修复内容

| 工作项 | 实现 |
| --- | --- |
| 采集状态与结果闭环 | `client.js`、`index.js`、`lib/cold-task.js`、`assets/migration-archive.cjs`、`bin/cold-backup.mjs`：请求字段按 `absent / present-valid / invalid` 分类；`clientPreferenceCapture` 仅记协议版本与状态；私有 `job.json` 另含 worker 入档所需的已校验偏好值，不记录原始 HTTP 请求体，公开摘要不含偏好值；非法输入以 `CLIENT_PREFERENCE_INVALID` 明确失败；合法值经 `knownPreference` 校验后归档。字段缺失仍允许归档可完整读取并校验的数据，同时在 `coverage.missing` 保留 `critical:true` 缺口，绝不写入默认偏好冒充采集。 |
| 有界 coverage 摘要 | `coverageSummary()` 只产生 `schema / state / criticalCount / criticalCodes / truncated / recoveryBlocked / blockReason`，错误码限 8 个且匹配 `^[A-Z0-9_]{1,64}$`，不含路径、正文、凭据或任意输入对象。摘要写入 `manifest.coverage.summary`，`validate()` 校验形状并要求它能由 `coverage.missing` / `coverage.excluded` 重新推导，防止改写清单伪造干净采集。摘要经 `onCommitted` → worker `done` → `terminal.json` → `ui-result.json` → `readUiOverview()` 全链路传递。 |
| 覆盖字段语义 | `completeWithinDeclaredScope` 改为 `before.missing.length === 0` 的实际计算；`sourceFilesVerified:true` 继续只描述已收录文件的校验，语义不变。 |
| 终态与历史展示 | `bin/cold-window.ps1`、`bin/cold-window-view.ps1`、`lib/ui-overview.js`、`client.js`：有已知关键缺口显示「归档完成；恢复受阻」并列出缺口码；ZIP 完整性仍单独显示。旧记录无摘要按 `unknown` 处理，不能升级为兼容成功；任何结果都不得宣称「恢复已通过」。成功完整性判据未弱化。 |
| apply 前拒绝必败恢复 | `assets/migration-plan.cjs` 导出共享谓词 `hasUnresolvedCritical`；`canApply` 与 `migration-engine.cjs` 的 `apply` 预检、以及原有 `verify`/`commit` 使用同一政策，在创建 state/workspace 前拒绝。迁移界面显示「关键阻断码」，不再把 blocked 与 critical unknown 统称「依赖冲突」。 |
| 结果持久化失败提示 | `Set-PackerRecordDurability` 供四种终态共用；`ui-result.json` 写盘失败时不再显示「结果已保留」，并把记录持久性与 ZIP 完整性分开表述。 |
| 独立 /4 检查入口 | 复用现有 `assets/migration-cli.cjs inspect`，不新增读取器、不改动旧严格验证器；文档明确 `verify-private.cjs` 仅适用于 /2、/3，检查成功不等于恢复可提交。 |
| 文档与维护说明 | 当前版本/格式/入口说明刷新；列出容量上限；新增最短卸载/清理规程；工具包 `READ-FIRST.txt` 冻结为 v0.6.2 内容。 |

## 2. 明确不改变的事项

Codex 最终验收补充：自相矛盾的“无关键缺口”摘要保守显示为未知；私有任务文件保留 worker 入档必需的已校验偏好值，公开摘要不含值。新增 Packer-only 合成偏好回归，使用真实宿主验证入档、隔离恢复、两轮启动与提交，并执行首页注入脚本验证首次写入和后续用户修改不被覆盖；该脚本执行使用隔离 localStorage 模型，不代表浏览器全功能认证。

- recovery/2、recovery/3 的严格备份门禁、精确运行时/宿主证明、格式布局与恢复语义原样保留。
- 依赖分析器严格性、宿主证明、schema 检查、`verify` / `commit` 的 critical 门禁未放宽；本次仅把同一政策前移到 plan/apply。
- 仍允许在 peer/engine 冲突下归档可完整读取的源树并如实记录冲突；恢复继续重算依赖契约。
- 失败产物、`rollback` 保留现场、不覆盖已有 ZIP、不自动重启或强杀 DSH 等数据保护取舍不变。
- 归档不加密、无签名；恢复会执行可信归档内的插件代码，这一信任边界未改变。
- 不提供对既有 ZIP 补录偏好或修复清单的接口；不修改、不删除旧归档。

## 3. 三项状态必须分别表达

| 维度 | 有关键覆盖缺口的有效归档 | 无已知缺口的有效归档 |
| --- | --- | --- |
| ZIP 完整性 | 已收录条目的结构、CRC、清单与 SHA-256 校验通过 | 同左 |
| 覆盖与恢复兼容性 | 已知关键数据未采集；**受支持完整恢复流程被阻断**；依赖、宿主、schema 仍须独立检查 | 未记录关键覆盖缺口；仍须目标宿主检查，**不等于兼容成功** |
| 恢复后业务可用性 | 未验证，不得由 ZIP 完整性或归档完成推断 | 未验证，须实际启动、业务读取与重启验收 |

## 4. 已发布 v0.6.1 与正式验证 ZIP

- 保留 `v0.6.1` tag、Release、附件与校验值，不在同版本下替换任何文件；不改写历史。
- 脱敏报告记录的正式验证 ZIP（27,693 文件 / 666,186,468 字节 / SHA-256 `58cd317b…`）完整性通过，可作为**数据保全产物**保留；它同时有 `CLIENT_PREFERENCE_NOT_CAPTURED` 关键覆盖缺口与 `dsh-rewind-plugin → @deepseek-ai/schemastery ^3.19.0 / 3.18.5` 的 `PEER_VERSION_MISMATCH` 记录。
- 技术表述：目标计划中仍成立的 peer 冲突会阻止 `apply`；关键覆盖缺口独立阻止完整 `verify`/`commit`。当前工具不支持对原包补录偏好；**源环境仍可用时请用 v0.6.2 另建新备份并验证，保留旧包，不修改原 ZIP**。不能保证换任意目标必然出现相同全部问题，也不能保证重备后依赖冲突自动消失。
- 本轮未读取、未解压、未修改该 ZIP，也未操作正式 DSH、Home、Workspace、Mnemon 或其他插件。

## 5. 容量与运行边界

| 限制 | 值 | 位置 |
| --- | --- | --- |
| 单文件 | 128 MiB | `assets/recovery-core.cjs` `MAX_FILE` |
| 单归档总载荷 | 2 GiB | `MAX_TOTAL` |
| 条目数 | 60,000（含 manifest 与目录保留空间） | `MAX_ENTRIES` |
| 恢复空间预算 | `载荷字节 × 3 + 128 MiB`（预算，不是已发生的残留量） | `assets/migration-plan.cjs` |

超限会明确失败，不做静默裁剪。恢复只写入全新的 Home/Workspace；旧任务目录、暂存 state、请求目录与旧 ZIP 的处置见 [CLEANUP.md](CLEANUP.md)。

## 6. 认证范围与尚未验证

- 已完成：偏好缺字段/合法值/未安装 comfort/非法字段闭环、五类结果层语义、`apply` 写入前门禁、干净载荷完整 `apply → verify → commit`、/4 规范独立检查与损坏归档拒绝、四类终态的持久化失败提示、recovery/2 /3 定向回归、既有 UI/路由/依赖门禁回归。全部为隔离合成环境或只读宿主检查。
- **未认证**：真实 17 插件组合、rc.1 原生 Mnemon 业务恢复、真实私人数据库/凭据业务恢复、跨设备迁移、真实 150% DPI、屏幕阅读器语音、多显示器 DPI、掉电于每条指令、任意 Node 版本对所有载荷的扫描能力。
- **已知环境限制**：`private-acceptance-test.mjs`（及依赖它的 `pack-test.mjs`、`restore-view-test.ps1`）在 Node 22.22.2 下崩溃，基线同样复现；`migration-smoke.cjs` 的完整回滚在有运行中正式 DSH 写入者时被设计门禁阻止。本版不重做这些事务或扩展运行时。
- 独立检查不要求运行中的 DSH 或 Agent，但需要受支持的 Node 运行时；完整恢复仍需要可信、已安装的 DSH Desktop 可执行文件（以 Node 模式运行）。

## 7. 附件与冻结

- `dsh-environment-packer-0.6.2.tgz` — 插件包。
- `Packer-v0.6.2-Standalone-Recovery.zip` — 完整独立恢复工具（含 `Open-Recovery.ps1`、`READ-FIRST.txt`、`TOOLKIT-FILES.sha256`）。
- `SHA256SUMS.txt` / 同名 `.sha256` — 精确校验值；本文件不内嵌自哈希。

构建与验收全部在隔离工作区完成，附件 `package/` 文件与 `v0.6.2` tag 逐字节一致，允许的生成文件另附清单。正式安装、GitHub 发布、DSH Market 更新与最终清理不在构建范围内，由后续阶段负责。

## 历史 README 补充 / Notes retained from the earlier README

以下为对应版本当时的首页记录，迁入发布文档保留事实；其中版本、状态与验收边界按原记录理解。当前入口见 [产品主页](../README.md)。

### 中文

#### 0.6.2 最小可靠性修正（已发布）

- **采集状态与结果闭环**：客户端偏好字段的 `absent / present-valid / invalid` 状态被明确记录；关键覆盖缺口以有界、仅含稳定错误码的摘要从归档结果传到 worker 终态、`ui-result.json`、Packer 任务历史与成功页。字段缺失仍允许保全可读取的数据，但绝不显示为采集成功。
- **「归档完成；恢复受阻」**：存在已知关键缺口时，成功页、任务记录明确显示该结论与缺口码；ZIP 完整性、恢复兼容性、恢复后业务可用性仍然分开表述。没有目标宿主检查时不宣称兼容成功；旧记录缺摘要按未知处理。
- **必败恢复不暂存**：计划与 `apply` 预检都拒绝当前流程无法解除的 critical 问题，在创建 state/workspace 之前结束；`verify/commit` 的纵深防御保留。
- **结果持久化失败可见**：`ui-result.json` 写入失败时，成功/失败/取消/中断四种终态都不再显示「结果已保留」。
- **独立检查入口**：recovery/4 使用 `assets/migration-cli.cjs inspect`；`verify-private.cjs` 仅适用于 recovery/2、/3。检查成功不等于恢复可提交。
- 补齐容量上限、最短卸载/清理规程，以及 recovery/2、/3 与 recovery/4 的入口区分。

**本版不修复旧归档**：v0.6.1 正式验证 ZIP 仍有 `CLIENT_PREFERENCE_NOT_CAPTURED` 关键覆盖缺口与已记录依赖冲突。该包完整性通过，可作为数据保全产物保留，但现有受支持完整恢复流程不能提交；当前工具不支持对原包补录偏好。源环境仍可用时，请用 v0.6.2 另建新备份并验证，不要修改原 ZIP。

### English

#### 0.6.2 minimal reliability fixes (published)

- **Capture state and result closure**: client preference capture is classified as `absent / present-valid / invalid`. A bounded code-only coverage summary travels from the archive result through the worker terminal record, `ui-result.json`, Packer task history and the success page. A missing field still permits data preservation, but is never presented as a successful capture.
- **"Archive complete; recovery blocked"**: with known critical gaps, the assistant and task records show that conclusion and the gap codes. ZIP integrity, recovery compatibility and post-restore usability remain separate. No target check means no compatibility success; old records without a summary stay unknown.
- **No staging for a deterministic dead end**: both `plan` and the `apply` precheck refuse critical issues the current flow cannot resolve, before any state/workspace is created; verify/commit defence in depth remains.
- **Result persistence failures are visible**: when `ui-result.json` cannot be written, all four terminal outcomes stop claiming the result was retained.
- **Canonical /4 inspection**: use `assets/migration-cli.cjs inspect`; `verify-private.cjs` is for recovery/2 and /3 only. A successful inspect does not mean a restore can commit.
- Capacity limits, a minimal uninstall/cleanup procedure and the /2 /3 vs /4 entry distinction are documented.

**This release does not repair old archives.** The v0.6.1 formal verification ZIP still has a `CLIENT_PREFERENCE_NOT_CAPTURED` critical coverage gap and a recorded dependency conflict. Its integrity passed and it remains a valid data-preservation artifact, but the currently supported complete recovery flow cannot commit it. There is no supported way to add the preference back to the original ZIP. If the source environment is still readable, create a new backup with v0.6.2 and validate it; do not modify the original ZIP.
