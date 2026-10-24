import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inspectTarget } from './write.js';
const C = createRequire(import.meta.url)('../assets/recovery-core.cjs');
export const fail = code => { throw Object.assign(new Error(code), { code }); };
export const powershell = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
export const scriptPath = name => fileURLToPath(new URL('../bin/' + name, import.meta.url));
export function privateEnvironment() {
  const env = {};
  for (const key of ['SystemRoot','WINDIR','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','USERNAME','USERDOMAIN','COMSPEC','TEMP','TMP']) {
    const value = Object.entries(process.env).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
    if (value) env[key] = value;
  }
  return env;
}
export function writeRecord(file, record) {
  C.noLinks(file);
  const temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(record), { flag:'wx', mode:0o600 });
    // Task directories already have a protected, inheritable current-user ACL.
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export function readRecord(file) { C.noLinks(file); return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')); }
export function validateJob(job) {
  if (job.schema !== 1 || !/^[a-f0-9]{32}$/.test(job.id) || job.confirmPrivate !== true || job.confirmExternal !== true) fail('INVALID_COLD_TASK');
  for (const key of ['homeDir','profileDir','target','runtime']) {
    if (typeof job[key] !== 'string' || !path.isAbsolute(job[key])) fail('INVALID_COLD_TASK');
    C.noLinks(job[key]);
  }
  const relative = path.relative(path.join(job.homeDir,'profiles'), job.profileDir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) fail('PROFILE_OUTSIDE_HOME');
  if (!fs.statSync(path.join(job.profileDir,'package.json')).isFile()) fail('PROFILE_UNRESOLVED');
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(job.dshVersion)) fail('DSH_VERSION_REQUIRED');
  if (!Number.isSafeInteger(job.hostPid) || job.hostPid < 1) fail('INVALID_COLD_TASK');
  if (!Number.isInteger(job.waitMs) || job.waitMs < 1000 || job.waitMs > 30*60*1000) fail('INVALID_COLD_TASK');
  const info = inspectTarget(job.target);
  C.safeName(info.base);
  if (path.extname(info.target).toLowerCase() !== '.zip') fail('TARGET_MUST_BE_ZIP');
  if (info.exists) fail('TARGET_EXISTS');
  if (!path.relative(job.homeDir,info.target).startsWith('..')) fail('TARGET_INSIDE_SOURCE');
  return info;
}
// stdout contains only identities for relevant writers, never their command line.
export function processSnapshot(job, excludePids = [], trackedPids = []) {
  const args = ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptPath('cold-processes.ps1'),
    '-HomePath',job.homeDir,'-RuntimePath',job.runtime,'-ExcludePids',excludePids.join(','),'-TrackedPids',trackedPids.join(',')];
  const r = spawnSync(powershell(),args,{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024,env:privateEnvironment()});
  if (r.status !== 0 || r.error) fail('WRITER_QUERY_FAILED');
  let result;
  try { result = JSON.parse(r.stdout.replace(/^\uFEFF/,'')); } catch { fail('WRITER_QUERY_FAILED'); }
  if (!Array.isArray(result.writers) || result.uncertain === true) fail('WRITER_QUERY_FAILED');
  return result.writers;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
export async function startColdTask(options) {
  if (process.platform !== 'win32') fail('COLD_WINDOWS_REQUIRED');
  const job = {schema:1,id:crypto.randomBytes(16).toString('hex'),homeDir:path.resolve(options.homeDir),profileDir:path.resolve(options.profileDir),
    target:options.target,runtime:process.execPath,dshVersion:options.dshVersion,hostPid:process.pid,confirmPrivate:true,
    confirmExternal:options.confirmExternal === true,waitMs:options.waitMs ?? 10*60*1000};
  validateJob(job);
  const root = path.join(job.homeDir,'.packer-cold');
  C.noLinks(root);
  if (!fs.existsSync(root)) { fs.mkdirSync(root); C.privateAccess(root,true); }
  else { if (!fs.statSync(root).isDirectory()) fail('TASK_PATH_UNSAFE'); C.privateAccess(root,true); }
  const lock = path.join(root,'active.lock');
  let fd;
  try { fd = fs.openSync(lock,'wx',0o600); } catch(e) { if(e.code==='EEXIST') fail('COLD_TASK_ACTIVE'); throw e; }
  let dir, child;
  try {
    fs.writeFileSync(fd,job.id); fs.closeSync(fd); fd = undefined;
    dir = path.join(root,job.id); fs.mkdirSync(dir); C.privateAccess(dir,true);
    fs.mkdirSync(path.join(dir,'tmp'));
    fs.writeFileSync(path.join(dir,'job.json'),JSON.stringify(job),{flag:'wx',mode:0o600});
    // Short-lived bootstrap uses Windows Start-Process for the independent UI.
    // Windows PowerShell 5.1 can silently exit with libuv DETACHED_PROCESS, so
    // do not directly spawn it with detached:true. There are no inherited pipes/IPC.
    child = spawn(powershell(),['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',scriptPath('start-cold.ps1'),'-TaskDirectory',dir],
      {windowsHide:true,stdio:'ignore',env:{...privateEnvironment(),TEMP:path.join(dir,'tmp'),TMP:path.join(dir,'tmp')},cwd:path.dirname(scriptPath('cold-window.ps1'))});
    let launchError;
    child.on('error',e => { launchError = /^[A-Z0-9_]+$/.test(e.code||'')?e.code:'FAILED'; }); child.unref();
    const until = Date.now()+20000;
    while (Date.now()<until) {
      if (launchError) fail('ASSISTANT_SPAWN_'+launchError);
      if (child.exitCode !== null && child.exitCode !== 0) fail('ASSISTANT_START_FAILED');
      if (fs.existsSync(path.join(dir,'ready.json'))) {
        const ready = readRecord(path.join(dir,'ready.json'));
        const launched = readRecord(path.join(dir,'launched.json'));
        if (ready.id !== job.id || launched.id !== job.id || ready.phase !== 'waiting' || ready.uiPid !== launched.uiPid) fail('ASSISTANT_BAD_HANDOFF');
        // Parent acknowledges only a live, initialized worker and visible independent window.
        process.kill(ready.workerPid,0); process.kill(ready.uiPid,0);
        writeRecord(path.join(dir,'accepted.json'),{id:job.id});
        return {taskId:job.id,manualQuitRequired:true};
      }
      await sleep(150);
    }
    fail('ASSISTANT_HANDOFF_TIMEOUT');
  } catch(e) {
    if (fd !== undefined) fs.closeSync(fd);
    // A late-starting assistant must see abort, never interpret host death as consent.
    if (dir) fs.writeFileSync(path.join(dir,'cancel'),'',{flag:'a'});
    if (fs.existsSync(lock) && fs.readFileSync(lock,'utf8') === job.id) fs.unlinkSync(lock);
    throw e;
  }
}
