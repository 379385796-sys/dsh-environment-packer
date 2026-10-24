import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hasUnsafeReparse } from './safe-fs.js';

export class TargetExistsError extends Error {
  constructor(target) {
    super('TARGET_EXISTS');
    this.name = 'TargetExistsError';
    this.code = 'TARGET_EXISTS';
    this.target = target;
  }
}

export class TargetIdentityChangedError extends Error {
  constructor() {
    super('TARGET_IDENTITY_CHANGED');
    this.name = 'TargetIdentityChangedError';
    this.code = 'TARGET_IDENTITY_CHANGED';
  }
}

function normalizeTarget(target) {
  if (typeof target !== 'string' || target.trim() === '') throw codedError('TARGET_REQUIRED');
  const absolute = path.resolve(target);
  if (path.extname(absolute).toLowerCase() !== '.zip') throw codedError('TARGET_MUST_BE_ZIP');
  const parent = path.dirname(absolute);
  return { absolute, parent, base: path.basename(absolute) };
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function identityOf(stat) {
  return `${String(stat.dev)}:${String(stat.ino)}`;
}

export function inspectTarget(target, expected = null) {
  const { absolute, parent, base } = normalizeTarget(target);
  const parentStat = fs.statSync(parent, { throwIfNoEntry: false });
  if (!parentStat || !parentStat.isDirectory()) throw codedError('TARGET_PARENT_MISSING');
  if (hasUnsafeReparse(parent)) throw codedError('TARGET_PARENT_REPARSE');
  const parentReal = fs.realpathSync.native(parent);
  const parentRealStat = fs.statSync(parentReal);
  if (expected) {
    if (expected.parentReal !== parentReal
      || String(expected.parentDev) !== String(parentRealStat.dev)
      || String(expected.parentIno) !== String(parentRealStat.ino)) {
      throw new TargetIdentityChangedError();
    }
  }
  const finalPath = path.join(parentReal, base);
  return {
    target: finalPath,
    parent: parentReal,
    base,
    exists: fs.existsSync(finalPath),
    parentReal,
    parentDev: parentRealStat.dev,
    parentIno: parentRealStat.ino,
  };
}

function unlinkIfOurs(target, expectedIdentity) {
  try {
    const before = fs.lstatSync(target, { throwIfNoEntry: false });
    if (!before || !before.isFile() || identityOf(before) !== expectedIdentity) return false;
    fs.unlinkSync(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Commit a ZIP without replacing an existing file.
 *
 * The temp file is fsynced, then hard-linked into the final name. link(2) is
 * atomic and fails with EEXIST, so no-overwrite does not depend on a
 * check-then-rename sequence. The final file is verified against the temp
 * inode and content. If verification fails, a target is removed only when its
 * inode is still the temp inode we linked (never a concurrently replaced file).
 */
export function writeZipAtomic(target, buffer, expected = null) {
  const info = inspectTarget(target, expected);
  if (info.exists) throw new TargetExistsError(info.target);
  if (hasUnsafeReparse(info.parent)) throw codedError('TARGET_PARENT_REPARSE');

  const expectedHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const temp = path.join(
    info.parent,
    `.${info.base}.dsh-environment-packer-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  let fd = null;
  let tempStat = null;
  let succeeded = false;
  let tempRemoved = false;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    // Capture the identity before writing: a write/fsync failure must still be
    // able to remove exactly the temp file we created, and never a replacement.
    tempStat = fs.fstatSync(fd);
    fs.writeFileSync(fd, buffer);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    const currentParent = fs.realpathSync.native(info.parent);
    const currentParentStat = fs.statSync(info.parent);
    if (currentParent !== info.parent || hasUnsafeReparse(info.parent)
      || String(currentParentStat.dev) !== String(info.parentDev)
      || String(currentParentStat.ino) !== String(info.parentIno)) {
      throw new TargetIdentityChangedError();
    }
    if (fs.existsSync(info.target)) throw new TargetExistsError(info.target);
    fs.linkSync(temp, info.target);
    try {
      const dirFd = fs.openSync(info.parent, 'r');
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    } catch { /* directory fsync is best-effort on Windows */ }

    const targetStat = fs.lstatSync(info.target);
    const identity = identityOf(tempStat);
    if (!targetStat.isFile() || identityOf(targetStat) !== identity || targetStat.size !== buffer.length) {
      const removed = identityOf(targetStat) === identity ? unlinkIfOurs(info.target, identity) : false;
      throw Object.assign(new Error('COMMIT_VERIFY_FAILED'), { code: 'COMMIT_VERIFY_FAILED', targetRemoved: removed });
    }
    let targetHash = null;
    try { targetHash = crypto.createHash('sha256').update(fs.readFileSync(info.target)).digest('hex'); } catch { targetHash = null; }
    if (targetHash !== expectedHash) {
      const removed = unlinkIfOurs(info.target, identity);
      throw Object.assign(new Error('COMMIT_VERIFY_FAILED'), { code: 'COMMIT_VERIFY_FAILED', targetRemoved: removed });
    }
    try { tempRemoved = unlinkIfOurs(temp, identityOf(tempStat)); } catch { tempRemoved = false; }
    succeeded = true;
    return {
      path: info.target,
      bytes: buffer.length,
      sha256: expectedHash,
      cleanup: { tempRemoved },
    };
  } catch (error) {
    if (error?.code === 'EEXIST') throw new TargetExistsError(info.target);
    throw error;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    if (!succeeded && tempStat) {
      unlinkIfOurs(temp, identityOf(tempStat));
    }
  }
}

/**
 * List only our own stale temp files. This function never deletes anything;
 * the caller reports them to the user, who decides whether to remove them.
 */
export function findStaleTemps(parent, base, olderThanMs = 24 * 60 * 60 * 1000) {
  try {
    if (hasUnsafeReparse(parent)) return [];
    const prefix = `.${base}.dsh-environment-packer-`;
    const now = Date.now();
    const result = [];
    for (const name of fs.readdirSync(parent)) {
      if (!name.startsWith(prefix) || !name.endsWith('.tmp')) continue;
      const absolute = path.join(parent, name);
      try {
        const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
        if (!stat || !stat.isFile()) continue;
        if (now - stat.mtimeMs >= olderThanMs) result.push(absolute);
      } catch { /* ignore individual entries */ }
    }
    return result;
  } catch {
    return [];
  }
}
