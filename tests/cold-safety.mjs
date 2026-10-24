import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createPrivateBackup} from '../lib/private-backup.js';import {validateJob} from '../lib/cold-task.js';
if(!process.env.DSH_PACKER_TEST_ROOT)throw Error('Explicit synthetic test root required');
const root=fs.mkdtempSync(path.join(process.env.DSH_PACKER_TEST_ROOT,'cold-safety-')),home=path.join(root,'home'),profile=path.join(home,'profiles/source');fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'synthetic',private:true,dependencies:{}}));
fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({token:'SYNTHETIC_ONLY_ERROR_SECRET'}));
const base={homeDir:home,profileDir:profile,target:path.join(root,'backup.zip'),dshVersion:'0.2.1-rc.2',confirmPrivate:true,sourceQuiescent:true},results=[];
function test(name,fn){fn();assert(!fs.readdirSync(root).some(n=>n.includes('.private-')));results.push({name,status:'PASS'});}
test('actual Windows output-directory permission denial produces no ZIP',()=>{
  const dir=path.join(root,'permission-denied');fs.mkdirSync(dir);
  const who=spawnSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true});const sid=who.stdout.match(/S-1-5-\d+(?:-\d+)+/)?.[0];assert(sid);
  const deny=spawnSync('icacls.exe',[dir,'/deny','*'+sid+':(W)'],{encoding:'utf8',windowsHide:true});assert.equal(deny.status,0);
  try{assert.throws(()=>createPrivateBackup({...base,target:path.join(dir,'denied.zip')}),e=>['EPERM','EACCES'].includes(e.code));}
  finally{assert.equal(spawnSync('icacls.exe',[dir,'/remove:d','*'+sid],{encoding:'utf8',windowsHide:true}).status,0);}
  assert.deepEqual(fs.readdirSync(dir),[]);
});
test('ENOSPC fault during payload writing removes partial archive',()=>{
  const original=fs.writeSync;let writes=0;fs.writeSync=function(...args){if(++writes===3)throw Object.assign(new Error('SYNTHETIC_ONLY_ERROR_SECRET'),{code:'ENOSPC'});return original.apply(this,args);};
  try{assert.throws(()=>createPrivateBackup(base),e=>e.code==='ENOSPC'&&!e.message.includes('SECRET'));}finally{fs.writeSync=original;}assert(!fs.existsSync(base.target));
});
test('precommit writer reappearance failure removes verified staging and no ZIP',()=>{
  assert.throws(()=>createPrivateBackup({...base,beforeCommit(){throw Object.assign(new Error('WRITERS_RESTARTED'),{code:'WRITERS_RESTARTED'});}}),e=>e.code==='WRITERS_RESTARTED');assert(!fs.existsSync(base.target));
});
test('cancellation while verifying is checked before commit',()=>{
  const signal={aborted:false};assert.throws(()=>createPrivateBackup({...base,signal,onPhase:p=>{if(p==='verifying')signal.aborted=true;}}),e=>e.code==='BACKUP_ABORTED');assert(!fs.existsSync(base.target));
});
test('temporary cleanup failure removes only our committed target',()=>{
  const original=fs.unlinkSync;let first=true;fs.unlinkSync=function(file){if(first&&String(file).includes('.private-')){first=false;throw Object.assign(new Error('synthetic'),{code:'EPERM'});}return original.call(this,file);};
  try{assert.throws(()=>createPrivateBackup(base),e=>e.code==='BACKUP_CLEANUP_FAILED');}finally{fs.unlinkSync=original;}assert(!fs.existsSync(base.target));
});
let backup;test('stage sequence and archive SHA are accurate',()=>{
  const phases=[];backup=createPrivateBackup({...base,onPhase:p=>phases.push(p)});assert.deepEqual(phases,['scanning','writing','verifying']);assert.equal(backup.sha256,crypto.createHash('sha256').update(fs.readFileSync(base.target)).digest('hex'));
});
test('existing ZIP remains byte-identical',()=>{const original=fs.readFileSync(base.target);assert.throws(()=>createPrivateBackup(base),e=>e.code==='TARGET_EXISTS');assert.deepEqual(fs.readFileSync(base.target),original);});
test('handoff parameter validation refuses scope escape and missing confirmation',()=>{
  const job={schema:1,id:'a'.repeat(32),homeDir:home,profileDir:profile,target:path.join(root,'new.zip'),runtime:process.execPath,dshVersion:'0.2.1-rc.2',hostPid:process.pid,confirmPrivate:true,confirmExternal:true,waitMs:1000};
  assert.throws(()=>validateJob({...job,profileDir:root}),e=>e.code==='PROFILE_OUTSIDE_HOME');assert.throws(()=>validateJob({...job,confirmPrivate:false}),e=>e.code==='INVALID_COLD_TASK');
});
fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({root,results}));
