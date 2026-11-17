// One declarative regression manifest. Every formal entry, whether it needs DSH
// fully closed, and its real timeout live here; run-regressions.mjs and the
// manifest consistency test read the same table so they cannot drift apart.
export const nodeEntries = [
  {file: 'v070-browser-diagnostics.cjs'},
  {file: 'run-tests.mjs'},
  {file: 'host-test.mjs'},
  {file: 'target-path-test.mjs'},
  {file: 'cold-target-path-test.mjs'},
  {file: 'dialog-test.mjs'},
  {file: 'client-bundle-test.mjs'},
  {file: 'ui-overview-test.mjs'},
  {file: 'route-export-test.mjs'},
  {file: 'recovery-route-test.mjs'},
  {file: 'tgz-test.mjs'},
  {file: 'read-failure-test.mjs'},
  {file: 'pack-test.mjs'},
  {file: 'smoke-test.mjs'},
  {file: 'cold-safety-test.mjs'},
  {file: 'dotnet-zip-test.mjs'},
  {file: 'cold-recovery-test.mjs'},
  {file: 'cold-retention-test.mjs'},
  {file: 'legacy-recovery-test.mjs'},
  {file: 'cold-component-test.mjs'},
  {file: 'cold-native-test.mjs', requiresDshClosed: true, timeoutMs: 600000},
  {file: 'cold-migration-native.mjs', requiresDshClosed: true, timeoutMs: 600000},
  {file: 'host-peer-test.mjs', args: ['--expose-internals']},
  {file: 'host-probe-native-test.mjs', requiresDshClosed: true, timeoutMs: 360000},
  {file: 'host-probe-cim-test.mjs', requiresDshClosed: true, timeoutMs: 360000},
  {file: 'migration-dependency-gate.cjs'},
  {file: 'v062-coverage-chain.cjs'},
  {file: 'v062-apply-gate.cjs'},
  {file: 'v062-clean-path.cjs'},
  {file: 'v062-preference-restore.cjs'},
  {file: 'v063-source-coverage.cjs'},
  {file: 'v063-clean-path.cjs'},
  {file: 'v073-plugin-home.cjs'},
  {file: 'v074-inode-precision.cjs'},
  {file: 'v074-chat-import-home.cjs'},
  {file: 'v074-ps1-encoding.cjs'},
  {file: 'v075-regression-manifest.mjs'},
  {file: 'v075-storage-ownership.cjs'}
];
export const psEntries = [
  {file: 'legacy-proof-test.ps1', testRoot: true},
  {file: 'parse-save-as.ps1'},
  {file: 'cold-view-test.ps1', testRoot: true},
  {file: 'v070-motion-test.ps1', testRoot: true},
  {file: 'appearance-controls-test.ps1', testRoot: true},
  {file: 'cold-paint-log-test.ps1', testRoot: true},
  {file: 'final-layout-test.ps1', testRoot: true},
  {file: 'result-state-test.ps1', testRoot: true},
  {file: 'restore-view-test.ps1', testRoot: true}
];
// Deliberately not formal regression entries. The reason is part of the
// manifest so a file cannot disappear from the suite silently.
export const classifiedUtilities = {
  'make-restore-fixture.mjs': 'fixture builder invoked by restore-view-test.ps1 inside its own fresh directory',
  'regression-manifest.mjs': 'manifest table imported by run-regressions.mjs and its consistency test',
  'cold-read-faults.mjs': 'covered by read-failure-test compatibility entry',
  'private-acceptance-test.mjs': 'covered by pack-test compatibility entry',
  'hold-exclusive.ps1': 'helper that holds a file handle for another test',
  'host-probe-snapshot.ps1': 'helper invoked inside host-probe-cim-test.mjs',
  'verify-zip.ps1': 'manual standalone ZIP verifier',
  'migration-wpf.ps1': 'supplemental UI check; consumes migration-smoke-result.json from a separate migration-smoke run'
};
export const testArtifacts = names => names.filter(n => /\.(?:mjs|ps1)$/.test(n) && n !== 'run-regressions.mjs');
export const registeredFiles = [...nodeEntries, ...psEntries].map(e => e.file);
export const requiresDshClosed = [...nodeEntries, ...psEntries].filter(e => e.requiresDshClosed === true).map(e => e.file);
export function auditManifest(availableFiles) {
  const errors = [];
  const duplicates = registeredFiles.filter((name, index) => registeredFiles.indexOf(name) !== index);
  if (duplicates.length) errors.push({code: 'DUPLICATE_TEST_ENTRY', detail: [...new Set(duplicates)]});
  const missing = registeredFiles.filter(name => !availableFiles.includes(name));
  if (missing.length) errors.push({code: 'MISSING_TEST_ENTRY', detail: missing});
  const unclassified = testArtifacts(availableFiles).filter(name => !registeredFiles.includes(name) && !classifiedUtilities[name]);
  if (unclassified.length) errors.push({code: 'UNCLASSIFIED_TEST_ENTRY', detail: unclassified});
  return errors;
}
