# Host peer dependency contract (0.4.3)

> **Historical / strict-channel document.** This describes the `dsh-private-recovery/2` and `/3` host-peer contract introduced in 0.4.3; it still applies to the strict channel unchanged. Current recovery/4 backups use the independent dependency re-evaluation described in [MIGRATION.md](MIGRATION.md). Current limits and independent /4 inspection: [BUILD-TEST.md](BUILD-TEST.md), [RESTORE.md](RESTORE.md).

Version 0.4.3 is published. The checks below describe the implemented contract; they do not certify every Profile or arbitrary plugin graph. See the [current compatibility scope](COMPATIBILITY.md).

The payload still contains installed Profile dependencies. An absent ordinary dependency is an error. Only a pure peer can be supplied by the Desktop installation; a dependency which is also declared as an ordinary dependency cannot use this exception. Installed peers take precedence and must satisfy their ranges. Missing optional peers are recorded; a present incompatible peer fails. Invalid metadata and non-semver peer ranges fail closed.

For `@deepseek-ai/dsh` and `@deepseek-ai/dsh-*` peers, range evaluation includes prereleases, matching the inspected `dsh-app-boot` compatibility policy. Other peers use npm semver's default prerelease policy. `engines.dsh` is checked separately. `workspace:` peer ranges are currently rejected rather than inferred from unrelated packages.

## Installation proof

The subprocess is the current executable, not a Profile-provided path. It requires Windows Electron Desktop and derives `resources/app.asar/dsh` from that executable. It imports only the installation's `dsh-app-boot` metadata API and calls `createRuntimeResolution({installAnchor})`. It does not call `loadProfile` or `loadProfileDirectory`: these can normalize a Profile. It never imports a Profile plugin or executes its lifecycle scripts.

Accepted providers must occur exactly once in the installation-scoped table, have matching package names and versions, and have package/declarer paths inside the installation archive. Directory existence alone, NODE_PATH and a package found elsewhere on disk are insufficient. The proof records the provider manifest SHA-256 and relative source/declarer paths; Desktop and DSH versions must agree with the job. It also pins the executable, the entire physical app.asar, and all files/directories in app.asar.unpacked, including native files. Hashing uses Electron's original-fs for the physical archive. Reparse points are refused. Stable file identities, size, mtime and ctime are checked across reads; complete host fingerprints are repeated around metadata discovery.

Each provider's declared Node, Electron and DSH engines, OS and CPU allow/deny lists must also match the actual process. Malformed or unsupported constraints fail closed. These normalized requirements are recorded alongside the manifest hash. Arbitrary peer-version declarations do not replace an installation or runtime proof.

This deliberately requires the same executable/archive/unpacked bytes at restoration, in addition to matching platform, architecture, exact Node version, ABI, Electron and DSH version. Same displayed version alone is insufficient. No runtime binaries are copied into the ZIP and no substitute runtime is downloaded. This is a local compatibility proof, not a publisher signature or a defense against a malicious administrator.

## Browser seeds are a separate realm

The Desktop frontend supplies React, React DOM, client-store, ui-slots and ui-primitives through its `staticModules` contract. These are not Node installation packages. Mere presence still cannot satisfy a peer. Browser admission additionally checks:

- The actual frontend entry's static-module table binds the requested name. DSH client modules use the frontend package's **exact** published build-dependency version, not a guessed frontend release number or a loose version range.
- React versions are traced from the seed binding to their bundled factory. React DOM's stable renderer package version is checked against its exported internal build tag and the frontend dependency range; an unrelated version literal is insufficient.
- The consumer declares a web client and has the corresponding registered bundle. Its normal Host entry and relative module graph are read without execution; a Node import of the peer, unknown dynamic Host resolution, unavailable browser subpath or unverifiable client fails closed. Testing/SDK exports are not invented startup roots. Lexical constant module names are resolved; Profile code is never evaluated by the check.
- The peer range is still checked. The binding records the client hash, observed browser requests and Host-source graph hashes. Restore recomputes this evidence from the verified ZIP, before staging. The executable, entire ASAR, unpacked files, runtime and frontend source/manifest hashes remain pinned.

