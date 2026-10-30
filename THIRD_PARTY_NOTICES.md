# Third-party notices and scope of grant

The root MIT grant covers the maintainer-controlled copyrightable contributions in this repository. It is not a representation of exclusive authorship of every line, does not create rights in third-party material, and does not replace the notices below. See [source provenance](docs/PROVENANCE.md) for historical limits.

## js-yaml 4.3.2

- File: vendor/js-yaml.mjs, byte-identical to package/dist/js-yaml.mjs in the official npm js-yaml 4.3.2 archive.
- Copyright (C) 2011-2015 by Vitaly Puzrin.
- License: MIT. Original full notice: [vendor/js-yaml.LICENSE](vendor/js-yaml.LICENSE). Keep it when redistributing the vendor file.
- Source: https://github.com/nodeca/js-yaml ; fixed npm artifact: https://registry.npmjs.org/js-yaml/-/js-yaml-4.3.2.tgz .

## semver 7.8.5

- Directory: vendor/semver, copied byte-for-byte from the existing npm distribution's semver 7.8.5 package; no installation or lifecycle scripts are run.
- License: ISC. Original full notice: vendor/semver/LICENSE.
- Source: https://github.com/npm/node-semver . Used for peer ranges, including DSH's explicit prerelease policy. This is bundled JavaScript, not a new runtime installation dependency.

## Technical references, not claimed as bundled source

KLRSL/dsh-packer (reviewed commit 709b94747413683d717f930b424b395d6d749667, MIT) was reviewed as a related project. A local offline-pack architecture was also a technical reference. The reviewed current business modules did not show identifiable copied business-source blocks in the bounded comparison. Similar ZIP, CRC32, tar and Node/WinForms API patterns alone are not evidence of derivation. This is not a claim that all possible sources were searched or historical authorship was proved.

Node.js, Electron, Windows, PowerShell, WinForms and DSH are external runtimes/platforms; they are not redistributed by this package. No native executable, DLL, .node binary, runtime installer or model is included.
