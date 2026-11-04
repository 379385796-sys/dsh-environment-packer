# Packer v0.6.0 — Phase 3 最小兼容性验收与发布候选

日期：2026-11-05（Australia/Sydney）。基线：37ba267efb88c5f655a899b9698632a07aae66ec；分支：phase2/v0.6.0。

**结论：附条件通过，发布候选已准备，尚未发布。** 通过范围为实际 Windows x64 rc.5→rc.1、可信纯 JS 合成插件和数据的受控迁移。设置页 DOM 自动检查未完成，原生 Mnemon/真实 17 插件组合未认证；不将这些项目标为通过。是否接受这一候选范围并进入发布，由用户确认。本轮未安装或修改正式 Packer，未升级宿主、推送 GitHub 或发布 Release。

## 实际宿主与边界

- 源宿主沿用已校验 rc.5 副本：phase3-isolated/source-installation，版本 0.2.1-rc.5；没有重新部署 rc.5。
- 目标使用用户自行升级后的 `D:\DeepSeek Harness`，只读加载其实际源码并以 Node 模式运行可信测试；版本确认 0.2.2-rc.1。未准备或安装另一份新版宿主。
- Node 24.21.0、ABI 149、Electron 44.7.0 未变；实际 Cordis 从 4.0.5 变为 4.1.0。Session 仍为 v4，Workspace unit 仍为 v2，projectKey/zstd 能力存在。版本相同/ABI 相同仅是事实，不自动认证插件兼容。
- 全部恢复目标、Profile、Home、Workspace、agents、userData、缓存和包管理 store 均在独立 `phase3-rc1` 目录。启动环境显式指定，没有加载正式 Profile、私人快照或真实第三方插件。没有更改系统全局环境变量、正式 C 盘 store 或无关配置。
- 验证子进程保留写入、网络及子进程限制，输入只含本项目与可审查合成 JS 插件。此限制不是恶意 native/plugin 的 OS 沙箱；本轮不试跑无法约束的真实原生插件，不要求 VM 或重建 17 插件环境。

## 实证问题与最小修复

| 问题 | 修改与证据 |
|---|---|
| rc.1 的 collectIndexInjections 需要请求上下文，原无参调用读取 principal 报错 | 从真实、认证后的 HTTP 首页检查带计划 ID 的偏好脚本，不再调用该内部 API；rc.1 正向、缺失脚本负向及 rc.5 回归通过 |
| 原 Session 适配器把头和事件合成一个 zstd 帧，目标 owner 拒绝读取 | 分离头帧和事件帧，保留非路径正文，实际会话 owner 验证通过 |
| Desktop Node 24 一次 zstd 解压只消费首帧，原适配器可能遗漏后续事件 | 按 engine.bytesWritten 消费所有帧，限制总解压长度；后续损坏帧拒绝。测试在真实 Node 24 执行，未以本机 Node 26 的不同行为替代 |
| 启动成功未证明恢复后的每个会话实际可读 | 计划记录 sessionId，提交前使用目标 sessionPersistence.open/read/close 读取所有声明会话；无效事件不能提交，失败后安全回滚 |
| 数据扫描仅识别 .db，旧合成 ZIP 的 .sqlite 未进入关键数据库判断 | 补齐 .sqlite/.sqlite3（含大小写），未知 owner/schema 保持 critical；不伪造 Mnemon 证明、不跳过依赖或版本要求 |
| 验证失败后已关闭的 IPC 通道可能产生次级未捕获异常 | 最外层失败上报提供回调，原始失败仍保留；无效会话负向检查无 ERR_IPC_CHANNEL_CLOSED 噪声 |

只修改 migration-data、migration-plan、migration-runtime、migration-engine 的上述位置及相关测试/文档；不重写归档、事务或旧严格恢复模块。新增的 sessionId 属于内部绑定计划，归档仍为 recovery/4 schema 1。旧计划因工具哈希变化需要重新检查，不修改旧计划校验值。早期失败测试目标使用其逐文件哈希匹配的原绑定工具回退，激活入口已禁用，诊断数据保留。

此前 Phase 2 的归档/启动通过记录不能追认为本轮的实际会话 owner 验收。本轮同时纠正了合成夹具首事件序号应为 0 的错误，没有通过放宽宿主校验使错误夹具通过。

## 定向测试与联合验收

本轮证据根目录：`D:\OpenAI Codex 工作区\dsh-environment-packer-v060-phase2\phase3-rc1`。

| 证据 | 结果与范围 |
|---|---|
| evidence/host-static.json | 实际新旧安装元数据、API 导出、schema 源码与 Cordis 差异；无版本字符串伪造 |
| evidence/session-framing-result.json | PASS，真实 Node 24 上 7 项：多帧不丢事件、头独立帧、正文保留、cwd 映射、仅头帧、plain JSONL、损坏后续帧拒绝 |
| evidence/sqlite-extension-result.json | PASS，6 项：未知数据库 critical、Mnemon 仍需 owner 验证、依赖目录范围不变 |
| evidence/migration-contracts-result.json | PASS，32 项受影响契约：版本差异、依赖/native/schema、路径、旧格式读取及严格通道门禁等；仅复用既有旧 ZIP 输入，未重跑旧全套冒烟 |
| integration-5/result.json | PASS，9 组：真实 rc.5 生成→rc.1 inspect/plan/apply/verify/commit；两次启动/正常关闭后提交；第三次读取配置、外部记忆、会话头/cwd 事件、Workspace/sessionIds、Skills 与持久化；损坏/缺项拒绝；回滚禁用启动器 |
| runtime-gates/result.json | PASS，3 组：rc.5 实际加载及 HTTP/Session owner 回归；缺失偏好脚本拒绝；无效事件提交阻断、回滚与失败资源收尾 |
| evidence/candidate-smoke.json | PASS：最终候选在全新 rc.1 Profile/store 官方 CLI 离线、ignore-scripts 安装；136 文件与暂存包逐一一致，2 个链接均在测试根；已安装 SQLite 门禁和 Packer 0.6.0 设置后端通过，正常退出 0 |
| 独立工具 ZIP | 136 个 package 文件哈希逐一核对通过；管理启动器从未改动的 C# 源码在暂存目录重编译，不修改仓库 EXE |
| evidence/settings-browser-limit.json | NOT_COMPLETED：独立 Edge 在 Windows PathService/用户目录初始化时超时，未进入设置页。未换用正式资料目录、修改系统设置或扩大权限；不将后端接口通过当作 DOM 通过 |

