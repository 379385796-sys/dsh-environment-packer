# Changelog

## 0.4.2 — candidate, 2026-10-24

- Replace ordinary hot-backup GUI with one offline cold-backup operation; retire /create-full with HTTP 410.
- Add independent Windows assistant, acknowledged handoff, private task lock, stage/activity window and explicit manual-exit confirmation. Confirmation never bypasses writer inspection.
- Require known writers to stop, hold Windows payload read leases, monitor for restarts and check again before no-replace ZIP commit.
- Reuse recovery/2 and unchanged trusted restore; add streamed archive SHA and cleanup-failure rollback. Keep expert safe export and offline CLI; CLI adds writer checks.
- Production upgrade and GitHub publication are pending separate authorization.

## 0.4.1 — 2026-10-24

- Correct restore counters and the written result report when no progress callback is supplied; verification/extraction/commit behavior is unchanged.
- Synchronize the displayed version.
- Validate native Save As through actual Windows desktop interaction; no native production-code change was needed. The earlier automated timeout did not establish failure to open.
- First reviewed public source snapshot. Public packaging adds license, bilingual documentation and maintenance information; executable plugin resources match the validated local 0.4.1 candidate. The public tgz therefore has a different hash from that earlier private candidate.

## 0.4.0 — local development

Introduce explicit private backup and narrow safe export modes, verified new-home restoration, private ACLs and fail-closed path/integrity checks. New private format: dsh-private-recovery/2.

## 0.3.4 and earlier — local development

Historical local versions and audits remain private. Their directory/declaration formats are not accepted by the new restore helper. This repository starts from a reviewed snapshot; it does not recreate or backdate missing development commits.
