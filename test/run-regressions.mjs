import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn,spawnSync} from 'node:child_process';
import {prepareGuard,holdGuard} from '../lib/task-guard.js';
import {nodeEntries,psEntries,classifiedUtilities,requiresDshClosed,auditManifest,testArtifacts} from './regression-manifest.mjs';
const project=path.resolve(import.meta.dirname,'..'),scratch=process.env.DSH_PACKER_TEST_ROOT;
if(!scratch||!path.isAbsolute(scratch)||!process.env.TEMP||!process.env.TMP)throw Error('Set explicit workspace DSH_PACKER_TEST_ROOT/TEMP/TMP before regression');
fs.mkdirSync(scratch,{recursive:true});const gateFile=path.join(scratch,'full-regression.guard');prepareGuard(gateFile);const suiteGate=await holdGuard(gateFile,true);
const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const manifestErrors=auditManifest(fs.readdirSync(import.meta.dirname));
const sourceHashes={};function hashTree(folder){for(const f of fs.readdirSync(path.join(project,folder),{withFileTypes:true})){const file=folder+'/'+f.name;if(f.isDirectory())hashTree(file);else sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(project,file))).digest('hex');}}for(const folder of ['lib','bin','assets','vendor','test'])hashTree(folder);for(const file of ['client.js','index.js','package.json'])sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(project,file))).digest('hex');
const reportDir=process.env.DSH_PACKER_EVIDENCE_DIR||path.resolve(project,'../evidence-round2');fs.mkdirSync(reportDir,{recursive:true});
const entries=[...nodeEntries.map(e=>({...e,command:process.execPath,args:[...(e.args||[]),path.join(project,'test',e.file)]})),...psEntries.map(e=>({...e,command:ps,args:['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',path.join(project,'test',e.file),...(e.testRoot?['-TestRoot',scratch]:[])]}))];
// Every failure, including a refused manifest or a live DSH, still produces a
// machine-readable result.json; the guard is never a silent early exit.
const finish=(payload,code)=>{const run=payload.run||path.join(scratch,'full-regression-'+Date.now());const results=payload.results||[];const report={status:payload.status,run,passed:results.filter(x=>x.status==='PASS').length,total:results.length,results,error:payload.error||null,detail:payload.detail||null,manifest:{nodeEntries:nodeEntries.map(e=>e.file),powerShellEntries:psEntries.map(e=>e.file),requiresDshClosed,classifiedUtilities,artifactsSeen:testArtifacts(fs.readdirSync(import.meta.dirname))},manifestErrors,sourceHashes,syntheticOnly:true,guiHumanAcceptanceSeparate:true};fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(reportDir,'full-regression-latest.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,passed:report.passed,total:report.total,run,error:report.error,detail:report.detail}));if(code)process.exitCode=code;};
try {
 if(manifestErrors.length){const run=path.join(scratch,'full-regression-'+Date.now());fs.mkdirSync(run,{recursive:true});finish({status:'FAIL',run,results:[],error:manifestErrors[0].code,detail:manifestErrors[0].detail},1);}
 else {
  // Native/probe entries wait for the real Desktop to stop; running them with a
  // live DSH only produces timeouts. Fail fast and name the real cause instead.
  if(requiresDshClosed.length){
   const live=spawnSync(ps,['-NoProfile','-NonInteractive','-Command',"@(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue).Count"],{encoding:'utf8',windowsHide:true,timeout:30000});
   const count=Number(String(live.stdout||'').trim());
   if(live.status!==0||!Number.isInteger(count)){const run=path.join(scratch,'full-regression-'+Date.now());fs.mkdirSync(run,{recursive:true});finish({status:'FAIL',run,results:[],error:'DSH_PROCESS_STATE_UNKNOWN'},1);}
   else if(count>0){const run=path.join(scratch,'full-regression-'+Date.now());fs.mkdirSync(run,{recursive:true});finish({status:'FAIL',run,results:[],error:'DSH_MUST_BE_CLOSED',detail:{runningProcesses:count}},1);}
  }
  if(!process.exitCode){
   const run=fs.mkdtempSync(path.join(scratch,'full-regression-')),results=[];
   for(const entry of entries){
    const stdout=path.join(run,entry.file+'.stdout.log'),stderr=path.join(run,entry.file+'.stderr.log'),out=fs.openSync(stdout,'wx'),err=fs.openSync(stderr,'wx'),at=Date.now();
    const child=spawn(entry.command,entry.args,{cwd:project,env:process.env,windowsHide:true,stdio:['ignore',out,err]});fs.closeSync(out);fs.closeSync(err);let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill();},entry.timeoutMs||240000);
    const exit=await new Promise(resolve=>{child.once('error',error=>resolve({code:null,error:error.code}));child.once('exit',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);
    const result={entry:entry.file,command:entry.command===ps?'powershell':path.basename(entry.command),requiresDshClosed:entry.requiresDshClosed===true,...exit,timedOut,durationMs:Date.now()-at,status:exit.code===0&&!timedOut?'PASS':'FAIL',stdout,stderr};results.push(result);console.log(result.status+' '+entry.file);
   }
   finish({status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',run,results},results.every(x=>x.status==='PASS')?0:1);
  }
 }
} finally {await suiteGate.release();}
