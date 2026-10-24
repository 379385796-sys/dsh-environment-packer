# Compatibility and acceptance boundary

Validated base: Windows 11 Pro x64 10.0.26300, DSH Desktop 0.2.1-rc.2, its Electron Node 24.21.0 / ABI 149, Windows PowerShell 5.1 / STA WinForms. Matching platform, architecture, exact DSH version, Node major and ABI are required for restoration. The package bundles no runtime and changes no execution policy globally.

Current Desktop has no exposed safe plugin quit API. The plugin deliberately uses manual normal menu/tray exit plus a separate assistant confirmation and mandatory process detection. There is no force-start or forced-termination fallback. Other Desktop instances and known databases may conservatively block a task even when unrelated. Unknown writer handles fail the source read lease; external transaction state outside scope is not claimed.

The 0.4.2 development acceptance includes human-operated actual Desktop Save As/confirmation/manual exit, an independent assistant-generated synthetic ZIP, exact hashes and a fresh-home restore followed by three synthetic plugins plus shared dependency startup/restart. Manual exit confirmation and process inspection are independent gates; a premature click cannot bypass live writers. Acceptance records distinguish desktop tests from component tests. Headless component previews are not actual desktop E2E tests.

The format remains dsh-private-recovery/2. 0.4.0 and 0.4.1 archives remain supported, including accurate callback/no-callback restore counters. 0.3.4 legacy directories/declaration archives remain incompatible.

Not validated: another physical machine/VM, real private database business restoration, arbitrary plugin dependency graphs, all DSH/Node releases, network/OneDrive targets, every antivirus/ACL/DPI/multi-monitor configuration, power loss at every instruction or every external executable/model/credential. GUI Profiles must be under DSH_HOME/profiles/<name>. Limits and excluded filesystem metadata remain as documented in README.
