import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { Readable, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Minimal, deterministic tar.gz writer.
 *
 * A recovery pack has to carry ~200 packages that already exist on disk, so the
 * packer streams one package at a time instead of holding the archive in memory.
 * Only the subset of tar that a package tree needs is emitted: regular files,
 * directories, and symlinks. Paths that ustar cannot express (over 100 bytes in
 * the name field, or over 155 in the prefix) get a pax `x` extended header, so
 * long paths are preserved instead of dropped.
 */

const BLOCK = 512;
const NAME_MAX = 100;
const PREFIX_MAX = 155;
const CHUNK = 1024 * 1024;
const PAX_NAME = '././@PaxHeader';

function octal(value, length) {
  const text = Math.max(0, Math.floor(value)).toString(8);
  return `${text.padStart(length - 1, '0')}\0`;
}

function splitName(name) {
  if (Buffer.byteLength(name, 'utf8') <= NAME_MAX) return { prefix: '', name };
  for (let index = name.lastIndexOf('/'); index > 0; index = name.lastIndexOf('/', index - 1)) {
    const prefix = name.slice(0, index);
    const rest = name.slice(index + 1);
    if (rest && Buffer.byteLength(rest, 'utf8') <= NAME_MAX && Buffer.byteLength(prefix, 'utf8') <= PREFIX_MAX) {
      return { prefix, name: rest };
    }
  }
  return null;
}

/** Trim a utf8 string to at most maxBytes without cutting a multibyte character. */
function trimUtf8(text, maxBytes) {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) return text;
  let start = buffer.length - maxBytes;
  while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) start += 1;
  return buffer.subarray(start).toString('utf8');
}

function writeHeader({ name, prefix = '', mode, size, mtime, type, linkname }) {
  const block = Buffer.alloc(BLOCK, 0);
  block.write(name, 0, NAME_MAX, 'utf8');
  block.write(octal(mode, 8), 100, 8, 'latin1');
  block.write(octal(0, 8), 108, 8, 'latin1');
  block.write(octal(0, 8), 116, 8, 'latin1');
  block.write(octal(size, 12), 124, 12, 'latin1');
  block.write(octal(mtime, 12), 136, 12, 'latin1');
  block.write('        ', 148, 8, 'latin1');
  block.write(type, 156, 1, 'latin1');
  if (linkname) block.write(trimUtf8(linkname, NAME_MAX - 1), 157, NAME_MAX, 'utf8');
  block.write('ustar\0', 257, 6, 'latin1');
  block.write('00', 263, 2, 'latin1');
  if (prefix) block.write(prefix, 345, PREFIX_MAX, 'utf8');
  let checksum = 0;
  for (const byte of block) checksum += byte;
  block.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'latin1');
  return block;
}

function padToBlock(buffer) {
  const padding = (BLOCK - (buffer.length % BLOCK)) % BLOCK;
  return padding > 0 ? Buffer.concat([buffer, Buffer.alloc(padding, 0)]) : buffer;
}

/**
 * One pax extended-header record: "<length> <key>=<value>\n", where length counts
 * its own digits, the space, and the trailing newline. bsdtar validates this and
 * aborts extraction when it is wrong, so the total is solved by fixed point.
 */
function paxRecord(key, value) {
  const body = Buffer.from(`${key}=${value}\n`, 'utf8');
  let digits = 1;
  let total = body.length + digits + 1;
  for (;;) {
    const next = String(total).length;
    if (next === digits) break;
    digits = next;
    total = body.length + digits + 1;
  }
  return Buffer.concat([Buffer.from(`${total} `, 'latin1'), body]);
}

/**
 * Header blocks for one entry. A path ustar cannot hold is carried in a pax
 * extended header (`type 'x'`) that the extractor applies to the next entry; the
 * entry's own name field then only needs a readable placeholder.
 */
