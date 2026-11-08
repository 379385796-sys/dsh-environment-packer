# Build and test

> **Current source: v0.6.3.** The `0.5.0` and v0.6.2 sections below are historical build records for those releases; the same isolated-workspace rules apply. The v0.6.3 section is at the end. Historical artefact hashes are deliberately kept unchanged.

No runtime dependency installation or install hooks are required. Use Windows PowerShell 5.1, Node, and the matching DSH Electron runtime. Explicitly set DSH_PACKER_TEST_ROOT, TEMP, TMP and npm_config_cache to directories in the authorized workspace. The pnpm store must also be explicit if pnpm is used; these tests do not install dependencies.

The disaster-recovery first-round changes extend `test/private-acceptance-test.mjs` and register `test/restore-view-test.ps1` in the existing regression manifest. For targeted checks, run private acceptance using the matching Desktop executable in process-local `ELECTRON_RUN_AS_NODE=1` mode with `--expose-internals`, then run the restore view test with the same `DSH_PACKER_TEST_ROOT`. The private acceptance fixture writes `acceptance-state.json`; the native controller test reuses that synthetic ZIP. It drives the real WPF handlers/worker protocol in an invisible component window, not the user's Desktop or a real private ZIP. Actual format-3 host-proof and fresh-home recovery are exercised under Electron; a standalone Node run retains legacy format-2 coverage and cannot authorize the assistant's Desktop restoration. Restore view tests do not establish human GUI or restored DSH business acceptance.

The remaining focused regressions are `cold-read-faults.mjs`, `host-peer-test.mjs`, `cold-target-path-test.mjs`, `cold-safety-test.mjs` and `dotnet-zip-test.mjs`. Do not run the full native cold-task lifecycle merely to check these independent helpers; completed real Desktop cold backup, helper interaction, restored-home startup/restart and joint validation are documented in COMPATIBILITY.md.

Also set process-local PSModuleAnalysisCachePath and NODE_COMPILE_CACHE to workspace cache locations before launching test tools. The helper's minimal environment forwards these two supported cache destinations when supplied; it does not change global environment variables or impose a product-specific absolute path. Codex/Windows application-managed startup state is not a guarantee of zero internal writes on the system drive.

Run node test/run-regressions.mjs from the source checkout. Its manifest enumerates the Node and PowerShell entries, logs each exit code/stdout/stderr, classifies manual utilities, and serializes full-suite runs with a kernel guard. Set DSH_PACKER_EVIDENCE_DIR to the current acceptance evidence directory. The inherited read-failure-test and pack-test entries call current cold-backup fixtures with mandatory confirmations. No test disables safety detection to pass. Real Profile utilities are not automatic regression tests. Native cold-task lifecycle tests require all real DSH processes to exit normally; do not bypass this requirement. The partial/stale CIM test substitutes a snapshot only inside a separate test PowerShell process; the product has no mock switch.

The manifest covers cold backup/restore, source read errors, ZIP and .NET validation, tar long paths, safe configuration export, HTTP origin/ownership/busy guards, client interactions, kernel leases, PID birth/reuse, corruption, simultaneous recovery, stale UI confirmations, guard bridge failure, native cold-task lifecycle, peer-dependency pre-write failure/retry, timeout and cancellation. Legacy proof tests include real Windows boot queries with synthetic preboot file ages and separate mocked-provider cases for Fast Startup, hibernate, unknown schemas, clock rollback and late job initialization. Test mocks are confined to test processes; no product force flags exist.

CIM queries and NTFS hard-link commits need ordinary Windows filesystem/query permissions; a tool sandbox may deny them. Run authorized synthetic tests with suitable tool permissions, rather than weaken product checks. Native process tests terminate only their own exact synthetic task identities and do not substitute for actual GUI operations.

Human GUI acceptance is separate: page -> native Save As -> private confirmation -> acknowledged assistant -> normal exit -> assistant confirmation -> source leases -> verified ZIP. Verify that ZIP independently, restore into a fresh compatible synthetic home, start actual DSH host business plugins, gracefully shut down and restart. Record the tested code snapshot and any later byte deltas. No real private Profile is a destructive fixture.

