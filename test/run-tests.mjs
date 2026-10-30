import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { collectEnvironment } from '../lib/collect.js';
import { createZip, crc32 } from '../lib/zip.js';
import {
  TargetExistsError,
  TargetIdentityChangedError,
  findStaleTemps,
  inspectTarget,
  writeZipAtomic,
} from '../lib/write.js';
import { parseDialogOutput } from '../lib/dialog.js';
import { inspectTgz, planLocalPackage } from '../lib/local-package.js';
import { sanitizeYaml } from '../lib/redact.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = fs.mkdtempSync(path.join(here, 'tmp-'));
const home = path.join(root, 'home');
const profile = path.join(root, 'profile');
const workspace = path.join(root, 'workspace');
const output = path.join(root, 'output');

function put(file, content, mode = 'utf8') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, mode);
}

function tarHeader(name, size) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.write('        ', 148, 8, 'ascii');
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

function makeTgz(pkg) {
  const data = Buffer.from(JSON.stringify(pkg), 'utf8');
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
  const tar = Buffer.concat([tarHeader('package/package.json', data.length), data, padding, Buffer.alloc(1024)]);
  return zlib.gzipSync(tar);
}

function makeTgzEntries(entries) {
  const parts = [];
  for (const [name, content] of entries) {
    const data = Buffer.from(content, 'utf8');
    const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
    parts.push(tarHeader(name, data.length), data, padding);
  }
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts));
}

function verifyZip(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x04034b50, 'local header missing');
  const local = new Map();
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 6) & 0x0800, 0x0800, 'UTF-8 flag missing');
    assert.equal(buffer.readUInt16LE(offset + 8), 0, 'unexpected compression method');
    const crc = buffer.readUInt32LE(offset + 14);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + size);
    assert.equal(crc32(data), crc, `CRC mismatch for ${name}`);
    local.set(name, { data, crc, size });
    offset = dataStart + size;
  }
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, 'EOCD signature missing');
  const count = buffer.readUInt16LE(eocd + 10);
  assert.equal(local.size, count, 'central/local entry count mismatch');
  return [...local.keys()];
}

function fileText(environment, name) {
  const found = environment.files.find((file) => file.path === name);
  assert.ok(found, `missing ${name}`);
  return found.data.toString('utf8');
}

