# Packer v0.7.1 · Task record retention / 任务记录保留

Windows DSH 检查 `.packer-cold` 的已结束记录，启动时一次，持续运行时每 24 小时一次。终态及记录均满 10 天时，验证任务身份、已退役锁、终态凭据及进程租约，再清理允许的诊断与历史文件。重新打开页面或点击“刷新记录”即可看到结果。占用或访问失败会留待后续检查。

活动任务、恢复退役记录、缺失或损坏的凭据、可能留有未确认产物的失败任务，以及含未知文件或链接的目录会保留。清理范围只包括 `.packer-cold` 中的诊断和历史记录，备份 ZIP、恢复产物及 Profile 配置保留。

On Windows, DSH checks finished `.packer-cold` records at plugin startup and every 24 hours while it is running. A record becomes eligible after 10 days when the task identity, terminal state, retired lock and process leases agree. Reopen the page or select Refresh to update the history. Busy or inaccessible records are retried on a later check.

Active or interrupted tasks, incomplete evidence, and directories with unknown files or links are retained. Backups, recovery output and Profile settings are outside the cleanup scope.

The plugin and standalone toolkit use the existing backup and recovery formats and gates. See the upgrade and rollback steps. [Upgrade and rollback](UPGRADE-ROLLBACK.md)
