# Cold backup and fresh-home restoration

1. Install the same compatible DSH/runtime first. Completely exit DSH, including tray and Host, before a database-consistent backup.
2. Read the private-data warning. Choose a local existing output directory and a new ZIP name. Confirm private scope and quiescence only when true.
3. Use the CLI commands in README with explicit absolute paths. For the DSH executable, set ELECTRON_RUN_AS_NODE=1 only for that process invocation and pass --expose-internals before the script path. Restore the prior environment afterwards; do not change global environment variables or system PowerShell policy.
4. On the destination, use the trusted package's assets/restore-private.cjs with a nonexistent new DSH_HOME. Existing targets, even empty directories, are refused. The parent must exist. Do not pass the official Profile as a target.
5. The helper validates all entries and hashes before staging, verifies written bytes, and commits a new home. No lifecycle script or package manager runs. A reported verified file count is not a substitute for subsequent business validation.
6. Start DSH with the new DSH_HOME and a separate agents directory; check plugin activation, configuration, databases, models and external paths before deciding on manual migration.

Legacy 0.3.4 full directories and declaration ZIPs are not compatible. Older private ZIPs use dsh-private-recovery/2. Since 0.4.3, archives use recovery/3 when installation peers are required; old readers reject it. Use the complete trusted release package, including assets and vendor/semver. It checks dependency metadata and, for host peers, the exact Desktop executable, archive, unpacked payload and provider bindings before staging and again before commit. A matching displayed DSH version alone is insufficient. See HOST-PEERS.md. Safe-config ZIPs cannot restore an environment.

On ordinary errors/cooperative cancellation, staging is cleaned. Hard process exit or power loss can leave private .*.private-*.tmp or .dsh-restore-* residue. It is not a completed artifact and is not automatically merged or resumed. Verify ownership and active processes before manually cleaning it. No automatic broad deletion is performed.

Treat private ZIPs and copied credentials as secrets. The ACL is not encryption and can change when copied. Do not upload a backup for troubleshooting. Use only trusted backups: hashes do not authenticate their author.

## Independent read-only inspection / 独立只读检查

Use the complete trusted Packer package. This entry does not create a recovery directory, extract files, run install hooks or load Profile/plugin code:

```text
node <完整工具包>/assets/verify-private.cjs --zip <私人备份.zip>
```

It always reports archive integrity separately from current recovery compatibility and post-restore usability. Without a corroborated runtime, a valid archive can still report `canRestore: false`; exit code 1 means that restoration is not currently cleared, not necessarily that the ZIP is corrupt. The report includes coverage, omitted Home entries, exclusions and identified external installation sources. It never prints payload text or credential contents.

To check against the installed Desktop runtime without starting Desktop, set `ELECTRON_RUN_AS_NODE=1` only in that command's environment and execute:

```text
<可信 DSH Desktop.exe> --expose-internals <完整工具包>/assets/verify-private.cjs --zip <私人备份.zip>
```

The Desktop version is read from the selected installation, not guessed from the ZIP. The existing expert `--dsh-version` option is supported by the verifier for explicit runtime checks; it does not bypass actual `recovery/3` host proof. Restore prior process environment afterwards. Configure TEMP/TMP, NODE_COMPILE_CACHE and PowerShell analysis cache to an appropriate task location; do not alter global environment settings for this purpose.

## Independent Windows assistant / 独立 Windows 恢复助手

From the complete trusted package, double-click **bin/restore-assistant.exe**. It opens only the WPF assistant, without a PowerShell console, and hosts the existing controller using installed Windows assemblies. Keep the EXE, XAML, scripts and core together. The advanced script entry remains:

```text
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File <完整工具包>/bin/restore-assistant.ps1
```

The WPF interface opens independently of DSH. Choose a trusted ZIP and run read-only inspection. A standalone Node installation can check archive bytes; to clear recovery compatibility and execute the assistant's restore, select an already installed, trusted DSH Desktop executable. The helper runs it in Node mode, without opening DSH, installing or downloading anything. Missing/incompatible runtime or inadequate host proof blocks restoration.

Choose an existing parent directory and a new, nonexistent Home name, review the coverage report, and explicitly confirm the private recovery. The assistant passes the inspected ZIP SHA-256 to the original restorer. Execution reopens the ZIP and repeats manifest, path, hash, dependency and runtime/host checks before staging; it does not trust a cached UI approval. The archive identity is checked again before commit. Editing the ZIP or runtime field invalidates the UI result. Existing directories, directory links and the current known official Home/subdirectories are refused. No Profile contents or lifecycle scripts are executed.

The helper waits for safe completion; it does not kill an active writer when its close button is pressed. Completion means files were restored and verified, **not** that DSH or its business data is usable. Start the new Home manually with an independent agents directory, validate the environment and restart it before any manual migration. Do not restore into or merge with the formal Home.

Supported readers remain `dsh-private-recovery/2` and `/3`. There is no format or Home whitelist change in this work. Format 2 retains its original runtime/dependency checks and does not acquire a fabricated format-3 proof. ZIP64, compressed or otherwise unsupported ZIP layouts remain refused under the existing reader limits. The original `assets/restore-private.cjs` CLI stays available with the same arguments and safety gates.

See the [恢复准备清单](RECOVERY-PREPARATION.md): a ZIP alone cannot guarantee future or cross-device recovery.

For 0.4.2 desktop backups use the native workflow in README, including manual exit and assistant confirmation. The expert offline backup CLI remains available; ordinary users need no Node command to create a backup.

The launcher uses the Windows .NET Framework WPF assemblies already present in the tested Windows environment; no Electron/WebView runtime is bundled. Keep `bin/restore-window.xaml`, both restore PowerShell files and the original Node core together. The process-local PowerShell execution option above does not change global policy or any archive/host validation.

In the assistant, **environment backup** means the ZIP previously created by Packer, not a DSH installer. **DSH program used for recovery** means the trusted installed `DeepSeek Harness.exe`, not a file extracted from the backup. Selecting it performs background Node/host checks without opening DSH. It is optional for archive-only inspection, but required and must satisfy the recorded proof before recovery. The ZIP contains neither the DSH installer nor external models/workspaces.

## v0.5.0 toolkit / 恢复工具包

Download the complete tgz and checksum from [GitHub Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.5.0), verify SHA-256, then extract into a separate existing tools folder. Keep the entire `package` directory, including `bin`, `assets` and `vendor`; do not copy the EXE alone. / 下载完整 tgz 与校验文件，校验后解开到独立工具目录，保留整个 package 文件夹。备份 ZIP 不含 DSH 安装程序及未收录的外部资源。
