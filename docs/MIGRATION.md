# v0.6.1 migration channel

This channel is independent of the unchanged `recovery/2` and `recovery/3` strict-restore implementation. Keep the complete tool directory and a trusted DSH installation. The assistant works without starting the ordinary DSH desktop first; target runtime inspection still requires its executable. No AI, download, installer, or installation lifecycle hook is used by recovery.

## Backup and archive

The plugin's cold-backup action now produces `dsh-private-recovery/4`, manifest `schemaVersion: 1`, `mode: environment-migration`. Use the cold assistant: its existing process gates, kernel source read leases, source consistency checks, CRC/SHA checks and no-replace publication remain mandatory. The legacy expert backup CLI retains its legacy format/scope. There is no standalone migration backup command that bypasses cold coordination.

The manifest records source runtime proof, roots and owners, installed packages, captured local TGZ identities, pinned tools, data sets, coverage/missing items, and each file's size/SHA-256. It also records `compatibility.dependencyIssues` when the installed peers/engines do not satisfy the declared ranges: recovery/4 may still archive a fully readable tree, but the real conflict is preserved and never reported as compatible. Malformed package metadata or unreadable sources still stop the archive before any bytes are written. Restore re-runs the dependency contract against the target host, so unresolved critical conflicts remain blocked. Coverage includes installed Profile payloads, necessary Home state, registered/history workspace configuration and Skills, discovered external memory and Skills, and supported browser preferences captured at handoff. Workspace traversal includes only explicit configuration/Skills paths; it does not recursively collect project source. Custom undiscovered data is not silently certified. Unclassified Home items, unknown path fields and missing critical sources appear in the plan and prevent complete success. Oversized input fails rather than trimming data.

ZIPs are **not encrypted**. Private directory ACLs protect local staging; they do not encrypt a copied ZIP. Treat archives, plans and diagnostics as private. DSH installers and engineering projects are excluded.

## Two-path recovery

Start `bin/restore-assistant.exe` from the complete tool directory. Select the ZIP, target DSH installation directory, and a **new** Workspace root. Review the generated plan and explicitly confirm private recovery and execution. The button for legacy strict recovery opens the original assistant.

The fresh Home, desktop Profile, agents, Electron userData, external data and logs are placed under a sibling directory `.<workspace>.dsh-state-<plan-id>`, outside the Workspace. Neither root may already exist. Reparse paths, recognized formal Homes, unsafe overlap and changed inputs are rejected. Historical roots receive stable distinct mappings; nested roots retain their relative relationships. All files are staged under these fresh roots. There is no overwrite/merge into an existing Home.

The engine performs `inspect → plan → apply → verify → commit / rollback`. Verification uses the real target runtime: dependency resolution, native module loading, schema-aware storage access, Session and workspace reads, Skills body reads, supported preference bootstrap, database integrity/owner reads, and startup, normal shutdown and restart. Commit requires a bound successful receipt and no critical unknowns. Only then is a guarded activation launcher enabled. A verification failure cannot become full recovery success.

Rollback disables activation and preserves the new transaction/data for diagnosis; it does not delete the old environment or erase newly written user data. A running/unproven DSH process prevents unsafe rollback. Retry with a fresh target after inspecting diagnostics. A crash before durable commit leaves activation disabled; owned unchanged partial publication can be retried.

## Deterministic interfaces

`assets/migration-engine.cjs` exports `inspect`, `plan`, `apply`, `verify`, `commit`, `rollback`. GUI and CLI share it. `assets/migration-cli.cjs <action> --request <absolute-json-file>` emits one JSON result envelope, `{ok,result}` or `{ok:false,code}`. Use a supported Node runtime or the target executable in its supported Node mode. Requests and output must be stored in a private directory.

`inspect` accepts `{zipFile}`; `plan` accepts `{zipFile, installation, workspace}`. Execution requests contain the complete returned `plan`; `apply`/`restore` additionally require `confirmPrivate: true, confirmExecution: true`. `restore` sequences apply, verify, commit and attempts safe rollback on failure. The individual operations allow diagnostic tooling to inspect a stopped transaction. A plan checksum is an identity binding, not a signature or permission token. The plan is rederived before apply, and archive, host, directory identities and executable toolkit contents are checked again. Editing a plan or using changed tool files requires a new plan; AI cannot bypass this boundary.

Compatibility depends on actual capabilities, engines/peers/dependency closure, platform/runtime/native ABI and data schemas. Source Packer/DSH version inequality alone creates no rejection. Unknown versions may be inspected and staged for guarded validation; critical unknowns cannot commit. Old archives can be read but their missing coverage cannot be invented. The original strict channel continues enforcing its exact proof/compatibility rules.

Adapters change only recognized structured fields: Session v4 header/replayable working-directory events and directory keys, Workspace unit v2 references, Mnemon canonical workspace identifiers, known plugin configuration path fields, Prompt Inject override keys and supported preferences. Session text, Prompt templates and database contents are not blindly replaced. SQLite is preserved and checked with its owner tool; unknown schema requires a real adapter or validation, not a version-string edit.

The runtime verification guard restricts outbound connections, subprocesses and writes for the trusted test workload. It is **not an operating-system sandbox for malicious native/plugin code**. Only execute trusted archive payloads after reviewing the plan; no unknown install scripts run. Phase 3 must include the final security and packaging review.

## Validated scope

Phase 2 uses the installed Windows x64 Desktop `0.2.1-rc.5` and isolated synthetic data. Controlled fixtures test version differences and rejection branches; they do not certify unavailable future installers or every plugin in a user's formal Profile. See the separately delivered Phase 2 result and retained evidence for exact passing cases. Phase 2.5 UI work has been accepted; the release preserves the documented validation limits.

## Actual rc.1 validation

Windows x64 `0.2.1-rc.5` to `0.2.2-rc.1` has been exercised with isolated synthetic data and trusted test plugins. Node 24.21.0 / ABI 149 / Electron 44.7.0 are unchanged; the actual Cordis provider changes from 4.0.5 to 4.1.0. This is not certification of the user's 17 real plugins or their native modules.

Session v4 Zstandard decoding consumes all concatenated frames, bounds total expanded bytes and refuses corrupt later frames. Conversion writes a standalone header frame followed by event frames. Verification now opens every declared session through the target persistence service and reads its events before commit; file hashes or startup alone cannot replace this check. Preference bootstrap verification uses the actual authenticated HTTP page and the bound plan ID, preserving compatibility with rc.1's request-dependent webserver API. Unknown `.db`, `.sqlite` and `.sqlite3` files remain critical; a SQLite header is not owner/schema compatibility proof.

The original rc.5 ZIP remains readable without changes. Archives with unknown SQLite can be inspected/staged for diagnosis but cannot verify/commit as a complete recovery. Native Mnemon owner migration on rc.1 and other real plugins remain unverified; no fake owner, version exemption or edited host proof is used to clear them. The candidate and evidence do not authorize writing the formal Home, Workspace, Profile, application installation or store.