function buildFixture() {
  put(path.join(home, 'AGENTS.md'), 'rule\nsecret sk-FIXTURESECRET\npassword: |\n  BLOCKSECRET\n');
  put(path.join(workspace, 'policies', 'security.md'), 'workspace security policy\n');
  put(path.join(profile, 'AGENTS.md'), 'profile policy\n');

  put(path.join(home, 'dsh-auto-memory.json'), JSON.stringify({
    tier0MaxTokens: 400,
    maxTokens: '400',
    injectEnabled: 'yes',
    noteCapacityChars: 24000,
    teamAccessKeyId: 'AKIAFIXTURE',
    teamSecretAccessKey: 'FIXTURESECRET',
    externalSources: { auth: { token: 'FIXTURE' } },
    globalBriefInstruction: 'SECRET-PROMPT',
    promptLayerOverrides: 'SECRET-ROLE',
  }, null, 2));
  put(path.join(home, 'skills-manager', 'state.json'), JSON.stringify({
    version: '1',
    sources: { dsh: true, claude: true },
    disabledSkills: { dsh: ['disabled-skill'] },
    enabledSkills: { dsh: [] },
  }, null, 2));

  put(path.join(workspace, 'skills', 'enabled-skill', 'SKILL.md'), '# Enabled\n');
  put(path.join(workspace, 'skills', 'disabled-skill', 'SKILL.md'), '# Disabled\n');
  put(path.join(workspace, 'skills', 'script-skill', 'SKILL.md'), '# Script\n');
  put(path.join(workspace, 'skills', 'script-skill', 'run.ps1'), 'Write-Host SHOULD_NOT_BE_INCLUDED\n');
  put(path.join(workspace, '.dsh', 'skills', 'ws-skill', 'SKILL.md'), '# WS\n');

  put(path.join(home, '.cc-safety-net', 'policy.json'), JSON.stringify({
    version: 1,
    safety: { level: 'standard' },
    secret_protection: { enabled: true, deny_paths: ['C:\\secret'] },
  }, null, 2));

  const promptTgz = makeTgz({ name: 'dsh-prompt-inject', version: '1.0.0' });
  const localTgz = makeTgz({ name: 'local-pkg', version: '1.2.3' });
  put(path.join(profile, 'vendor', 'prompt-inject.tgz'), promptTgz);
  put(path.join(profile, 'vendor', 'local.tgz'), localTgz);

  put(path.join(profile, 'package.json'), JSON.stringify({
    name: 'fixture-profile',
    private: true,
    dependencies: {
      'dsh-prompt-inject': 'file:vendor/prompt-inject.tgz',
      'local-pkg': 'file:vendor/local.tgz',
      'dsh-context': '1.0.0',
      'dsh-prompt': '0.4.0',
      'remote-pkg': '1.0.0',
      'cc-safety-net': '1.0.0',
    },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-context', 'dsh-prompt-inject', 'local-pkg'] } },
  }, null, 2));
  put(path.join(profile, 'pnpm-lock.yaml'), [
    "lockfileVersion: '9.0'",
    'importers:',
    '  .:',
    '    dependencies:',
    '      dsh-context:',
    '        specifier: 1.0.0',
    '        version: 1.0.0',
    '      local-pkg:',
    '        specifier: file:vendor/local.tgz',
    '        version: file:vendor/local.tgz',
    '      remote-pkg:',
    '        specifier: 1.0.0',
    '        version: https://user:pass@example.com/remote.tgz?token=SECRET',
    'packages:',
    '  dsh-context@1.0.0:',
    '    resolution: {integrity: sha512-FIXTURE}',
    '',
  ].join('\n'));
  put(path.join(profile, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: prompt',
    '      name: dsh-prompt-inject',
    '      config:',
    '        activeTemplate: one',
    '        templates:',
    '          - name: one',
    '            text: SECRET-TEMPLATE',
    '        apiKey: sk-SECRET',
    '    - id: context',
    '      name: dsh-context',
    '      config:',
    '        enabled: true',
    '        maxTokens: 123',
    '        apiKey: sk-SECRET',
    '- insert:',
    '    - id: library',
    '      name: dsh-prompt',
    '      config:',
    '        prompt: SECRET-ROLE',
    '',
  ].join('\n'));
  put(path.join(profile, 'cordis.yml'), '[]\n');

  for (const [name, version] of [['dsh-context', '1.0.0'], ['dsh-prompt', '0.4.0'], ['remote-pkg', '1.0.0'], ['cc-safety-net', '1.0.0'], ['dsh-prompt-inject', '1.0.0'], ['local-pkg', '1.2.3']]) {
    put(path.join(profile, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }));
  }
}

function run(options = {}) {
  return collectEnvironment({
    dshHome: home,
    profileDir: profile,
    workspaceRoot: workspace,
    desktopRoot: null,
    desktopVersion: '0.2.1-rc.2',
    entries: [
      { options: { id: 'context-live', name: 'dsh-context', config: { enabled: false, maxTokens: 99, apiKey: 'sk-LIVE' }, disabled: false }, disabled: true },
      { options: { id: 'unknown-live', name: 'unknown-plugin', config: { hidden: 'SECRET-UNKNOWN' } } },
    ],
    safetyPolicyPaths: [path.join(home, '.cc-safety-net', 'policy.json')],
    ...options,
  });
}

buildFixture();

// P1-A: whole-document YAML sanitizer; parse errors carry only a position.
const yaml = sanitizeYaml('a: 1\nb:\n  apiKey: sk-SECRET\n  nested:\n    - token: SECRET\n');
assert.ok(!yaml.includes('sk-SECRET'), 'YAML secret leaked');
assert.ok(!yaml.includes('SECRET'), 'YAML value leaked');
assert.throws(() => sanitizeYaml('a: [1, 2'));

