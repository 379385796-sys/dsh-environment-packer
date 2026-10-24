import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { load, JSON_SCHEMA } from '../vendor/js-yaml.mjs';
import { sanitizeText } from './redact.js';
import {
  sanitizeAutoMemory,
  sanitizeSkillsState,
  sanitizeProfilePackage,
  sanitizePluginConfig,
  sanitizeSafetyPolicy,
  sanitizeDependencySpec,
  PLUGIN_SCHEMAS,
} from './schema.js';
import { hasUnsafeReparse, readFileSafe, listDirectorySafe } from './safe-fs.js';

import {
  buildBundleInventory,
  buildDependencyInventory,
  buildPlugins,
  normalizeLoaderEntries,
  patchConfigMap,
  readInstalledPackage,
  readLockfile,
  safeFileStem,
} from './inventory.js';
import { planLocalPackage } from './local-package.js';

/** Version stamped into every manifest; read from the package itself so it cannot drift. */
const PACKER_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const DENY_DIRS = new Set(['sessions', 'memory', 'logs', 'cache', 'temp', 'tmp', '.git', 'node_modules', '.dsh-memory', '.dsh-ops', 'attachments', 'storages']);
const DENY_FILES = new Set(['.credentials.yaml', '.credentials.yml', '.env', '.env.local', 'auth.json', 'cookies', 'id_rsa', 'id_ed25519']);
const SAFETY_CANDIDATES = [
  { id: 'dsh-AGENTS.md', source: 'dsh', sourceRoot: 'dsh', relative: 'AGENTS.md', archive: 'agents/dsh-AGENTS.md' },
  { id: 'profile-AGENTS.md', source: 'profile', sourceRoot: 'profile', relative: 'AGENTS.md', archive: 'agents/profile-AGENTS.md' },
  { id: 'workspace-AGENTS.md', source: 'workspace', sourceRoot: 'workspace', relative: 'AGENTS.md', archive: 'agents/workspace-AGENTS.md' },
  { id: 'workspace-security.md', source: 'workspace', sourceRoot: 'workspace', relative: 'policies/security.md', archive: 'agents/workspace-security.md' },
];
const SAFETY_POLICY_CANDIDATES = [
  path.join(os.homedir(), '.cc-safety-net', 'policy.json'),
  path.join(os.homedir(), '.dsh', '.cc-safety-net', 'policy.json'),
];

function isSecretPath(absolute) {
  const base = path.basename(absolute).toLowerCase();
  if (DENY_FILES.has(base)) return true;
  return /(^|[._-])(credential|secret|token|password|passwd|cookie|private[-_]?key)([._-]|$)/i.test(base);
}

function normalizeEntryPath(relative) {
  const normalized = relative.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) throw new Error('UNSAFE_ARCHIVE_PATH');
  if (normalized.split('/').some((part) => part === '..' || part === '.' || part === '')) throw new Error('UNSAFE_ARCHIVE_PATH');
  return normalized;
}

function parseJson(buffer) {
  try { return JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}

function walkDirectories(root, maxDepth = 3, maxEntries = 500) {
  const result = [];
  if (hasUnsafeReparse(root)) return result;
  const walk = (absolute, relative, depth) => {
    if (depth > maxDepth || result.length >= maxEntries) return;
    const entries = listDirectorySafe(absolute);
    if (!entries) return;
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (result.length >= maxEntries) break;
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const lowered = entry.name.toLowerCase();
      if (DENY_DIRS.has(lowered) || entry.name.startsWith('.')) continue;
      const child = path.join(absolute, entry.name);
      if (hasUnsafeReparse(child)) continue;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      result.push(childRelative);
      walk(child, childRelative, depth + 1);
    }
  };
  walk(root, '', 1);
  return result;
}

function findSkillFiles(root, maxFiles = 100) {
  const result = [];
  if (hasUnsafeReparse(root)) return result;
  const walk = (absolute, relative, depth) => {
    if (depth > 4 || result.length >= maxFiles) return;
    const entries = listDirectorySafe(absolute);
    if (!entries) return;
    for (const entry of entries) {
      if (result.length >= maxFiles) break;
      if (entry.isSymbolicLink()) continue;
      const child = path.join(absolute, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!DENY_DIRS.has(entry.name.toLowerCase()) && !hasUnsafeReparse(child)) walk(child, childRelative, depth + 1);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        result.push({ absolute: child, relative: childRelative });
      }
    }
  };
  walk(root, '', 1);
  return result;
}

