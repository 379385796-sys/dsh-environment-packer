# Changelog

## 0.6.2 — 2026-11-05（候选，未发布）

- **Capture state / result closure**: `clientPreferences` is classified as `absent / present-valid / invalid` at the host boundary; `job.json` records only protocol version and state, never the raw body or preference values. Invalid input fails with `CLIENT_PREFERENCE_INVALID`; an absent field still allows a fully readable tree to be archived while keeping `CLIENT_PREFERENCE_NOT_CAPTURED` as a critical coverage gap. No default value is ever substituted to fake a successful capture.
- Add a bounded, code-only `coverageSummary` (max 8 stable codes) to `manifest.coverage`, `onCommitted`, the worker `done` message, `terminal.json`, `ui-result.json` and `readUiOverview()`. `validate()` checks its shape and requires it to be derivable from `coverage.missing` / `coverage.excluded`, so a rewritten manifest cannot claim a clean capture. `completeWithinDeclaredScope` is now computed from `missing.length` instead of hardcoded; `sourceFilesVerified` keeps its original meaning.
- Terminal and history views show 「归档完成；恢复受阻」 plus gap codes for known critical gaps, keep ZIP integrity separate, treat old records without a summary as unknown, and never claim recovery compatibility without a target check. Success integrity criteria are unchanged.
- `migration-plan.cjs` exports `hasUnresolvedCritical`; `canApply`, the `apply` precheck, `verify` and `commit` share the same policy, so a recovery that cannot commit is refused before any state/workspace is written. The migration GUI lists critical blocking codes and no longer labels all blocked/unknown issues as dependency conflicts.
- All four terminal outcomes now report `ui-result.json` write failures truthfully via `Set-PackerRecordDurability`; ZIP integrity and record durability are stated separately.
- Document the canonical recovery/4 independent inspection entry (`assets/migration-cli.cjs inspect`), the strict /2 /3 vs /4 entry difference, archive capacity limits, and a minimal manual uninstall/cleanup procedure. Toolkit `READ-FIRST.txt` is frozen to v0.6.2.
- No change to recovery/2 or /3 semantics, dependency/host/schema analysis, verify/commit gates, archive format, encryption or rollback behaviour. No archive repair interface and no automatic cleanup are added.

## 0.6.1 — 2026-11-05

- recovery/4 cold backup no longer refuses a fully readable source tree solely because installed peers/engines conflict. The real issues are recorded in `manifest.compatibility` and the dependency report; malformed package metadata and unreadable sources still stop the archive. Restore re-evaluates the same contract, so unresolved critical issues still block apply/commit. recovery/2 and recovery/3 backup/restore gates are unchanged.
- The standalone WinForms assistant uses coordinated Fluent light/dark palettes. The light primary action is a readable blue instead of a dark block; secondary buttons keep a visible surface/border; hover, pressed, disabled and focus states are unified. Dark-theme header actions, copy buttons, log text and disabled controls now set explicit readable foregrounds; text boxes show a blue focus border. The DWM caption/border colors are matched to the content background where Windows supports them.
- The assistant layout is compact and sectioned: five-step header, status card, save-location card, terminal result card, grouped details/appearance actions, and a copy action for long paths. Card spacing, internal vertical padding, text-block rhythm and footer breathing were tuned without restoring large blank areas; the window height still auto-fits the current content (waiting/failure stay compact; success grows only when the result card is present).
- Terminal pages stay open until the user closes them. Success requires the target ZIP to exist with the verified size and shows path, size, SHA-256, integrity result and completion time. A restrained amber strip separates ZIP integrity from recovery compatibility when dependency conflicts were recorded; it does not change the success result or restore gate. Failure, cancellation and interruption are distinct, persisted in `ui-result.json`, and readable from Packer's task history (including terminal-only records).
- Add focused tests for the recovery/4 dependency gate, light/dark contrast, compact layout, and success/failure/cancel/unknown result persistence.

## 0.6.0 — 2026-11-05

- Add the independent format-4 environment migration channel, manifest coverage, external memory/Skills and original package provenance capture, and typed rc.5 path/data adapters. Keep strict recovery/2 and recovery/3 compatibility rules unchanged.
- Share deterministic inspect/plan/apply/verify/commit/rollback between the functional WPF assistant and CLI. Bind archive, target/runtime, directories and toolkit; stage fresh sibling Home/Workspace roots and enable activation only after runtime verification and normal restart.
- Evaluate actual dependency/runtime/schema compatibility instead of rejecting source/target version inequality alone. Unknown critical data cannot commit as complete. No install hooks, source projects, cloud synchronization or release automation are added.
- Unify the plugin page and standalone helpers; keep cold-backup actions visible in a fixed, DPI-aware window and retain the Phase 2.5 paint/performance fixes.
- Validate rc.5 to rc.1 migration with synthetic data on actual Windows x64 hosts. Read the real authenticated HTTP preference bootstrap instead of calling the request-dependent internal index-injection API.
- Decode every Zstandard session frame on Desktop Node 24, preserve independent header/event framing, and require target session-owner reads before commit. Classify .sqlite/.sqlite3 data as critical unknowns until validated.
- Publish the accepted runtime code with concise in-app documentation and complete GitHub guides. Real third-party/native plugin combinations, native Mnemon business migration, settings DOM automation, real 150% DPI and arbitrary future hosts remain uncertified.

## 0.5.0 — 2026-11-02

