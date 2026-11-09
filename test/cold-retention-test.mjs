import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { holdGuard, operationGuard } from '../lib/task-guard.js';
import { pruneRetiredTasks, startColdRetention } from '../lib/cold-retention.js';
import { readUiOverview } from '../lib/ui-overview.js';

assert(process.env.DSH_PACKER_TEST_ROOT, 'Set an isolated test directory');
const home = fs.mkdtempSync(path.join(process.env.DSH_PACKER_TEST_ROOT, 'retention-'));
const root = path.join(home, '.packer-cold');
fs.mkdirSync(root);
const day = 86_400_000, now = Date.now(), zip = path.join(home, 'kept.zip');
fs.writeFileSync(zip, 'synthetic archive sentinel');
const gonePid = 2147483647;
const json = (dir, name, record) => fs.writeFileSync(path.join(dir, name), JSON.stringify(record));

function task(age, makeChanges = () => {}, phase = 'failed') {
  const id = crypto.randomBytes(16).toString('hex'), dir = path.join(root, id), at = now - age * day;
  fs.mkdirSync(dir);
  json(dir, 'job.json', { id, schema:1, lockProtocol:2, confirmPrivate:true, homeDir:home, target:zip });
  const terminal = { id, target:zip, phase, at, ...(phase==='success' ? {verified:true,cleanup:true,sha256:'a'.repeat(64)} : {error:'BACKUP_ABORTED'}) };
  for (const name of ['terminal.json','status.json']) json(dir, name, terminal);
  if (phase==='success') json(dir, 'committed.json', { id, path:zip, verified:true, sha256:terminal.sha256 });
  for (const name of ['ui-owner.json','coordinator-owner.json']) json(dir, name, { pid:gonePid, born:'639000000000000000' });
  for (const [name, value] of [['released.lock',id],['task.guard',''],['runtime.stdout.log','synthetic trace']]) fs.writeFileSync(path.join(dir,name),value);
  fs.mkdirSync(path.join(dir,'tmp'));
  makeChanges(dir, id, terminal);
  for (const name of fs.readdirSync(dir)) fs.lutimesSync(path.join(dir,name), new Date(at), new Date(at));
  return { id, dir };
}

const recent = task(9), boundary = task(10), expired = task(11, undefined, 'success');
const interrupted = task(11, (dir,id) => json(dir,'recovered.json',{id,phase:'interrupted'}));
const incompleteBackup = task(11, (dir,id) => json(dir,'lease-request.private.json',{id,files:[]}));
const missing = task(11, dir => fs.unlinkSync(path.join(dir,'released.lock')));
const corrupt = task(11, dir => fs.writeFileSync(path.join(dir,'terminal.json'),'{'));
const wrong = task(11, dir => fs.writeFileSync(path.join(dir,'released.lock'),'b'.repeat(32)));
const wrongType = task(11, (dir,_id,t) => json(dir,'terminal.json',{...t,id:true}));
const unknown = task(11, dir => fs.writeFileSync(path.join(dir,'partial.zip'),'unresolved'));
const occupied = task(11, dir => fs.writeFileSync(path.join(dir,'tmp','unproven.txt'),'retain'));
const linked = task(11, dir => fs.symlinkSync(home,path.join(dir,'link'),'junction'));
const linkedTmp = task(11, dir => {
  fs.rmdirSync(path.join(dir,'tmp')); fs.symlinkSync(home,path.join(dir,'tmp'),'junction');
});
const hardlink = task(11, dir => {
  fs.unlinkSync(path.join(dir,'runtime.stdout.log')); fs.linkSync(zip,path.join(dir,'runtime.stdout.log'));
});
const unavailable = task(11, dir => fs.chmodSync(path.join(dir,'runtime.stdout.log'),0o444));
const active = task(11);
const malformedSeal = task(11, dir => fs.writeFileSync(path.join(dir,'retention-v1.json'),'{'));
const liveRecord = task(11, (dir,id,t) => json(dir,'ui-result.json',{id,phase:t.phase,outcome:'unknown'}));
const outputProtected = [interrupted,incompleteBackup,missing,corrupt,wrong,wrongType,unknown,occupied,linked,linkedTmp,hardlink,malformedSeal,liveRecord];

