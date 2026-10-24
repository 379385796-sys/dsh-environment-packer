# Design overview

The settings panel calls same-origin, bounded-body, single-operation host routes. Private backup and safe export use separate collectors. Private mode requires explicit per-backup confirmation; safe mode only emits typed data and exclusions.

Private backup enumerates the selected Profile and fixed home scope, materializes package-root installation links, rejects unsupported/data/cyclic links, checks required installed dependencies and local archive structure, and records every file hash. It writes a bounded STORE ZIP with private permissions, checks source stability, verifies the completed archive, and commits without replacing an existing file.

The trusted external restore helper accepts only the supported format. It checks path safety, entry-set equality, CRC, all hashes and runtime compatibility before writing private staging. Written files are verified and the complete new home is committed. There is no overwrite or merge. Error cleanup is scoped to that operation; hard-exit residues remain private and require informed cleanup.

0.4.1 changes only the restore count evaluation order and displayed version. Native dialog production code was not changed after actual desktop testing demonstrated that the earlier automation timeout did not prove an opening failure. See compatibility, restore and provenance documents for acceptance limits.