This reuses the JavaScript parser bundled in the exact Node runtime (`--expose-internals`, already required by the Desktop CLI workflow); it adds no npm runtime dependency. Browser-only proofs use `dsh-desktop-asar/2` inside recovery/3. Existing installation-only proofs keep `/1` and retain their validation behavior. Older readers which do not understand the new proof reject it. A browser seed never makes an absent Node optional peer present: that absence is recorded under Node's optional semantics. No global peer-skip switch exists.

## Backup and restore

The helper keeps source leases and all existing exit, writer, consistency, ZIP, no-overwrite and commit gates. Dependency results are saved in the task's dependency-check.json. The read-only `precheckPrivateSource` API inventories metadata and validates local tgz archives without starting a task, changing a lock or opening chat/credential payload contents; it is observational and is not a cold-backup approval.

The background writer monitor recognizes only its own read-only host probe. Before spawning it, the Worker durably records a random nonce, exact base64 request and script hash in the task directory. Admission requires the active protocol-2 token, the owning coordinator's exact PID/birth identity, executable and full command, a direct child with the exact probe command and executable, matching request/nonce/script hash, and a creation time after the owner. Windows' trailing command whitespace is normalized, with no extra arguments admitted. The child additionally registers its exact .NET start ticks and CIM start ticks before lengthy reads; their precision must agree within the known sub-microsecond truncation. A partial or departed-child CIM row needs this bound receipt, exact CIM birth, and either a matching current .NET birth or proven process departure. A reused PID with a different birth cannot use the receipt. Invalid or unreadable evidence gets no exemption. A foreign process running the same script still blocks. Probe records and writer identity diagnostics are retained. Native tests inject foreign parents, nonce/script mismatch and parent birth reuse, while a separate test process supplies partial/stale CIM snapshots and changed child birth identities. The product has no snapshot injection switch.

A backup using installation peers writes `dsh-private-recovery/3`, hostRequirements and exact consumer peer bindings. Older recovery/2 readers reject this format. Archives without host peers keep recovery/2. The trusted restore package validates ZIP contents, runtime, host fingerprints, package metadata, every peer range and the exact set of provider bindings before creating staging. It rechecks the host before final atomic commit. Deleting proof, changing a binding, downgrading a format, changing provider bytes, or using an ordinary Node executable cannot silently satisfy the contract. Use the complete trusted 0.4.3 package, including assets and vendor/semver; copying restore-private.cjs alone is insufficient.

Read-only host probes can take tens of seconds because they fingerprint native unpacked files. They have a 120-second process timeout. Cancellation retains the cold-task gates; a bounded read-only probe may outlive its terminated Worker briefly, and normal writer/process detection remains conservative. Updating the runtime after a successful check is a separate event: recheck compatibility before launching a restored Profile. A restore cannot promise future runtime immutability.

## References and limits

This is a declaration and bounded startup-graph compatibility check, not a proof of arbitrary program behavior or every possible plugin interaction. Packer's server uses Node builtins plus bundled js-yaml and semver; its existing browser bundle obtains React from the DSH browser platform and injects the settings domain. An absent npm peer declaration is not evidence that arbitrary client code has no host requirements. Business and browser startup validation remain separate acceptance steps. No third-party package declarations are rewritten to make the check pass.

- npm peer contract: https://docs.npmjs.com/cli/v9/configuring-npm/package-json/#peerdependencies
- npm semver range/prerelease semantics: https://github.com/npm/node-semver#prerelease-tags
- Node caller-relative resolution: https://nodejs.org/api/modules.html#loading-from-node_modules-folders
- Electron physical archive filesystem: https://www.electronjs.org/docs/latest/tutorial/asar-archives#treating-an-asar-archive-as-a-normal-file

Acceptance must distinguish installation-peer support, browser-seed proof and per-consumer admission failures, historical task recovery, and restored business operation. No other plugin metadata is rewritten to make the check pass.
