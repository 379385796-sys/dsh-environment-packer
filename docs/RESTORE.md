# Cold backup and fresh-home restoration

1. Install the same compatible DSH/runtime first. Completely exit DSH, including tray and Host, before a database-consistent backup.
2. Read the private-data warning. Choose a local existing output directory and a new ZIP name. Confirm private scope and quiescence only when true.
3. Use the CLI commands in README with explicit absolute paths. For the DSH executable, set ELECTRON_RUN_AS_NODE=1 only for that process invocation and pass --expose-internals before the script path. Restore the prior environment afterwards; do not change global environment variables or system PowerShell policy.
4. On the destination, use the trusted package's assets/restore-private.cjs with a nonexistent new DSH_HOME. Existing targets, even empty directories, are refused. The parent must exist. Do not pass the official Profile as a target.
5. The helper validates all entries and hashes before staging, verifies written bytes, and commits a new home. No lifecycle script or package manager runs. A reported verified file count is not a substitute for subsequent business validation.
6. Start DSH with the new DSH_HOME and a separate agents directory; check plugin activation, configuration, databases, models and external paths before deciding on manual migration.

Legacy 0.3.4 full directories and declaration ZIPs are not compatible. Older private ZIPs use dsh-private-recovery/2. The 0.4.3 candidate uses recovery/3 when installation peers are required; old readers reject it. Use the complete trusted candidate package, including assets and vendor/semver. It checks dependency metadata and, for host peers, the exact Desktop executable, archive, unpacked payload and provider bindings before staging and again before commit. A matching displayed DSH version alone is insufficient. See HOST-PEERS.md. Safe-config ZIPs cannot restore an environment.

On ordinary errors/cooperative cancellation, staging is cleaned. Hard process exit or power loss can leave private .*.private-*.tmp or .dsh-restore-* residue. It is not a completed artifact and is not automatically merged or resumed. Verify ownership and active processes before manually cleaning it. No automatic broad deletion is performed.

Treat private ZIPs and copied credentials as secrets. The ACL is not encryption and can change when copied. Do not upload a backup for troubleshooting. Use only trusted backups: hashes do not authenticate their author.

For 0.4.2 desktop backups use the native workflow in README, including manual exit and assistant confirmation. The expert offline backup CLI remains available; ordinary users need no Node command to create a backup.