export function readAsarVersion(asarPath) {
  // Electron virtualizes .asar as a directory; raw archive reads work in plain Node only.
  try {
    const pkg=JSON.parse(fs.readFileSync(path.join(asarPath,'dsh','package.json'),'utf8'));
    if(typeof pkg.version==='string') return pkg.version;
  } catch { /* plain Node falls back to the bounded raw ASAR reader below */ }
  try {
    const fd = fs.openSync(asarPath, 'r');
    try {
      const head = Buffer.alloc(16);
      fs.readSync(fd, head, 0, 16, 0);
      if (head.readUInt32LE(0) !== 4) return null;
      const headerSize = head.readUInt32LE(4);
      const jsonSize = head.readUInt32LE(12);
      const headerBuffer = Buffer.alloc(jsonSize);
      fs.readSync(fd, headerBuffer, 0, jsonSize, 16);
      const header = JSON.parse(headerBuffer.toString('utf8'));
      const node = header.files?.dsh?.files?.['package.json'] ?? header.files?.['package.json'];
      if (!node || typeof node.offset !== 'string') return null;
      const data = Buffer.alloc(Number(node.size));
      fs.readSync(fd, data, 0, data.length, 8 + headerSize + Number(node.offset));
      const pkg = JSON.parse(data.toString('utf8'));
      return typeof pkg.version === 'string' ? pkg.version : null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function findDesktopRoot() {
  const candidates = [];
  if (process.env.DSH_DESKTOP_ROOT) candidates.push(process.env.DSH_DESKTOP_ROOT);
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness'));
  if (process.execPath) candidates.push(path.dirname(process.execPath));
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(path.join(candidate, 'resources', 'app.asar'))) return candidate;
  }
  return null;
}

function summarizeCordisRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (Array.isArray(row.insert)) return { insert: row.insert.map(summarizeCordisRow).filter(Boolean) };
  const result = {};
  if (typeof row.id === 'string') result.id = row.id;
  if (typeof row.name === 'string') result.name = row.name;
  if (typeof row.disabled === 'boolean') result.disabled = row.disabled;
  const config = sanitizePluginConfig(row.name, row.config);
  if (config) result.config = config;
  return Object.keys(result).length ? result : null;
}

function summarizeCordis(value) {
  if (!Array.isArray(value)) throw new Error('YAML_TOP_LEVEL_NOT_ARRAY');
  return value.map(summarizeCordisRow).filter(Boolean);
}

function yamlErrorPosition(error) {
  const line = error?.mark?.line;
  const column = error?.mark?.column;
  return Number.isInteger(line) && Number.isInteger(column) ? `${line + 1}:${column + 1}` : null;
}

// A custom safety-doc ID is returned to the client on errors, so never put an
// absolute (or traversal) path in it. Relative bare names remain readable.
function customSafetyId(text) {
  if (!path.isAbsolute(text) && !/[\\/]/.test(text)) return `custom:${text}`;
  const base = path.basename(text).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'doc';
  const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
  return `custom:${hash}-${base}`;
}

const CORE_CONFIG_FILES = new Map([
  ['@a9i5k4/dsh-auto-memory', 'config/core/auto-memory.json'],
  ['@michengai/dsh-skills-manager', 'config/core/skills-manager.json'],
]);

// Keep live/patch precedence and metadata-only exceptions in one place.
function collectPluginConfigs(declaredDependencies, normalizedEntries, patchConfigs, addJson) {
  // Per-plugin config: strict named schemas only; unknown plugins get none.
  const liveConfig = new Map();
  for (const entry of normalizedEntries) {
    if (entry.config && typeof entry.config === 'object') liveConfig.set(entry.name, entry.config);
  }
  const pluginCoverage = [];
  for (const name of Object.keys(declaredDependencies)) {
    if (name === 'dsh-prompt') {
      pluginCoverage.push({ name, configIncluded: false, reason: 'prompt-library-user-text' });
      continue;
    }
    if (CORE_CONFIG_FILES.has(name)) {
      pluginCoverage.push({ name, configIncluded: true, path: CORE_CONFIG_FILES.get(name), reason: 'captured-as-core-config' });
      continue;
    }
    const config = liveConfig.get(name) ?? patchConfigs.get(name);
    if (name === 'dsh-prompt-inject') {
      const metadata = sanitizePluginConfig(name, config);
      if (metadata && (metadata.activeTemplate || (Array.isArray(metadata.templates) && metadata.templates.length))) {
        const relative = `config/plugins/${safeFileStem(name)}.metadata.json`;
        addJson(relative, {
          metadataOnly: true,
          doNotApplyAsConfig: true,
          requiresTemplateText: true,
          ...metadata,
          note: 'Template bodies are user text and are not exported. Re-enter each template body before enabling it; this file must not be applied as plugin config.',
        });
        pluginCoverage.push({
          name,
          configIncluded: false,
          metadataOnly: true,
          doNotApplyAsConfig: true,
          requiresTemplateText: true,
          path: relative,
          fields: Object.keys(metadata),
          reason: 'template-text-not-exported',
        });
      } else {
        pluginCoverage.push({ name, configIncluded: false, reason: config === undefined ? 'no-instance-config' : 'template-metadata-empty' });
      }
      continue;
    }
    const sanitized = sanitizePluginConfig(name, config);
    if (!sanitized) {
      const reason = !Object.prototype.hasOwnProperty.call(PLUGIN_SCHEMAS, name)
        ? 'no-verified-schema'
        : (config === undefined ? 'no-instance-config' : 'empty-after-schema');
      pluginCoverage.push({ name, configIncluded: false, reason });
      continue;
    }
    const relative = `config/plugins/${safeFileStem(name)}.json`;
    addJson(relative, sanitized);
    pluginCoverage.push({ name, configIncluded: true, path: relative, fields: Object.keys(sanitized) });
  }

  return pluginCoverage;
}

