# Packer v0.7.0 — diagnostics and restrained motion

Baseline: v0.6.3 (`1c5f6b3`), with the final documentation-only main commit `dea7c99`. No archive format change, dependency installation change, migration architecture replacement or relaxation of verify/commit gates.

- Missing internal Acorn now yields `browser-parser-unavailable`; a parser-rejected source yields `consumer-source-syntax-invalid`. Both retain `HOST_BROWSER_PEER_UNPROVEN` and refuse recovery. Other source/read failures remain unproven. The settings task diagnostic shows an allowlisted explanation, without exposing parser messages or source content. Use the shipped assistant or the documented `--expose-internals` invocation.
- The existing three settings tabs, backup entry and five-step assistant remain. Surfaces are quieter; native semantic tokens, font inheritance, keyboard navigation and visible privacy/correctness notices remain. Buttons receive 140ms color feedback, tabs/details use 180ms entry transitions, and native step/state accents use finite 180ms local repaints. The completed active step uses a contrasting check mark.
- WPF recovery pages fade only when the page changes. Focus borders no longer change button content dimensions. Primary actions share the light/dark accent family across the independent helpers.
- Motion never changes a task phase, percentage, safety decision or window bounds. Native timers stop when settled, hidden, disposed, in high contrast or with client-area animation disabled. CSS honors reduced motion, including pseudo-elements. Indeterminate progress remains explicitly unknown.

## Technical comparison

Read-only research preceded Packer edits. References were pinned to actual source:

| Reference | Source/history examined | Decision |
|---|---|---|
| [xiaoyuyu6420/dsh-backup](https://github.com/xiaoyuyu6420/dsh-backup/tree/d03c840f9686b5c28002763898c31b34e21830b9) | `lib/paths.js`, `lib/oplock.js`, `lib/index.js`, `lib/zip.js`, `rescue/rescue.mjs`, `scripts/regression-review.mjs`; fixes [#139](https://github.com/xiaoyuyu6420/dsh-backup/pull/139), [#112](https://github.com/xiaoyuyu6420/dsh-backup/issues/112), [#119](https://github.com/xiaoyuyu6420/dsh-backup/issues/119), [#126](https://github.com/xiaoyuyu6420/dsh-backup/issues/126) | Retain Packer's existing path/identity checks, same-directory exclusive publication, kernel guard, bounded ZIP reader and strict proofs. Learn from concrete alias, lock-race and truncated-output regression cases; no recovery algorithm transplant. |
| [tagayamajin/dsh-backup-skill](https://github.com/tagayamajin/dsh-backup-skill/tree/519563746795ad5dfbcf69f00cc6b8a9ace827ff) | `backup-dsh.ps1`, `restore-dsh.ps1`, `fix-restored-dsh.ps1`, `verify-backup.ps1`, `make-kit.ps1` and commit history; repository issue history was empty at review | Offline dependency checks, modules-path repair and writer reappearance are valuable comparisons. Packer already reconstructs/rechecks the dependency closure and verifies isolated startup. Do not adopt arbitrary workspace creation, online-install fallback or source-config repair into the guarded flow. |

Both repositories use MIT licenses (copyright xiaoyuyu6420; dsh-backup contributors). No third-party implementation or substantial snippet was copied; existing vendored dependency notices remain applicable. Test concepts were independently implemented with synthetic data.

## Validation and limits

Targeted regressions cover browser peer/source proof, coverage and source fidelity, critical apply refusal, strict legacy recovery, Session framing, SQLite extension gates, paths, links, cancellation, cold safety, both UI palettes, long paths, keyboard focus and settled repaint behavior. The current synthetic recovery completed inspect → plan → apply → verify (two real isolated DSH starts and normal shutdown) → commit under Electron 44.7.0 / Node 24.21.0. A real version-conflict fixture still refuses before state/workspace creation.

Browser QA exercises the real settings bundle in a synthetic host at two widths, both themes, keyboard navigation, reduced motion and 150%/200% text scaling. Text scaling does not certify real Windows DPI. Native render tests do not replace human desktop review.

Private backup business recovery, the full real plugin combination, native Mnemon migration, cross-device/OS migration, power-loss behavior, real 150% DPI and screen-reader speech remain uncertified. No private archive was used as a restore fixture. A running formal DSH task must finish and DSH must exit normally before any official upgrade. Market status is tracked separately from GitHub publication; do not infer catalog availability from a Release.

Retain v0.6.3 packages and backups. See [upgrade/rollback](UPGRADE-ROLLBACK.md), [compatibility](COMPATIBILITY.md) and [runtime requirements](MIGRATION.md#runtime-requirement-for-browser-peer-proof).