function headerBlocks(entry) {
  const split = splitName(entry.name);
  if (split) {
    return [writeHeader({ ...entry, name: split.name, prefix: split.prefix })];
  }
  const records = [paxRecord('path', entry.name)];
  if (entry.linkname && Buffer.byteLength(entry.linkname, 'utf8') > NAME_MAX) {
    records.push(paxRecord('linkpath', entry.linkname));
  }
  const body = Buffer.concat(records);
  return [
    writeHeader({ name: PAX_NAME, mode: 0o644, size: body.length, mtime: entry.mtime, type: 'x' }),
    padToBlock(body),
    writeHeader({ ...entry, name: trimUtf8(entry.name, NAME_MAX), prefix: '' }),
  ];
}

function* walk(root, relative, options, skipped) {
  const items = fs.readdirSync(path.join(root, relative), { withFileTypes: true });
  items.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const item of items) {
    const rel = relative ? `${relative}/${item.name}` : item.name;
    const abs = path.join(root, rel);
    if (options.shouldSkip?.(rel, item) === true) continue;
    const stat = fs.lstatSync(abs);
    if (stat.isSymbolicLink()) {
      yield { name: rel, type: '2', size: 0, mode: 0o777, mtime: stat.mtimeMs, linkname: fs.readlinkSync(abs) };
      continue;
    }
    if (stat.isDirectory()) {
      yield { name: `${rel}/`, type: '5', size: 0, mode: 0o755, mtime: stat.mtimeMs };
      yield* walk(root, rel, options, skipped);
      continue;
    }
    if (!stat.isFile()) {
      skipped.push({ path: rel, reason: 'UNSUPPORTED_TYPE' });
      continue;
    }
    if (options.maxFileBytes && stat.size > options.maxFileBytes) {
      skipped.push({ path: rel, bytes: stat.size, reason: 'TOO_LARGE' });
      continue;
    }
    yield { name: rel, type: '0', size: stat.size, mode: 0o644, mtime: stat.mtimeMs, source: abs };
  }
}

async function* readFile(abs, size) {
  const handle = await fs.promises.open(abs, 'r');
  try {
    const buffer = Buffer.allocUnsafe(CHUNK);
    let remaining = size;
    while (remaining > 0) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(CHUNK, remaining), null);
      if (bytesRead <= 0) break;
      remaining -= bytesRead;
      yield Buffer.from(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
}

async function* archiveBody(sourceDir, options, skipped) {
  for (const entry of walk(sourceDir, '', options, skipped)) {
    for (const block of headerBlocks(entry)) yield block;
    if (entry.type !== '0') continue;
    let produced = 0;
    for await (const chunk of readFile(entry.source, entry.size)) {
      produced += chunk.length;
      yield chunk;
    }
    if (produced !== entry.size) throw new Error(`File changed while packing: ${entry.name}`);
    const padding = (BLOCK - (entry.size % BLOCK)) % BLOCK;
    if (padding > 0) yield Buffer.alloc(padding, 0);
  }
  yield Buffer.alloc(BLOCK * 2, 0);
}

export async function packToTgz(sourceDir, outPath, options = {}) {
  const skipped = [];
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const tap = new PassThrough();
  tap.on('data', (chunk) => {
    hash.update(chunk);
    bytes += chunk.length;
  });
  const gzip = zlib.createGzip({ level: options.level ?? 6 });
  const out = fs.createWriteStream(outPath, { flags: 'wx' });
  let created = false;
  out.once('open', () => { created = true; });
  try {
    await pipeline(
      Readable.from(archiveBody(sourceDir, options, skipped)),
      gzip,
      tap,
      out,
    );
  } catch (error) {
    // Only remove the file opened by this invocation; EEXIST belongs to the caller.
    if (created) {
      try { await fs.promises.unlink(outPath); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') throw new AggregateError([error, cleanupError], 'Archive failed and temporary output cleanup failed');
      }
    }
    throw error;
  }
  return { path: outPath, bytes, sha256: hash.digest('hex'), skipped };
}
