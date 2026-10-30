import {readAsarVersion} from '../lib/collect.js';
// Real Desktop children: failure injections affect only synthetic task records.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {readRecord,writeRecord} from '../lib/cold-task.js';import {taskOwners} from '../lib/task-guard.js';
const runtime='D:/DeepSeek Harness/DeepSeek Harness.exe',root=fs.mkdtempSync(path.join(process.env.TEMP,'cold-probe-')),results=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=150000){const end=Date.now()+ms;while(Date.now()<end){try{const r=fn();if(r)return r;}catch{}await sleep(100);}throw Error('test deadline');}
for(const kind of ['foreign-probe','nonce-mismatch','script-mismatch','parent-birth-reuse']){
 const homeDir=path.join(root,kind,'home'),profileDir=path.join(homeDir,'profiles/synthetic'),plugin=path.join(profileDir,'node_modules/synthetic-peer');fs.mkdirSync(plugin,{recursive:true});
 fs.writeFileSync(path.join(profileDir,'package.json'),JSON.stringify({name:'synthetic',dependencies:{'synthetic-peer':'1.0.0'}}));fs.writeFileSync(path.join(plugin,'package.json'),JSON.stringify({name:'synthetic-peer',version:'1.0.0',peerDependencies:{'@deepseek-ai/cordis':'^4.0.0'}}));
 const options={homeDir,profileDir,target:path.join(root,kind,'must-not-commit.zip'),dshVersion:readAsarVersion('D:/DeepSeek Harness/resources/app.asar'),confirmExternal:true,waitMs:30000};
 const code=`import {startColdTask} from ${JSON.stringify(new URL('../lib/cold-task.js',import.meta.url).href)};try{await startColdTask(${JSON.stringify(options)});}catch(e){console.error(e.code);process.exitCode=1;}`;
 const child=spawn(runtime,['--expose-internals','--input-type=module','-e',code],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',b=>err+=b);const exit=new Promise(r=>child.once('exit',r));
 const task=await until(()=>{const id=fs.readFileSync(path.join(homeDir,'.packer-cold/active.lock'),'utf8'),dir=path.join(homeDir,'.packer-cold',id);return fs.existsSync(path.join(dir,'accepted.json'))?dir:false;});assert.equal(await exit,0,err);
 fs.writeFileSync(path.join(task,'exit-confirmed.json'),JSON.stringify({id:path.basename(task)}));
 const recordFile=await until(()=>{const n=fs.readdirSync(task).find(n=>/^host-probe-[a-f0-9]{32}\.json$/.test(n));return n&&path.join(task,n);}),record=readRecord(recordFile);let foreign,foreignExit;
 if(kind==='foreign-probe'){
   // Same executable and read-only script, with a valid standalone request.
   // Its parent is this test, so it must never receive the coordinator exemption.
   const request=JSON.parse(Buffer.from(record.payload,'base64'));delete request.task;
   foreign=spawn(runtime,['--expose-internals',path.resolve('assets/host-proof.cjs'),'--probe64',Buffer.from(JSON.stringify(request)).toString('base64')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'ignore'});foreignExit=new Promise(r=>foreign.once('exit',r));
 }else if(kind==='nonce-mismatch'){writeRecord(recordFile,{...record,nonce:crypto.randomBytes(16).toString('hex')});}
 else if(kind==='script-mismatch'){writeRecord(recordFile,{...record,scriptSHA256:'0'.repeat(64)});}
 else {const owner=readRecord(path.join(task,'coordinator-owner.json'));writeRecord(path.join(task,'coordinator-owner.json'),{...owner,born:'1'});}
 const terminal=await until(()=>readRecord(path.join(task,'terminal.json')));if(foreignExit)await foreignExit;
 assert.equal(terminal.phase,'failed');assert(kind==='foreign-probe'?terminal.error==='WRITERS_RESTARTED':['WRITERS_RESTARTED','HOST_PROOF_INVALID','HOST_PROOF_UNAVAILABLE'].includes(terminal.error),JSON.stringify(terminal));assert(!fs.existsSync(options.target));await until(()=>!fs.existsSync(path.join(homeDir,'.packer-cold/active.lock')));
 await until(()=>!taskOwners(task).owners['coordinator-owner.json']);const ui=readRecord(path.join(task,'ui-owner.json'));if(taskOwners(task).owners['ui-owner.json'])process.kill(ui.pid);await until(()=>!taskOwners(task).owners['ui-owner.json']);
 results.push({kind,task,status:'PASS',noZipCommitted:true});console.log('PASS probe identity '+kind);
}
fs.writeFileSync(path.join(process.env.DSH_PACKER_EVIDENCE_DIR||process.env.TEMP,'host-probe-native-results.json'),JSON.stringify({status:'PASS',root,results,syntheticOnly:true},null,2));