strict recovery/2、recovery/3 的精确运行时拒绝及 format3 缺少宿主证明的拒绝已做函数级定向检查；旧 recovery/3 实际归档独立读取仍通过。recovery-core、verify-private、restore-private、dependency-contract、host-proof、原冷备控制器与任务核心相对基线无代码差异，未放宽严格恢复语义。

## ZIP 结果：区分完整性、提交与可用性

1. **原有 rc.5 合成 ZIP 保持不变**：phase3-isolated/backups/Packer-0.6.0-rc5-isolated-synthetic.zip，1897925 字节，SHA256 `7a300702c6035ba5adee7fa1cbc4abe7cc07fe4946b4b47acc2843adeefa8fe4`。归档校验通过；本轮补识别出未知 .sqlite，允许检查/诊断暂存，但 verify/commit 正确拒绝，并完成回滚。这不是完整恢复成功。
2. **正向迁移合成 ZIP**：phase3-rc1/integration-5/rc5-to-rc1.zip，897776 字节、132 文件，recovery/4，SHA256 `a7fa351a779a7104417060b3cb1bb14052063b32ec12d44773f21c880e49aa95`。由已有 rc.5 实际运行时生成，包含 Packer 和纯 JS 合成插件、有效分帧/序号的 Session、多个 cwd、Workspace v2、Skills、外部记忆与模拟偏好，不递归收录测试工程。
3. 正向 ZIP 完成真实 rc.1 提交，回执表明两轮正常关闭；第三轮目标宿主实际读取会话事件、配置和记忆，状态计数持久化。随后按验收要求主动 rollback，启动入口禁用、数据保留。回执是当次验证证据，不用于跳过未来重新检查。
4. 未运行原生 Mnemon，因此不宣称 SQLite/Mnemon 数据在 rc.1 已得到 owner 认证。SQLite 字节/哈希保留、未知 schema 拦截已验证。真实 17 插件、其他 native ABI 组合、任意用户会话全集和未测宿主不认证；不据此无限扩大本阶段。

## 发布候选产物

目录：`D:\OpenAI Codex 工作区\dsh-environment-packer-v060-phase2\phase3-rc1\candidate\artifacts`。

| 文件 | 字节 | SHA256 |
|---|---:|---|
| dsh-environment-packer-0.6.0.tgz | 246967 | `f58ef601759baeb2a137c716ae9701d05e19e38249f30a88db32faa36cf05edc` |
| Packer-v0.6.0-Standalone-Recovery-Candidate.zip | 311526 | `597f754207b78c83abfe3852a3df1cce79a26190208f6ce5c36afb8dec4e2c14` |

同目录保存各自 `.sha256`。TGZ 与工具 ZIP 的 package 内容相同，不含私人快照、会话正文、凭据、测试环境、用户工程或 DSH 安装程序。新候选包含本轮实证修复；此前 SHA 为 27440af3… 的 0.6.0 候选只作历史材料保留，不再作为最终恢复候选。

独立工具解压到 D 盘后保留完整目录，入口为 Open-Recovery.ps1（进程内重定向 TEMP/缓存）或 package/bin/restore-assistant.exe；不单独拷贝 EXE。文档与变更记录已更新，旧 v0.5.0 下载说明仍明确标为已发布基线。未安装此最终候选到正式环境。

## 正式环境保护与剩余限制

运行前后 8 项内容哈希一致：5 份正式 Profile 配置/包管理元数据、正式 EXE 和 app.asar、原冷态快照清单。原 rc.5 合成 ZIP 哈希也一致。记录在 evidence/protected-before.json、protected-after.json；所有包管理命令使用新 D 盘 Profile/store，并核实生成的链接在各自根内。

该核验不是整个工作区、userData 或 C 盘 store 的全量内容审计，也不是 OS 级无写入证明。没有给正式目录下发测试写入、覆盖、恢复或安装命令；没有加载真实私人快照。原快照、rc.5 副本、v0.5.0 回退材料和全部失败证据保留。

待确认项：rc.1 设置页 DOM 未完成；原生 Mnemon/真实插件组合未认证；真实 150% DPI 沿用用户接受的 Phase 2.5 未验证限制。本轮后端与受控迁移验收通过，不宣布这些未测组合完整可用，也不自动进入正式安装或发布。

代码、测试与结果报告作本地提交；最终 SHA 见交付消息及工作区外同名报告附记，避免自引用。证据摘要随代码保存于 evidence/phase3-rc1.json。到此停止，等待用户确认。
