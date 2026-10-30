import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TargetDirectoryError,
  defaultDirectory,
  resolveTarget,
  safeDefaultName,
} from '../lib/target.js';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-packer-target-'));

function throwsCode(fn, code) {
  let caught;
  try { fn(); } catch (error) { caught = error; }
  assert.ok(caught, `expected ${code}`);
  assert.equal(caught.code, code);
  assert.ok(caught instanceof TargetDirectoryError, 'should be a TargetDirectoryError');
}

// --- safeDefaultName -------------------------------------------------------
assert.match(safeDefaultName(''), /^dsh-environment-\d{8}-\d{6}\.zip$/);
assert.equal(safeDefaultName('recovery'), 'recovery.zip');
assert.equal(safeDefaultName('recovery.ZIP'), 'recovery.ZIP');
// Traversal and separators collapse to a single file name.
assert.equal(safeDefaultName('..\\..\\evil.zip'), 'evil.zip');
assert.equal(safeDefaultName('a/b/c.zip'), 'c.zip');
assert.equal(safeDefaultName('C:\\temp\\out.zip'), 'out.zip');
assert.equal(safeDefaultName('bad:name?.zip'), 'bad_name_.zip');
assert.equal(safeDefaultName('.').endsWith('.zip'), true);
assert.equal(safeDefaultName('x'.repeat(400)).length, 120);

// --- defaultDirectory ------------------------------------------------------
const fallback = defaultDirectory();
assert.equal(path.isAbsolute(fallback), true);
assert.equal(fs.statSync(fallback).isDirectory(), true);

// --- resolveTarget ---------------------------------------------------------
assert.equal(
  resolveTarget({ directory: scratch, fileName: 'out' }),
  path.join(scratch, 'out.zip'),
);
// Quoted paths (pasted from Explorer's "Copy as path") are accepted.
assert.equal(
  resolveTarget({ directory: `"${scratch}"`, fileName: 'quoted.zip' }),
  path.join(scratch, 'quoted.zip'),
);
throwsCode(() => resolveTarget({}), 'TARGET_DIRECTORY_REQUIRED');
throwsCode(() => resolveTarget({ directory: '   ' }), 'TARGET_DIRECTORY_REQUIRED');
throwsCode(() => resolveTarget({ directory: 'relative\\dir' }), 'TARGET_DIRECTORY_NOT_ABSOLUTE');
throwsCode(() => resolveTarget({ directory: path.join(scratch, 'missing') }), 'TARGET_DIRECTORY_MISSING');
const fileAsDirectory = path.join(scratch, 'not-a-folder.txt');
fs.writeFileSync(fileAsDirectory, 'x');
throwsCode(() => resolveTarget({ directory: fileAsDirectory }), 'TARGET_DIRECTORY_NOT_FOLDER');

// --- real commit through the unchanged safety layer ------------------------
const { inspectTarget, writeZipAtomic, TargetExistsError } = await import('../lib/write.js');
const payload = Buffer.from('PK\u0003\u0004fake-zip-body', 'utf8');
const target = resolveTarget({ directory: scratch, fileName: 'archive' });
const info = inspectTarget(target);
assert.equal(info.exists, false);
const written = writeZipAtomic(target, payload, {
  parentReal: info.parentReal,
  parentDev: info.parentDev,
  parentIno: info.parentIno,
});
assert.equal(written.bytes, payload.length);
assert.equal(fs.readFileSync(target, 'utf8'), payload.toString('utf8'));
assert.equal(written.cleanup.tempRemoved, true);
assert.equal(fs.readdirSync(scratch).filter((name) => name.endsWith('.tmp')).length, 0);

// A second export to the same name must refuse instead of overwriting.
let second;
try { writeZipAtomic(target, Buffer.from('other'), null); } catch (error) { second = error; }
assert.ok(second instanceof TargetExistsError, 'second write must be refused');
assert.equal(fs.readFileSync(target, 'utf8'), payload.toString('utf8'));

fs.rmSync(scratch, { recursive: true, force: true });
console.log('PASS: target path resolution + no-overwrite commit');
