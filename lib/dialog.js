import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function sanitizeDefaultName(value) {
  const base = path.basename(String(value || 'dsh-environment.zip')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_');
  const withExtension = base.toLowerCase().endsWith('.zip') ? base : `${base}.zip`;
  return withExtension.slice(0, 180);
}

function powershellPath() {
  const root = process.env.SystemRoot || 'C:\\Windows';
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/**
 * Failures carry a stable code plus the underlying text, so the Host can
 * surface "the dialog failed: <real reason>" instead of a generic error.
 * 160 characters matches the limit the HTTP layer keeps in `details`.
 */
function dialogFailure(code, message, detail) {
  const error = new Error(message);
  error.code = code;
  const text = typeof detail === 'string' ? detail.replace(/\s+/g, ' ').trim() : '';
  if (text) error.details = [text.slice(0, 160)];
  return error;
}

function lastLine(stdout) {
  return stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1) ?? '';
}

function decodePath(line) {
  return Buffer.from(line, 'base64').toString('utf8').trim();
}

export function parseDialogOutput(stdout) {
  const line = lastLine(stdout);
  if (!line) return null;
  const decoded = decodePath(line);
  if (!path.isAbsolute(decoded)) throw new Error('Native Save As returned a non-absolute path');
  if (path.extname(decoded).toLowerCase() !== '.zip') throw new Error('Native Save As path must end with .zip');
  return decoded;
}

export function parseFolderOutput(stdout) {
  const line = lastLine(stdout);
  if (!line) return null;
  const decoded = decodePath(line);
  if (!path.isAbsolute(decoded)) throw new Error('Native folder picker returned a non-absolute path');
  return decoded;
}

/**
 * Spawn a WinForms picker script and return its raw stdout.
 *
 * -NonInteractive is deliberately absent: these scripts never prompt, and a
 * non-interactive host mode is one of the things that can interfere with a
 * modal WinForms dialog raised from a background Host process.
 */
function runDialogScript({ scriptName, args, timeoutMs, signal, codePrefix }) {
  if (process.platform !== 'win32') {
    return Promise.reject(dialogFailure(`${codePrefix}_UNAVAILABLE`, 'Native dialogs are only available on Windows'));
  }
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(new URL(`../bin/${scriptName}`, import.meta.url));
    const child = spawn(powershellPath(), [
      '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass',
      '-File', script, ...args,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    const stopChild = () => {
      try { child.kill(); } catch { /* best effort */ }
    };
    const timer = setTimeout(() => {
      stopChild();
      settle(dialogFailure(`${codePrefix}_TIMEOUT`, 'Native dialog timed out'));
    }, Number.isFinite(timeoutMs) ? timeoutMs : 10 * 60 * 1000);
    const onAbort = () => {
      stopChild();
      settle(null, null);
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      const detail = [error?.code, error?.message].filter((part) => typeof part === 'string' && part).join(' ');
      settle(dialogFailure(`${codePrefix}_FAILED`, 'Native dialog could not be started', detail));
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        const detail = stderr.trim() || `powershell.exe exited with code ${String(code)}`;
        settle(dialogFailure(`${codePrefix}_FAILED`, 'Native dialog failed', detail));
        return;
      }
      settle(null, stdout);
    });
  });
}

export function chooseSavePath(options = {}) {
  return runDialogScript({
    scriptName: 'save-as.ps1',
    args: ['-DefaultName', sanitizeDefaultName(options.defaultName)],
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    codePrefix: 'SAVE_DIALOG',
  }).then((stdout) => {
    try {
      return parseDialogOutput(stdout);
    } catch (error) {
      throw dialogFailure('SAVE_DIALOG_BAD_OUTPUT', 'Native Save As returned an unusable path', error?.message);
    }
  });
}

export function confirmColdBackup(options = {}) {
  return runDialogScript({scriptName:'confirm-cold.ps1',args:[],timeoutMs:options.timeoutMs,signal:options.signal,codePrefix:'COLD_CONFIRM'})
    .then(stdout => lastLine(stdout || '') === 'YES');
}

/** Only returns a path; writing anything stays the caller's decision. */
export function chooseDirectory(options = {}) {
  const initial = typeof options.initialDirectory === 'string' ? options.initialDirectory.trim() : '';
  return runDialogScript({
    scriptName: 'pick-folder.ps1',
    args: ['-InitialDirectory', initial],
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    codePrefix: 'DIRECTORY_DIALOG',
  }).then((stdout) => {
    try {
      return parseFolderOutput(stdout);
    } catch (error) {
      throw dialogFailure('DIRECTORY_DIALOG_BAD_OUTPUT', 'Native folder picker returned an unusable path', error?.message);
    }
  });
}
