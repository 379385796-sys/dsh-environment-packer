// Builds a self-contained legacy (format-2) fixture for restore-view-test.ps1.
// The WPF controller test must never depend on a previous test run's leftovers
// or on the real user Profile: this script writes only under the explicit
// fixture directory and uses the product's own private-backup implementation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createPrivateBackup} from '../lib/private-backup.js';
import {readAsarVersion} from '../lib/collect.js';

const target = process.argv[2];
if (!target || !path.isAbsolute(target)) throw Error('ABSOLUTE_FIXTURE_DIR_REQUIRED');
// The compatibility header must be written by the same Desktop runtime that
// later inspects it (process.versions.modules/node), exactly like the product's
// own acceptance path. A plain Node fixture is rejected as INCOMPATIBLE_RUNTIME.
if (!process.versions.electron) throw Error('DESKTOP_RUNTIME_REQUIRED');
const root = path.resolve(target);
if (fs.existsSync(root)) throw Error('FIXTURE_DIR_EXISTS');
const home = path.join(root, 'source-home');
const profile = path.join(home, 'profiles', 'synthetic');
const version = readAsarVersion('D:/DeepSeek Harness/resources/app.asar');
assert.match(version, /^\d+\.\d+\.\d+/);
const write = (file, data) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, data); };

write(path.join(profile, 'package.json'), JSON.stringify({
  name: 'dsh-profile-synthetic',
  private: true,
  dependencies: {},
  dsh: {profile: {bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']}}
}, null, 2));
write(path.join(profile, 'cordis.yml'), '[]\n');
write(path.join(profile, 'cordis.patch.yml'), '[]\n');
write(path.join(profile, 'synthetic.txt'), 'SYNTHETIC_RESTORE_VIEW_FIXTURE');
for (const name of ['storages', 'sessions', 'attachments', 'memory', 'skills'])
  write(path.join(home, name, 'synthetic.json'), JSON.stringify({synthetic: true, name}));

const zip = path.join(root, 'restore-view-fixture.zip');
const backup = createPrivateBackup({homeDir: home, profileDir: profile, target: zip, dshVersion: version, confirmPrivate: true, sourceQuiescent: true});
const state = {zip, version, files: backup.files, bytes: backup.bytes, sourceHome: home, sourceProfile: profile, syntheticOnly: true, generatedBy: 'test/make-restore-fixture.mjs'};
write(path.join(root, 'fixture-state.json'), JSON.stringify(state, null, 2));
console.log(JSON.stringify({status: 'PASS', root, zip, files: backup.files, bytes: backup.bytes, version}));
