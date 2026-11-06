# DSH Environment Packer · v0.6.3 (candidate)

Private offline backup and guarded environment migration for DSH, with independent Windows recovery.

[Published v0.6.2](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.6.2) · [简体中文](README.md) · [Migration guide](docs/MIGRATION.md) · [Recovery preparation](docs/RECOVERY-PREPARATION.md) · [Cleanup](docs/CLEANUP.md)

> **v0.6.3 is a candidate and is not published.** The published version remains v0.6.2. Scope, tests and residual boundaries are in [RELEASE-0.6.3.md](docs/RELEASE-0.6.3.md); exact hashes are in `SHA256SUMS.txt`. This candidate does not replace the v0.6.2 Release, attachments, Market entry or any formal backup.

## 0.6.3 coverage classification and recovery diagnostics

- **Local plugin source trees**: `~/.dsh/plugins-local` is not a DSH runtime path and is not referenced by configuration; it holds user-authored local packages. v0.6.3 preserves it as **inert data** under `home-data/plugins-local/`, explicitly excludes `node_modules` install artifacts, and records file count, bytes, exclusions and `complete` in manifest `sourceTrees`. The restore plan exposes a deterministic mapping to `<new Home>/plugins-local`; after staging, `verify` recomputes file/byte/digest fidelity and fails with `SOURCE_TREE_CHANGED` on any mismatch. Source trees are restored as data only: never activated as plugins and never used to rewrite configuration.
- **Cache backup files**: `.dshw-usage.json.before-recharge-fix.bak` was checked against code references, lifecycle and metadata. It is a manual pre-fix snapshot of the captured `.dshw-usage.json` with no runtime reader. Only when the live file exists as a regular file, `.dshw-{usage,size,turn}.json.<qualifier>.bak` is **explicitly excluded** as `superseded-runtime-cache-backup` with `supersededBy` recorded; if the live file is missing, the backup may be the only copy and remains a critical gap.
- **Peer conflict record and gate**: the formal archive records `dsh-rewind-plugin → @deepseek-ai/schemastery ^3.19.0` (actual `3.18.5`). Package name, range and actual version are exact; no `@//` rewritten name exists. Restore re-analysis still marks it `blocked/critical` and refuses `apply`/`commit`. No third-party plugin, production dependency or peer declaration was modified, and no gate was relaxed to reduce warning counts.
- recovery/2 and /3 semantics are unchanged; recovery/4 `verify`/`commit` gates are not relaxed. New manifest fields are optional, so existing `dsh-private-recovery/4` archives remain readable.

## 0.6.2 minimal reliability fixes (published)

- **Capture state and result closure**: client preference capture is classified as `absent / present-valid / invalid`. A bounded code-only coverage summary travels from the archive result through the worker terminal record, `ui-result.json`, Packer task history and the success page. A missing field still permits data preservation, but is never presented as a successful capture.
- **"Archive complete; recovery blocked"**: with known critical gaps, the assistant and task records show that conclusion and the gap codes. ZIP integrity, recovery compatibility and post-restore usability remain separate. No target check means no compatibility success; old records without a summary stay unknown.
- **No staging for a deterministic dead end**: both `plan` and the `apply` precheck refuse critical issues the current flow cannot resolve, before any state/workspace is created; verify/commit defence in depth remains.
- **Result persistence failures are visible**: when `ui-result.json` cannot be written, all four terminal outcomes stop claiming the result was retained.
- **Canonical /4 inspection**: use `assets/migration-cli.cjs inspect`; `verify-private.cjs` is for recovery/2 and /3 only. A successful inspect does not mean a restore can commit.
- Capacity limits, a minimal uninstall/cleanup procedure and the /2 /3 vs /4 entry distinction are documented.

**This release does not repair old archives.** The v0.6.1 formal verification ZIP still has a `CLIENT_PREFERENCE_NOT_CAPTURED` critical coverage gap and a recorded dependency conflict. Its integrity passed and it remains a valid data-preservation artifact, but the currently supported complete recovery flow cannot commit it. There is no supported way to add the preference back to the original ZIP. If the source environment is still readable, create a new backup with v0.6.2 and validate it; do not modify the original ZIP.

## 0.6.1 targeted fixes

