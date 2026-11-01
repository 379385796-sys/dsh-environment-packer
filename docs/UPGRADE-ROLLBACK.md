# Upgrade and rollback

## Current 0.5.0 release

Verify the exact tgz SHA-256 and complete restore toolkit first. Normal-exit all Desktop/Host instances; verify and back up the current formal Profile and previous package with private local storage. Record installed versions, template/config hashes, dependency lock and actual pnpm store. Do not migrate the store or force unrelated reinstalls.

After explicit user authorization, use the official DSH plugin CLI/manager to install the reviewed local tgz with lifecycle scripts disabled. Compare all unrelated plugin files/lock entries and all original private configuration before/after. Start the formal Desktop and run only a minimal load/UI smoke. Stop on any data/dependency anomaly.

A rollback must happen with all relevant processes stopped and no intervening user work. Preserve the failed state, restore the previous Packer payload and its package-manager metadata from the verified backup, and verify unrelated files/configuration are untouched. Never blindly overwrite newer conversations, other plugins or the whole Profile. Keep previous artifacts and all private rollback materials local.

## Historical 0.4.2 procedure

Use the exact reviewed v0.4.2 artifact and checksum. Preserve the prior 0.4.1 source, installation list and rollback materials. Never overwrite the existing public 0.4.1 Release.

Normally exit DSH completely, verify installed 0.4.1, Junction target and file hashes against the recorded baseline, back up plugin source/history and installation records with private ACLs, and verify the exact approved 0.4.2 tgz checksum. Stop on any conflict. Preserve the Junction and deploy only the reviewed file list; never overwrite a whole Profile or resolve unrelated plugins.

GUI behavior changes: running full backup removed, retired /create-full returns 410, manual normal exit and assistant confirmation/process detection are mandatory. Existing plugin config is not migrated or rewritten. Safe export remains an expert compatibility endpoint, outside the main GUI. Verify cold-only UI, cancellation, handoff, strict exit gate, native path handling and a synthetic restore before any real private backup.

Rollback requires normal exit, preservation of the failed state and checking no subsequent user work is overwritten. Restore only the previous Packer files; quarantine added files instead of broadly deleting. Do not roll back core, sessions, unrelated plugins or the whole Profile. A real production rollback is not part of this candidate acceptance.

Restore format is unchanged from 0.4.0/0.4.1; 0.3.4 formats remain incompatible. Keep all trusted earlier packages and private rollback evidence.
