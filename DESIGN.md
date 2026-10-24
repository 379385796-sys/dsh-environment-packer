# Cold-backup design, 0.4.2

The sole ordinary GUI operation selects a ZIP, obtains native per-task confirmation and starts a short Windows PowerShell bootstrap. It uses Start-Process to create the independent WinForms assistant without shared DSH pipes or IPC. A private UUID task, exclusive per-home lock and ready/accepted handshake must complete before the UI advises quitting. A direct Node detached PowerShell 5.1 launch silently exited in local probing; it is not used.

There is no supported whole-Desktop quit bridge in the tested 0.2.1-rc.2. The user normally quits using the existing menu/tray, then confirms that step in the assistant. Neither that button nor an HTTP parameter bypasses inspection. The coordinator tracks writer identities and descendants, queries known writers until a three-second quiet interval, requires explicit exit confirmation, rechecks before worker start, monitors throughout backup and synchronously checks again before commit. Uncertain inspection, timeout or reappearing writers fail closed.

The UI owns read-only FileShare.Read handles on every inventoried source file: existing/new write and delete access is denied while packing. Failure to obtain all handles stops the task. Core repeated inventory and hash checks also detect source changes or omissions. External state outside the declared scope remains outside the guarantee.

The existing ZIP/recovery architecture and dsh-private-recovery/2 schema remain. Minimal core hooks expose stages, inventory leases and a precommit gate; SHA-256 is streamed before no-replace commit. Temporary cleanup failure removes only the operation's own committed hard link by identity. Trusted restore remains unchanged.

Task directories and ZIP staging have private ACLs. Parameters/lease requests never enter ordinary status or command lines as configuration content; no source payload is logged. Environment inheritance is allowlisted. Production task TEMP/TMP is explicitly redirected beneath its private task directory. Abrupt OS termination can leave private residues and a commit-to-status gap; no unconfirmed artifact is presented as success.

POST /create-full is retired with 410; /create only performs the existing narrow safe export. GUI and server cannot invoke the former hot backup path. The expert offline CLI retains explicit confirmations and adds start/precommit writer checks.
