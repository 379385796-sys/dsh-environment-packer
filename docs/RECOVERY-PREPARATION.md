# 灾难恢复准备清单

请一起保管以下内容，不要只保留 ZIP：

1. **私人备份 ZIP**，以及你另行保存的 SHA-256 校验值。ZIP 未加密，可能包含凭据、会话和私人 Prompt；不要上传排错。哈希能发现内容变化，不能认证备份来源。
2. **与 ZIP 格式兼容的完整可信 Packer 工具包**，包含 `assets`、`bin`、`vendor/semver` 和 `package.json`。包括无控制台启动器、XAML、脚本和原恢复核心。不要只复制一个 EXE 或脚本，也不要运行未经确认可信的 ZIP 载荷程序。
3. **符合该备份要求的 DSH Desktop 安装版本与运行时**。需要匹配 Windows/架构、DSH 精确版本、Node 主版本和 ABI。`recovery/3` 还绑定实际 Desktop EXE、app.asar、解包文件及依赖提供者证明；只有版本号相同仍可能无法恢复。保存可信安装介质，并在安全的隔离环境验证，不自动放宽证明。
4. **ZIP 外的业务资源**：外部工作区文件、外置插件数据/数据库、模型、可执行文件、绝对路径依赖，以及浏览器和系统凭据。清单中的 `externalReferences` 只列出已识别的包安装源，不是所有外部路径的完整清单。

核对覆盖报告中的 `homeEntriesNotCaptured` 和 `exclusions`。未知名称可能包含不可再生数据，不能当作缓存忽略。只备份所选 Profile；Home 只有明示白名单会收录，其他 Profile 须另行备份。当前收集器不重复打包 `node_modules/.pnpm` 虚拟存储，而是实体化实际已装包；恢复不运行包管理器，后续重新安装仍可能需要修正原安装源和 store 路径。

请区分三件事：

| 结果 | 能说明什么 |
| --- | --- |
| 存档完整性通过 | ZIP 结构、清单、范围、CRC 和文件 SHA-256 校验通过 |
| 当前恢复兼容性满足 | 当前运行时、依赖契约及该格式要求的宿主证明通过；执行恢复时还会重新检查 |
| 恢复后可用性已验证 | 只有在全新 Home 实际启动 DSH、核对插件/配置/数据库，并重启验收后才能确认 |

**全部文件哈希正确，不等于全部业务数据均已备份。仅持有 ZIP，也不保证未来在任意 DSH 版本或任意电脑上可以恢复。** 真正跨设备迁移必须另行实测，不能由同机文件验证推断。

恢复只选不存在的全新 Home，父目录必须存在且不能是目录链接。不要选择正式 Home、其子目录或试图覆盖已有目录。源 ZIP、运行时或目标状态在预检后变化会导致重新检查或拒绝恢复。普通错误按原恢复器清理暂存；清理失败、强行结束进程或断电可能留下私人暂存目录，它不代表恢复成功，不能自动合并或直接启动。

操作入口和准确命令见 [RESTORE.md](RESTORE.md)。组件测试与实际窗口、Desktop 启动验收分别记录；本轮同机合成环境的真实恢复与重启通过，不代表跨设备迁移或任意私人业务数据已经验收。

## v0.5.0 toolkit / 恢复工具包

Download the complete tgz and checksum from [GitHub Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.5.0), verify SHA-256, then extract into a separate existing tools folder. Keep the entire `package` directory, including `bin`, `assets` and `vendor`; do not copy the EXE alone. / 下载完整 tgz 与校验文件，校验后解开到独立工具目录，保留整个 package 文件夹。备份 ZIP 不含 DSH 安装程序及未收录的外部资源。