const env = run();
assert.equal(env.manifest.format, 'dsh-environment-pack/2');
assert.equal(env.manifest.backupCoverage.status, 'complete');
assert.equal(env.manifest.restoreReadiness.status, 'ready-with-manual-steps');
assert.equal(env.manifest.complete, false);
assert.equal(env.manifest.requiredSafetyDocsComplete, true);
assert.equal(env.manifest.counts.plugins, 7);
assert.equal(env.manifest.counts.bundles, 4);
assert.equal(env.manifest.counts.dependencies, 6);

// R3-1: manifest must be covered by checksums, and every payload except the
// checksum file itself must have exactly one line.
assert.ok(env.files.some((file) => file.path === 'manifest.json'));
const checksumText = fileText(env, 'checksums.sha256');
const checksumNames = checksumText.trim().split('\n').map((line) => line.slice(66));
assert.ok(checksumNames.includes('manifest.json'), 'manifest missing from checksums');
assert.equal(new Set(checksumNames).size, checksumNames.length, 'duplicate checksum lines');
assert.equal(checksumNames.length, env.files.length - 1, 'checksum set does not cover all files');
assert.ok(!checksumNames.includes('checksums.sha256'));

// v2 layout.
for (const name of [
  'runtime/bundles.json', 'runtime/loader-entries.json', 'dependencies/installed.json',
  'config/core/auto-memory.json', 'config/plugins/dsh-prompt-inject.metadata.json',
  'packages/local/local-pkg-1.2.3.tgz', 'skills/index.json', 'restore-plan.json',
  'safety/cc-safety-net-policy.json', 'safety/README.md', 'START_HERE.md',
]) {
  assert.ok(env.files.some((file) => file.path === name), `missing ${name}`);
}
assert.ok(!env.files.some((file) => file.path === 'profile/pnpm-lock.yaml'), 'raw lockfile leaked');
assert.ok(!env.files.some((file) => file.path === 'profile/cordis.yml'), 'raw cordis.yml leaked');

const profilePkg = JSON.parse(fileText(env, 'profile/package.json'));
assert.deepEqual(profilePkg.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'dsh-context', 'dsh-prompt-inject', 'local-pkg']);
assert.equal(profilePkg.dependencies['local-pkg'], 'file:local.tgz');
assert.ok(!JSON.stringify(profilePkg).includes('vendor/'), 'local path leaked');

// P1-B: strict per-plugin schema and prompt text exclusion.
const promptConfig = JSON.parse(fileText(env, 'config/plugins/dsh-prompt-inject.metadata.json'));
assert.equal(promptConfig.metadataOnly, true);
assert.equal(promptConfig.doNotApplyAsConfig, true);
assert.equal(promptConfig.requiresTemplateText, true);
assert.deepEqual(promptConfig.templates, [{ name: 'one' }]);
assert.ok(!fileText(env, 'config/plugins/dsh-prompt-inject.metadata.json').includes('SECRET-TEMPLATE'));
assert.ok(!env.files.some((file) => file.path.includes('dsh-prompt') && !file.path.includes('prompt-inject')), 'prompt library text exported');
assert.equal(env.manifest.prompt.configIncluded, false);
assert.equal(env.manifest.prompt.metadataIncluded, true);
assert.equal(env.manifest.prompt.requiresTemplateText, true);
assert.equal(env.manifest.prompt.textIncluded, false);

// P1-B: Auto Memory strict allowlist and count typing; P1-C: dependency path/URL.
const auto = JSON.parse(fileText(env, 'config/core/auto-memory.json'));
assert.equal(auto.tier0MaxTokens, 400);
assert.equal(auto.noteCapacityChars, 24000);
assert.ok(!('maxTokens' in auto), 'string count should be omitted');
assert.ok(!('injectEnabled' in auto), 'wrong boolean type should be omitted');
assert.ok(!('teamAccessKeyId' in auto) && !('teamSecretAccessKey' in auto));
assert.ok(!('externalSources' in auto) && !('globalBriefInstruction' in auto));
assert.ok(!JSON.stringify(auto).includes('SECRET'));

