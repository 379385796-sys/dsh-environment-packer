# DSH Environment Packer

**Keep a portable backup of the DSH environment you've made your own.**

[![Version 0.7.1](https://img.shields.io/badge/version-0.7.1-4D6BFE)](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.7.1)
![Windows x64](https://img.shields.io/badge/platform-Windows_x64-697586)
[![MIT License](https://img.shields.io/badge/license-MIT-697586)](LICENSE)

[Download v0.7.1](#download-and-install) · [Get started](#back-up-and-restore) · [Documentation](#documentation-and-feedback) · [简体中文](README.md)

A clean install shouldn't mean rebuilding every setting from memory. Packer brings your selected Profile's plugins, configuration and supported session data into a private offline archive. When you need it, an independent assistant guides recovery into a fresh environment—with clear records of what was saved, what was checked and what needs attention.

## What you can do

- **Keep plugins and settings together.** Preserve the selected Profile's installed plugin payloads, dependencies and configuration.
- **Carry your working context forward.** Include Sessions, Workspace registrations, and identified memory, Skills, plugin state and supported client preferences.
- **Follow a guided cold backup.** Let the independent helper take over, quit DSH normally, then collect and verify the archive. Existing ZIPs are never overwritten.
- **Recover to a different location.** The recovery plan maps recognized paths into fresh directories; the destination needn't match the old machine's paths.
- **Open recovery even when DSH won't start.** The complete standalone toolkit works independently, using an installed compatible DSH runtime for checks and recovery.
- **See a result you can inspect.** Task history, file hashes and explicit coverage or compatibility findings keep the outcome clear.

**New in v0.7.1** — automatic 10-day retention for safely retired task records. [Release notes](docs/RELEASE-0.7.1.md)

## A look inside

Start a backup from DSH Settings. Task records and help stay within easy reach.

<img src="docs/images/packer-settings-v0.7.0.jpg" width="800" alt="Packer v0.7.0 backup page inside native DSH Settings, showing the selected Profile, backup action and private-data notice">

<details>
<summary>See the standalone recovery assistant</summary>

Choose an archive, a compatible DSH installation and a fresh Workspace. Review the plan before confirming recovery.

<img src="docs/images/packer-recovery-v0.7.0.jpg" width="800" alt="Initial Packer recovery assistant with archive, DSH installation and new Workspace fields; continuing is disabled until requirements are met">

</details>

These are real v0.7.0 interfaces captured in empty isolated environments, without private conversations or backups. The interface shown is in Chinese.

## Download and install

Get the files you need from the [v0.7.1 Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.7.1), then verify their SHA-256 hashes against its checksum list.

| Download | Purpose |
| --- | --- |
| [Plugin TGZ](https://github.com/379385796-sys/dsh-environment-packer/releases/download/v0.7.1/dsh-environment-packer-0.7.1.tgz) | Install Packer in DSH |
| [Standalone recovery ZIP](https://github.com/379385796-sys/dsh-environment-packer/releases/download/v0.7.1/Packer-v0.7.1-Standalone-Recovery.zip) | Keep the complete extracted folder for independent recovery |
| [SHA256SUMS.txt](https://github.com/379385796-sys/dsh-environment-packer/releases/download/v0.7.1/SHA256SUMS.txt) | Verify your downloads |

Save your work and fully quit DSH before installing the TGZ through your Desktop version's official plugin-management workflow. With the CLI configured:

```text
dsh plugin --profile desktop add "<absolute TGZ path>" --offline --ignore-scripts
```

Restart DSH and confirm **0.7.1** in **Settings → 环境恢复包**. Retain the existing Profile's pnpm store and your previous rollback package. See the [upgrade guide](docs/UPGRADE-ROLLBACK.md) for offline-cache preparation and rollback.

See the [DSH Market catalog entry](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/379385796-sys__dsh-environment-packer.yml) for the version currently listed in Market.

## Back up and restore

### Save your current environment

1. Open **Settings → 环境恢复包 → 备份**. Choose a new ZIP location and review the private-data confirmation.
2. Wait for the independent helper to take over. Save your work, quit every DSH instance—including the tray—and confirm in the helper.
3. Let collection and verification finish, review the result, then store the ZIP safely. If it reports **“Archive complete; recovery blocked”**, keep the archive and address the reported gaps before relying on it for complete recovery.

### Recover into a fresh environment

1. Prepare a trusted, compatible DSH installation and extract the complete recovery toolkit. Open `Open-Recovery.ps1` or `package/bin/restore-assistant.exe`.
2. Select your backup ZIP, the DSH installation directory and a **new Workspace root that does not yet exist**. Inspect the generated plan.
3. Confirm the scope and start recovery. The assistant stages and verifies an isolated environment, committing only after dependency, data and actual startup checks pass. Review your own plugins and business data afterward.

You don't need your everyday DSH desktop running to open the assistant. [Detailed recovery steps and legacy archive entry points →](docs/RESTORE.md)

## Support and important limits

Packer currently targets **Windows x64**. Controlled synthetic migration from DSH **0.2.1-rc.5 to 0.2.2-rc.1** has been validated. Each archive still needs checks against its destination runtime, dependencies, ABI and data formats.

- **Included:** the selected Profile and identified Home, memory and Skills state. Local sources under `plugins-local` exclude `node_modules` and are restored as data, not activated.
- **Prepare separately:** DSH installers, external models, arbitrary project source trees and other resources outside the captured scope.
- **Capacity:** 128 MiB per file, 2 GiB total payload and 60,000 entries. Exceeding a limit fails explicitly; recovery also needs free-space headroom. See [capacity details](docs/BUILD-TEST.md).

> **Backup ZIPs are not encrypted and may contain credentials and private conversations. Store them securely and never upload them publicly.** Use trusted archives and the complete toolkit.

File integrity is not certification of private business recovery. Full real-world plugin combinations, native Mnemon, private database/credential recovery and cross-device migration remain subject to unverified boundaries. Unknown critical data or unresolved compatibility issues block complete recovery; upgrading Packer does not repair old archives. Read the [compatibility and acceptance boundaries](docs/COMPATIBILITY.md). Runtime guards are not an OS sandbox for malicious plugins.

## Documentation and feedback

- **Prepare and recover:** [Preparation](docs/RECOVERY-PREPARATION.md) · [Recovery guide](docs/RESTORE.md) · [Migration details](docs/MIGRATION.md)
- **Support and maintenance:** [Compatibility](docs/COMPATIBILITY.md) · [Upgrade and rollback](docs/UPGRADE-ROLLBACK.md) · [Uninstall and cleanup](docs/CLEANUP.md)
- **Changes and history:** [Changelog](CHANGELOG.md) · [v0.7.1 notes](docs/RELEASE-0.7.1.md) · [All releases](https://github.com/379385796-sys/dsh-environment-packer/releases)
- **Questions and suggestions:** [Open an issue](https://github.com/379385796-sys/dsh-environment-packer/issues)

Released under the [MIT License](LICENSE). Feedback is welcome—please leave private archives, credentials and unredacted logs out of public issues.
