# v0.6.1 — 正式发布：recovery/4 依赖门禁与独立助手 UI 改进

基线：v0.6.0。本轮只处理四项实际问题及发布前 UI 收尾，不扩展 Packer 的系统复杂度。

## 正式环境验证

- 正式 DSH Desktop：`0.2.2-rc.1`；Packer 已从 `0.6.0` 更新至 `0.6.1`，Profile 为 `C:\Users\37938\.dsh\profiles\desktop`。
- 通过桌面 CLI 正常离线安装；DSH 由用户正常退出/启动，未强制结束进程。插件页显示“环境恢复包”已启用，`GET /plugins/dsh-environment-packer/defaults` 返回 `version:0.6.1`。
- 正式冷备任务 `d247bd15e1cf9e912aa5c00e6a3b4ed5` 成功：27,693 个文件、666,186,468 字节，SHA-256 `58cd317bd85a6b389094adfcd85550fa518ad0a193e70fe06acef71bbc17372e`，`verified:true`、`cleanup:true`、worker 退出码 0。
- 归档为 `dsh-private-recovery/4`，记录已知冲突：`dsh-rewind-plugin` 要求 `@deepseek-ai/schemastery ^3.19.0`，实际 `3.18.5`；`manifest.compatibility.dependencyIssues` 与 `dependency-check.json` 均保留该冲突。
- 同一归档记录一项关键覆盖缺口 `CLIENT_PREFERENCE_NOT_CAPTURED`。ZIP 文件与载荷完整性通过，但恢复计划会因该关键项阻断；未执行恢复覆盖，也未修改其他插件依赖。

## 修复

1. **recovery/4 备份依赖门禁**：允许归档“依赖版本/peer 冲突但源文件可完整读取并校验”的环境。真实冲突写入 `manifest.compatibility.dependencyIssues` 和 `dependency-check.json`，不虚报兼容性；损坏的包元数据或不可读源文件仍在写入前失败。恢复计划继续重新检查依赖、宿主和数据 schema，未解决的关键问题仍阻止 apply/commit。recovery/2、recovery/3 的严格语义不变。
2. **浅色主题**：主按钮改为 Fluent 蓝色（白字），深色主题保留浅蓝主按钮（深字）；统一次级按钮表面/边框、圆角、悬停、按下、禁用和焦点环。
3. **独立助手布局**：五步流程、运行状态卡、保存位置卡、终态结果卡分区；`任务详情` 与 `外观` 收进顶部次级操作组；长路径单行显示并提供复制；窗口更紧凑。
4. **完成反馈**：终态页面不再自动关闭。成功页要求目标 ZIP 存在且大小与已验证终态一致，显示路径、大小、SHA-256、完整性结果和完成时间；失败、取消、中断分别显示并持久写入 `ui-result.json`。Packer 任务记录同时读取终态记录，重新打开后可查看最近结果。

## 发布前 UI 定向收尾

- 深色主题显式设置页眉操作、复制按钮、日志文本、禁用态和焦点态前景色；路径文本框获得焦点时显示蓝色边框。Windows 支持时同步 DWM 标题栏/边框颜色。
- 窗口高度按当前内容自动收紧：等待页不再保留路径卡下方的大面积空白，失败页同样紧凑；成功页仅在结果卡出现时增高。卡片间距、卡片内上下留白、文字块间距和底部按钮区留白适度增加，保留紧凑感。
- 成功页把“ZIP 完整性通过”与“恢复兼容性待检查”分开显示。依赖冲突使用独立琥珀色提示条，不改变备份成功判定或恢复门禁。
- 仅做受影响 UI 的定向测试；真实 150% DPI 未实机验收，只做了 15.75pt/560px 模拟，结果标记 `real150DPITested=false`。

## 验证范围

- 合成 rewind/schemastery peer 冲突：recovery/4 归档成功并记录冲突；恢复兼容性分析仍为 blocked；recovery/2/3 备份仍在写盘前拒绝。
- 浅色/深色主按钮与文本对比度、布局、DPI 模拟、成功/失败/取消/中断结果与持久记录查询。
- 旧 strict-restore 回归：迁移冒烟与 recovery/2/3 定向检查。
- 正式环境：v0.6.1 安装、插件加载、入口与版本确认；已知依赖冲突下 recovery/4 冷备成功并记录冲突。

**未认证**：真实 150% DPI 人工视觉验收、真实 17 插件完整组合、rc.1 原生 Mnemon 业务恢复、跨设备迁移、完整恢复业务可用。正式冷备记录了一项关键覆盖缺口 `CLIENT_PREFERENCE_NOT_CAPTURED`，恢复计划应阻断；文件完整性通过不等于恢复业务通过。

私人 ZIP 未加密；不打包 DSH 安装程序或工程源码。只使用可信归档。

## 附件

- `dsh-environment-packer-0.6.1.tgz` — 插件包。
- `Packer-v0.6.1-Standalone-Recovery.zip` — 完整独立恢复工具。
- `SHA256SUMS.txt` / 同名 `.sha256` — 精确校验值；本文件不内嵌自哈希。

v0.6.1 已安装到正式环境、提交 GitHub 并更新 DSH Market 条目；Market 审核状态以实际 PR 为准。
