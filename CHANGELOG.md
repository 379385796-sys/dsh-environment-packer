# Changelog

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
