# Compatibility and acceptance boundary

> **Current release: v0.6.2.** The current cold-backup format is `dsh-private-recovery/4`. Sections below labelled with a version/date are **historical acceptance records** for that release and are retained for provenance; they are not the current feature statement. Current behaviour, entry points and limits: [README.md](../README.md), [MIGRATION.md](MIGRATION.md), [RESTORE.md](RESTORE.md), [RELEASE-0.6.2.md](RELEASE-0.6.2.md).
>
> v0.6.2 does not extend the certified matrix: real 17-plugin combinations, native Mnemon business recovery on rc.1, real private database/credential recovery, cross-device migration, real 150% DPI and screen-reader speech remain uncertified. Known critical coverage gaps now surface as "归档完成；恢复受阻" and block the supported complete recovery flow. The strict recovery/2 and /3 channel keeps its exact runtime and host-proof rules.
>
> **Archive limits**: 128 MiB per file, 2 GiB total payload, 60,000 entries (including manifest/directory headroom); recovery free-space budget `payloadBytes × 3 + 128 MiB`. See [BUILD-TEST.md](BUILD-TEST.md) and [CLEANUP.md](CLEANUP.md).

## Historical 0.5.0 acceptance — 2026-11-02

Target: Windows 11 x64 / DSH Desktop 0.2.1-rc.5, Electron Node 24.21.0 / ABI 149; Windows .NET Framework WPF and the installed PowerShell engine. The small x64 managed GUI host runs as the current user, opens no console and changes no user/machine execution policy. No runtime or Windows DLL is bundled.

The real Desktop settings cold workflow produced a 2307-file recovery/3 ZIP after fixing a reproduced PowerShell 5.1 long-path read-lease issue. The fix preserves the same FileShare.Read lock and existing path checks. Independent byte/CRC/SHA and exact host-proof inspection passed without extraction. The original synthetic Home was made unavailable; the real independent WPF window restored a new Home, whose every payload byte matched before startup. Actual Desktop startup, four-plugin behavior and a normal shutdown/restart were verified, including the original synthetic conversation messages and Prompt Inject templates/global/workspace rules. The user confirmed both native Desktop displays.

The single joint business workflow used the 0.4.3 development snapshot with Prompt Inject 0.1.2-rc.5, Chat Comfort 1.0.3 and AI Exporter 0.1.3. Final 0.5.0 packaging adds the accepted console-free GUI entry, final wording/presentation and version records; eight verifier/recovery-core files are unchanged from the start of round 2. Final targeted tests additionally include byte-for-byte backup/restore of the complete current launcher/XAML/controller toolkit. No broad joint rerun is implied.

WPF component layouts/rasterization cover 1020x860 / 720x600 and 96/144/192 DPI. Actual window screenshots and manual resize/maximize/keyboard/error feedback are distinct from those component images. All physical multi-monitor DPI transitions and all accessibility/antivirus configurations are not certified.

Supported private formats remain recovery/2 and recovery/3, with the original format-specific runtime/host requirements. The Home whitelist is unchanged. ZIP integrity is not full business coverage. Cross-device migration, actual private credential/database restoration, external models/workspaces, network volumes and arbitrary plugin graphs remain unverified. The ZIP contains no DSH installer.

## Historical acceptance

Validated base: Windows 11 Pro x64 10.0.26300, DSH Desktop 0.2.1-rc.2, its Electron Node 24.21.0 / ABI 149, Windows PowerShell 5.1 / STA WinForms. Matching platform, architecture, exact DSH version, Node major and ABI are required for restoration. The package bundles no runtime and changes no execution policy globally.

Current Desktop has no exposed safe plugin quit API. The plugin deliberately uses manual normal menu/tray exit plus a separate assistant confirmation and mandatory process detection. There is no force-start or forced-termination fallback. Other Desktop instances and known databases may conservatively block a task even when unrelated. Unknown writer handles fail the source read lease; external transaction state outside scope is not claimed.

The 0.4.2 development acceptance includes human-operated actual Desktop Save As/confirmation/manual exit, an independent assistant-generated synthetic ZIP, exact hashes and a fresh-home restore followed by three synthetic plugins plus shared dependency startup/restart. Manual exit confirmation and process inspection are independent gates; a premature click cannot bypass live writers. Acceptance records distinguish desktop tests from component tests. Headless component previews are not actual desktop E2E tests.

The format remains dsh-private-recovery/2. 0.4.0 and 0.4.1 archives remain supported, including accurate callback/no-callback restore counters. 0.3.4 legacy directories/declaration archives remain incompatible.

Not validated: another physical machine/VM, real private database business restoration, arbitrary plugin dependency graphs, all DSH/Node releases, network/OneDrive targets, every antivirus/ACL/DPI/multi-monitor configuration, power loss at every instruction or every external executable/model/credential. GUI Profiles must be under DSH_HOME/profiles/<name>. Limits and excluded filesystem metadata remain as documented in README.