fs.writeFileSync(path.join(root,'active.lock'),active.id);
assert.equal(await pruneRetiredTasks(home,now),0);
fs.unlinkSync(path.join(root,'active.lock'));
const op = await operationGuard(root);
try { assert.equal(await pruneRetiredTasks(home,now),0); }
finally { await op.release(); }
const lease = await holdGuard(path.join(active.dir,'task.guard'));
try {
  assert.equal(await pruneRetiredTasks(home,now),2);
  for (const t of [recent,active,unavailable,...outputProtected]) assert(fs.existsSync(t.dir),t.id);
  for (const t of [boundary,expired]) assert(!fs.existsSync(t.dir),t.id);
  assert.equal(await pruneRetiredTasks(home,now),0);
} finally { await lease.release(); }

// Unlock a previously denied file without changing its retained age.
const readOnlyFile = path.join(unavailable.dir,'runtime.stdout.log');
fs.chmodSync(readOnlyFile,0o666);
fs.utimesSync(readOnlyFile,new Date(now-11*day),new Date(now-11*day));
const run = `import {pruneRetiredTasks} from ${JSON.stringify(new URL('../lib/cold-retention.js',import.meta.url).href)};console.log(await pruneRetiredTasks(${JSON.stringify(home)},${now+day}));`;
const restarted = spawn(process.execPath,['--input-type=module','-e',run],{windowsHide:true,stdio:['ignore','pipe','inherit']});
let count=''; restarted.stdout.on('data',chunk=>count+=chunk);
assert.equal((await once(restarted,'exit'))[0],0);
assert.equal(Number(count),3);
for (const t of [recent,active,unavailable]) assert(!fs.existsSync(t.dir),t.id);
for (const t of outputProtected) assert(fs.existsSync(t.dir),t.id);
assert.equal(fs.readFileSync(zip,'utf8'),'synthetic archive sentinel');
assert(!readUiOverview(home).history.some(t=>[expired.id,boundary.id,recent.id].includes(t.id)));

const outside = fs.mkdtempSync(path.join(process.env.DSH_PACKER_TEST_ROOT,'retention-linked-home-'));
fs.symlinkSync(root,path.join(outside,'.packer-cold'),'junction');
assert.equal(await pruneRetiredTasks(outside,now+day),0);
assert(fs.existsSync(wrong.dir));

const originalSetInterval=globalThis.setInterval, originalClearInterval=globalThis.clearInterval;
const startup=task(11), timer={unref(){return this;}};
let tick,cleared=false,stop;
try {
  globalThis.setInterval=(callback,ms)=>{assert.equal(ms,day);tick=callback;return timer;};
  globalThis.clearInterval=value=>{assert.equal(value,timer);cleared=true;};
  stop=startColdRetention(home);
  for(let i=0;i<100&&fs.existsSync(startup.dir);i++)await sleep(50);
  assert(!fs.existsSync(startup.dir),'startup must check once');
  const daily=task(11);
  // The directory may disappear before the startup bridge has released its lock.
  for(let i=0;i<20&&fs.existsSync(daily.dir);i++){await tick();await sleep(50);}
  assert(!fs.existsSync(daily.dir),'daily check must prune expired tasks');
  stop();assert(cleared);
  const afterStop=task(11);await tick();assert(fs.existsSync(afterStop.dir));
} finally {if(!cleared)stop?.();globalThis.setInterval=originalSetInterval;globalThis.clearInterval=originalClearInterval;}
console.log('PASS: 9/10/11 days, startup/24h/dispose, restart, active lock, competing sweep, task lease, interrupted/corrupt/mismatched state, read-only failure and retry, junctions, hard links, ZIP protection and refreshed history');