const installed = JSON.parse(fileText(env, 'dependencies/installed.json'));
assert.equal(installed.dependencies['dsh-context'].installedVersion, '1.0.0');
assert.equal(installed.dependencies['local-pkg'].source, 'local-file');
assert.equal(installed.dependencies['local-pkg'].tarball.sha256.length, 64);
assert.equal(installed.dependencies['remote-pkg'].resolvedVersion, '1.0.0');
assert.ok(!JSON.stringify(installed.dependencies['remote-pkg']).includes('user:pass'));
assert.ok(!JSON.stringify(installed.dependencies['remote-pkg']).includes('SECRET'));
assert.equal(installed.dependencies['dsh-context'].integrityValid, true);
assert.ok(!JSON.stringify(installed).includes('user:pass'));
assert.ok(!JSON.stringify(installed).includes('SECRET'));
assert.ok(!JSON.stringify(installed).includes('example.com/remote'));
assert.ok(!JSON.stringify(installed).includes('vendor/'), 'installed local path leaked');

// R3-8: full tgz audit rejects sensitive/traversal/install-hook entries without
// executing anything.
const evilTgz = makeTgzEntries([
  ['package/package.json', JSON.stringify({ name: 'evil', version: '1.0.0', scripts: { postinstall: 'node evil.js' } })],
  ['package/.npmrc', '//registry.example/:_authToken=SECRET'],
  ['package/.credentials.yaml', 'token: sk-LEAK'],
  ['package/../escape.txt', 'outside'],
]);
const evilAudit = inspectTgz(evilTgz);
assert.equal(evilAudit.ok, false);
assert.ok(evilAudit.issues.includes('tar-install-hook'));
assert.ok(evilAudit.issues.includes('tar-entry-sensitive'));
assert.ok(evilAudit.issues.includes('tar-entry-path-unsafe'));
assert.equal(evilAudit.scriptsExecuted, false);

// R3-8: the end-to-end local package planner must mark the whole tgz manual
// when a DSH credential filename is present; it must not include the bytes.
const credDir = fs.mkdtempSync(path.join(os.tmpdir(), 'packer-cred-'));
try {
  const credPath = path.join(credDir, 'evil.tgz');
  fs.writeFileSync(credPath, evilTgz);
  const credPlan = planLocalPackage('evil', 'file:./evil.tgz', credDir, '1.0.0');
  assert.equal(credPlan.status, 'manual');
  assert.equal(credPlan.reason, 'tgz-static-audit-failed');
  assert.ok(credPlan.issues.includes('tar-entry-sensitive'));
} finally {
  fs.rmSync(credDir, { recursive: true, force: true });
}

// P2-C: Loader options + effective disabled.
const loader = JSON.parse(fileText(env, 'runtime/loader-entries.json'));
const contextEntry = loader.entries.find((entry) => entry.id === 'context-live');
assert.equal(contextEntry.explicitDisabled, false);
assert.equal(contextEntry.effectiveDisabled, true);
assert.equal(contextEntry.runtimeState, 'disabled');
const plugins = JSON.parse(fileText(env, 'plugins.json'));
const contextPlugin = plugins.plugins.find((plugin) => plugin.name === 'dsh-context');
assert.equal(contextPlugin.enabled, false);
assert.equal(contextPlugin.explicitDisabled, false);
assert.equal(contextPlugin.effectiveDisabled, true);
assert.equal(plugins.plugins.find((plugin) => plugin.name === 'unknown-plugin').enabled, 'unknown');

