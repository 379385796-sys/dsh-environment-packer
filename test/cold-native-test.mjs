import {readAsarVersion} from '../lib/collect.js';
// Runs the shipped Windows bootstrap, native UI, coordinator, worker and ZIP validator.
// All homes and target ZIPs are synthetic and reside under TEMP in the unified workspace.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {recoverColdTask,taskOwners} from '../lib/task-guard.js';
import {readRecord,powershell} from '../lib/cold-task.js';
const runtime='D:/DeepSeek Harness/DeepSeek Harness.exe';
const base=path.join(process.env.TEMP,'cold-native-'+crypto.randomBytes(5).toString('hex'));fs.mkdirSync(base,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=120000){const end=Date.now()+ms;while(Date.now()<end){const r=fn();if(r)return r;await sleep(100);}throw Error('test deadline');}
const results=[];
async function closeUI(dir){
  const r=readRecord(path.join(dir,'ui-owner.json'));
  // 0.6.1 keeps a terminal result page open until the user closes it. Assert
  // that it did not auto-exit, then close only this synthetic test's UI identity.
  assert(taskOwners(dir).owners['ui-owner.json'],'terminal UI closed by itself');
  try{process.kill(r.pid);}catch{}
  await until(()=>!taskOwners(dir).owners['ui-owner.json'],25000);
}
async function scenario(kind,reuse){
  const succeeds=kind.startsWith('success');
  const homeDir=reuse?.homeDir||path.join(base,kind,'home'),profileDir=path.join(homeDir,'profiles','synthetic'),target=path.join(path.dirname(homeDir),kind+'.zip');fs.mkdirSync(profileDir,{recursive:true});
  fs.writeFileSync(path.join(profileDir,'package.json'),JSON.stringify({name:'synthetic',dependencies:kind==='ordinary-failure'?{missing:'1.0.0'}:{}}));fs.writeFileSync(path.join(profileDir,'data.txt'),'SYNTHETIC_ONLY');
  if(kind==='success-long-path'){
    const file=path.join(profileDir,'data','x'.repeat(110),'y'.repeat(110),'synthetic.txt');
    assert(file.length>300);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'SYNTHETIC_LONG_PATH_ONLY');
  }
  if(kind.startsWith('peer-failure')){
    const plugin=path.join(profileDir,'node_modules','synthetic-peer');fs.mkdirSync(plugin,{recursive:true});fs.writeFileSync(path.join(profileDir,'package.json'),JSON.stringify({name:'synthetic',dependencies:{'synthetic-peer':'1.0.0'}}));fs.writeFileSync(path.join(plugin,'package.json'),JSON.stringify({name:'synthetic-peer',version:'1.0.0',peerDependencies:{'synthetic-missing-host-peer':'>=4.0.1 <5.0.0'}}));
  }
  if(kind==='success-host-peer'){
    const plugin=path.join(profileDir,'node_modules','synthetic-peer');fs.mkdirSync(plugin,{recursive:true});fs.writeFileSync(path.join(profileDir,'package.json'),JSON.stringify({name:'synthetic',dependencies:{'synthetic-peer':'1.0.0'}}));fs.writeFileSync(path.join(plugin,'package.json'),JSON.stringify({name:'synthetic-peer',version:'1.0.0',peerDependencies:{'@deepseek-ai/cordis':'>=4.0.1 <5.0.0'}}));
  }
  if(kind==='success-browser-peer'){
    const plugin=path.join(profileDir,'node_modules','synthetic-browser');fs.mkdirSync(plugin,{recursive:true});
    fs.writeFileSync(path.join(profileDir,'package.json'),JSON.stringify({name:'synthetic',dependencies:{'synthetic-browser':'1.0.0'}}));
    fs.writeFileSync(path.join(plugin,'package.json'),JSON.stringify({name:'synthetic-browser',version:'1.0.0',type:'module',exports:{'.':'./index.js','./client':'./client.js'},dsh:{client:{platform:'web'}},peerDependencies:{react:'^18.3.1','@deepseek-ai/dsh-client-ui-primitives':'>=0.2.0-rc.1 <0.3.0-0'}}));
    fs.writeFileSync(path.join(plugin,'index.js'),'export const value=42;');
    fs.writeFileSync(path.join(plugin,'client.js'),'window.__ModuleLoader__.load({id:"synthetic-browser",factory(require){const React=require("react");return {React};}});');
  }
  const options={homeDir,profileDir,target,dshVersion:readAsarVersion('D:/DeepSeek Harness/resources/app.asar'),confirmExternal:true,waitMs:kind==='timeout'?1000:kind==='interactive-cancel'?600000:15000};
  const source=`import {startColdTask} from ${JSON.stringify(new URL('../lib/cold-task.js',import.meta.url).href)};try{const t=await startColdTask(${JSON.stringify(options)});console.log(JSON.stringify(t));}catch(e){console.error(e.code);process.exitCode=1;}`;
  const host=spawn(runtime,['--expose-internals','--input-type=module','-e',source],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';host.stdout.on('data',b=>stdout+=b);host.stderr.on('data',b=>stderr+=b);const exit=once(host,'exit');
  const root=path.join(homeDir,'.packer-cold');
  const dir=await until(()=>{try{const id=fs.readFileSync(path.join(root,'active.lock'),'utf8'),d=path.join(root,id);return fs.existsSync(path.join(d,'accepted.json'))?d:false;}catch{return false;}});
  const [code]=await exit;assert.equal(code,0,stderr);assert(stdout.includes(path.basename(dir)));
  if(kind==='success'){
    const second=spawnSync(runtime,['--expose-internals','--input-type=module','-e',source],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,encoding:'utf8'});
    assert.equal(second.status,1);assert.match(second.stderr,/COLD_TASK_ACTIVE|COLD_OPERATION_BUSY/);assert.equal(fs.readdirSync(root).filter(x=>/^[a-f0-9]{32}$/.test(x)).length,1);
  }
  if(kind==='crash'){
    const ready=readRecord(path.join(dir,'ready.json'));process.kill(ready.workerPid); // Own synthetic coordinator only.
    await assert.rejects(recoverColdTask(homeDir),{code:'COLD_TASK_RUNNING_OR_UNPROVEN'});
    await sleep(1000);await closeUI(dir);assert.equal((await recoverColdTask(homeDir)).code,'COLD_RECOVERED');
  }else{
    if(kind==='status-failure'){fs.renameSync(path.join(dir,'status.json'),path.join(dir,'status.saved.json'));fs.mkdirSync(path.join(dir,'status.json'));}
    if(kind==='cancel'||kind==='premature-terminal'){
      if(kind==='premature-terminal'){fs.writeFileSync(path.join(dir,'terminal.json'),JSON.stringify({id:path.basename(dir),phase:'success',files:0,verified:true,cleanup:true}));await sleep(4300);assert(taskOwners(dir).owners['ui-owner.json']);assert(fs.existsSync(path.join(root,'active.lock')));assert(!fs.existsSync(path.join(dir,'ui-result.json')),'premature terminal produced a success receipt');}
      fs.writeFileSync(path.join(dir,'cancel'),'');
    }else if(kind==='interactive-cancel'){
      fs.writeFileSync(path.join(process.env.DSH_PACKER_EVIDENCE_DIR,'interactive-cancel-ready.json'),JSON.stringify({dir,homeDir,syntheticOnly:true}));console.log('READY interactive cancel '+dir);
    }else if(kind!=='timeout')fs.writeFileSync(path.join(dir,'exit-confirmed.json'),JSON.stringify({id:path.basename(dir)}));
    const terminal=await until(()=>{try{const r=readRecord(path.join(dir,'terminal.json'));return kind==='premature-terminal'&&r.phase!=='failed'?false:r;}catch{return false;}},kind==='interactive-cancel'?660000:120000);
    assert.equal(terminal.phase,succeeds?'success':'failed',JSON.stringify(terminal));
    if(kind==='ordinary-failure')assert.equal(terminal.error,'DECLARED_DEPENDENCY_MISSING');
    if(kind.startsWith('peer-failure')){assert.equal(terminal.error,'TRANSITIVE_DEPENDENCY_MISSING');assert.equal(terminal.files,0);assert(fs.existsSync(path.join(dir,'lease-ready.json')));assert(!fs.existsSync(path.join(dir,'committed.json')));}
    if(kind==='timeout')assert.equal(terminal.error,'DSH_EXIT_TIMEOUT');
    if(['cancel','interactive-cancel','premature-terminal'].includes(kind))assert.equal(terminal.error,'BACKUP_ABORTED');
    await until(()=>!fs.existsSync(path.join(root,'active.lock')));
    const receipt=await until(()=>{try{return readRecord(path.join(dir,'ui-result.json'));}catch{return false;}});
    // The terminal page must remain open until this test closes its own UI.
    assert(taskOwners(dir).owners['ui-owner.json'],'terminal page did not remain open');
    assert.equal((await recoverColdTask(homeDir)).code,'COLD_NO_TASK');
    const observation=readRecord(path.join(dir,'ui-result.json'));assert.equal(observation.id,path.basename(dir));assert.equal(observation.workerExited,true);assert.equal(observation.sourceLeasesReleased,true);
    assert.equal(observation.outcome,succeeds?'success':kind==='interactive-cancel'?'cancelled':'failed');
    assert.equal(typeof observation.workerExitCode,'number');
    if(succeeds){
      assert.equal(observation.workerExitCode,0);
      assert.equal(observation.phase,'success');
      assert.equal(observation.verified,true);
      assert.equal(observation.integrity,'zip-crc-manifest-payload-verified');
      assert.equal(observation.target,target);
      assert(fs.existsSync(target));
      assert.equal(fs.statSync(target).size,observation.bytes);
      assert.match(observation.sha256,/^[a-f0-9]{64}$/);
      assert(Number.isSafeInteger(observation.completedAt)&&observation.completedAt>0);
      assert(Number.isSafeInteger(observation.dependencyIssues)&&observation.dependencyIssues>=0);
    }else{
      assert.equal(observation.integrity,'unconfirmed');
      assert.equal(observation.zipPresent,false);
    }
    await closeUI(dir);
    if(kind==='success-long-path'){
      const C=createRequire(import.meta.url)('../assets/recovery-core.cjs'),zip=C.openZip(target);
      try{const manifest=C.validateManifest(zip),file=manifest.files.find(f=>f.path.endsWith('/synthetic.txt'));assert(file);assert.equal(zip.get(file.path).toString(),'SYNTHETIC_LONG_PATH_ONLY');}finally{zip.close();}
    }
    console.log(JSON.stringify({kind,outcome:observation.outcome,receiptAt:receipt.completedAt}));
  }
  results.push({kind,status:'PASS',dir});console.log('PASS native '+kind);
  if(kind==='ordinary-failure')await scenario('success-after-failure',{homeDir});
  if(kind==='peer-failure')await scenario('peer-failure-retry',{homeDir});
}
for(const kind of (process.argv.length>2?process.argv.slice(2):['success','ordinary-failure','peer-failure','timeout','crash','status-failure','success-host-peer','success-browser-peer']))await scenario(kind);
fs.writeFileSync(path.join(process.env.DSH_PACKER_EVIDENCE_DIR||path.resolve('../evidence'),'cold-native-results.json'),JSON.stringify({passed:results.length,results,base},null,2));
