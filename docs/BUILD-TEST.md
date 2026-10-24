# Build and test

No runtime npm dependency installation is needed: js-yaml is vendored with its original license. There are no install hooks or downloaded executables. Build the local package with npm pack --ignore-scripts --pack-destination <OUTPUT_DIRECTORY>; keep its SHA-256 alongside it. private:true intentionally prevents npm publish, not GitHub tgz installation.

Use Windows and the matching DSH runtime for recovery tests. Set TEMP/TMP and DSH_PACKER_TEST_ROOT to an explicit scratch directory of your choice before running tests/smoke.mjs. It creates only synthetic files. It never discovers a real Profile automatically. A system Node with a different ABI is not a substitute for testing the DSH host.

The smoke test covers a synthetic ZIP, safe export, private confirmation, new-home restoration, hashes, callback/no-callback counts and no overwrite. Separate local acceptance also covered actual desktop Save As, three-plugin host startup/restart, ZIP corruption/traversal/links/cycles, missing dependencies, permission errors and hard process interruption. Private acceptance logs and fixtures are not part of this public repository. Do not interpret the smaller public smoke suite as all of those desktop tests.

Public packaging adds documentation/license metadata; functional JS/CJS/MJS/PowerShell/SVG/locale/bundle resources match the validated 0.4.1 candidate. Private candidate archives and public Release archives can therefore have different SHA-256 values despite the same functional version. Always verify the checksum for the exact artifact you install.