// P2-D: stable safety IDs; required missing blocks.
const dshDoc = env.manifest.safetyDocs.find((doc) => doc.id === 'dsh-AGENTS.md');
assert.equal(dshDoc.source, 'dsh');
assert.equal(dshDoc.sourcePath, 'AGENTS.md');
assert.equal(dshDoc.archivePath, 'agents/dsh-AGENTS.md');
assert.ok(!fileText(env, 'agents/dsh-AGENTS.md').includes('sk-FIXTURESECRET'));
assert.ok(!fileText(env, 'agents/dsh-AGENTS.md').includes('BLOCKSECRET'));
assert.ok(!env.manifest.missingRequiredSafetyDocs.length);
const badPolicyPath = path.join(root, 'unknown-policy.json');
fs.writeFileSync(badPolicyPath, JSON.stringify({ deny: ['danger'], custom: { memory: [{ content: 'SECRET-POLICY' }] } }));
const badPolicyEnv = run({ safetyPolicyPaths: [badPolicyPath] });
assert.equal(badPolicyEnv.manifest.safetyPolicy.included, false);
assert.equal(badPolicyEnv.manifest.safetyPolicy.reason, 'policy-schema-unknown');
assert.ok(!badPolicyEnv.files.some((file) => file.path === 'safety/cc-safety-net-policy.json'));
assert.ok(!JSON.stringify(badPolicyEnv.manifest).includes('SECRET-POLICY'));
assert.throws(() => run({ requiredSafetyDocs: ['dsh-AGENTS.md', 'profile-missing.md'] }), (error) => error.code === 'SAFETY_DOC_MISSING' && error.details.includes('custom:profile-missing.md'));
const absoluteMissing = path.join(root, 'outside', 'missing.md');
assert.throws(() => run({ requiredSafetyDocs: [absoluteMissing] }), (error) => error.code === 'SAFETY_DOC_MISSING'
  && error.details.every((id) => id.startsWith('custom:'))
  && !error.details.join(' ').includes(root));

// skills: only DSH enabled source, SKILL.md only, disabled filtered.
const skillIndex = JSON.parse(fileText(env, 'skills/index.json'));
const skillsConfig = JSON.parse(fileText(env, 'config/core/skills-manager.json'));
assert.ok(!('version' in skillsConfig), 'string skills version accepted');
assert.deepEqual(skillsConfig.disabledSkills, { dsh: ['disabled-skill'] });
assert.deepEqual(skillIndex.included.map((item) => item.path).sort(), ['enabled-skill/SKILL.md', 'script-skill/SKILL.md', 'ws-skill/SKILL.md']);
assert.ok(!env.files.some((file) => file.path.includes('disabled-skill')));
assert.ok(!env.files.some((file) => file.path.endsWith('run.ps1')));
assert.equal(skillIndex.scriptsExecuted, false);
const noSkillsHome = path.join(root, 'no-skills-home');
put(path.join(noSkillsHome, 'skills-manager', 'state.json'), JSON.stringify({
  version: 1, sources: { dsh: false }, disabledSkills: { dsh: [] }, enabledSkills: { dsh: [] },
}));
const noSkillsEnv = collectEnvironment({
  dshHome: noSkillsHome, profileDir: profile, workspaceRoot: workspace, desktopVersion: '0.2.1-rc.2', safetyPolicyPaths: [],
});
const noSkillsIndex = JSON.parse(fileText(noSkillsEnv, 'skills/index.json'));
assert.equal(noSkillsIndex.status, 'not-included');
assert.equal(noSkillsIndex.reason, 'source-disabled');

// S3: no-overwrite and identity binding.
fs.mkdirSync(output, { recursive: true });
const target = path.join(output, 'export.zip');
const buffer = createZip(env.files);
verifyZip(buffer);
const written = writeZipAtomic(target, buffer);
assert.equal(written.cleanup.tempRemoved, true);
assert.ok(fs.statSync(target).isFile());
assert.throws(() => writeZipAtomic(target, buffer), TargetExistsError);
const info = inspectTarget(target);
assert.throws(() => writeZipAtomic(target, buffer, { parentReal: info.parentReal, parentDev: info.parentDev, parentIno: `${info.parentIno}-wrong` }), TargetIdentityChangedError);
const oldTemp = path.join(output, `.${path.basename(target)}.dsh-environment-packer-dead.tmp`);
fs.writeFileSync(oldTemp, 'stale');
// NTFS mtime has sub-millisecond precision while Date.now() is integer ms.
// Make this an actually aged fixture rather than racing a same-tick boundary.
const staleAt=new Date(Date.now()-60000);fs.utimesSync(oldTemp,staleAt,staleAt);
const stale = findStaleTemps(output, path.basename(target), 1000);
assert.ok(stale.includes(oldTemp));
assert.ok(fs.existsSync(oldTemp), 'findStaleTemps must not delete');

