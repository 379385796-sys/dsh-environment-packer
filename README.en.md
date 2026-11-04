# DSH Environment Packer · v0.6.0

Private offline backup and guarded environment migration for DSH, with independent Windows recovery.

[Download v0.6.0](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.6.0) · [简体中文](README.md) · [Migration guide](docs/MIGRATION.md)

## Coverage

Preserves the selected Profile's installed plugins, dependencies, configuration and source provenance; Sessions, Workspace registration and historical cwd; identified external memory/SQLite, Skills, workspace configuration and supported client preferences. Missing or unknown items are reported. DSH installers and project source trees are excluded.

**Private ZIPs are not encrypted and may contain credentials and private conversations. Keep them in a trusted location; do not upload them publicly.**

## Install

Download the TGZ and matching SHA-256 from the Release. Save your environment and fully quit DSH. Install through the current Desktop's official plugin manager or its configured CLI:

```text
dsh plugin --profile desktop add "<absolute TGZ path>" --offline --ignore-scripts
```

Retain the existing Profile's pnpm store. Updating Packer does not require rebuilding the Profile or changing other plugins. Restart and confirm 0.6.0.

## Backup and recover

1. Start a new private ZIP from Packer. Wait for the standalone cold-backup helper to take over.
2. Save work, normally quit every DSH instance including the tray, then confirm in the helper. Process checks, read locks, consistency and archive verification remain enforced.
3. On the destination, install a compatible trusted DSH and extract the complete standalone recovery ZIP. Keep the whole package together.
4. Run `Open-Recovery.ps1` or `package/bin/restore-assistant.exe`; choose the ZIP, new DSH installation and fresh Workspace root.
5. Review the generated plan. Restore stages into fresh independent roots, verifies data and actual startup/restart, then commits or safely rolls back.

The migrate interface is inspect → plan → apply → verify → commit / rollback. Different machine paths and multiple historical cwd roots are supported. Only identified structured fields are rewritten; conversation and Prompt text are not globally replaced.

## Validation limits

Actual Windows x64 rc.5→rc.1 synthetic migration covers configuration, Session owner reads, Workspace v2, Skills, external memory, persistence and failure gates. Source/target version inequality alone is not a rejection; engines, peers, dependency closure, ABI and schemas still apply.

The complete real 17-plugin combination, native Mnemon business migration on rc.1, settings-page DOM automation and real 150% DPI are not certified. Unknown critical data cannot commit as complete. The old recovery/2 and /3 strict channel keeps exact runtime/proof checks. Runtime guards are not an OS sandbox for malicious native/plugin code.

[Release notes](docs/RELEASE-0.6.0.md) · [Changelog](CHANGELOG.md)
