// Proves the regression manifest is complete and still guards itself: every
// test artifact is either registered or explicitly classified, every registered
// entry exists, and a new or deleted file is reported by code, not ignored.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {nodeEntries, psEntries, registeredFiles, requiresDshClosed, classifiedUtilities, auditManifest, testArtifacts} from './regression-manifest.mjs';

const dir = import.meta.dirname;
const files = fs.readdirSync(dir);
assert.deepEqual(auditManifest(files), [], 'real test directory must have no manifest drift');

for (const file of ['cold-retention-test.mjs', 'cold-target-path-test.mjs', 'cold-migration-native.mjs'])
  assert(registeredFiles.includes(file), `previously unregistered test must be formal: ${file}`);
for (const file of ['cold-native-test.mjs', 'cold-migration-native.mjs', 'host-probe-native-test.mjs', 'host-probe-cim-test.mjs'])
  assert(requiresDshClosed.includes(file), `Desktop-dependent test must declare its shutdown requirement: ${file}`);
for (const entry of [...nodeEntries, ...psEntries]) {
  assert(fs.existsSync(path.join(dir, entry.file)), `registered entry exists: ${entry.file}`);
  if (entry.requiresDshClosed) assert.equal(Number.isInteger(entry.timeoutMs) && entry.timeoutMs >= 60000, true, `closed-Desktop entry needs a real timeout: ${entry.file}`);
}
for (const [name, reason] of Object.entries(classifiedUtilities)) {
  assert(fs.existsSync(path.join(dir, name)), `classified utility exists: ${name}`);
  assert.equal(typeof reason === 'string' && reason.length > 10, true, `classified utility states a reason: ${name}`);
  assert(!registeredFiles.includes(name), `a file is either formal or a utility, not both: ${name}`);
}

const extra = auditManifest([...files, 'v999-not-registered.mjs']);
assert.deepEqual(extra.map(e => e.code), ['UNCLASSIFIED_TEST_ENTRY'], 'a new test file must be refused');
assert.deepEqual(extra[0].detail, ['v999-not-registered.mjs']);
const dropped = auditManifest(files.filter(name => name !== 'cold-retention-test.mjs'));
assert.deepEqual(dropped.map(e => e.code), ['MISSING_TEST_ENTRY'], 'a vanished formal test must be refused');
assert.deepEqual(dropped[0].detail, ['cold-retention-test.mjs']);
assert.deepEqual(testArtifacts(['run-regressions.mjs', 'a.mjs', 'b.ps1', 'c.cjs']).sort(), ['a.mjs', 'b.ps1'], 'the runner itself is not an entry');

// The advertised plugin version must come from package.json, not a stale literal.
const root = path.resolve(dir, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const indexSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
assert(indexSource.includes('version: VERSION'), 'defaults must report the package version');
assert(!/version: '0\./.test(indexSource), 'no hardcoded version literal in index.js');
assert(clientSource.includes(`defaults?.version||'${pkg.version}'`), `client fallback must match ${pkg.version}`);
console.log(JSON.stringify({status: 'PASS', formalEntries: registeredFiles.length, nodeEntries: nodeEntries.length, powerShellEntries: psEntries.length, requiresDshClosed, classifiedUtilities: Object.keys(classifiedUtilities).length, checks: 8}));