- recovery/4 cold backup can archive a fully readable source tree even when installed peers/versions conflict. The real conflicts are written to the archive metadata and backup report; restore still re-evaluates them and blocks unresolved critical issues. recovery/2 and recovery/3 keep their strict semantics.
- The standalone helper uses coordinated Fluent light/dark palettes. The light primary action is no longer a large dark block; button, border, radius, hover, disabled and focus states are unified. Dark header actions, copy buttons, log text and disabled controls set explicit readable foregrounds; the DWM caption is matched to the content background where supported.
- The helper is a compact wizard: five steps, run status, save location and result are separate regions; details/appearance are grouped as secondary actions; the path can be copied. The window height tightens to the current content, so the waiting page no longer keeps a large blank area.
- The helper no longer closes automatically. Success shows the ZIP path, size, SHA-256, ZIP integrity result and completion time. When dependency conflicts were recorded, a restrained amber strip separates "ZIP integrity passed" from "recovery compatibility to check"; it changes neither the success result nor the restore gate. Failure, cancellation and interruption stay distinct and are persisted for later viewing in Packer's task records.

## Coverage

Preserves the selected Profile's installed plugins, dependencies, configuration and source provenance; Sessions, Workspace registration and historical cwd; identified external memory/SQLite, Skills, workspace configuration and supported client preferences; and local plugin sources under `plugins-local` (excluding `node_modules`), restored as data only. Missing or unknown items are reported. DSH installers and project source trees outside that explicit area are excluded.

**Private ZIPs are not encrypted and may contain credentials and private conversations. Keep them in a trusted location; do not upload them publicly.**

## Install

Download the TGZ and matching SHA-256 from the Release. Save your environment and fully quit DSH. Install through the current Desktop's official plugin manager or its configured CLI:

```text
dsh plugin --profile desktop add "<absolute TGZ path>" --offline --ignore-scripts
```

Retain the existing Profile's pnpm store. Updating Packer does not require rebuilding the Profile or changing other plugins. Restart and confirm 0.6.3 (candidate); the published version remains 0.6.2. Candidate hashes are in `SHA256SUMS.txt`; published downloads remain on the v0.6.2 Release.

## Backup and recover

1. Start a new private ZIP from Packer. Wait for the standalone cold-backup helper to take over.
2. Save work, normally quit every DSH instance including the tray, then confirm in the helper. Process checks, read locks, consistency and archive verification remain enforced.
3. On the destination, install a compatible trusted DSH and extract the complete standalone recovery ZIP. Keep the whole package together.
4. Run `Open-Recovery.ps1` or `package/bin/restore-assistant.exe`. This EXE opens the **recovery/4 migration** interface; the legacy strict restore (/2, /3) is a button inside it. Choose the ZIP, new DSH installation and fresh Workspace root.
5. For archive-only inspection without a running DSH, run `node package/assets/migration-cli.cjs inspect --request <private-dir>/inspect-request.json` with `{"zipFile":"<absolute ZIP path>"}`. See [RESTORE.md](docs/RESTORE.md). `verify-private.cjs` applies only to /2 and /3.
6. Review the plan and its critical blocking codes. Both plan and apply refuse unresolvable critical issues before writing. Restore stages into fresh independent roots, verifies data and actual startup/restart, then commits or safely rolls back.

The migrate interface is inspect → plan → apply → verify → commit / rollback. Different machine paths and multiple historical cwd roots are supported. Only identified structured fields are rewritten; conversation and Prompt text are not globally replaced.

## Validation limits

Actual Windows x64 rc.5→rc.1 synthetic migration covers configuration, Session owner reads, Workspace v2, Skills, external memory, persistence and failure gates. Source/target version inequality alone is not a rejection; engines, peers, dependency closure, ABI and schemas still apply.

The complete real 17-plugin combination, native Mnemon business migration on rc.1, settings-page DOM automation and real 150% DPI are not certified. Unknown critical data cannot commit as complete. The old recovery/2 and /3 strict channel keeps exact runtime/proof checks. Runtime guards are not an OS sandbox for malicious native/plugin code.

**Capacity limits**: 128 MiB per file, 2 GiB total payload, 60,000 entries per archive (including manifest/directory headroom); exceeding them fails explicitly. Restore also needs a free-space budget of about `payloadBytes × 3 + 128 MiB`.

[Release notes](docs/RELEASE-0.6.2.md) · [Changelog](CHANGELOG.md) · [Restore and independent inspection](docs/RESTORE.md) · [Cleanup](docs/CLEANUP.md)
