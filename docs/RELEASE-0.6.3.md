# v0.6.3 — 覆盖分类与恢复诊断

日期：2026-11-07（Australia/Sydney）。基线：v0.6.2 正式 tag `e4acfd6a8d14cb2efe7c4741c8d668ed305f1c6f`。

> v0.6.3 发布说明。正式安装、冷备和远端附件校验的证据见独立 Codex 最终验收报告；Market 合并状态独立披露。

## 1. 本版范围

v0.6.2 正式冷备暴露三个剩余问题：`plugins-local` 未分类、`.dshw-usage.json.before-recharge-fix.bak` 未分类、`dsh-rewind-plugin → @deepseek-ai/schemastery` peer 冲突的记录与恢复门禁准确性。本版以**数据保全、恢复正确性和真实问题修复**为目标，不以清零告警数量为目标。

不改变 recovery/2、/3 的严格语义；不改变 `dsh-private-recovery/4` 格式版本；不放宽 /4 的 `verify`/`commit` 门禁；不修改第三方插件或生产依赖；不新增服务、自动清理工具或无关 UI 功能。

## 2. 调查结论

### 2.1 `plugins-local`

- **已确认**：目录位于 `~/.dsh/plugins-local`，含两个本地包：`dsh-prompt-inject`（0.1.0，带本地兼容性修改）与 `dsh-whale-musume`（2.3.0，`private: true`）。
- **已确认**：当前 Profile `package.json` 将 `dsh-prompt-inject` 声明为 `file:...tgz`（0.1.5），未使用 `link:`/`file:` 指向 `plugins-local`；`dsh-whale-musume` 不在依赖或 `dsh.profile.bundles` 中。
- **已确认**：`cordis.patch.yml`、`cordis.yml`、已安装插件源码与 DSH 应用资源均无 `plugins-local` 引用；唯一匹配来自 Packer 自身。它不在 DSH 运行时路径约定内。
- **合理推断**：它是早期本地插件开发/兼容性改造的暂存源码区，当前环境启动不依赖它。
- **无法确认**：这些源码是否另有上游或 Git 历史副本。目录内无 `.git`；`dsh-prompt-inject` 的说明明确标注“本地兼容性适配版（非上游发布）”。因此不能断言可从 registry 重建。
- **决定**：作为**惰性源码数据**采集，而不是环境依赖。`node_modules` 是安装产物，且可能含链接/原生载荷、污染恢复计划的包解析，明确排除。

### 2.2 `.dshw-usage.json.before-recharge-fix.bak`

- **已确认**：178 字节 JSON，结构为 `date/lastBalance/todayUsage/history/events`；mtime 2026-10-16 21:54，早于 live `.dshw-usage.json` 的 2026-10-18 12:04（9,224 字节）。
- **已确认**：所有已安装插件、`plugins-local` 源码与 DSH 应用资源均无对该 `.bak` 文件名的读取；唯一匹配仍是 Packer 的 Home 白名单中的 live 文件名。
- **已确认**：live `.dshw-usage.json` 属于既有 Home 白名单并已采集；`.bak` 是修复充值逻辑前的手工快照。
- **合理推断**：其所属鲸鱼插件当前未安装，`.dshw-*` 是遗留缓存；该 `.bak` 不参与任何恢复语义。
- **历史快照保全**：已知 `.dshw-{usage,size,turn}.json.<qualifier>.bak` 采集到 `packages/home-history/`，清单记录 `historicalData` 与 `activation: archive-only`；不依赖 live 文件存在。恢复只保留在事务目录，不写入运行时 Home，不覆盖当前缓存。不可读、链接及异常类型保留 critical 缺口，未知 Home 项仍保守告警。

### 2.3 `dsh-rewind-plugin` peer 冲突

- **已确认**：正式归档记录为 `PEER_VERSION_MISMATCH`，`package=dsh-rewind-plugin`、`name=@deepseek-ai/schemastery`、`range=^3.19.0`、`actual=3.18.5`、`state=recorded`。
- **已确认**：Profile 使用 hoisted linker，`autoInstallPeers:false`；顶层 `@deepseek-ai/schemastery` 实装 3.18.5，正是该包解析到的副本。该 peer 在插件中声明为 optional，但已安装且版本不满足范围，属于真实冲突。
- **已确认**：归档与计划中不存在 `@//deepseek-ai/schemastery` 形式的名字；包名、范围、实际版本均准确。
- **决定**：不修改插件、依赖或 peer 声明；归档继续记录并保全可读数据，恢复计划继续以 `blocked/critical` 阻断 `apply`/`commit`。optional 只影响“缺失是否允许”，不影响“已安装但不满足范围”的真实冲突判定；恢复侧无法证明运行时不会加载它。

## 3. 代码改动

- `assets/migration-archive.cjs`
  - 新增 `LOCAL_SOURCE_HOME`、`LOCAL_SOURCE_EXCLUDED`、`CACHE_BACKUP` 与 `addSourceTree()`。