// R3-4: a write/fsync failure must not leave a temp file behind.
const failingTarget = path.join(output, 'failing.zip');
const originalFsync = fs.fsyncSync;
fs.fsyncSync = () => { throw new Error('fixture-fsync-failure'); };
try {
  assert.throws(() => writeZipAtomic(failingTarget, buffer));
} finally {
  fs.fsyncSync = originalFsync;
}
assert.ok(!fs.existsSync(failingTarget));
assert.ok(!fs.readdirSync(output).some((name) => name.startsWith('.failing.zip.dsh-environment-packer-') && name.endsWith('.tmp')), 'fsync failure left temp');

const failingWriteTarget = path.join(output, 'failing-write.zip');
const originalWriteFile = fs.writeFileSync;
fs.writeFileSync = () => { throw new Error('fixture-write-failure'); };
try {
  assert.throws(() => writeZipAtomic(failingWriteTarget, buffer));
} finally {
  fs.writeFileSync = originalWriteFile;
}
assert.ok(!fs.existsSync(failingWriteTarget));
assert.ok(!fs.readdirSync(output).some((name) => name.startsWith('.failing-write.zip.dsh-environment-packer-') && name.endsWith('.tmp')), 'write failure left temp');

// R3-4: success with temp-cleanup failure must be reported, not hidden.
const partialTarget = path.join(output, 'partial-cleanup.zip');
const originalUnlink = fs.unlinkSync;
fs.unlinkSync = () => { throw new Error('fixture-unlink-failure'); };
let partialResult;
try {
  partialResult = writeZipAtomic(partialTarget, buffer);
} finally {
  fs.unlinkSync = originalUnlink;
}
assert.equal(partialResult.cleanup.tempRemoved, false);
assert.ok(fs.existsSync(partialTarget));
for (const name of fs.readdirSync(output)) {
  if (name.startsWith('.partial-cleanup.zip.dsh-environment-packer-') && name.endsWith('.tmp')) {
    fs.unlinkSync(path.join(output, name));
  }
}

// P1-A: malformed patch diagnostics must not include source snippets.
const badHome = path.join(root, 'bad-home');
const badProfile = path.join(root, 'bad-profile');
put(path.join(badProfile, 'package.json'), JSON.stringify({ name: 'bad', dependencies: {} }));
put(path.join(badProfile, 'cordis.patch.yml'), '- insert:\n  - name: dsh-context\n    config: {apiKey: sk-SNIPPET\n');
const bad = collectEnvironment({ dshHome: badHome, profileDir: badProfile, workspaceRoot: path.join(root, 'bad-workspace'), desktopVersion: '0.2.1-rc.2', safetyPolicyPaths: [] });
assert.ok(bad.manifest.notes.some((note) => note.startsWith('YAML_PARSE_ERROR:profile/cordis.patch.yml:')), 'missing controlled parse error');
assert.ok(!JSON.stringify(bad.manifest).includes('sk-SNIPPET'), 'parser snippet leaked');
assert.equal(bad.manifest.backupCoverage.complete, false);
assert.equal(bad.manifest.backupCoverage.status, 'partial');

// Dialog parser.
const dialogPath = 'C:\\temp\\out.zip';
assert.equal(parseDialogOutput(Buffer.from(`${Buffer.from(dialogPath, 'utf8').toString('base64')}\n`).toString()), dialogPath);

console.log(`PASS fixture: ${env.files.length} files, ${env.manifest.counts.contentBytes} bytes, ${env.manifest.counts.plugins} plugins, ${env.manifest.counts.bundles} bundles`);
console.log('PASS v2 layout, P1-A/B/C, P2-A/B/C/D, skills, no-overwrite, diagnostics');

// Fixtures live inside test/ (not the OS temp dir), so a failed run must not
// leave them behind for the next pack build to sweep into the plugin tarball.
fs.rmSync(root, { recursive: true, force: true });