Build with npm pack --ignore-scripts --json --pack-destination <workspace-output> and explicit npm cache. Audit actual tar entries and unpacked bytes, source test hashes, licenses, private path/secret patterns and the exact SHA-256. Keep previous candidates separately. private:true remains set; never deploy, push or publish as part of the build.

Production acceptance remains distinct: the actual historical lock may still lack post-failure full-boot proof; historical stderr cannot be recreated retroactively. HOST-PEERS.md describes the installation proof and unresolved browser-seed version/realm requirements. Power loss, kernel hangs, all diagnostics simultaneously unwritable, network volumes, malicious same-user replay and full real business recovery remain outside the synthetic acceptance claim. The host-peer unit entry covers range, source/realm, shadowing and format cases; native cold tests include an actual installation-peer success. Independent artifact acceptance must also exercise recovery/3 restoration and DSH business startup.

The recovery view now uses Windows .NET Framework WPF with a bundled XAML resource; the cold-backup assistant keeps its accepted WinForms implementation. The existing restore-view test covers navigation, input invalidation, private consent, fresh targets, busy close refusal, 1020x860/720x600 layouts, child exit/result consistency and a presentation fault after process start. The original Node recovery core remains authoritative. Rasterization at 96/144/192 DPI is component evidence; distinguish it from a user-provided screenshot and live keyboard/resize/error acceptance. Per-monitor DPI transitions remain a separate manual check.

Build the console-free managed launcher from the shipped C# source/manifest using bin/build-restore-launcher.ps1 under Windows PowerShell 5.1 and its installed .NET Framework compiler. Set TEMP/TMP and PSModuleAnalysisCachePath before compiling. Audit the generated PE as a Windows GUI/x64 managed assembly, retain its source/build hashes, and include it with the XAML and original Node core. The launcher hosts a local STA runspace only; it does not change user/machine policy. No PowerShell console subprocess is created.

## Immutable release artifact

The v0.5.0 Release retains the exact accepted and installed tgz (SHA-256 `b301efa06bcb2b589e382c5a7c20ee07292e9899b4f34a452e1fd6faac84db11`). Public README, screenshots and release documentation were finalized afterwards; they are not a newly repacked same-version artifact. Executable resources, launcher, manifest and vendor bytes match the accepted package. A future npm pack from this documentation commit will therefore not reproduce the accepted tgz. Do not replace the released artifact with that output.

## v0.6.0 release artifact

The runtime code is pinned to ae441043444491c2bfb1e0b67cafc5da453bb1fc. The user approved a documentation-only repackage for the final 0.6.0 README/links. All 132 non-document package files remain byte-identical to the accepted candidate; no functional executable was recompiled. Exact published attachment hashes are recorded in RELEASE-0.6.0.md and GitHub Release. Source documentation can evolve after artifact acceptance; do not silently replace an already released same-version archive.

## v0.6.1 release

Release-prep UI pass adds: explicit dark-theme foregrounds for header actions, copy buttons, log text and disabled controls; blue focus borders for path fields; content-fitted window height; a separate amber recovery-compatibility strip on success; and DWM caption/border color matching where Windows supports it. `result-state-test.ps1` covers 12 checks including light/dark contrast for these controls. Real 150% DPI remains unverified; the test uses 15.75pt/560px simulation and records `real150DPITested=false`.

Baseline is the published v0.6.0 tree. The four targeted fixes are covered by:

- `test/migration-dependency-gate.cjs` — synthetic rewind/schemastery peer conflict; recovery/4 archive succeeds and records the conflict; restore compatibility is still blocked; recovery/2+3 still refuse before writing; malformed metadata still fails.
- `test/cold-view-test.ps1`, `test/appearance-controls-test.ps1`, `test/final-layout-test.ps1`, `test/cold-paint-log-test.ps1` — theme, compact layout, copy/result controls, DPI/font extremes, keyboard/tab and accessibility contracts.
- `test/ui-overview-test.mjs` — persisted success/failure/cancel/unknown result records, terminal-only success, and no upgrade to success without a verified terminal record.
- `test/migration-smoke.cjs` and the existing recovery/2+3 focused entries — old strict-restore behavior remains unchanged.

