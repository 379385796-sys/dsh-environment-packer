# DSH Environment Packer 0.4.2

[中文](README.md) · [Compatibility](docs/COMPATIBILITY.md) · [Restore](docs/RESTORE.md) · [Provenance](docs/PROVENANCE.md)

A local offline cold-backup tool for infrequent migration, reinstallation and disaster recovery. Download the tgz and SHA-256 file from [v0.4.2](https://github.com/379385796-sys/dsh-environment-packer/releases/tag/v0.4.2), verify it, then use the DSH local plugin installer. It does not promise universal lossless migration.

## Desktop workflow

Click Create complete environment backup (offline), choose a new ZIP with Windows Save As, save unfinished work and approve the private-data warning. Wait for an independent assistant to acknowledge handoff. If handoff fails, keep DSH running.

**Manually quit all DSH instances using the application or tray menu**, then click **I have quit normally; check and continue** in the assistant. The current Desktop exposes no safe plugin API for whole-application quit. Closing a window may only hide it. Human confirmation cannot bypass process checks. No detected exit, uncertain inspection or a ten-minute timeout means no backup.

The independent window displays waiting, verified exit, scanning, writing, verification and the final result, with an activity bar and file count rather than invented percentages. Windows read leases deny writes/deletion of every inventoried payload while the archive is generated. Failure to acquire a lease stops the task. Success includes path, size, SHA-256, validation and cleanup. The assistant never restarts DSH automatically.

## Scope and privacy

**Private ZIPs can contain API keys, tokens, passwords, private prompts, conversations, memories and attachments. ZIPs are not encrypted and must not be shared publicly.** Local only; no cloud upload. Windows private ACLs are not encryption.

The GUI requires a Profile under the selected DSH_HOME/profiles/<name>; nonstandard external Profiles are refused. Includes the selected Profile's regular files, plugins, installed dependencies and local packages; package-root installation links are materialized, other/cyclic links fail. Declared home scope: storages, sessions, attachments, memory, skills, AGENTS.md and .credentials.yaml/.yml. Other Profiles, undeclared home entries, external workspaces/models/programs, runtime, OS/browser credentials and original filesystem metadata are excluded. Stop external databases and other writers; external state is not guaranteed to migrate.

The assistant conservatively waits for all instances using the Desktop runtime, tracked descendants, processes referencing the source home and known database processes. Private task parameters and payload path requests remain under a protected task directory. Ordinary status contains phases, counts, booleans and controlled error codes. Historical task records under DSH_HOME/.packer-cold are excluded from backups.

The old full-backup GUI is removed; POST /create-full always returns 410 HOT_BACKUP_DISABLED. The narrow /create safe-export compatibility endpoint remains for experts and **cannot restore an environment**. It excludes raw configurations, arbitrary strings, prompts, plugin files and archives.

## Recovery and limitations

The expert offline backup CLI remains bin/backup-private.mjs, with explicit source paths and private/quiescence flags; it checks known writers before starting and committing. Ordinary desktop backup requires no Node commands. Restore uses the trusted assets/restore-private.cjs and accepts only a nonexistent fresh home. No merge, overwrite, install scripts or online dependency installation. See [restore](docs/RESTORE.md).

dsh-private-recovery/2 is unchanged: 0.4.0/0.4.1 private archives remain compatible; legacy 0.3.4 formats do not. Tested Windows 11 x64 build 10.0.26300, Desktop 0.2.1-rc.2, Electron Node 24.21.0 / ABI 149. Matching platform, architecture, exact DSH version, Node major and ABI are required. Limits: 128 MiB/file, about 2 GiB payload and 59,999 files/directories. Cross-machine/VM, real private database restoration, all external dependencies, network/OneDrive paths and all antivirus/DPI setups remain unvalidated. ZIP verification does not prove restored business operation. Hashes are not signatures.

Ordinary errors/cooperative cancellation clean the current staging. Hard exits or power loss can leave private temporary files or locks; an atomic ZIP commit can precede its success record. Treat any unacknowledged output as unconfirmed. Preserve and inspect residues; no broad automatic deletion.

Build and isolated installation: [instructions](docs/BUILD-TEST.md). Before production upgrade, quit normally, back up the plugin and preserve existing Junctions. Never overwrite an entire Profile. No npm publication. The scoped MIT grant, js-yaml author/license and historical provenance disclosure remain intact. New assistant sources add no bundled runtime, binary or npm dependency.