export function collectEnvironment(options = {}) {
  const dshHome = path.resolve(options.dshHome ?? process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh'));
  const profileName = options.profileName ?? process.env.DSH_PROFILE ?? 'desktop';
  const profileDir = path.resolve(options.profileDir ?? process.env.DSH_PROFILE_DIR ?? path.join(dshHome, 'profiles', profileName));
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const desktopRoot = options.desktopRoot ?? findDesktopRoot();
  const includePromptLibrary = options.includePromptLibrary === true;
  const files = [];
  const notes = [];
  const excluded = [];
  const manual = [];
  const safetyDocs = [];
  let totalBytes = 0;

  const note = (code) => { if (!notes.includes(code)) notes.push(code); };
  const add = (relative, data) => {
    const entryPath = normalizeEntryPath(relative);
    if (files.some((file) => file.path === entryPath)) return false;
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    totalBytes += buffer.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('PACK_TOO_LARGE');
    files.push({ path: entryPath, data: buffer });
    return true;
  };
  const addText = (relative, text) => add(relative, Buffer.from(text, 'utf8'));
  const addJson = (relative, value) => addText(relative, `${JSON.stringify(value, null, 2)}\n`);

  const readConfig = (relative, absolute, maxBytes = 2 * 1024 * 1024) => {
    try {
      if (isSecretPath(absolute)) { excluded.push(relative); return null; }
      if (hasUnsafeReparse(absolute)) { note(`REPARSE_PATH_SKIPPED:${relative}`); return null; }
      const buffer = readFileSafe(absolute, maxBytes);
      if (!buffer) { note(`FILE_UNAVAILABLE:${relative}`); return null; }
      return buffer;
    } catch (error) {
      note(`READ_ERROR:${relative}:${error?.code ?? 'UNKNOWN'}`);
      return null;
    }
  };

  const addFile = (relative, absolute, maxBytes = 2 * 1024 * 1024, transform = (buffer) => buffer) => {
    const buffer = readConfig(relative, absolute, maxBytes);
    if (!buffer) return false;
    try {
      add(relative, transform(buffer));
      return true;
    } catch (error) {
      note(`ADD_ERROR:${relative}:${error?.code ?? 'UNKNOWN'}`);
      return false;
    }
  };

  if (hasUnsafeReparse(dshHome)) note('DSH_HOME_REPARSE');
  if (hasUnsafeReparse(profileDir)) note('PROFILE_REPARSE');
  if (hasUnsafeReparse(workspaceRoot)) note('WORKSPACE_REPARSE');

  addText('START_HERE.md', [
    '# DSH 环境恢复包（格式 2）',
    '',
    '这是一个**只读的环境说明包**，不是自动恢复程序。',
    '',
    '恢复 Agent 必须按顺序执行：',
    '1. **先校验 `checksums.sha256`**：逐项重算 SHA-256；任何不匹配就停止，不要恢复。',
    '2. 读取 `manifest.json`，分别检查 `backupCoverage.status`、`restoreReadiness.status` 和 `requiredSafetyDocsComplete`；`complete` 只有在备份覆盖与恢复准备都满足时才为 true。可选安全文档缺失只记录，不阻塞。',
    '3. 核对 `runtime/bundles.json`、`runtime/loader-entries.json`、`dependencies/installed.json`、`plugins.json`、`config/`、`skills/index.json` 与 `workspace/structure.json`。',
    '4. 本地 tgz 在 `packages/local/`；恢复时先校验 sha256，再交给 DSH 官方安装流程。',
    '5. 先向用户提出安装、配置恢复和工作区重建计划，**等待用户确认**；凭据、浏览器偏好、记忆/聊天/角色卡必须由用户手工恢复。',
    '6. 使用 DSH 官方插件安装命令恢复插件；恢复配置前先备份目标配置。',
    '7. 不要把本包中的声明当成实际安全策略；恢复后重新设置沙盒、审批和安全规则，并验证。',
    '',
    '本包不包含聊天、记忆数据库、角色卡、剧情资料、项目文件、缓存、日志、API Key/Token/Cookie/密码、Windows ACL 或完整性标签。',
    '配置采用逐插件 schema；未知插件配置、未知字段和角色/剧情文本会被省略。',
    '本包不会自动写入目标机器；所有恢复动作必须由新设备上的 Agent 在用户确认后执行。',
    '',
  ].join('\n'));

  // Profile identity and dependency inventory.
  const profilePackagePath = path.join(profileDir, 'package.json');
  let profilePackage = {};
  let profileValid = false;
  const profileBuffer = readConfig('profile/package.json', profilePackagePath);
  if (profileBuffer) {
    const parsed = parseJson(profileBuffer);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) { profilePackage = parsed; profileValid = true; }
    else note('INVALID_JSON:profile/package.json');
  }
  addJson('profile/package.json', sanitizeProfilePackage(profilePackage));

  const declaredDependencies = profilePackage.dependencies && typeof profilePackage.dependencies === 'object'
    ? profilePackage.dependencies
    : {};
  const lock = readLockfile(profileDir);
  if (!lock) note('LOCKFILE_UNAVAILABLE');
  const dependencyInventory = buildDependencyInventory(declaredDependencies, profileDir, lock);
  const bundles = buildBundleInventory(profilePackage, dependencyInventory);
  const normalizedEntries = normalizeLoaderEntries(options.entries);

  // Local tgz bodies: only verified package name/version and safe path.
  const localPackages = {};
  for (const [name, spec] of Object.entries(declaredDependencies)) {
    if (!/^file:/i.test(String(spec))) continue;
    const plan = planLocalPackage(name, spec, profileDir, dependencyInventory[name]?.installedVersion ?? null);
    if (plan.status !== 'included') {
      localPackages[name] = { status: 'manual', reason: plan.reason };
      manual.push({ item: `local package ${name}`, action: 'provide tgz manually', reason: plan.reason });
      continue;
    }
    try {
      add(plan.archiveName, plan.buffer);
      localPackages[name] = {
        status: 'included',
        archivePath: plan.archiveName,
        sha256: plan.sha256,
        version: plan.version,
        audit: plan.audit,
      };
      dependencyInventory[name].tarball = {
        path: plan.archiveName,
        sha256: plan.sha256,
        verifiedPackageVersion: plan.version,
        audit: plan.audit,
      };
    } catch (error) {
      localPackages[name] = { status: 'manual', reason: 'archive-add-failed' };
      manual.push({ item: `local package ${name}`, action: 'provide tgz manually', reason: 'archive-add-failed' });
    }
  }

  addJson('runtime/bundles.json', {
    declaredOrder: bundles.declaredOrder,
    entries: bundles.entries,
    missing: bundles.missing,
    extra: bundles.extra,
    note: 'declaredOrder comes from profile package.dsh.profile.bundles; installed versions come from node_modules.',
  });
  addJson('runtime/loader-entries.json', {
    entries: normalizedEntries.map(({ name, id, explicitDisabled, effectiveDisabled, runtimeState }) => ({
      name,
      ...(id ? { id } : {}),
      explicitDisabled,
      effectiveDisabled,
      runtimeState,
    })),
    note: 'effectiveDisabled comes from Loader entry.disabled; explicitDisabled comes from entry.options.disabled.',
  });
  addJson('dependencies/installed.json', {
    lockfile: { present: !!lock, version: lock ? 'present' : null },
    dependencies: dependencyInventory,
    localPackages,
    bundles,
  });

  // Loader patch: parse whole YAML; parser diagnostics carry only position.
  let patchConfigs = new Map();
  let patchParsed = false;
  const patchPath = path.join(profileDir, 'cordis.patch.yml');
  const patchBuffer = readConfig('profile/cordis.patch.yml', patchPath, 4 * 1024 * 1024);
  if (patchBuffer) {
    try {
      const parsed = load(patchBuffer.toString('utf8'), { schema: JSON_SCHEMA });
      const summary = summarizeCordis(parsed);
      patchParsed = true;
      addJson('profile/cordis.patch.summary.json', {
        note: 'Sanitized structural summary. Opaque plugin config values are omitted.',
        entries: summary,
      });
      patchConfigs = patchConfigMap(parsed);
    } catch (error) {
      const position = yamlErrorPosition(error);
      note(position ? `YAML_PARSE_ERROR:profile/cordis.patch.yml:${position}` : 'YAML_PARSE_ERROR:profile/cordis.patch.yml');
    }
  }
  if (fs.existsSync(path.join(profileDir, 'cordis.yml'))) note('CORDIS_YML_OMITTED');
  if (fs.existsSync(path.join(profileDir, 'pnpm-lock.yaml'))) note('LOCKFILE_RAW_OMITTED');

  const pluginCoverage = collectPluginConfigs(declaredDependencies, normalizedEntries, patchConfigs, addJson);

  // Auto Memory and Skills Manager settings.
  let autoMemoryValid = false;
  const autoMemoryBuffer = readConfig('config/core/auto-memory.json', path.join(dshHome, 'dsh-auto-memory.json'), 1024 * 1024);
  if (autoMemoryBuffer) {
    const parsed = parseJson(autoMemoryBuffer);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      addJson('config/core/auto-memory.json', sanitizeAutoMemory(parsed));
      autoMemoryValid = true;
    } else note('INVALID_JSON:auto-memory');
  }
  let skillsStateValid = false;
  const skillsStateBuffer = readConfig('config/core/skills-manager.json', path.join(dshHome, 'skills-manager', 'state.json'), 1024 * 1024);
  let skillsState = null;
  if (skillsStateBuffer) {
    const parsed = parseJson(skillsStateBuffer);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      skillsState = parsed;
      addJson('config/core/skills-manager.json', sanitizeSkillsState(parsed));
      skillsStateValid = true;
    } else note('INVALID_JSON:skills-manager');
  }

  // A core config file can exist but be invalid JSON; only claim core coverage
  // when the sanitized file actually made it into the archive.
  for (const item of pluginCoverage) {
    const corePath = CORE_CONFIG_FILES.get(item.name);
    if (!corePath) continue;
    if (!files.some((file) => file.path === corePath)) {
      item.configIncluded = false;
      item.reason = 'core-config-unavailable';
      delete item.path;
    }
  }

  // Skills: only DSH-declared sources. Never Codex/Claude/other tool dirs.
  const skills = [];
  const disabledSkills = new Set(
    Array.isArray(skillsState?.disabledSkills?.dsh)
      ? skillsState.disabledSkills.dsh.filter((item) => typeof item === 'string')
      : Array.isArray(skillsState?.disabledSkills)
        ? skillsState.disabledSkills.filter((item) => typeof item === 'string')
        : [],
  );
  let skillRootsPresent = 0;
  let skillCandidates = 0;
  let skillDisabled = 0;
  if (skillsState?.sources?.dsh === true) {
    const skillRoots = [
      ['dsh', path.join(dshHome, 'skills')],
      ['profile', path.join(profileDir, 'skills')],
      ['workspace-dsh', path.join(workspaceRoot, '.dsh', 'skills')],
      ['workspace', path.join(workspaceRoot, 'skills')],
    ];
    for (const [label, root] of skillRoots) {
      if (!fs.existsSync(root)) continue;
      skillRootsPresent += 1;
      for (const found of findSkillFiles(root)) {
        skillCandidates += 1;
        if (disabledSkills.has(found.relative) || disabledSkills.has(path.basename(path.dirname(found.relative)))) {
          skillDisabled += 1;
          continue;
        }
        const relative = `skills/${label}/${found.relative}`;
        if (addFile(relative, found.absolute, 512 * 1024, (b) => Buffer.from(sanitizeText(b.toString('utf8')), 'utf8'))) {
          const data = files.find((file) => file.path === relative)?.data;
          skills.push({
            source: label,
            path: found.relative,
            archivePath: relative,
            enabled: true,
            sha256: data ? crypto.createHash('sha256').update(data).digest('hex') : null,
            scriptsExecuted: false,
          });
        }
      }
    }
  }
  let skillsStatus = 'included';
  let skillsReason = null;
  if (skills.length === 0) {
    if (!skillsStateValid) { skillsStatus = 'not-included'; skillsReason = 'state-missing-or-invalid'; }
    else if (skillsState.sources?.dsh !== true) { skillsStatus = 'not-included'; skillsReason = 'source-disabled'; }
    else if (skillRootsPresent === 0) { skillsStatus = 'not-included'; skillsReason = 'no-dsh-skill-roots'; }
    else if (skillCandidates === 0) { skillsStatus = 'not-included'; skillsReason = 'no-skill-files'; }
    else if (skillDisabled >= skillCandidates) { skillsStatus = 'not-included'; skillsReason = 'all-skills-disabled'; }
    else { skillsStatus = 'not-included'; skillsReason = 'nothing-collected'; }
    manual.push({ item: 'skills', action: 'confirm and copy enabled DSH skills manually', reason: skillsReason });
  }
  addJson('skills/index.json', {
    included: skills,
    status: skillsStatus,
    reason: skillsReason,
    rootsPresent: skillRootsPresent,
    candidateCount: skillCandidates,
    disabledCount: skillDisabled,
    scriptsExecuted: false,
    note: 'Only SKILL.md from DSH-managed roots; scripts are never executed or included.',
  });

  // Safety documents with stable IDs and source/archive paths.
  const requested = new Map();
  const required = new Set();
  const addRequested = (value, isRequired) => {
    if (typeof value !== 'string' || !value.trim()) return;
    const text = value.trim();
    const known = SAFETY_CANDIDATES.find((candidate) => candidate.id === text || candidate.relative === text);
    const id = known ? known.id : customSafetyId(text);
    if (!requested.has(id)) requested.set(id, { id, input: text, known });
    if (isRequired) required.add(id);
  };
  for (const candidate of SAFETY_CANDIDATES) addRequested(candidate.id, false);
  for (const item of Array.isArray(options.safetyDocs) ? options.safetyDocs : []) addRequested(item, false);
  for (const item of Array.isArray(options.requiredSafetyDocs) ? options.requiredSafetyDocs : []) addRequested(item, true);

  for (const { id, input, known } of requested.values()) {
    let absolute;
    let source;
    let sourceRoot;
    let sourcePath;
    let archivePath;
    if (known) {
      absolute = path.join(known.sourceRoot === 'dsh' ? dshHome : known.sourceRoot === 'profile' ? profileDir : workspaceRoot, known.relative);
      source = known.source;
      sourceRoot = known.sourceRoot;
      sourcePath = known.relative;
      archivePath = known.archive;
    } else {
      absolute = path.isAbsolute(input) ? input : path.join(workspaceRoot, input);
      source = 'custom';
      sourceRoot = 'custom';
      sourcePath = input;
      const base = path.basename(input).replace(/[^A-Za-z0-9._-]/g, '_') || 'policy.md';
      const hash = crypto.createHash('sha256').update(path.resolve(absolute)).digest('hex').slice(0, 12);
      archivePath = `safety/docs/custom-${hash}-${base}`;
    }
    const isRequired = required.has(id);
    if (isSecretPath(absolute) || hasUnsafeReparse(absolute)) {
      safetyDocs.push({ id, source, sourceRoot, sourcePath, archivePath, included: false, required: isRequired });
      if (isRequired) throw Object.assign(new Error('SAFETY_DOC_UNSAFE'), { code: 'SAFETY_DOC_UNSAFE', details: [id] });
      continue;
    }
    let buffer;
    try { buffer = readFileSafe(absolute, 1024 * 1024); } catch { buffer = null; }
    if (!buffer) {
      safetyDocs.push({ id, source, sourceRoot, sourcePath, archivePath, included: false, required: isRequired });
      if (isRequired) throw Object.assign(new Error('SAFETY_DOC_MISSING'), { code: 'SAFETY_DOC_MISSING', details: [id] });
      continue;
    }
    const text = sanitizeText(buffer.toString('utf8'));
    addText(archivePath, text);
    safetyDocs.push({
      id, source, sourceRoot, sourcePath, archivePath, included: true, required: isRequired,
      sha256: crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
    });
  }
  const missingSafetyDocs = safetyDocs.filter((doc) => !doc.included).map((doc) => doc.id);
  const missingRequiredSafetyDocs = safetyDocs.filter((doc) => doc.required && !doc.included).map((doc) => doc.id);

  // cc-safety-net actual policy: include only if JSON and readable; restore
  // always requires explicit approval. Never bypass a blocked read.
  let safetyPolicy = { included: false, reason: 'not-found-or-unreadable' };
  const policyCandidates = Array.isArray(options.safetyPolicyPaths) ? options.safetyPolicyPaths : SAFETY_POLICY_CANDIDATES;
  for (const candidate of policyCandidates) {
    let buffer;
    try { buffer = readFileSafe(candidate, 1024 * 1024); } catch { buffer = null; }
    if (!buffer) continue;
    const parsed = parseJson(buffer);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const sanitized = sanitizeSafetyPolicy(parsed);
    if (!sanitized) {
      safetyPolicy = { included: false, reason: 'policy-schema-unknown' };
      break;
    }
    const policyText = `${JSON.stringify(sanitized, null, 2)}\n`;
    addText('safety/cc-safety-net-policy.json', policyText);
    safetyPolicy = {
      included: true,
      path: 'safety/cc-safety-net-policy.json',
      sha256: crypto.createHash('sha256').update(Buffer.from(policyText, 'utf8')).digest('hex'),
      requiresApproval: true,
      note: 'Policy content may include command patterns. Restore only after user approval and schema review.',
    };
    break;
  }
  if (!safetyPolicy.included) manual.push({ item: 'cc-safety-net policy', action: 'export/restore manually with approval', reason: safetyPolicy.reason });
  else manual.push({ item: 'cc-safety-net policy', action: 'review and restore with explicit approval', reason: 'policy is included but never auto-applied' });
  manual.push({ item: 'credentials (API keys/tokens/cookies/passwords)', action: 're-enter manually on the new device', reason: 'intentionally excluded from backup' });
  manual.push({ item: 'browser preferences and local UI state', action: 'reconfigure manually', reason: 'not environment configuration' });
  manual.push({ item: 'memory/chat history/role cards/prompt-library text', action: 'restore from the user\'s own source if desired', reason: 'intentionally excluded from this environment pack' });

  addText('safety/README.md', [
    '# 安全规则说明',
    '',
    '本包只包含**显式允许的安全文档、可读取的 cc-safety-net 策略与脱敏后的配置**，不包含 Windows ACL、完整性标签或设备专属权限。',
    '',
    '- `agents/*` 与 `safety/docs/*`：显式列入允许清单的规则文档。',
    '- `safety/cc-safety-net-policy.json`：仅在可读且为 JSON 对象时收录；恢复前必须由用户审核并批准。',
    '- `safety/cc-safety-net-README.md`：说明文档。',
    '- `sandbox/declaration.json`：导出时的沙盒/审批**声明**，不是可执行策略；恢复后必须由用户重新确认。',
    '',
    '恢复前请先校验 `checksums.sha256`，并在新设备上重新设置沙盒模式、审批策略和安全规则。',
    '',
  ].join('\n'));
  addFile(
    'safety/cc-safety-net-README.md',
    path.join(profileDir, 'node_modules', 'cc-safety-net', 'README.md'),
    512 * 1024,
    (b) => Buffer.from(sanitizeText(b.toString('utf8')), 'utf8'),
  );

  if (fs.existsSync(workspaceRoot)) {
    addJson('workspace/structure.json', {
      root: workspaceRoot,
      note: 'Directory names only; project files and hidden state directories are excluded.',
      directories: walkDirectories(workspaceRoot),
    });
  } else {
    note('WORKSPACE_MISSING');
  }

  addJson('sandbox/declaration.json', {
    portableDeclaration: true,
    filePolicy: options.sandboxMode ?? 'workspace-write',
    approvalPolicy: options.approvalPolicy ?? 'ask',
    aclIncluded: false,
    integrityLabelsIncluded: false,
    note: 'This is a declaration for the recovery Agent, not an exported Windows ACL, integrity label, or global sandbox setting.',
  });

  const desktopVersion = options.desktopVersion ?? (desktopRoot ? readAsarVersion(path.join(desktopRoot, 'resources', 'app.asar')) : null);
  const plugins = buildPlugins(declaredDependencies, dependencyInventory, normalizedEntries);
  const pluginRows = plugins.map((plugin) => ({
    ...plugin,
    config: pluginCoverage.find((item) => item.name === plugin.name) ?? null,
  }));

  // Separate backup coverage from restore readiness. Coverage is computed from
  // what was actually parsed/validated/collected, not from file existence.
  const dependencyNames = Object.keys(dependencyInventory);
  const invalidDependencies = dependencyNames.filter((name) => {
    const item = dependencyInventory[name];
    return item.installedVersionValid === false || item.integrityValid === false || item.resolution === 'unrecognized';
  });
  const localPackageEntries = Object.entries(localPackages);
  const localPackageItems = localPackageEntries.filter(([, value]) => value.status !== 'included');
  const backupItems = [
    { id: 'profile/package.json', status: profileValid ? 'captured' : profileBuffer ? 'invalid' : 'missing', critical: true },
    { id: 'profile/cordis.patch.yml', status: patchParsed ? 'captured' : patchBuffer ? 'invalid' : 'missing', critical: true },
    { id: 'pnpm-lock.yaml', status: lock ? 'captured' : 'missing', critical: true },
    { id: 'runtime/loader-entries.json', status: normalizedEntries.length ? 'captured' : 'unavailable', critical: true },
    { id: 'dependencies/installed.json', status: dependencyNames.length === 0 ? 'missing' : invalidDependencies.length ? 'invalid' : 'captured', critical: true },
    { id: 'runtime/bundles.json', status: bundles.entries.length && bundles.missing.length === 0 ? 'captured' : bundles.missing.length ? 'missing' : 'unavailable', critical: true },
    {
      id: 'config/core/auto-memory.json',
      status: autoMemoryValid ? 'captured' : autoMemoryBuffer ? 'invalid' : 'missing',
      critical: !!declaredDependencies['@a9i5k4/dsh-auto-memory'],
    },
    {
      id: 'config/core/skills-manager.json',
      status: skillsStateValid ? 'captured' : skillsStateBuffer ? 'invalid' : 'missing',
      critical: !!declaredDependencies['@michengai/dsh-skills-manager'],
    },
    { id: 'safety/required-docs', status: missingRequiredSafetyDocs.length ? 'missing' : 'captured', critical: true },
    {
      id: 'packages/local',
      status: localPackageEntries.length === 0 ? 'captured' : localPackageItems.length ? 'manual' : 'captured',
      critical: localPackageEntries.length > 0,
      manual: localPackageItems.map(([name, value]) => `${name}:${value.reason}`),
    },
  ];
  const failedBackupItems = backupItems.filter((item) => item.critical && item.status !== 'captured');
  const manualBackupItems = backupItems.filter((item) => item.status === 'manual');
  const backupMissing = backupItems.filter((item) => item.status !== 'captured').map((item) => item.id);
  const backupCoverage = {
    status: failedBackupItems.length || manualBackupItems.length ? 'partial' : 'complete',
    complete: failedBackupItems.length === 0 && manualBackupItems.length === 0,
    failed: failedBackupItems.map((item) => ({ id: item.id, status: item.status })),
    items: backupItems,
    captured: {
      profile: profileValid,
      loader: normalizedEntries.length > 0,
      lockfile: !!lock,
      dependencies: dependencyNames.length,
      bundles: bundles.entries.length,
      plugins: pluginRows.length,
      safetyDocs: safetyDocs.filter((doc) => doc.included).length,
      skills: skills.length,
    },
    missing: backupMissing,
    manual: localPackageItems.map(([name, value]) => ({ item: name, reason: value.reason })),
    expectedExclusions: [
      'credentials/API keys/tokens/cookies/passwords',
      'sessions/chat history/memory databases',
      'character cards/story/role-play material',
      'logs/caches/temp/project files',
      'Windows ACL/integrity labels',
      'unknown plugin config and prompt-library text',
    ],
  };

  const restoreReadiness = {
    status: missingRequiredSafetyDocs.length > 0
      ? 'not-ready'
      : manual.length > 0 ? 'ready-with-manual-steps' : 'ready',
    manual,
    missingSafetyDocs,
    missingRequiredSafetyDocs,
    canAutoRestore: false,
    note: 'Credentials, browser state, prompt-library text, role cards and memory must be restored manually; this package never auto-writes.',
  };

  addJson('plugins.json', {
    profile: profileName,
    packageCount: pluginRows.length,
    plugins: pluginRows,
    note: 'Enabled state uses Loader effective disabled; explicitDisabled is the user setting.',
  });
  addJson('overlays.json', {
    version: 1,
    plugins: pluginCoverage,
    note: 'Per-plugin sanitized config overlays; unknown plugins and unknown fields are omitted.',
  });
  addJson('restore-plan.json', {
    format: 'dsh-environment-restore-plan/1',
    steps: [
      'verify checksums.sha256',
      'inspect manifest backupCoverage and restoreReadiness',
      'install DSH runtime/bundles in declared order',
      'restore registry dependencies and local tgz packages (with approval)',
      'restore config/core and config/plugins overlays after backup',
      'review and restore cc-safety-net policy with explicit approval',
      'copy skills only if user confirms; never execute scripts',
      'rebuild workspace directories; do not restore project files',
      're-enter credentials, memory, browser preferences and user text manually',
    ],
    perPlugin: pluginCoverage,
    manual,
    doNotAutoExecute: ['scripts', 'cc-safety-net policy', 'shell commands from templates'],
  });

  const contentFiles = files.length;
  const contentBytes = totalBytes;
  const manifest = {
    format: 'dsh-environment-pack/2',
    createdAt: new Date().toISOString(),
    packer: { name: 'dsh-environment-packer', version: PACKER_VERSION },
    complete: backupCoverage.complete && restoreReadiness.status === 'ready',
    backupCoverage,
    restoreReadiness,
    safetyDocsComplete: missingSafetyDocs.length === 0,
    requiredSafetyDocsComplete: missingRequiredSafetyDocs.length === 0,
    missingSafetyDocs,
    missingRequiredSafetyDocs,
    safetyDocs,
    safetyPolicy,
    prompt: {
      configIncluded: false,
      metadataIncluded: pluginCoverage.some((item) => item.name === 'dsh-prompt-inject' && item.metadataOnly),
      requiresTemplateText: true,
      templateTextIncluded: false,
      textIncluded: false,
      libraryIncluded: false,
      libraryStatus: includePromptLibrary ? 'requested-but-no-library-source' : 'excluded-by-default',
      note: 'dsh-prompt-inject template bodies and character/story material are never exported; metadata-only files must not be applied as config until the user re-enters template text.',
    },
    source: {
      dshDesktopVersion: desktopVersion,
      dshHome, profile: profileName, profileDir, workspaceRoot,
      platform: process.platform, arch: process.arch, node: process.versions.node,
    },
    counts: {
      contentFiles,
      contentBytes,
      plugins: pluginRows.length,
      dependencies: Object.keys(dependencyInventory).length,
      bundles: bundles.entries.length,
      skills: skills.length,
      note: 'contentFiles/contentBytes are payload before manifest.json and checksums.sha256.',
    },
    excluded: {
      directories: [...DENY_DIRS],
      categories: [
        'history', 'memory databases', 'character cards/story material', 'project files',
        'caches', 'logs', 'temporary data', 'API keys/tokens/cookies/passwords',
        'Windows ACL/integrity labels', 'unknown plugin config', 'prompt-library text',
      ],
      skipped: excluded,
    },
    notes,
  };
  addJson('manifest.json', manifest);
  const checksumLines = files
    .filter((file) => file.path !== 'checksums.sha256')
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => `${crypto.createHash('sha256').update(file.data).digest('hex')}  ${file.path}`);
  addText('checksums.sha256', `${checksumLines.join('\n')}\n`);

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, manifest };
}
