import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { holdGuard } from './task-guard.js';

const { noLinks } = createRequire(import.meta.url)('../assets/recovery-core.cjs');
const DAY = 24 * 60 * 60 * 1000;

export async function pruneRetiredTasks(home, now = Date.now()) {
  if (process.platform !== 'win32') return 0;
  const homeDir = path.resolve(home);
  const root = path.join(homeDir, '.packer-cold');
  let guard;
  try {
    noLinks(root);
    if (!fs.lstatSync(root).isDirectory()) return 0;
    noLinks(path.join(root, 'active.lock'));
    if (fs.existsSync(path.join(root, 'active.lock'))) return 0;
    guard = await holdGuard(path.join(root, 'operation.guard'), true);
    const result = await guard.request({ operation: 'prune-retired', home: homeDir, now });
    return result.removed;
  } catch {
    // Unsupported, busy, unreadable or concurrently changed: retry next check.
    return 0;
  } finally {
    await guard?.release();
  }
}

export function startColdRetention(home) {
  let running = false, stopped = false;
  const check = async () => {
    if (running || stopped) return;
    running = true;
    try { await pruneRetiredTasks(home); } catch { /* best effort */ }
    finally { running = false; }
  };
  queueMicrotask(check);
  const interval = setInterval(check, DAY).unref();
  return () => { stopped = true; clearInterval(interval); };
}
