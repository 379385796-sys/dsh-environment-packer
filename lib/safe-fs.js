import fs from 'node:fs';
import path from 'node:path';

/**
 * Reject any symlink, junction, or other reparse point in the path. This is a
 * best-effort check: Windows path resolution can still race with a local
 * attacker between the check and the following operation.
 */
export function findReparseComponent(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current, { throwIfNoEntry: false }); } catch { return current; }
    if (!stat) break;
    if (stat.isSymbolicLink()) return current;
    // Node on Windows can report a junction as a directory in lstat. A
    // junction also resolves to a different real path than its input path.
    try {
      const real = fs.realpathSync.native(current);
      if (real.toLowerCase() !== path.resolve(current).toLowerCase()) return current;
    } catch { /* not resolvable; leave the normal file checks to fail */ }
  }
  return null;
}

export function hasUnsafeReparse(target) {
  return findReparseComponent(target) !== null;
}

/**
 * Read a small regular file without following a link in any path component.
 * The opened handle is checked again against lstat/realpath to narrow the
 * lstat->open race. It is not a replacement for an OS-level sandbox.
 */
export function readFileSafe(absolute, maxBytes) {
  let beforeReal;
  try {
    beforeReal = fs.realpathSync.native(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
  if (hasUnsafeReparse(absolute)) {
    const error = new Error(`Refusing reparse-point path: ${absolute}`);
    error.code = 'REPARSE_REFUSED';
    throw error;
  }
  const before = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (!before || !before.isFile() || before.isSymbolicLink()) return null;
  if (before.size > maxBytes) return null;

  const fd = fs.openSync(absolute, 'r');
  try {
    const handle = fs.fstatSync(fd);
    if (!handle.isFile() || handle.size !== before.size) throw new Error(`File changed while opening: ${absolute}`);
    if (before.ino && handle.ino && before.ino !== handle.ino) throw new Error(`File identity changed while opening: ${absolute}`);
    const afterReal = fs.realpathSync.native(absolute);
    if (afterReal.toLowerCase() !== beforeReal.toLowerCase()) throw new Error(`Path changed while opening: ${absolute}`);
    const buffer = Buffer.alloc(handle.size);
    let offset = 0;
    while (offset < buffer.length) {
      const read = fs.readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (read <= 0) break;
      offset += read;
    }
    return buffer.subarray(0, offset);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Read a small regular file that may legitimately sit behind a reparse point.
 *
 * Package-manager installs of the form `link:` / `file:` make
 * `node_modules/<name>` a junction to the development directory on purpose, so
 * refusing every reparse component there would refuse the install layout the
 * host itself created. This reader is deliberately narrow: it only ever reads
 * one regular file, refuses anything larger than `maxBytes`, and verifies the
 * opened handle against the pre-open size. It is for packaging metadata, never
 * for the environment content the caller exports.
 */
export function readMetadataFile(absolute, maxBytes) {
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) return null;
  if (stat.size > maxBytes) return null;
  let fd;
  try {
    fd = fs.openSync(absolute, 'r');
  } catch {
    return null;
  }
  try {
    const handle = fs.fstatSync(fd);
    if (!handle.isFile() || handle.size > maxBytes) return null;
    if (handle.size !== stat.size) return null;
    const buffer = Buffer.alloc(handle.size);
    let offset = 0;
    while (offset < buffer.length) {
      const read = fs.readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (read <= 0) break;
      offset += read;
    }
    return buffer.subarray(0, offset);
  } finally {
    fs.closeSync(fd);
  }
}

export function listDirectorySafe(absolute) {
  if (hasUnsafeReparse(absolute)) return null;
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) return null;
  try {
    return fs.readdirSync(absolute, { withFileTypes: true });
  } catch {
    return null;
  }
}