Build the release with `npm pack --ignore-scripts --json` into a separate candidate directory, then assemble the standalone toolkit from the package plus `Open-Recovery.ps1`, `READ-FIRST.txt` and `TOOLKIT-FILES.sha256`. Record exact SHA-256 values in the release assets. The accepted artifact was installed into the formal profile and a formal recovery/4 backup was generated with the known rewind/schemastery conflict recorded; no restore was executed.

## v0.6.2 build, limits and targeted tests

**Capacity limits (current implementation, `assets/recovery-core.cjs` / `assets/migration-plan.cjs`)**：

| Limit | Value | Behaviour |
|---|---|---|
| `MAX_FILE` | 128 MiB per file | `SOURCE_TYPE_OR_SIZE` / `ARCHIVE_LIMIT` before publish |
| `MAX_TOTAL` | 2 GiB total payload | `ARCHIVE_LIMIT` before publish |
| `MAX_ENTRIES` | 60,000 files + directories | `ARCHIVE_LIMIT` before publish; keep headroom for `manifest.json` and directories |
| Restore space budget | `payloadBytes × 3 + 128 MiB` | `INSUFFICIENT_SPACE` precheck; a **budget**, not actual staged residue |

Limits fail explicitly; no silent trimming. `C.ZipWriter` writes stored (uncompressed) entries with strict name/CRC/central-directory checks; ZIP64, compressed and otherwise unsupported layouts are refused.

**New targeted tests**（全部在 `DSH_PACKER_TEST_ROOT` 隔离合成目录；进程级 TEMP/TMP 与缓存也指向工作区）：

- `test/v062-coverage-chain.cjs` — 偏好缺字段/合法值/未安装 comfort/非法字段闭环；真实 /4 ZIP 与有界摘要；改写清单不能伪造干净采集；五类结果层语义；`normalizeCoverage` 限长与脱敏；`migration-cli.cjs inspect` 规范 /4 检查与损坏归档拒绝。
- `test/v062-apply-gate.cjs` — 合成宿主证据下 critical unknown 使 `canApply=false`，`apply` 在写入 state/workspace 前拒绝；干净载荷仍 `canApply=true`。
- `test/v062-clean-path.cjs` — 干净载荷完整 `apply → verify`（两轮真实隔离运行时）`→ commit`，不执行回滚。
- 扩展 `test/result-state-test.ps1`、`test/client-bundle-test.mjs`、`test/ui-overview-test.mjs`：四种终态的持久化失败提示、「归档完成；恢复受阻」、旧记录 unknown、非法采集提示。
- 既有定向回归：`migration-dependency-gate.cjs`、`legacy-strict-restore.cjs`、`migration-smoke.cjs`、`cold-view-test.ps1`、`appearance-controls-test.ps1`、`final-layout-test.ps1`、`cold-paint-log-test.ps1`、`run-tests.mjs`、`route-export-test.mjs`、`recovery-route-test.mjs`、`tgz-test.mjs`。

`run-regressions.mjs` 的 manifest 已登记三个新的 `.cjs` 入口。**不重跑整库**；本版不扩展运行时认证。`private-acceptance-test.mjs`（及 `pack-test.mjs`、`restore-view-test.ps1`）在 Node 22.22.2 下崩溃、基线同样复现，属既有环境限制；`migration-smoke.cjs` 的回滚在有运行中正式 DSH 写入者时按设计门禁阻止。真实 DPI、屏幕阅读器与跨设备业务认证继续显式待证。

**发布产物冻结**：候选 TGZ 与独立工具 ZIP 的 `package/` 内容必须与最终 tag 中应一致文件逐字节相同；允许的生成文件（`Open-Recovery.ps1`、`READ-FIRST.txt`、`TOOLKIT-FILES.sha256`、`SHA256SUMS.txt` 与 `.sha256`）另附清单。README、下载链接、版本号与「归档完成；恢复受阻」说明不得落后于代码。冻结一次候选并记录哈希后再发布，不在已发布版本名下替换附件。

