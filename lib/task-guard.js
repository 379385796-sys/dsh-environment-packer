import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { powershell, scriptPath, privateEnvironment, readRecord, writeRecord, fail } from './cold-task.js';
const C = createRequire(import.meta.url)('../assets/recovery-core.cjs');

export function prepareGuard(file) {
  C.noLinks(file);
  const fd=fs.openSync(file,'a',0o600); fs.closeSync(fd);
}
export async function holdGuard(file, exclusive=false) {
  C.noLinks(file);
  const child=spawn(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptPath('task-guard.ps1'),
    '-Path',file,...(exclusive?['-Exclusive']:[]),'-OwnerPid',String(process.pid)],
    {windowsHide:true,stdio:['pipe','pipe','ignore'],env:privateEnvironment()});
  child.stdin.on('error',()=>{});
  let held=false, record;
  const exited=new Promise(resolve=>{child.once('exit',()=>{held=false;resolve();});child.once('error',()=>{held=false;resolve();});});
  const stop=async()=>{child.stdin.end();const timer=setTimeout(()=>{if(child.exitCode===null)child.kill();},5000);try{await exited;}finally{clearTimeout(timer);}};
  try {
    record=await new Promise((resolve,reject)=>{
      let data='';
      const timer=setTimeout(()=>reject(Object.assign(new Error('GUARD_TIMEOUT'),{code:'GUARD_TIMEOUT'})),10000);
      const bad=()=>{clearTimeout(timer);reject(Object.assign(new Error('COLD_OPERATION_BUSY'),{code:'COLD_OPERATION_BUSY'}));};
      child.once('error',bad);child.once('exit',bad);
      const onData=chunk=>{
        data+=chunk.toString();
        if(data.length>2048)return bad();
        if(data.includes('\n')) {clearTimeout(timer);child.stdout.removeListener('data',onData);try{const r=JSON.parse(data.split('\n')[0]);if(!r.ready)return bad();resolve(r);}catch{bad();}}
      };
      child.stdout.on('data',onData);
    });
    held=child.exitCode===null;
    if(!held)fail('COLD_OPERATION_BUSY');
  } catch(e) {await stop();throw e;}
  return {record,assertHeld(){if(!held)fail('TASK_GUARD_LOST');},
    async request(command){
      if(!held)fail('TASK_GUARD_LOST');
      return await new Promise((resolve,reject)=>{
        let data='';
        const bad=(code='TASK_LOCK_RETIRE_FAILED')=>{cleanup();reject(Object.assign(new Error(typeof code==='string'?code:'TASK_LOCK_RETIRE_FAILED'),{code:typeof code==='string'?code:'TASK_LOCK_RETIRE_FAILED'}));};
        const timer=setTimeout(bad,45000);
        const cleanup=()=>{clearTimeout(timer);child.stdout.removeListener('data',onData);child.removeListener('exit',bad);};
        const onData=b=>{data+=b.toString();if(data.includes('\n')){cleanup();try{const r=JSON.parse(data);if(r.operation!==true)return bad(/^[A-Z][A-Z0-9_]+$/.test(r.code||'')?r.code:'TASK_LOCK_RETIRE_FAILED');resolve(r);}catch{bad();}}};
        child.stdout.on('data',onData);child.once('exit',bad);
        child.stdin.write(JSON.stringify(command)+'\n');
      });
    },async retire(source,destination,id){return this.request({operation:'retire',source,destination,id});},async release(){await stop();}};
}
export async function operationGuard(root) {
  const file=path.join(root,'operation.guard');
  try{prepareGuard(file);}catch(e){if(['EACCES','EPERM','EBUSY'].includes(e.code))fail('COLD_OPERATION_BUSY');throw e;}
  return holdGuard(file,true);
}
export function taskOwners(dir) {
  for(const name of ['ui-owner.json','coordinator-owner.json'])C.noLinks(path.join(dir,name));
  const r=spawnSync(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptPath('task-owners.ps1'),'-Directory',dir],
    {encoding:'utf8',windowsHide:true,timeout:10000,env:privateEnvironment()});
  try{if(r.status!==0||r.error)throw Error();const record=JSON.parse(r.stdout);if(typeof record.live!=='boolean')throw Error();return record;}catch{fail('COLD_IDENTITY_UNPROVEN');}
}
export function assertTaskOwner(dir,job,allowRecovered=false) {
  C.noLinks(dir);C.noLinks(path.join(dir,'job.json'));
  if(job.lockProtocol!==2 || path.basename(dir)!==job.id || path.dirname(dir)!==path.join(job.homeDir,'.packer-cold'))fail('COLD_STATE_CORRUPT');
  const lock=path.join(path.dirname(dir),'active.lock'); C.noLinks(lock);
  if(fs.readFileSync(lock,'utf8')!==job.id || (!allowRecovered&&fs.existsSync(path.join(dir,'recovered.json'))))fail('TASK_LOCK_LOST');
}
export async function releaseTaskLock(dir,job) {
  let gate;const deadline=Date.now()+5000;
  while(!gate) {
    try{gate=await operationGuard(path.dirname(dir));}
    catch(e){if(e.code!=='COLD_OPERATION_BUSY'||Date.now()>=deadline)throw e;await new Promise(r=>setTimeout(r,100));}
  }
  try {
    gate.assertHeld();assertTaskOwner(dir,job);
    // Archive the ownership token. Logs and partial/committed ZIPs are untouched.
    await gate.retire(path.join(path.dirname(dir),'active.lock'),path.join(dir,'released.lock'),job.id);
  } finally {await gate.release();}
}
export async function recoverColdTask(homeDir,options={}) {
  const root=path.join(homeDir,'.packer-cold');C.noLinks(root);
  if(!fs.existsSync(root))return {ok:true,code:'COLD_NO_TASK'};
  const gate=await operationGuard(root);
  let lease;
  try {
    const lock=path.join(root,'active.lock');C.noLinks(lock);
    if(!fs.existsSync(lock))return {ok:true,code:'COLD_NO_TASK'};
    const id=fs.readFileSync(lock,'utf8');
    if(!/^[a-f0-9]{32}$/.test(id))fail('COLD_STATE_CORRUPT');
    const dir=path.join(root,id);C.noLinks(dir);
    let job;
    try{job=readRecord(path.join(dir,'job.json'));}catch{fail('COLD_STATE_CORRUPT');}
    if(job.id!==id||job.homeDir!==homeDir)fail('COLD_STATE_CORRUPT');
    if(options.confirmLegacyTaskId!==undefined && options.confirmLegacyTaskId!==id)fail('COLD_STATE_CHANGED');
    if(job.lockProtocol!==2) {
      const commit=options.confirmLegacyTaskId===id;
      const result=await gate.request({operation:commit?'legacy-retire':'legacy-check',home:homeDir,id});
      return {ok:true,code:commit?'COLD_LEGACY_RECOVERED':'COLD_LEGACY_REBOOT_ELIGIBLE',taskId:id,requiresConfirmation:!commit,
        proof:{bootUtc:result.proof.bootUtc,taskLatestUtc:result.proof.taskLatestUtc,bootType:result.proof.bootType},result:'unconfirmed'};
    }
    // Open EXISTING guard exclusively: missing/corrupt evidence never proves death.
    try{lease=await holdGuard(path.join(dir,'task.guard'),true);}catch{fail('COLD_TASK_RUNNING_OR_UNPROVEN');}
    const identity=taskOwners(dir);
    if(identity.live!==false)fail('COLD_TASK_RUNNING_OR_UNPROVEN');
    gate.assertHeld();lease.assertHeld();assertTaskOwner(dir,job,true);
    // Persist a tombstone before retiring the token; a delayed launcher must refuse it.
    writeRecord(path.join(dir,'recovered.json'),{id,phase:'interrupted',at:Date.now(),result:'unconfirmed',evidencePreserved:true});
    await gate.retire(lock,path.join(dir,'recovered.lock'),id);
    return {ok:true,code:'COLD_RECOVERED',taskId:id,result:'unconfirmed'};
  } finally {if(lease)await lease.release();await gate.release();}
}
