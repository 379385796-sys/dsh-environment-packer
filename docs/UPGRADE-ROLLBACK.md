# Upgrade and rollback

Do not update a live link/Junction target. Fully exit DSH; record the installed version, link target and file hashes. Back up the plugin source/history and installed-file list locally with private permissions. Verify the Release SHA-256 before deployment.

For an existing source link, preserve its target relationship and deploy only the audited plugin files after checking the prior hashes. Stop on conflicts. Do not overwrite a whole Profile or re-resolve unrelated plugins without reviewing the resulting changes. Restart DSH and check the settings entry, two mode boundaries, cancellation and a synthetic backup/restore.

For rollback, fully exit DSH, preserve the failed state and check that no later user edits would be overwritten. Restore only the previous plugin files. Quarantine newly added files instead of broadly deleting directories. Preserve the original link. Never roll back sessions, other plugins' ledgers, the DSH core or the whole Profile as a side effect.

The 0.3.4 and new private formats are incompatible. Keep the previous trusted package/tools and backups; there is no automatic format migration. The local upgrade and isolated recovery were validated separately; a formal production rollback was not executed during acceptance.
