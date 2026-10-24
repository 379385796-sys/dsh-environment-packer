# Compatibility and acceptance boundary

Validated environment: Windows 11 Pro x64 (10.0.26300), DSH Desktop 0.2.1-rc.2, its Electron Node 24.21.0 / ABI 149. Restoration requires matching platform, architecture, exact DSH version, Node major and ABI. The system Node is not assumed equivalent.

Actual Windows Save As was operated by the user: open/cancel, a Chinese/space/Ω/emoji path, an existing ZIP rejected with HTTP 409 and unchanged hash, and safe export. The window ran on Session 1, WinSta0/Default, STA. Automation did not enumerate it; this alone is not a dialog implementation failure.

Synthetic full ZIP restoration matched every file hash and preserved embedded test credentials privately. Safe export excluded those values. Three synthetic plugins and a shared dependency ran after restoration and restart. The 0.4.1 no-callback and callback result counters matched actual files and the written report. Negative path, corruption, missing dependency, permission and interruption cases were checked.

Not validated: second machine/VM, real private database business restoration, every third-party plugin graph, every external executable/model/credential, network/OneDrive paths, all antivirus/ACL/DPI/multi-monitor configurations. A running database may be inconsistent even if files appear stable. Use cold backups.

Runtime paths, browser/OS credentials, other Profiles, filesystem ownership/ADS and external workspaces are outside the backup scope. No overwrite/merge restoration exists. Hashes detect corruption, not authenticity. See README for size limits and safe-failure behavior.