## v0.6.3 build, classification tests and limits

Baseline: tag `v0.6.2` (`e4acfd6a8d14cb2efe7c4741c8d668ed305f1c6f`), isolated Git worktree. Node used for these targeted runs: v22.22.2 (x64). Codex final acceptance additionally ran test/v063-clean-path.cjs under the trusted installed DSH Electron Node with --expose-internals. Both isolated runtime rounds and commit passed.

**Capacity limits are unchanged**: 128 MiB per file, 2 GiB total payload, 60,000 files + directories (`manifest.json` and directory headroom included), restore budget `payloadBytes × 3 + 128 MiB`. A per-tree entry/link/type failure becomes `LOCAL_SOURCE_TREE_INCOMPLETE`; whole-archive limits still fail explicitly, and no silent trimming occurs.

**New targeted test**：

- `test/v063-source-coverage.cjs` — 23 checks: `plugins-local` source capture with `node_modules` excluded; explicit `captured-local-plugin-source` classification; unrelated unknown Home entry still critical; `.bak` with and without its live file; clean coverage summary; deterministic Home-relative restore mapping; staged file/byte/digest; changed/missing staged tree refusal; manifest count tamper refusal; pre-0.6.3 archive without `sourceTrees` still readable; real `apply` staging and `verify` `SOURCE_TREE_CHANGED` gate (synthetic host evidence, no DSH start).

**Extended targeted test**：

- `test/migration-dependency-gate.cjs` — additionally asserts the recorded peer identity is exact (`dsh-rewind-plugin`, `@deepseek-ai/schemastery`, `^3.19.0`, `3.18.5`), contains no `@//` rewrite, and that restore re-analysis keeps the conflict `blocked/critical` (`hasUnresolvedCritical === true`).

**Regression subset actually run**：

| Entry | Result |
|---|---|
| `test/v063-source-coverage.cjs` | PASS 18 |
| `test/migration-dependency-gate.cjs` | PASS |
| `test/v062-coverage-chain.cjs` | PASS 15 |
| `test/v062-apply-gate.cjs` | PASS 6 |
| `test/client-bundle-test.mjs` | PASS |
| `test/ui-overview-test.mjs` | PASS |

All test roots, ZIPs and staged state were under DSH_PACKER_TEST_ROOT. Final acceptance added inspect → plan → apply → verify (two real isolated runtime rounds) → commit with an inert plugin entry that throws if activated, plus historical data preservation outside Home. No formal recovery was performed.

**Candidate build**：`npm pack --ignore-scripts --json` into `candidate/v0.6.3/`, then assemble the standalone toolkit from the TGZ plus `Open-Recovery.ps1`, `READ-FIRST.txt` and `TOOLKIT-FILES.sha256`. `package/` content must match the candidate commit byte for byte; generated toolkit files are listed separately. Record SHA-256 values in `SHA256SUMS.txt`; do not embed the artifact's own hash inside itself. No formal install, GitHub Release, Market update, private ZIP overwrite or production restore is part of this build.


## v0.7.0 focused validation

Set process TEMP/TMP, npm cache, pnpm store, browser profile and DSH_PACKER_TEST_ROOT explicitly in the D: workspace. Added `test/v070-browser-diagnostics.cjs` (seven positive/negative parser/source/read cases) and `test/v070-motion-test.ps1` (settled repaint, reduced motion, both palettes/eight states, bounds). `test/v070-legacy-runtime.cjs` generates an exact-DSH-ABI /2 fixture for WPF integration; set `DSH_PACKER_LEGACY_FIXTURE=wpf-legacy-state.json` when invoking restore-view-test.ps1. A standalone Node /2 fixture must continue to fail on a different Node ABI. The 43-case standalone legacy suite and exact-runtime WPF integration are distinct checks.

Browser QA uses an independent synthetic host and fresh D: Edge profile. Text scaling is not OS DPI certification. Full synthetic /4 verification uses the trusted installed Electron Node with --expose-internals; formal tasks and private archives are excluded.
