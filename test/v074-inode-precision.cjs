'use strict';
// v0.7.4 targeted validation: directory identities that decide whether the walk
// re-entered an ancestor are read from bigint stats. NTFS file ids exceed 2^53,
// where a Number stops being lossless, so two neighbouring ids can read as one
// value and a healthy tree is reported as PACKAGE_LINK_CYCLE.
// Synthetic data only. No real Home, Profile, DSH installation or private ZIP.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const C = require('../assets/recovery-core.cjs');
const root = process.env.DSH_PACKER_TEST_ROOT;
if (!root || !path.isAbsolute(root)) throw Error('Explicit isolated test root required');
const realLstat = fs.lstatSync;
const COLLAPSED = 9288674231748432; // > 2^53: an id a Number cannot round-trip

const write = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))); };
const checks = [], skipped = [];
const ok = (name, fn) => { fn(); checks.push(name); };

function fixture(name) {
  const dir = fs.mkdtempSync(path.join(root, 'v074-' + name + '-'));
  const home = path.join(dir, 'home'), profile = path.join(home, 'profiles/desktop');
  write(path.join(profile, 'package.json'), { name: 'dsh-profile-desktop', private: true, dependencies: {} });
  write(path.join(profile, 'node_modules/alpha/package.json'), { name: 'alpha', version: '1.0.0' });
  write(path.join(profile, 'node_modules/alpha/index.js'), 'module.exports=1\n');
  write(path.join(profile, 'node_modules/alpha/src/index.js'), 'module.exports=2\n');
  write(path.join(home, 'sessions/s1/session.json'), { id: 's1' });
  return { dir, home, profile };
}

// A Stats proxy whose Number identity collapses to one value while the bigint
// form keeps the real, distinct ids: exactly what NTFS looks like above 2^53.
function shadow(st) { return new Proxy(st, { get: (target, key) => key === 'ino' ? COLLAPSED : Reflect.get(target, key, target) }); }

function collectDirs(base, prefix, out = []) {
  out.push(prefix);
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.pnpm' && path.basename(base) === 'node_modules') continue;
    collectDirs(path.join(base, entry.name), `${prefix}/${entry.name}`, out);
  }
  return out;
}

function junction(target, link) {
  try { fs.symlinkSync(target, link, 'junction'); return true; } catch (e) { if (['EPERM', 'ENOTSUP', 'EACCES', 'ENOTEXIST'].includes(e.code)) return false; throw e; }
}

(async () => {
  const P = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'private-backup.js')).href);

  // ---- 1. Collapsing 64-bit ids are no longer mistaken for a cycle ----
  const f = fixture('precision'), alpha = path.join(f.profile, 'node_modules/alpha'), alphaSrc = path.join(alpha, 'src');
  let walked;
  try {
    fs.lstatSync = function (target, options) {
      const st = realLstat.apply(fs, arguments);
      return !(options && options.bigint) && (target === alpha || target === alphaSrc) ? shadow(st) : st;
    };
    walked = P.inventory(f.profile, f.home);
  } finally { fs.lstatSync = realLstat; }
  ok('two neighbouring ids that collapse in the Number form are distinct in the exact form', () => {
    assert.equal(C.identity(shadow(realLstat(alpha))), C.identity(shadow(realLstat(alphaSrc))));
    assert.notEqual(C.identityExact(alpha), C.identityExact(alphaSrc));
    assert.equal(C.identity(shadow(realLstat(alpha))) === C.identity(shadow(realLstat(alphaSrc))), true, 'fixture must reproduce the old collision');
  });
  ok('a healthy tree whose ids collapse below a parent is walked instead of failing', () => {
    assert(walked.directories.includes('profile/node_modules/alpha/src'));
    assert(walked.files.some(x => x.path === 'profile/node_modules/alpha/src/index.js'));
    assert.equal(walked.directories.includes('profile/node_modules/alpha'), true);
  });

  // ---- 2. A real link cycle is still refused ----
  const c = fixture('cycle'), cycleLink = path.join(c.profile, 'node_modules/self');
  const linksSupported = junction(c.profile, cycleLink);
  if (!linksSupported) skipped.push('real junction cycle, materialized package link, reparse refusal (volume without junction support)');
  else {
    ok('a package link that leads back to an ancestor is still PACKAGE_LINK_CYCLE', () => {
      assert.throws(() => P.inventory(c.profile, c.home), e => e.code === 'PACKAGE_LINK_CYCLE');
    });

    // ---- 3. A legitimate package-root link is still materialized, not skipped ----
    const p = fixture('package-link'), outside = path.join(p.dir, 'external-pkg');
    write(path.join(outside, 'package.json'), { name: 'external-pkg', version: '2.0.0' });
    write(path.join(outside, 'index.js'), 'module.exports=3\n');
    write(path.join(outside, 'lib', 'x.js'), 'module.exports=4\n');
    const pkgLink = path.join(p.profile, 'node_modules/ext');
    assert.equal(junction(outside, pkgLink), true);
    const linked = P.inventory(p.profile, p.home);
    ok('a package-root link is materialized with its files and recorded once', () => {
      assert.deepEqual(linked.links.filter(l => l.path === 'profile/node_modules/ext'), [{ path: 'profile/node_modules/ext', action: 'materialized-package-link' }]);
      assert(linked.files.some(x => x.path === 'profile/node_modules/ext/index.js'));
      assert(linked.files.some(x => x.path === 'profile/node_modules/ext/lib/x.js'));
    });

    // ---- 4. A link inside package data is still refused, and so is a linked profile root ----
    const q = fixture('refused'), innerLink = path.join(q.profile, 'node_modules/alpha/extra');
    write(path.join(q.dir, 'payload', 'secret.txt'), 'x\n');
    junction(path.join(q.dir, 'payload'), innerLink);
    ok('a link inside package data is still SOURCE_LINK_REFUSED', () => {
      assert.throws(() => P.inventory(q.profile, q.home), e => e.code === 'SOURCE_LINK_REFUSED');
    });
    const linkedRoot = path.join(q.dir, 'linked-profile');
    junction(q.profile, linkedRoot);
    ok('a profile reached through a reparse point is still REPARSE_REFUSED', () => {
      assert.throws(() => P.inventory(linkedRoot, q.home), e => e.code === 'REPARSE_REFUSED');
    });
  }

  // ---- 5. The unpatched walk stays complete: no directory is dropped ----
  const tree = fixture('complete');
  const inventory = P.inventory(tree.profile, tree.home);
  ok('every directory of a nested tree is enumerated and each exact id is unique', () => {
    const expected = [...collectDirs(tree.profile, 'profile', []), ...collectDirs(path.join(tree.home, 'sessions'), 'home/sessions', [])];
    assert.deepEqual([...inventory.directories].sort(), expected.filter(rel => rel !== 'profile').sort());
    const ids = inventory.directories.map(rel => C.identityExact(path.join(rel.startsWith('home/') ? tree.home : tree.profile, rel.slice(rel.indexOf('/') + 1))));
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(inventory.files.some(x => x.path === 'home/sessions/s1/session.json'), true);
  });

  fs.writeFileSync(path.join(root, 'v074-inode-precision-result.json'), JSON.stringify({ status: 'PASS', checks, skipped, syntheticOnly: true, realHomeUntouched: true }, null, 2));
  console.log('PASS v0.7.4 exact directory identity: ' + checks.length + ' checks' + (skipped.length ? ', skipped: ' + skipped.length : ''));
})().catch(e => { console.error(e); process.exitCode = 1; });
