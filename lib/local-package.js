import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { hasUnsafeReparse, readFileSafe, listDirectorySafe } from './safe-fs.js';

const MAX_TGZ = 32 * 1024 * 1024;
const MAX_UNPACKED = 8 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const INSTALL_HOOKS = new Set(['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepack', 'postpack']);
const SENSITIVE_BASENAMES = [
  /^\.npmrc$/i, /^\.env(?:\..*)?$/i, /^\.credentials(?:\..*)?$/i,
  /^auth\.json$/i, /^cookies$/i,
  /^id_(?:rsa|dsa|ed25519)$/i,
  /^credentials?(?:\..*)?$/i, /^secrets?(?:\..*)?$/i,
  /^\.ssh$/i, /^\.git$/i, /\.(?:pem|key|p12|pfx)$/i,
];

function readCString(buffer, start, length) {
  const slice = buffer.subarray(start, start + length);
  const zero = slice.indexOf(0);
  return (zero === -1 ? slice : slice.subarray(0, zero)).toString('utf8');
}

function parseOctal(buffer, start, length) {
  const text = readCString(buffer, start, length).trim().replace(/\0/g, '');
  if (!text) return 0;
  const value = Number.parseInt(text, 8);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function checksumOk(header) {
  const expected = parseOctal(header, 148, 8);
  if (expected === null) return false;
  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += i >= 148 && i < 156 ? 32 : header[i];
  return sum === expected;
}

function safeEntryName(raw) {
  if (typeof raw !== 'string' || !raw || raw.includes('\0') || raw.includes('\\')) return null;
  const normalized = raw.replace(/^\.\//, '');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  return parts.join('/');
}

function sensitiveName(name) {
  const parts = name.split('/');
  const base = parts.at(-1) ?? '';
  if (SENSITIVE_BASENAMES.some((pattern) => pattern.test(base))) return true;
  return parts.some((part) => part === '.git' || part === '.ssh' || part === 'node_modules');
}

function parsePaxPath(data) {
  for (const line of data.toString('utf8').split('\n')) {
    const match = /^\d+ path=(.*)$/.exec(line);
    if (match) return match[1];
  }
  return null;
}

/**
 * Static audit of every tar entry. Nothing is executed, extracted or followed.
 * Any unsupported/unsafe entry makes the package manual-only.
 */
export function inspectTgz(buffer) {
  let tar;
  try {
    tar = zlib.gunzipSync(buffer, { maxOutputLength: MAX_UNPACKED });
  } catch {
    return { ok: false, issues: ['gzip-invalid-or-too-large'] };
  }

  const issues = [];
  const entries = [];
  const names = new Set();
  const installHooks = [];
  let packageJson = null;
  let unpackedBytes = 0;
  let longName = null;
  let paxPath = null;

  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    if (!checksumOk(header)) {
      issues.push('tar-header-checksum');
      break;
    }
    const type = readCString(header, 156, 1) || '0';
    const size = parseOctal(header, 124, 12);
    if (size === null) {
      issues.push('tar-size-invalid');
      break;
    }
    const dataStart = offset + 512;
    if (dataStart + size > tar.length) {
      issues.push('tar-truncated');
      break;
    }
    const rawData = tar.subarray(dataStart, dataStart + size);
    const next = dataStart + Math.ceil(size / 512) * 512;

    if (type === 'L') {
      longName = readCString(rawData, 0, rawData.length);
      offset = next;
      continue;
    }
    if (type === 'x' || type === 'g') {
      if (type === 'x') paxPath = parsePaxPath(rawData);
      offset = next;
      continue;
    }

    const rawName = longName ?? paxPath ?? (() => {
      const name = readCString(header, 0, 100);
      const prefix = readCString(header, 345, 155);
      return prefix && header.subarray(257, 262).toString('ascii') === 'ustar' ? `${prefix}/${name}` : name;
    })();
    longName = null;
    paxPath = null;

    if (!['0', '\0', '5'].includes(type)) {
      issues.push(`tar-entry-type:${type}`);
      offset = next;
      continue;
    }
    const name = safeEntryName(rawName);
    if (!name) {
      issues.push('tar-entry-path-unsafe');
      offset = next;
      continue;
    }
    if (!name.startsWith('package/')) {
      issues.push('tar-entry-outside-package');
      offset = next;
      continue;
    }
    if (names.has(name)) {
      issues.push('tar-entry-duplicate');
      offset = next;
      continue;
    }
    names.add(name);
    if (sensitiveName(name)) {
      issues.push('tar-entry-sensitive');
      offset = next;
      continue;
    }
    if (entries.length >= MAX_ENTRIES) {
      issues.push('tar-entry-count-limit');
      break;
    }
    entries.push({ name, type: type === '5' ? 'directory' : 'file', size });
    unpackedBytes += size;
    if (unpackedBytes > MAX_UNPACKED) {
      issues.push('tar-unpacked-limit');
      break;
    }

    if (type === '0' || type === '\0') {
      if (name === 'package/package.json') {
        if (packageJson) {
          issues.push('tar-package-json-duplicate');
        } else if (size > 1024 * 1024) {
          issues.push('tar-package-json-too-large');
        } else {
          try {
            const parsed = JSON.parse(rawData.toString('utf8').replace(/^\uFEFF/, ''));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) packageJson = parsed;
            else issues.push('tar-package-json-invalid');
          } catch {
            issues.push('tar-package-json-invalid');
          }
        }
      }
    }
    offset = next;
  }

  if (!packageJson) issues.push('tar-package-json-missing');
  if (packageJson?.scripts && typeof packageJson.scripts === 'object' && !Array.isArray(packageJson.scripts)) {
    for (const hook of Object.keys(packageJson.scripts)) {
      if (INSTALL_HOOKS.has(hook)) installHooks.push(hook);
    }
    if (installHooks.length) issues.push('tar-install-hook');
  }
  if (!entries.length) issues.push('tar-empty');

  return {
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    packageJson,
    entryCount: entries.length,
    unpackedBytes,
    installHooks: [...new Set(installHooks)],
    scriptsExecuted: false,
  };
}

