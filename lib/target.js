import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Target-path selection that does not depend on any UI.
 *
 * The previous round resolved the destination through a WinForms Save As
 * dialog spawned from the Host process. When that dialog cannot be shown, the
 * HTTP handler has nothing to fall back on and the whole export fails with an
 * opaque error. This module makes the destination an ordinary request field so
 * the export works without any native dialog, and keeps the dialog as an
 * optional convenience.
 */

export class TargetDirectoryError extends Error {
  constructor(code) {
    super(code);
    this.name = 'TargetDirectoryError';
    this.code = code;
  }
}

export function defaultName() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  return `dsh-environment-${stamp}.zip`;
}

/** Reduce any caller-supplied name to a single safe ZIP file name. */
export function safeDefaultName(value) {
  const base = typeof value === 'string'
    ? path.win32.basename(value.trim()).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
    : '';
  if (!base || base === '.' || base === '..') return defaultName();
  const withExtension = base.toLowerCase().endsWith('.zip') ? base : `${base}.zip`;
  return withExtension.slice(0, 120);
}

/** A destination directory the operator can actually write to. */
export function defaultDirectory() {
  const home = process.env.USERPROFILE || os.homedir();
  if (!home) return process.cwd();
  for (const name of ['Documents', '文档']) {
    const candidate = path.join(home, name);
    try {
      if (fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) return candidate;
    } catch { /* keep looking */ }
  }
  return home;
}

function normalizeDirectory(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new TargetDirectoryError('TARGET_DIRECTORY_REQUIRED');
  // A pasted Explorer path arrives quoted often enough to be worth unwrapping.
  const unwrapped = value.trim().replace(/^"(.*)"$/, '$1').trim();
  if (!path.isAbsolute(unwrapped)) throw new TargetDirectoryError('TARGET_DIRECTORY_NOT_ABSOLUTE');
  return path.resolve(unwrapped);
}

/**
 * Compose the final target path from a directory and a file name.
 *
 * Only existence/type is checked here; identity, reparse points and the
 * no-overwrite commit stay in inspectTarget/writeZipAtomic so the safety
 * properties are unchanged.
 */
export function resolveTarget({ directory, fileName } = {}) {
  return path.join(resolveDirectory(directory), safeDefaultName(fileName));
}

/** Validate a destination folder without composing a file path. */
export function resolveDirectory(directory) {
  const parent = normalizeDirectory(directory);
  const stat = fs.statSync(parent, { throwIfNoEntry: false });
  if (!stat) throw new TargetDirectoryError('TARGET_DIRECTORY_MISSING');
  if (!stat.isDirectory()) throw new TargetDirectoryError('TARGET_DIRECTORY_NOT_FOLDER');
  return parent;
}
