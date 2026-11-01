# DSH Environment Packer

[简体中文](README.md) · [Download v0.4.3](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.4.3) · [Restore guide](docs/RESTORE.md) · [Compatibility](docs/COMPATIBILITY.md)

A **local offline cold-backup tool** for reinstallation, migration, and disaster recovery. An independent Windows assistant packages the selected Profile and declared home data after DSH exits normally, verifies the ZIP, and supports restoration into a fresh compatible target.

**Private ZIPs may contain API keys, tokens, passwords, private prompts, conversations, memories, and attachments. They are not encrypted and must not be shared publicly.** No cloud upload. Do not attach backups or private task records to issues.

## Current release and installation

Current release: **0.4.3**. “Local candidate” references in older source documentation describe development stages. The [v0.4.3 Release](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.4.3) provides the tgz/checksum and records Windows x64, DSH Desktop **0.2.1-rc.5** as its tested target. Earlier RC2 evidence does not certify every host version.

1. Download `dsh-environment-packer-0.4.3.tgz` and its `.sha256`.
2. Run `Get-FileHash -Algorithm SHA256 -LiteralPath '<absolute-tgz-path>'` and compare the checksum.
3. First install the local package in an isolated Profile using DSH's plugin manager. With a configured CLI:

   ```text
   dsh plugin --profile <profile> add <absolute-tgz-path>
   ```

4. Restart and verify package `dsh-environment-packer`, entry ID `environment-packer`, and version `0.4.3`. Open Settings → Environment recovery package.

The package includes JavaScript, js-yaml, and semver, with no DSH/Node runtime, native binaries, or installation hooks. The assistant requires Windows PowerShell 5.1 / STA WinForms and the corresponding Desktop runtime. The other three plugins are not required; their actual dependency contracts are checked if backed up. The package remains `private: true`, with no npm publication installation path.

See [upgrade, rollback, and removal](docs/UPGRADE-ROLLBACK.md).

## Desktop backup workflow

1. Click Create complete environment backup (offline). Use Windows Save As to choose an existing local folder and a new ZIP name.
2. Save unfinished work, read the private-scope/external-writer notice, and confirm. Canceling creates no task.
3. Wait for acknowledged handoff and the independent progress window. Keep DSH running if handoff fails.
4. **Manually quit all DSH instances through the application/tray menu.** Closing a window may only hide it. The plugin does not force-kill or automatically quit DSH.
5. Click I have quit normally; check and continue in the assistant. Confirmation cannot bypass process detection. Related processes must be fully exited and remain quiet; uncertainty or a ten-minute timeout stops the task.
6. The assistant takes payload read leases, writes the archive, and verifies entries, CRC, manifest, and all payload SHA-256 values. It displays phases, file counts, and an activity bar without invented percentages.
7. Check the successful result's path, size, hash, and cleanup status. DSH is not restarted automatically; the assistant can exit after its displayed terminal countdown.

A full ZIP-path fallback appears only when the native dialog is unavailable. Existing targets are refused and repeated clicks do not create competing tasks.

This existing image is a **synthetic component preview, not actual Desktop acceptance evidence**:

![Cold-backup component preview](assets/cold-backup.png)

Suggested additions: redacted RC5 settings and independent-assistant screenshots labeled with host version and stage.

## Backup scope

| Included | Excluded or not guaranteed to migrate |
| --- | --- |
| Selected Profile regular files, plugins, installed dependencies, local tgz files | Other Profiles and undeclared home entries |
| Selected DSH_HOME storages, sessions, attachments, memory, skills | External workspaces, models, programs, runtime |
| AGENTS.md and .credentials.yaml/.yml when present | OS/browser credentials, original ACL/ownership/ADS, external database transaction state |

The GUI requires `DSH_HOME/profiles/<name>` and refuses nonstandard external Profiles. Package-root installation links can be materialized; cyclic or unsupported data links fail. The manifest records actual scope, exclusions, and per-file hashes.

Normally stop external databases and other writers. Detection conservatively waits for Desktop runtime instances, tracked descendants, processes referencing the source home, and known database processes. Failure to acquire source read leases stops the task.

Private ACLs protect task parameters and payload requests; ACLs are not encryption. Task records under `DSH_HOME/.packer-cold` are excluded from backups. Failure diagnostics may contain private paths and should remain local.

## Restoration and compatibility limits

Use `assets/restore-private.cjs` from the **complete trusted package**, not a standalone copied script. The target home must not exist and its parent must exist. No merge, overwrite, online dependency installation, or install scripts. See [runtime preparation, commands, and startup checks](docs/RESTORE.md).

- The base contract requires matching platform, architecture, exact DSH version, Node major, and ABI. Host-peer archives additionally pin the Desktop executable, ASAR, unpacked files, and stricter runtime/dependency proof. A matching displayed version is insufficient. See [host peer contract](docs/HOST-PEERS.md).
- Archives without host peers use `dsh-private-recovery/2`; host peers require `/3`, which old readers reject. Older private archives retain format checks plus dependency validation. Legacy 0.3.4 directories/declaration ZIPs are not converted.
- Limits: 128 MiB per file, about 2 GiB payload, 59,999 files/directories. Oversized or complex linked layouts may fail.
- Another machine/VM, real private database business restoration, arbitrary dependency graphs, network/OneDrive volumes, and every antivirus/DPI combination are not generally validated.

**A verified ZIP does not prove a working restored environment.** Separately check the host, plugins, databases, models, and external paths after restore. Hashes check integrity; they are not signatures.

## FAQ

**Why no full backup while DSH runs?** Complete backups use the cold workflow to avoid changing source data. Legacy `POST /create-full` returns `410 HOT_BACKUP_DISABLED`. The expert `/create` compatibility endpoint exports a narrowly typed configuration summary only; it cannot restore an environment or export raw configuration, prompts, plugins, or tgz files.

**Why does dependency precheck refuse my Profile?** Missing ordinary dependencies, incompatible versions, unproven sources, or unproven browser/Node realms block backup. Version 0.4.3 supports evidenced host/browser peers, not skipping peer checks. Arbitrary plugin graphs may still fail.

**How do I recover an abnormal task or leftover lock?** Inspect the assistant first. Once an ended window is closed, use Check and recover abnormal tasks. Active leases and exact process identities still block recovery. Legacy 0.4.2 tasks need [full-boot proof](docs/LEGACY-RECOVERY.md); timeout or a missing PID alone cannot unlock them.

**Are failed ZIPs deleted?** Assistant failures, cancellation, and abnormal interruption preserve diagnostics and failed/unconfirmed ZIPs. Normal terminal states retire owned locks; crashes may leave them. ZIP commit can precede success recording: preserve and inspect any unacknowledged result, retry with a new name, and do not assume it is recoverable. Restore staging cleanup is documented separately in the [restore guide](docs/RESTORE.md).

## Maintenance and license

The expert backup CLI is `bin/backup-private.mjs`, requiring explicit paths and private/quiescence confirmation. Ordinary Desktop backup needs no Node command. See [build/test](docs/BUILD-TEST.md) and [changelog](CHANGELOG.md).

The [MIT grant](LICENSE) covers maintainer-controlled contributions. See [third-party notices](THIRD_PARTY_NOTICES.md) and [provenance](docs/PROVENANCE.md) for js-yaml, semver, and early-history scope.