- Add conservative coverage reporting, standalone read-only archive/runtime inspection, and a redesigned WPF recovery assistant with a small console-free managed launcher. Bundle its XAML, controller and launcher source; add no downloaded runtime.
- Reuse the original ZIP/Manifest/CRC/SHA, dependency, exact host-proof and recovery transaction code. Reopen and revalidate before execution/commit; bind the inspected ZIP hash and reject stale source/target states. Existing formats, Home whitelist, cold defaults and user configuration remain compatible.
- Keep private confirmation visible, distinguish backup files from the installed DSH program, explain blocked navigation, and retain process tracking if presentation fails after a worker starts.
- Fix a real RC5 session-path issue in Windows PowerShell 5.1 read leases using extended spelling for validated long drive paths; retain FileShare.Read and all source/path safety checks.
- Acceptance: real Desktop cold backup, exact-proof read-only verification, actual independent WPF recovery of 2307 synthetic files, restored Desktop startup/restart and four-plugin joint behavior. WPF safety/controller tests and a native long-path cold scenario passed. Full cross-device recovery remains untested.

## 0.4.3 — unpublished candidate

### Assistant UI revision — 2026-10-31

- Formal acceptance exposed a cold-task preflight bug: Windows `path.relative()` returns an absolute path across drives. Correctly allow an external drive while retaining refusal of same-Home descendants; the worker's existing source-boundary check is unchanged.
- Formal-acceptance follow-up: replace the invisible 1px cold-confirmation owner with a visible, taskbar-discoverable owner; clarify the preparation instructions. Preserve the full independent warning, default No, and existing cancel/timeout behavior. No lock or backup-engine change.
- Cache unchanged status, theme and layout rendering; buffer the main WinForms containers. Keep the independent assistant architecture and polling cadence. Residual flicker during resize/theme changes remains; user dynamic review accepted it.
- After a durable terminal result and coordinator exit, release the assistant's source leases and close automatically: approximately 3 seconds for verified success, 10 seconds for failure, and shortly after safe user cancellation. Manual early close remains available after completion; DSH is never restarted automatically.
- Require ZIP verification, commit receipt, cleanup and owned lock retirement for successful auto-exit. Preserve uncertain locks and failed artifacts. Retain a bounded UI-exit receipt for next-launch display; it is never recovery proof.
- Retain the Windows process handle so Windows PowerShell reports the actual coordinator exit code. Never infer success from a missing code.
- Preserve prior rc.5 compatibility, recovery/2 and recovery/3 behavior, lock recovery and cold-backup gates from the accepted candidate.

## 0.4.2 — 2026-10-24

- Replace ordinary hot-backup GUI with one offline cold-backup operation; retire /create-full with HTTP 410.
- Add independent Windows assistant, acknowledged handoff, private task lock, stage/activity window and explicit manual-exit confirmation. Confirmation never bypasses writer inspection.
- Require known writers to stop, hold Windows payload read leases, monitor for restarts and check again before no-replace ZIP commit.
- Reuse recovery/2 and unchanged trusted restore; add streamed archive SHA and cleanup-failure rollback. Keep expert safe export and offline CLI; CLI adds writer checks.
- Preserve the tested manual normal-exit workflow; publication updates documentation and the visible release label only.

## 0.4.1 — 2026-10-24

- Correct restore counters and the written result report when no progress callback is supplied; verification/extraction/commit behavior is unchanged.
- Synchronize the displayed version.
- Validate native Save As through actual Windows desktop interaction; no native production-code change was needed. The earlier automated timeout did not establish failure to open.
- First reviewed public source snapshot. Public packaging adds license, bilingual documentation and maintenance information; executable plugin resources match the validated local 0.4.1 candidate. The public tgz therefore has a different hash from that earlier private candidate.

## 0.4.0 — local development

Introduce explicit private backup and narrow safe export modes, verified new-home restoration, private ACLs and fail-closed path/integrity checks. New private format: dsh-private-recovery/2.

## 0.3.4 and earlier — local development

Historical local versions and audits remain private. Their directory/declaration formats are not accepted by the new restore helper. This repository starts from a reviewed snapshot; it does not recreate or backdate missing development commits.
# 0.4.3 (candidate)

- Guard task startup, cleanup and recovery with Windows kernel file leases and process birth identities.
- Add Packer recovery action; refuse active, corrupt, uncertain and unsupported legacy task evidence.
- Contain asynchronous status errors, retry transient Windows sharing conflicts, publish an independent terminal record after worker shutdown.
- Preserve failed artifacts and committed-but-unreported ZIPs; record commit receipt and runtime diagnostics.
- Keep all cold backup and fresh-target restore safety gates.
- Add two-step legacy recovery only with corroborated full-boot, clock, record and current-process evidence; fence late initializers with an exclusive old job read and retire atomically under the root guard.
- Migrate legacy test entry points to the current cold API, run an explicit full regression manifest, and independently verify private ZIP payloads with .NET.
- Validate installation-provided pure peers through the Desktop resolution table, semver and pinned executable/archive/unpacked fingerprints. Require recovery/3 host proof and exact consumer bindings at restoration; old readers reject the new format.
- Separate browser seeds from Node installation packages. Unproven browser versions/consumer realms still refuse; no peer declarations, plugins or integrity gates are rewritten.
- Add read-only source precheck, persistent dependency diagnostics, semver ISC notices and a native installation-peer success scenario.
