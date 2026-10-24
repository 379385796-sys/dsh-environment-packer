# DSH Environment Packer 0.4.2 候选

[English](README.en.md) · [兼容范围](docs/COMPATIBILITY.md) · [恢复](docs/RESTORE.md) · [来源与许可](docs/PROVENANCE.md)

面向重装、迁移和灾难恢复的低频本地离线冷备份工具。当前为供审阅的候选，尚未升级正式 0.4.1，也未发布 0.4.2 Release。不是所有 DSH 环境通用的一键无损迁移器。

## 创建完整环境备份（离线）

1. 在设置 → 环境恢复包点击主按钮，使用 Windows Save As 选择已存在的文件夹和新 ZIP 文件名。
2. 保存未完成工作，阅读私人范围及外部写入者警告，确认本次备份。取消不会创建任务。
3. 等待“独立助手已接管”和自动显示的独立进度窗口。交接失败时保持 DSH 运行。
4. **你手动通过菜单或托盘正常退出所有 DSH 实例**。当前 Desktop 没有安全的插件退出接口，不会自动退出或强杀；仅关窗口可能隐藏到托盘。
5. 在助手点击 **“我已正常退出，检查后继续”**。点击不能绕过检测：只有相关进程完全退出且持续静止，才会开始扫描。无法确认或 10 分钟超时就安全停止。
6. 助手锁定载荷文件防止写入/删除，生成 ZIP 并校验条目集合、CRC、清单和全部载荷 SHA-256。阶段、文件数量及活动条持续显示，不虚构百分比。
7. 成功后查看路径、大小、SHA-256 和清理结果，可打开所在文件夹。不会自动重启 DSH。

原生窗口不可用时才显示完整 ZIP 路径输入后备。现有目标拒绝覆盖。重复点击不会创建竞争任务；异常中断遗留的任务锁需先检查现场，不自动抢占。

![合成组件预览，非真实桌面验收截图](assets/cold-backup.png)

## 私人数据与范围

**ZIP 可能包含 API Key、Token、密码、私人 Prompt、会话、记忆和附件。ZIP 没有加密，仅本地保存，不适合公开分享。** 不上传云端；不要将 ZIP、配置或任务私有记录附在 issue。

范围：当前 Profile 全部常规文件和目录，包括插件、依赖和本地 tgz；安装包根链接物化，循环或数据链接安全失败。另包含所选 DSH_HOME 的 storages、sessions、attachments、memory、skills、AGENTS.md、.credentials.yaml/.yml（存在时）。清单记录实际范围、逐文件哈希及排除。

不包含其他 Profile、未声明的 home 项、外部工作区/模型/程序、系统或浏览器凭据、运行时、原 ACL/所有者/ADS。外部数据库和其他写入程序须正常停止；不保证外部状态被迁移。助手会保守等待同一 Desktop 运行时的所有实例、已跟踪后代、引用源 home 的进程及已知数据库进程。文件读锁失败就停止。

Windows 私人 ACL 仅限当前用户/SYSTEM；这不是加密。任务参数、载荷路径请求及临时目录受私有 ACL 保护；普通状态只记录阶段、计数、布尔结果与受控错误码，不存原始配置。已完成任务记录留在 DSH_HOME/.packer-cold（不在备份范围）。

## 专家接口与恢复

普通 GUI 没有运行中完整备份入口，旧 POST /create-full 固定返回 410 HOT_BACKUP_DISABLED。专家安全导出兼容接口 /create 保留，只导出严格类型化的少量计数、布尔和有限数字；**不能恢复环境**，不会导出原始配置、Prompt、插件或 tgz。

离线专家 CLI 保留 bin/backup-private.mjs；须显式指定 --home、--profile、--zip、--dsh-version、--confirm-private、--source-quiescent。它在开始及提交前检测已知写入者，仍要求操作者确实停止外部写入。普通用户无须输入 Node 命令。

恢复使用可信安装包 assets/restore-private.cjs，参数 --zip、--home（不存在的全新目标）、--profile-name、--dsh-version、--confirm-private。没有覆盖/合并选项，不运行安装脚本或联网安装依赖。具体运行时与命令见 [恢复说明](docs/RESTORE.md)。**ZIP 校验通过不等于已证明环境恢复运行**，恢复后必须另做宿主与业务验证。

## 兼容性及限制

- 保留 dsh-private-recovery/2；0.4.0/0.4.1 私人包兼容。0.3.4 旧完整目录包和声明 ZIP 不自动转换。
- 已验证 Windows 11 x64 10.0.26300、DSH Desktop 0.2.1-rc.2、Electron Node 24.21.0 / ABI 149。恢复要求同平台、架构、精确 DSH 版本、Node 主版本及 ABI。
- 单文件 128 MiB、载荷约 2 GiB、文件加目录 59,999 项；超限安全失败。复杂链接布局也可能失败。
- 第二台机器/VM、真实私人数据库业务恢复、网络盘/OneDrive、所有杀软/DPI/外部依赖未验证。哈希不是签名。
- 普通失败/协作取消清理本次临时文件；强制结束、断电或系统崩溃可能留私有临时文件/任务锁，也存在 ZIP 原子提交与成功状态写入之间的短窗口。没有明确成功状态的产物一律视为未确认，先保留检查，不能当作完成备份。不会自动删除历史材料。

## 构建、候选安装与许可

见 [构建测试](docs/BUILD-TEST.md) 和 [升级回滚](docs/UPGRADE-ROLLBACK.md)。只安装核对 SHA-256 后的候选 tgz 到隔离测试 Profile；正式升级和 GitHub Release 需要后续明确授权。保持 private:true，不发布 npm。

维护者可授权的贡献沿用 [MIT](LICENSE)；js-yaml 原作者及 MIT 保留：[第三方声明](THIRD_PARTY_NOTICES.md)。早期来源记录不完整的披露不变；新增助手没有引入 npm/二进制依赖。
