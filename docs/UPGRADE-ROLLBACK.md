# Upgrade and rollback

> **Current source: v0.6.3.** The sections below are historical procedures for 0.5.0, 0.4.2 and 0.6.2; keep them for provenance but use the v0.6.3 notes first.

## v0.6.3 upgrade / rollback notes

- Keep v0.6.2 attachments, installed-package rollback material and formal backups untouched. Verify v0.6.3 hashes before using the normal offline install path.
- Upgrade path is unchanged: normally exit every DSH instance, keep the existing Profile pnpm store, and install the candidate TGZ through the official offline plugin path (`dsh plugin --profile desktop add <TGZ> --offline --ignore-scripts`).
- **Data/behaviour change**: new cold backups may include `home-data/plugins-local/` source files and an optional `sourceTrees` manifest entry. Restore writes them to the new Home's `plugins-local` as inert data only; it does not install, link or activate those plugins. Existing /4 archives remain readable; existing ZIPs are never rewritten.
- After restart, confirm the Packer page reports `0.6.3`. A v0.6.3 archive cannot be fully committed while the recorded `dsh-rewind-plugin → @deepseek-ai/schemastery ^3.19.0 / 3.18.5` conflict remains unresolved; this is the unchanged strict gate, not an installation failure.
- Rollback: stop relevant processes normally, preserve diagnostics, restore only the previous verified Packer payload and package-manager metadata. Do not overwrite the Profile or private data wholesale. v0.6.2 does not understand `sourceTrees` as a plan field but can still read the archive; it may conservatively flag a `.db` inside a source tree as unknown data (the current `plugins-local` has none).

## v0.6.2 upgrade / rollback notes

- Upgrade from 0.6.1 uses the same normal offline plugin path (`dsh plugin --profile desktop add <v0.6.2 TGZ> --offline --ignore-scripts`) with all relevant DSH instances normally exited; keep the existing Profile's pnpm store and do not rebuild the whole Profile.
- **Behaviour change, not a data migration**: 0.6.2 changes capture-state classification, result reporting and the plan/apply gate. It does **not** change `dsh-private-recovery/4`, does not repair or rewrite any existing ZIP, and does not relax recovery/2 or /3. Old `terminal.json` / `ui-result.json` records without a coverage summary are shown as **unknown**, never upgraded to compatible.
- Verify after restart: `GET /plugins/dsh-environment-packer/defaults` returns `version:0.6.2`; the settings page and the standalone assistant show the new 「归档完成；恢复受阻」 wording for archives with known critical gaps.
- **Rollback of the plugin**: stop all relevant processes, preserve the failed state, restore only the previous verified Packer payload and its package-manager metadata, and confirm unrelated plugins/conversations/configuration are untouched. A restored old version will again lack the 0.6.2 gap reporting; this is a display/regression difference, not a change to any archive.
- **Rollback of a recovery attempt** (`assets/migration-engine.cjs`) only disables the activation launcher and keeps the staged transaction/data for diagnosis; it is **not** deletion. Retained task directories, `.<Workspace>.dsh-state-<planId>` state, `.packer-requests-<guid>` request directories and old ZIPs must be handled manually with explicit user choice — see [CLEANUP.md](CLEANUP.md). Do not use wildcard deletion or clean up to hide a failure.
- The released v0.6.1 tag, Release, attachments and hashes stay untouched; do not repack under the same version. See [RELEASE-0.6.2.md](RELEASE-0.6.2.md).

## Historical 0.5.0 release

Verify the exact tgz SHA-256 and complete restore toolkit first. Normal-exit all Desktop/Host instances; verify and back up the current formal Profile and previous package with private local storage. Record installed versions, template/config hashes, dependency lock and actual pnpm store. Do not migrate the store or force unrelated reinstalls.

After explicit user authorization, use the official DSH plugin CLI/manager to install the reviewed local tgz with lifecycle scripts disabled. Compare all unrelated plugin files/lock entries and all original private configuration before/after. Start the formal Desktop and run only a minimal load/UI smoke. Stop on any data/dependency anomaly.

A rollback must happen with all relevant processes stopped and no intervening user work. Preserve the failed state, restore the previous Packer payload and its package-manager metadata from the verified backup, and verify unrelated files/configuration are untouched. Never blindly overwrite newer conversations, other plugins or the whole Profile. Keep previous artifacts and all private rollback materials local.

## Historical 0.4.2 procedure

Use the exact reviewed v0.4.2 artifact and checksum. Preserve the prior 0.4.1 source, installation list and rollback materials. Never overwrite the existing public 0.4.1 Release.

Normally exit DSH completely, verify installed 0.4.1, Junction target and file hashes against the recorded baseline, back up plugin source/history and installation records with private ACLs, and verify the exact approved 0.4.2 tgz checksum. Stop on any conflict. Preserve the Junction and deploy only the reviewed file list; never overwrite a whole Profile or resolve unrelated plugins.

GUI behavior changes: running full backup removed, retired /create-full returns 410, manual normal exit and assistant confirmation/process detection are mandatory. Existing plugin config is not migrated or rewritten. Safe export remains an expert compatibility endpoint, outside the main GUI. Verify cold-only UI, cancellation, handoff, strict exit gate, native path handling and a synthetic restore before any real private backup.

Rollback requires normal exit, preservation of the failed state and checking no subsequent user work is overwritten. Restore only the previous Packer files; quarantine added files instead of broadly deleting. Do not roll back core, sessions, unrelated plugins or the whole Profile. A real production rollback is not part of this candidate acceptance.

Restore format is unchanged from 0.4.0/0.4.1; 0.3.4 formats remain incompatible. Keep all trusted earlier packages and private rollback evidence.
