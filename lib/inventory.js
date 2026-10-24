import path from 'node:path';
import { load, JSON_SCHEMA } from '../vendor/js-yaml.mjs';
import { readFileSafe, readMetadataFile } from './safe-fs.js';
import { sanitizeDependencySpec } from './schema.js';

function parseJson(buffer) {
  try { return JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}

export function readInstalledPackage(profileDir, name) {
  const file = path.join(profileDir, 'node_modules', name, 'package.json');
  let buffer = null;
  try {
    buffer = readFileSafe(file, 1024 * 1024);
  } catch (error) {
    // `link:` and `file:` installs put a junction in node_modules on purpose.
    // Their metadata is ordinary packaging data, so read it through the
    // bounded metadata reader instead of failing the whole export.
    if (error?.code !== 'REPARSE_REFUSED') throw error;
    buffer = readMetadataFile(file, 1024 * 1024);
  }
  if (!buffer) return null;
  const pkg = parseJson(buffer);
  return pkg && typeof pkg === 'object' && !Array.isArray(pkg) ? pkg : null;
}

export function readLockfile(profileDir) {
  const buffer = readFileSafe(path.join(profileDir, 'pnpm-lock.yaml'), 8 * 1024 * 1024);
  if (!buffer) return null;
  try {
    const doc = load(buffer.toString('utf8'), { schema: JSON_SCHEMA });
    const importer = doc?.importers?.['.'] ?? {};
    const dependencies = { ...(importer.dependencies ?? {}), ...(importer.devDependencies ?? {}) };
    return { packages: doc?.packages ?? {}, dependencies };
  } catch {
    return null;
  }
}

function integrityFor(lock, name, version) {
  if (!lock || typeof version !== 'string') return null;
  const packages = lock.packages ?? {};
  const exact = packages[`${name}@${version}`];
  if (exact?.resolution?.integrity && typeof exact.resolution.integrity === 'string') {
    return exact.resolution.integrity;
  }
  return null;
}

const SEMVER = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SRI = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/;

function safeVersion(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return SEMVER.test(trimmed) ? trimmed.slice(0, 128) : null;
}

function safeIntegrity(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return SRI.test(trimmed) ? trimmed.slice(0, 256) : null;
}

function classifyResolution(raw, installedVersion) {
  if (typeof raw !== 'string' || !raw) {
    return { version: installedVersion, resolution: installedVersion ? 'installed' : 'unknown', locator: null };
  }
  const version = safeVersion(raw);
  if (version) return { version, resolution: 'version', locator: null };
  const locator = sanitizeDependencySpec(raw);
  if (/^file:/i.test(raw)) return { version: installedVersion, resolution: 'local-file', locator };
  if (/^link:/i.test(raw)) return { version: installedVersion, resolution: 'local-link', locator };
  if (raw.includes('://') || /^(?:git|https?):/i.test(raw)) {
    return { version: installedVersion, resolution: 'remote', locator };
  }
  return { version: installedVersion, resolution: 'unrecognized', locator };
}

export function dependencySource(spec) {
  if (typeof spec !== 'string') return 'unknown';
  if (/^file:/i.test(spec)) return 'local-file';
  if (/^link:/i.test(spec)) return 'local-link';
  if (/^(?:git|https?):/i.test(spec) || spec.includes('://')) return 'remote';
  return 'registry';
}

export function buildDependencyInventory(dependencies, profileDir, lock) {
  const result = {};
  for (const [name, spec] of Object.entries(dependencies ?? {})) {
    const installed = readInstalledPackage(profileDir, name);
    const installedRaw = installed && typeof installed.version === 'string' ? installed.version : null;
    const installedVersion = safeVersion(installedRaw);
    const lockEntry = lock?.dependencies?.[name];
    const resolution = classifyResolution(lockEntry?.version, installedVersion);
    const rawIntegrity = integrityFor(lock, name, resolution.version ?? installedVersion ?? '');
    const integrity = safeIntegrity(rawIntegrity);
    result[name] = {
      declared: sanitizeDependencySpec(spec),
      source: dependencySource(spec),
      installedVersion,
      installedVersionValid: installedRaw === null ? null : installedVersion !== null,
      resolvedVersion: resolution.version,
      resolution: resolution.resolution,
      resolvedLocator: resolution.locator,
      integrity,
      integrityValid: rawIntegrity === null ? null : integrity !== null,
      hasBundle: !!(installed?.dsh?.bundle),
      hasClient: !!(installed?.dsh?.client),
    };
  }
  return result;
}

export function buildBundleInventory(profilePackage, dependencyInventory) {
  const declared = profilePackage?.dsh?.profile?.bundles;
  const declaredOrder = Array.isArray(declared)
    ? declared.filter((item) => typeof item === 'string').slice(0, 500)
    : [];
  const entries = [];
  const missing = [];
  const seen = new Set();
  for (const name of declaredOrder) {
    if (seen.has(name)) continue;
    seen.add(name);
    const dep = dependencyInventory[name];
    if (dep) {
      entries.push({ name, order: entries.length + 1, present: true, installedVersion: dep.installedVersion, hasBundle: dep.hasBundle });
    } else if (name.startsWith('@deepseek-ai/')) {
      entries.push({ name, order: entries.length + 1, present: 'builtin', installedVersion: null, hasBundle: true });
    } else {
      missing.push(name);
      entries.push({ name, order: entries.length + 1, present: false, installedVersion: null, hasBundle: false });
    }
  }
  const extra = [];
  for (const [name, dep] of Object.entries(dependencyInventory)) {
    if (seen.has(name) || !dep.hasBundle) continue;
    extra.push({ name, installedVersion: dep.installedVersion });
  }
  return { declaredOrder, entries, missing, extra };
}

export function normalizeLoaderEntries(entries) {
  const live = Array.isArray(entries) ? entries : [];
  const normalized = [];
  for (const entry of live) {
    const options = entry?.options && typeof entry.options === 'object' ? entry.options : {};
    const name = typeof options.name === 'string' ? options.name : (typeof entry?.name === 'string' ? entry.name : null);
    if (!name) continue;
    const id = typeof options.id === 'string' ? options.id : (typeof entry?.id === 'string' ? entry.id : undefined);
    const explicitDisabled = typeof options.disabled === 'boolean' ? options.disabled : null;
    const effectiveDisabled = typeof entry?.disabled === 'boolean' ? entry.disabled : explicitDisabled;
    normalized.push({
      ...(id ? { id } : {}),
      name,
      explicitDisabled,
      effectiveDisabled,
      runtimeState: effectiveDisabled === true ? 'disabled' : effectiveDisabled === false ? 'enabled' : 'unknown',
      config: options.config,
    });
  }
  return normalized;
}

export function buildPlugins(dependencies, dependencyInventory, normalizedEntries) {
  const live = Array.isArray(normalizedEntries) ? normalizedEntries : [];
  const plugins = [];
  for (const name of Object.keys(dependencies ?? {})) {
    const dep = dependencyInventory[name];
    const matches = live.filter((entry) => entry.name === name);
    if (matches.length === 0) {
      plugins.push({
        name,
        declared: dep?.declared ?? sanitizeDependencySpec(dependencies[name]),
        installedVersion: dep?.installedVersion ?? null,
        enabled: 'unknown',
        runtimeState: 'unknown',
        explicitDisabled: null,
        effectiveDisabled: null,
      });
      continue;
    }
    for (const match of matches) {
      plugins.push({
        name,
        ...(match.id ? { id: match.id } : {}),
        declared: dep?.declared ?? sanitizeDependencySpec(dependencies[name]),
        installedVersion: dep?.installedVersion ?? null,
        enabled: match.effectiveDisabled === true ? false : match.effectiveDisabled === false ? true : 'unknown',
        runtimeState: match.runtimeState,
        explicitDisabled: match.explicitDisabled,
        effectiveDisabled: match.effectiveDisabled,
        hasBundle: dep?.hasBundle ?? false,
      });
    }
  }
  for (const entry of live) {
    if (plugins.some((plugin) => plugin.id && plugin.id === entry.id)) continue;
    if (plugins.some((plugin) => plugin.name === entry.name && plugin.runtimeState !== 'unknown')) continue;
    plugins.push({
      name: entry.name,
      ...(entry.id ? { id: entry.id } : {}),
      declared: null,
      installedVersion: null,
      enabled: entry.effectiveDisabled === true ? false : entry.effectiveDisabled === false ? true : 'unknown',
      runtimeState: entry.runtimeState,
      explicitDisabled: entry.explicitDisabled,
      effectiveDisabled: entry.effectiveDisabled,
      hasBundle: false,
    });
  }
  return plugins;
}

export function patchConfigMap(rows, map = new Map()) {
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (Array.isArray(row.insert)) {
      patchConfigMap(row.insert, map);
      continue;
    }
    if (typeof row.name === 'string' && row.config && typeof row.config === 'object') {
      map.set(row.name, row.config);
    }
  }
  return map;
}

export function safeFileStem(value) {
  return String(value).replace(/[^A-Za-z0-9._@-]/g, '_').slice(0, 160) || 'plugin';
}