export function readTgzPackageJson(buffer) {
  const audit = inspectTgz(buffer);
  return audit.ok ? audit.packageJson : null;
}

function specPath(spec) {
  const match = /^(?:file|link):(.*)$/i.exec(spec);
  if (!match) return null;
  return match[1];
}

function candidateArchives(spec, profileDir) {
  const raw = specPath(spec);
  if (!raw) return [];
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(profileDir, raw);
  if (hasUnsafeReparse(resolved)) return [];
  if (/\.tgz$/i.test(resolved)) return [resolved];
  const directories = [resolved, path.join(resolved, 'dist')];
  const result = [];
  for (const directory of directories) {
    const entries = listDirectorySafe(directory);
    if (!entries) continue;
    for (const entry of entries) {
      if (!entry.isFile() || !/\.tgz$/i.test(entry.name)) continue;
      result.push(path.join(directory, entry.name));
    }
  }
  return [...new Set(result)];
}

export function planLocalPackage(name, spec, profileDir, installedVersion) {
  if (typeof spec !== 'string' || !/^file:/i.test(spec)) {
    return { status: 'manual', reason: 'link-or-non-file-spec' };
  }
  const archives = candidateArchives(spec, profileDir);
  if (archives.length === 0) return { status: 'manual', reason: 'tgz-not-found' };
  const matches = [];
  for (const absolute of archives) {
    if (hasUnsafeReparse(absolute)) continue;
    let buffer;
    try { buffer = readFileSafe(absolute, MAX_TGZ); } catch { buffer = null; }
    if (!buffer) continue;
    const audit = inspectTgz(buffer);
    if (!audit.ok) {
      return { status: 'manual', reason: 'tgz-static-audit-failed', issues: audit.issues };
    }
    const pkg = audit.packageJson;
    if (!pkg || typeof pkg.name !== 'string' || typeof pkg.version !== 'string') continue;
    if (pkg.name !== name) continue;
    if (installedVersion && pkg.version !== installedVersion) continue;
    matches.push({ absolute, buffer, pkg, audit });
  }
  if (matches.length !== 1) {
    return { status: 'manual', reason: matches.length === 0 ? 'tgz-identity-mismatch' : 'multiple-matching-tgz' };
  }
  const { absolute, buffer, pkg, audit } = matches[0];
  const safeName = name.replace(/[^A-Za-z0-9._@-]/g, '_').replace(/@/g, '');
  return {
    status: 'included',
    absolute,
    archiveName: `packages/local/${safeName}-${pkg.version}.tgz`,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    version: pkg.version,
    buffer,
    audit: {
      entries: audit.entryCount,
      unpackedBytes: audit.unpackedBytes,
      installHooks: audit.installHooks,
      scriptsExecuted: false,
    },
  };
}
