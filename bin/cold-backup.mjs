import fs from 'node:fs';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { createPrivateBackup } from '../lib/private-backup.js';
import { validateJob, processSnapshot, readRecord, writeRecord, fail } from '../lib/cold-task.js';
const C = createRequire(import.meta.url)('../assets/recovery-core.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
if (!isMainThread) {
  const {job,flag,uiPid} = workerData, bits = new Int32Array(flag);
  try {
    const dir=path.join(job.homeDir,'.packer-cold',job.id);
    const result = createPrivateBackup({...job,sourceQuiescent:true,signal:{get aborted(){return Atomics.load(bits,0)!==0;}},
      onInventory:files=>{
        writeRecord(path.join(dir,'lease-request.private.json'),{id:job.id,files});
        const deadline=Date.now()+60000;
        while(!fs.existsSync(path.join(dir,'lease-ready.json'))) {
          if(fs.existsSync(path.join(dir,'lease-failed.json'))) fail('SOURCE_NOT_QUIESCENT');
          if(Atomics.load(bits,0)!==0||fs.existsSync(path.join(dir,'cancel'))) fail('BACKUP_ABORTED');
          if(Date.now()>deadline) fail('SOURCE_LEASE_TIMEOUT');
          Atomics.wait(bits,0,0,100);
        }
        const lease=readRecord(path.join(dir,'lease-ready.json'));
        if(lease.id!==job.id||lease.files!==files.length||lease.uiPid!==uiPid) fail('SOURCE_LEASE_FAILED');
      },
      onPhase:phase=>parentPort.postMessage({phase}),onFile:files=>parentPort.postMessage({files}),
      beforeCommit:()=>{
        if(Atomics.load(bits,0)!==0||fs.existsSync(path.join(dir,'cancel'))) fail('BACKUP_ABORTED');
        try {process.kill(uiPid,0);} catch {fail('BACKUP_ABORTED');}
        if(processSnapshot(job,[process.pid,uiPid]).length) fail('WRITERS_RESTARTED');
      }});
    if (!result.cleanup.tempRemoved) fail('BACKUP_CLEANUP_FAILED');
    // Core already verified all entry names, CRCs, manifest and payload hashes before commit.
    parentPort.postMessage({done:true,files:result.files,bytes:result.bytes,sha256:result.sha256,verified:true,cleanup:true});
  } catch(e) { parentPort.postMessage({error:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'BACKUP_FAILED'}); }
} else {
  let dir,job,heartbeat,monitor,worker;
  try {
    if(process.argv.length!==4||process.argv[2]!=='--task') fail('INVALID_COLD_TASK');
    dir=path.resolve(process.argv[3]); C.noLinks(dir); job=readRecord(path.join(dir,'job.json')); validateJob(job);
    if(path.basename(dir)!==job.id||path.dirname(dir)!==path.join(job.homeDir,'.packer-cold')) fail('INVALID_COLD_TASK');
    const uiPid=Number(process.env.DSH_COLD_UI_PID); if(!Number.isInteger(uiPid)||uiPid<1) fail('INVALID_COLD_TASK');
    const lock=path.join(path.dirname(dir),'active.lock');
    if(fs.readFileSync(lock,'utf8')!==job.id) fail('TASK_LOCK_LOST');
    let phase='waiting',files=0,finished=false,writers=0,exitConfirmed=false,quitVerified=false;
    const status=extra=>writeRecord(path.join(dir,'status.json'),{id:job.id,phase,files,writers,exitConfirmed,quitVerified,at:Date.now(),...extra});
    const cancel=()=>fs.existsSync(path.join(dir,'cancel'));
    const uiAlive=()=>{try{process.kill(uiPid,0);return true;}catch{return false;}};
    let tracked=processSnapshot(job,[process.pid,uiPid]);
    writers=tracked.length;
    if(!tracked.some(p=>p.pid===job.hostPid)) fail('HOST_IDENTITY_UNCONFIRMED');
    status();
    writeRecord(path.join(dir,'worker-ready.json'),{id:job.id,pid:process.pid});
    const acceptedDeadline=Date.now()+25000;
    while(!fs.existsSync(path.join(dir,'accepted.json'))) {
      if(cancel()||!uiAlive()) fail('BACKUP_ABORTED');
      if(Date.now()>acceptedDeadline) fail('HANDOFF_NOT_ACCEPTED');
      await sleep(150);
    }
    if(readRecord(path.join(dir,'accepted.json')).id!==job.id) fail('INVALID_COLD_TASK');
    heartbeat=setInterval(()=>status(),1000);
    const deadline=Date.now()+job.waitMs;
    let quietSince=0;
    while(true) {
      if(cancel()||!uiAlive()) fail('BACKUP_ABORTED');
      const current=processSnapshot(job,[process.pid,uiPid],tracked.map(p=>p.pid));
      // PID+birth identity avoids treating PID reuse as proof that the old writer is alive.
      const alive=current.length>0||tracked.some(p=>{try{process.kill(p.pid,0);return !current.some(q=>q.pid===p.pid&&q.born!==p.born);}catch{return false;}});
      tracked=current;
      writers=current.length;
      if(fs.existsSync(path.join(dir,'exit-confirmed.json'))) {
        if(readRecord(path.join(dir,'exit-confirmed.json')).id!==job.id) fail('INVALID_COLD_TASK');
        exitConfirmed=true;
      }
      if(alive) quietSince=0; else if(!quietSince) quietSince=Date.now();
      status();
      if(exitConfirmed&&quietSince&&Date.now()-quietSince>=3000) break;
      if(Date.now()>deadline) fail('DSH_EXIT_TIMEOUT');
      await sleep(750);
    }
    quitVerified=true;phase='exit-verified';status();
    await sleep(800);
    if(cancel()||!uiAlive()) fail('BACKUP_ABORTED');
    if(processSnapshot(job,[process.pid,uiPid]).length) fail('WRITERS_RESTARTED');
    validateJob(job);
    const flag=new SharedArrayBuffer(4),bits=new Int32Array(flag);
    phase='scanning';status();
    worker=new Worker(new URL(import.meta.url),{workerData:{job,uiPid,flag}});
    let gateFailure;
    monitor=setInterval(()=>{
      try {
        if(cancel()||!uiAlive()) {gateFailure='BACKUP_ABORTED';Atomics.store(bits,0,1);}
        else if(processSnapshot(job,[process.pid,uiPid]).length) {gateFailure='WRITERS_RESTARTED';Atomics.store(bits,0,1);}
      } catch {gateFailure='WRITER_QUERY_FAILED';Atomics.store(bits,0,1);}
    },1200);
    await new Promise((resolve,reject)=>{
      worker.on('message',m=>{
        if(m.phase) phase=m.phase;
        if(m.files!==undefined) files=m.files;
        if(m.error) {finished=true;reject(Object.assign(new Error(m.error),{code:gateFailure||m.error}));}
        else if(m.done) {finished=true;phase='success';status({files:m.files,bytes:m.bytes,sha256:m.sha256,verified:m.verified,cleanup:m.cleanup});resolve();}
        else status();
      });
      worker.on('error',()=>{finished=true;reject(Object.assign(new Error('BACKUP_WORKER_FAILED'),{code:'BACKUP_WORKER_FAILED'}));});
      worker.on('exit',()=>{if(!finished)reject(Object.assign(new Error('BACKUP_WORKER_FAILED'),{code:'BACKUP_WORKER_FAILED'}));});
    });
  } catch(e) {
    if(dir&&job) {try{writeRecord(path.join(dir,'status.json'),{id:job.id,phase:'failed',files:0,error:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'BACKUP_FAILED',at:Date.now()});}catch{}}
    process.exitCode=1;
  } finally {
    clearInterval(heartbeat);clearInterval(monitor);
    if(dir&&job) {
      // If an abrupt OS/process exit prevented cleanup, the lock intentionally remains for review.
      const lock=path.join(path.dirname(dir),'active.lock');
      try{if(fs.readFileSync(lock,'utf8')===job.id)fs.unlinkSync(lock);}catch{}
    }
  }
}
