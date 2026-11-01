# Compatibility and acceptance boundary

## 当前 0.4.3 / Current 0.4.3

[v0.4.3 Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.4.3) records Windows x64 DSH Desktop **0.2.1-rc.5** cold-backup and recovery/3 compatibility. Source commit: `3ef197124167757c7f1d5e4f23a5fba1e5fd7bfe`; frozen validation commit: `8a8882e64681c4606d566fefde228064e3637f40`. These are distinct recorded snapshots, not a new test claim.

当前为已发布 0.4.3。基本恢复契约要求平台、架构、精确 DSH 版本、Node 主版本与 ABI 一致；宿主 peer 证明还固定完整宿主字节及更严格运行时条件，详见 [HOST-PEERS](HOST-PEERS.md)。不含宿主 peer 时保持 recovery/2，需要时为 recovery/3，旧恢复器拒绝新格式。源码 package.json 未声明通用 engines.dsh 范围，不能从此推断所有版本兼容。

The base restore contract requires matching platform, architecture, exact DSH version, Node major and ABI. Host-peer archives pin full installation bytes and stricter runtime requirements. No general engines.dsh range is declared in package.json; that does not imply universal compatibility.

本轮只修正文档，不重新运行备份/恢复或 Desktop 验收。跨机器、真实私人数据库及任意依赖图仍不作通用保证；ZIP 完整性不等于恢复业务可用。

This documentation-only revision does not rerun backup, restore, or Desktop acceptance. Cross-machine recovery, real private database operation, and arbitrary dependency graphs remain outside a universal guarantee.

## 历史基线 / Historical baseline


Historical 0.4.2 validated base: Windows 11 Pro x64 10.0.26300, DSH Desktop 0.2.1-rc.2, its Electron Node 24.21.0 / ABI 149, Windows PowerShell 5.1 / STA WinForms. Matching platform, architecture, exact DSH version, Node major and ABI are required for restoration. The package bundles no runtime and changes no execution policy globally.

Current Desktop has no exposed safe plugin quit API. The plugin deliberately uses manual normal menu/tray exit plus a separate assistant confirmation and mandatory process detection. There is no force-start or forced-termination fallback. Other Desktop instances and known databases may conservatively block a task even when unrelated. Unknown writer handles fail the source read lease; external transaction state outside scope is not claimed.

The 0.4.2 development acceptance includes human-operated actual Desktop Save As/confirmation/manual exit, an independent assistant-generated synthetic ZIP, exact hashes and a fresh-home restore followed by three synthetic plugins plus shared dependency startup/restart. Manual exit confirmation and process inspection are independent gates; a premature click cannot bypass live writers. Acceptance records distinguish desktop tests from component tests. Headless component previews are not actual desktop E2E tests.

The historical 0.4.2 format is dsh-private-recovery/2; current 0.4.3 host-peer archives use recovery/3 (see current scope above). 0.4.0 and 0.4.1 archives remain supported, including accurate callback/no-callback restore counters. 0.3.4 legacy directories/declaration archives remain incompatible.

Not validated: another physical machine/VM, real private database business restoration, arbitrary plugin dependency graphs, all DSH/Node releases, network/OneDrive targets, every antivirus/ACL/DPI/multi-monitor configuration, power loss at every instruction or every external executable/model/credential. GUI Profiles must be under DSH_HOME/profiles/<name>. Limits and excluded filesystem metadata remain as documented in README.