- **历史快照保全**：已知 `.dshw-{usage,size,turn}.json.<qualifier>.bak` 采集到 `packages/home-history/`，清单记录 `historicalData` 与 `activation: archive-only`；不依赖 live 文件存在。恢复只保留在事务目录，不写入运行时 Home，不覆盖当前缓存。不可读、链接及异常类型保留 critical 缺口，未知 Home 项仍保守告警。
  - `inventory()` 采集 `plugins-local` 源码，排除任意层级 `node_modules`；失败（链接、类型、容量、路径）不阻断整个归档，转为 `LOCAL_SOURCE_TREE_INCOMPLETE` 关键缺口，并把对应分类标记为需复核。
  - 清单新增可选 `sourceTrees`：名称、归档前缀、恢复相对路径、文件数、字节数、排除项、`complete`。
  - `validate()` 校验 `sourceTrees` 形状，并要求其文件数/字节数与清单文件逐项吻合；旧归档无该字段仍通过。
- `assets/migration-plan.cjs`
  - `scanData()` 跳过源码树路径，避免把其中 `.db`/`.json`/`.md` 误判为数据库、存储或 Skills。
  - 计划新增 `sourceTrees`，给出 `to=<新Home>/plugins-local`、`activation=data-only`；`validatePlan()` 校验目标必须位于新 Home 且等于 Home 下的同名相对路径。
- `assets/migration-engine.cjs`
  - 新增 `sourceTreeDigest()`；`apply` 暂存后把文件/字节/摘要写入 transaction，`verify` 重新计算并在不一致时以 `SOURCE_TREE_CHANGED` 拒绝；`verification.json` 记录源码树回执。
- 版本与文档：`0.6.3`；README 中英文、CHANGELOG、MIGRATION、COMPATIBILITY、RESTORE、BUILD-TEST 与升级说明补充本版边界。

## 4. 定向验证

全部在 `DSH_PACKER_TEST_ROOT` 隔离合成目录执行，未读取真实私人载荷、Mnemon、凭据或会话正文。

| 项目 | 结果 |
|---|---|
| `test/v063-source-coverage.cjs` | PASS 22 项：源码树采集/排除 `node_modules`、显式分类、未知项保守告警、`.bak` 有无 live 的两种语义、clean 覆盖、确定性映射、暂存摘要、变更/缺失拒绝、清单计数与排除段篡改拒绝、源码树内预编译 `.node` 不触发原生门禁、旧归档兼容、`apply` 实际暂存与 `verify` 源码树门禁 |
| `test/migration-dependency-gate.cjs` | PASS：/4 记录真实 peer 冲突且包名精确无 `@//`；恢复重分析仍 blocked/critical；/2 /3 严格备份门禁不变；结构错误仍在写盘前失败 |
| `test/v062-coverage-chain.cjs` | PASS 15 项：偏好采集状态、有界摘要、清单自洽、结果层语义、规范 inspect 与损坏拒绝（回归） |
| `test/v062-apply-gate.cjs` | PASS 6 项：critical unknown 在创建 state/workspace 前拒绝，干净计划仍可 apply（回归） |
| `git diff --check` / `node --check` | PASS：无空白错误，改动脚本语法有效 |

定向回归使用合成数据；新增 `v063-clean-path.cjs` 在真实可信 DSH Node 下执行 inspect → plan → apply → verify（两轮隔离启动与正常关闭）→ commit。源码入口设置为加载即报错，验证其保持惰性；历史快照位于事务目录且不写回 Home。未重跑整库。

## 5. 兼容性与剩余风险

- 旧 `dsh-private-recovery/4` 归档无 `sourceTrees`，新读取器继续接受；v0.6.2 读取器忽略未知字段，但可能把源码树中的 `.db` 保守判为未知数据库并阻断恢复。当前 `plugins-local` 不含 `.db`/`.jsonl`。
- `plugins-local` 采集会把归档增大约 13 MB；仍受 128 MiB/文件、2 GiB/总载荷、60,000 条目限制。单树自身的条目上限、链接或不可读类型会转为 `LOCAL_SOURCE_TREE_INCOMPLETE` 关键缺口；合并后触发全归档上限仍按既有规则明确失败，不静默裁剪。
- 源码树恢复为惰性数据，**不会**重新安装、链接或激活其中的插件；本地兼容性修改仍需人工决定是否重新打包/安装。
- peer 冲突仍会阻断完整恢复；本版不提供依赖修复、版本覆盖或强制提交。
- 真实 17 插件组合、原生 Mnemon 业务恢复、私人数据库/凭据、跨设备、真实 150% DPI、屏幕阅读器仍未认证。

## 6. 附件

- `dsh-environment-packer-0.6.3.tgz` — 插件包。
- `Packer-v0.6.3-Standalone-Recovery.zip` — 完整独立恢复工具（含 `Open-Recovery.ps1`、`READ-FIRST.txt`、`TOOLKIT-FILES.sha256`）。
- `SHA256SUMS.txt` / 同名 `.sha256` — 精确校验值；本文件不内嵌自哈希。

最终产物与 tag 逐字节核对，保留候选与旧版附件。不执行生产恢复；已知 peer 冲突不降级。

Codex 最终修正：sourceTrees 只允许 plugins-local，强制 node_modules 排除（大小写不敏感），拒绝运行时目录伪装为源码树；verify 两轮启动后再次核对惰性源码摘要。
