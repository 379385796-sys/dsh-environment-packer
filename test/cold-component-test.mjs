// Windows component tests. This does not substitute for the user-operated Desktop E2E.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startColdTask,readRecord } from '../lib/cold-task.js';
const C=createRequire(import.meta.url)('../assets/recovery-core.cjs');
if(!process.env.DSH_PACKER_TEST_ROOT)throw Error('Explicit synthetic test root required');
const root=fs.mkdtempSync(path.join(process.env.DSH_PACKER_TEST_ROOT,'cold-component-'));
const results=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
const home=path.join(root,'synthetic home'),profile=path.join(home,'profiles','synthetic');fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'synthetic',private:true,dependencies:{}}));
const secret='SYNTHETIC_ONLY_COLD_TASK_SECRET_49781';fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({token:secret}));
const base={homeDir:home,profileDir:profile,target:path.join(root,'取消 Ω😀.zip'),dshVersion:'0.2.1-rc.2',confirmExternal:true};
async function terminal(id){const dir=path.join(home,'.packer-cold',id),until=Date.now()+30000;while(Date.now()<until){try{const s=readRecord(path.join(dir,'status.json'));if(['success','failed'].includes(s.phase))return s;}catch{}await sleep(200);}throw Error('COMPONENT_TIMEOUT');}
async function closeTestWindow(id){await sleep(800);const r=readRecord(path.join(home,'.packer-cold',id,'ready.json'));try{process.kill(r.uiPid);}catch{}}
let result=await startColdTask({...base,waitMs:1500});assert(result.manualQuitRequired);results.push({name:'independent window and worker acknowledged before handoff',status:'PASS'});
fs.writeFileSync(path.join(home,'.packer-cold',result.taskId,'exit-confirmed.json'),JSON.stringify({id:result.taskId}));
await sleep(300);
const premature=readRecord(path.join(home,'.packer-cold',result.taskId,'status.json'));assert.equal(premature.phase,'waiting');assert(premature.writers>0);assert(!fs.existsSync(base.target));results.push({name:'premature manual confirmation cannot bypass live writer gate',status:'PASS'});
await assert.rejects(()=>startColdTask(base),e=>e.code==='COLD_TASK_ACTIVE');results.push({name:'cross-request duplicate task refused by exclusive home lock',status:'PASS'});
const timeout=await terminal(result.taskId);assert.equal(timeout.phase,'failed');assert.equal(timeout.error,'DSH_EXIT_TIMEOUT');assert(!fs.existsSync(base.target));results.push({name:'live host exit timeout leaves no ZIP',status:'PASS'});
await closeTestWindow(result.taskId);
await sleep(500);
result=await startColdTask({...base,waitMs:30000});const dir=path.join(home,'.packer-cold',result.taskId);fs.writeFileSync(path.join(dir,'cancel'),'');
const cancelled=await terminal(result.taskId);assert.equal(cancelled.error,'BACKUP_ABORTED');assert(!fs.existsSync(base.target));results.push({name:'waiting cancellation safely stops without ZIP',status:'PASS'});
await closeTestWindow(result.taskId);
for(const id of fs.readdirSync(path.join(home,'.packer-cold')).filter(x=>/^[a-f0-9]{32}$/.test(x))){
  for(const file of ['status.json','ready.json','worker-ready.json','job.json','accepted.json']){const p=path.join(home,'.packer-cold',id,file);if(fs.existsSync(p))assert(!fs.readFileSync(p,'utf8').includes(secret));}
}
results.push({name:'secret config value absent from task parameters and ordinary status',status:'PASS'});
const acl=(await import('node:child_process')).spawnSync('icacls.exe',[dir],{encoding:'utf8',windowsHide:true});assert.equal(acl.status,0);assert(!/\(I\)|Everyone|BUILTIN\\Users/i.test(acl.stdout));results.push({name:'private protected task directory ACL',status:'PASS'});
fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({root,results,componentOnly:true},null,2));console.log(JSON.stringify({root,results}));
