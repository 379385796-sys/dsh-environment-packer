# Upgrade and rollback

Use the exact reviewed v0.4.2 artifact and checksum. Preserve the prior 0.4.1 source, installation list and rollback materials. Never overwrite the existing public 0.4.1 Release.

Normally exit DSH completely, verify installed 0.4.1, Junction target and file hashes against the recorded baseline, back up plugin source/history and installation records with private ACLs, and verify the exact approved 0.4.2 tgz checksum. Stop on any conflict. Preserve the Junction and deploy only the reviewed file list; never overwrite a whole Profile or resolve unrelated plugins.

GUI behavior changes: running full backup removed, retired /create-full returns 410, manual normal exit and assistant confirmation/process detection are mandatory. Existing plugin config is not migrated or rewritten. Safe export remains an expert compatibility endpoint, outside the main GUI. Verify cold-only UI, cancellation, handoff, strict exit gate, native path handling and a synthetic restore before any real private backup.

Rollback requires normal exit, preservation of the failed state and checking no subsequent user work is overwritten. Restore only the previous Packer files; quarantine added files instead of broadly deleting. Do not roll back core, sessions, unrelated plugins or the whole Profile. A real production rollback is not part of this candidate acceptance.

Restore format is unchanged from 0.4.0/0.4.1; 0.3.4 formats remain incompatible. Keep all trusted earlier packages and private rollback evidence.
