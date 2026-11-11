# Packer v0.7.2 · Third-party plugin data preservation / 第三方插件数据保全

白名单之外的 DSH Home 顶层目录不再只记录、不采集。备份会把其中可安全读取的普通文件按原结构保存到 `home-data/<name>/`，并在清单的 `pendingReview` 中记录文件数、字节数与跳过项。`needsReview`、`HOME_ITEM_UNCLASSIFIED` 和恢复阻断保持不变：数据被保住，但仍需人工确认。

恢复时这些目录映射到恢复目录下的 `pending-review/<name>/`，不写入新 Home，也不激活为运行时状态。超大文件、链接与特殊文件记为跳过项并保持关键缺口；单个惰性树有独立上限，超限只让该树不完整，不中止整次备份。

覆盖完整性现在与摘要一致：`completeWithinDeclaredScope` 计入 `needsReview` 条目，不会再出现“声明范围内完整”与“critical-gaps”并存的清单。备份写入前先探测目标卷的可写性、ACL 与硬链接能力，分别报 `TARGET_VOLUME_NOT_WRITABLE`、`TARGET_VOLUME_NO_ACL`、`TARGET_VOLUME_NO_HARDLINK`。

Homes outside the declared whitelist are no longer recorded without being captured. Readable regular files are archived under `home-data/<name>/` with a `pendingReview` record of file counts, bytes and skipped entries. `needsReview`, `HOME_ITEM_UNCLASSIFIED` and the restore block are unchanged: the bytes are preserved, but a human still confirms them.

Restore maps those trees to `pending-review/<name>/` outside the new Home, so nothing is activated as runtime state. Oversized files, links and special files are skipped and reported as gaps; each inert tree has its own limit, and exceeding it marks that tree incomplete instead of aborting the backup.

`completeWithinDeclaredScope` now counts `needsReview` entries, so an archive can no longer claim complete coverage while its summary reports critical gaps. Before writing, the target volume is probed for writability, ACLs and hard links.

The recovery/2, /3 and /4 formats, verify/commit gates and archive limits are unchanged. Older /4 archives without `pendingReview` still read. [Upgrade and rollback](UPGRADE-ROLLBACK.md)
