import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {holdGuard,prepareGuard,recoverColdTask,releaseTaskLock,assertTaskOwner,operationGuard} from '../lib/task-guard.js';
import {writeRecord,readRecord} from '../lib/cold-task.js';
import {createPrivateBackup} from '../lib/private-backup.js';
const C=createRequire(import.meta.url)('../assets/recovery-core.cjs');
const base=path.resolve(process.env.TEMP,'cold-recovery-'+crypto.randomBytes(5).toString('hex'));
fs.mkdirSync(base,{recursive:true});
const results=[];
async function test(name,fn){await fn();results.push(name);console.log('PASS '+name);}
function fixture(){
  const homeDir=path.join(base,crypto.randomBytes(5).toString('hex')),id=crypto.randomBytes(16).toString('hex'),root=path.join(homeDir,'.packer-cold'),dir=path.join(root,id);
  fs.mkdirSync(dir,{recursive:true});const job={id,homeDir,lockProtocol:2};writeRecord(path.join(dir,'job.json'),job);fs.writeFileSync(path.join(root,'active.lock'),id);prepareGuard(path.join(dir,'task.guard'));
  return {homeDir,id,root,dir,job};
}
await test('live kernel lease refuses recovery even with no PID record',async()=>{
  const f=fixture(),g=await holdGuard(path.join(f.dir,'task.guard'));
  try{await assert.rejects(recoverColdTask(f.homeDir),{code:'COLD_TASK_RUNNING_OR_UNPROVEN'});assert.equal(fs.readFileSync(path.join(f.root,'active.lock'),'utf8'),f.id);}finally{await g.release();}
});
await test('active exact PID+birth refuses recovery even after lease loss',async()=>{
  const f=fixture(),g=await holdGuard(path.join(f.dir,'task.guard'));writeRecord(path.join(f.dir,'coordinator-owner.json'),g.record);await g.release();
  await assert.rejects(recoverColdTask(f.homeDir),{code:'COLD_TASK_RUNNING_OR_UNPROVEN'});
});
await test('PID reuse: different birth is not the former owner; never signals reused process',async()=>{
  const f=fixture();writeRecord(path.join(f.dir,'coordinator-owner.json'),{pid:process.pid,born:'1'});
  assert.equal((await recoverColdTask(f.homeDir)).code,'COLD_RECOVERED');assert.equal(process.kill(process.pid,0),true);
});
await test('crash releases kernel lease via pipe EOF, retained token can recover',async()=>{
  const f=fixture();const source=`import {holdGuard} from ${JSON.stringify(new URL('../lib/task-guard.js',import.meta.url).href)};await holdGuard(${JSON.stringify(path.join(f.dir,'task.guard'))});console.log('HELD');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  const closed=once(child,'exit');await once(child.stdout,'data');child.kill();await closed;
  // The helper may still be disposing its handle; retry boundedly without modifying evidence.
  let r;for(let i=0;i<20;i++){try{r=await recoverColdTask(f.homeDir);break;}catch(e){if(e.code!=='COLD_TASK_RUNNING_OR_UNPROVEN')throw e;await new Promise(r=>setTimeout(r,100));}}
  assert.equal(r?.code,'COLD_RECOVERED');assert.equal(fs.readFileSync(path.join(f.dir,'recovered.lock'),'utf8'),f.id);
});
await test('two simultaneous recoveries have one retirement and a safe busy/no-task result',async()=>{
  const f=fixture();const r=await Promise.allSettled([recoverColdTask(f.homeDir),recoverColdTask(f.homeDir)]);
  assert.equal(r.filter(x=>x.status==='fulfilled'&&x.value.code==='COLD_RECOVERED').length,1);
  assert(r.every(x=>x.status==='fulfilled'||x.reason.code==='COLD_OPERATION_BUSY'));
});
await test('corrupt lock and legacy protocol fail closed',async()=>{
  const f=fixture();fs.writeFileSync(path.join(f.root,'active.lock'),'../bad');await assert.rejects(recoverColdTask(f.homeDir),{code:'COLD_STATE_CORRUPT'});
  fs.writeFileSync(path.join(f.root,'active.lock'),f.id);writeRecord(path.join(f.dir,'job.json'),{id:f.id,homeDir:f.homeDir});await assert.rejects(recoverColdTask(f.homeDir),{code:'COLD_STATE_CORRUPT'});
});
await test('damaged job/owner/missing guard evidence refuses recovery',async()=>{
  for(const kind of ['job','owner','guard']){const f=fixture();if(kind==='job')fs.writeFileSync(path.join(f.dir,'job.json'),'{');if(kind==='owner')fs.writeFileSync(path.join(f.dir,'ui-owner.json'),'{');if(kind==='guard')fs.renameSync(path.join(f.dir,'task.guard'),path.join(f.dir,'original.guard'));await assert.rejects(recoverColdTask(f.homeDir));assert(fs.existsSync(path.join(f.root,'active.lock')));}
});
await test('late launcher observes tombstone; all diagnostics and partial ZIP remain',async()=>{
  const f=fixture();fs.writeFileSync(path.join(f.dir,'runtime.stderr.log'),'synthetic crash');const zip=path.join(f.homeDir,'partial.zip');fs.writeFileSync(zip,'partial');
  await recoverColdTask(f.homeDir);assert.throws(()=>assertTaskOwner(f.dir,f.job));assert.equal(fs.readFileSync(zip,'utf8'),'partial');assert.equal(fs.readFileSync(path.join(f.dir,'runtime.stderr.log'),'utf8'),'synthetic crash');
});
await test('normal owner cleanup retires only its own token; wrong owner cannot release',async()=>{
  const f=fixture();await assert.rejects(releaseTaskLock(f.dir,{...f.job,id:'0'.repeat(32)}));assert(fs.existsSync(path.join(f.root,'active.lock')));await releaseTaskLock(f.dir,f.job);assert(fs.existsSync(path.join(f.dir,'released.lock')));
});
await test('normal failure cleanup retries a concurrent recovery operation without leaking its token',async()=>{
  const f=fixture(),g=await operationGuard(f.root);const released=releaseTaskLock(f.dir,f.job);await new Promise(r=>setTimeout(r,300));await g.release();await released;assert(fs.existsSync(path.join(f.dir,'released.lock')));
});
await test('a stale legacy UI confirmation cannot retire a different new-protocol task',async()=>{
  const f=fixture();await assert.rejects(recoverColdTask(f.homeDir,{confirmLegacyTaskId:'0'.repeat(32)}),{code:'COLD_STATE_CHANGED'});assert.equal(fs.readFileSync(path.join(f.root,'active.lock'),'utf8'),f.id);
});
await test('unexpected guard bridge loss is observed and does not silently retire a live parent owner',async()=>{
  const f=fixture(),g=await holdGuard(path.join(f.dir,'task.guard'));writeRecord(path.join(f.dir,'coordinator-owner.json'),g.record);process.kill(g.record.bridgePid);await new Promise(r=>setTimeout(r,200));assert.throws(()=>g.assertHeld(),{code:'TASK_GUARD_LOST'});await g.release();await assert.rejects(recoverColdTask(f.homeDir),{code:'COLD_TASK_RUNNING_OR_UNPROVEN'});
});
await test('status replacement retries a transient Windows read lease and fails boundedly for persistent locks',async()=>{
  const file=path.join(base,'status.json');writeRecord(file,{a:1});const g=await holdGuard(file);
  const started=Date.now();assert.throws(()=>writeRecord(file,{a:2}));assert(Date.now()-started>=1900);assert.equal(readRecord(file).a,1);await g.release();writeRecord(file,{a:3});assert.equal(readRecord(file).a,3);
});
await test('ZIP success; commit reporting failure preserves a verified ZIP and refuses overwrite',async()=>{
  const homeDir=path.join(base,'backup-home'),profileDir=path.join(homeDir,'profiles','synthetic');fs.mkdirSync(profileDir,{recursive:true});fs.writeFileSync(path.join(profileDir,'package.json'),'{"name":"synthetic","dependencies":{}}');fs.writeFileSync(path.join(profileDir,'data.txt'),'SYNTHETIC_ONLY');
  const opts={homeDir,profileDir,dshVersion:'0.2.1-rc.3',confirmPrivate:true,sourceQuiescent:true,preserveFailureArtifacts:true};
  const target=path.join(base,'success.zip'),r=createPrivateBackup({...opts,target});assert(r.cleanup.tempRemoved);const z=C.openZip(target);try{C.validateManifest(z);}finally{z.close();}
  const committed=path.join(base,'unconfirmed.zip');assert.throws(()=>createPrivateBackup({...opts,target:committed,onCommitted(){throw Object.assign(new Error(),{code:'STATUS_WRITE_FAILED'});}}),{code:'STATUS_WRITE_FAILED'});assert(fs.existsSync(committed));const u=C.openZip(committed);try{C.validateManifest(u);}finally{u.close();}
  assert.throws(()=>createPrivateBackup({...opts,target:committed}),{code:'TARGET_EXISTS'});
  assert.throws(()=>createPrivateBackup({...opts,target:path.join(base,'unconfirmed-gates.zip'),sourceQuiescent:false}),{code:'QUIESCENT_CONFIRMATION_REQUIRED'});
});
fs.writeFileSync(path.resolve('../evidence/cold-recovery-results.json'),JSON.stringify({passed:results.length,results,base},null,2));
