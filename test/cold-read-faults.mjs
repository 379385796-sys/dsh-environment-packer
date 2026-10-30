import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {packToTgz} from '../lib/tgz.js';import {createPrivateBackup} from '../lib/private-backup.js';
const root=fs.mkdtempSync(path.join(process.env.TEMP,'read-faults-')),homeDir=path.join(root,'home'),profileDir=path.join(homeDir,'profiles','source'),pkg=path.join(profileDir,'node_modules','plugin'),output=path.join(root,'output');
fs.mkdirSync(path.join(pkg,'nested'),{recursive:true});fs.mkdirSync(output);fs.writeFileSync(path.join(profileDir,'package.json'),'{"name":"synthetic","dependencies":{"plugin":"1.0.0"}}');fs.writeFileSync(path.join(pkg,'package.json'),'{"name":"plugin","version":"1.0.0"}');const payload=path.join(pkg,'nested','data.txt');fs.writeFileSync(payload,'SYNTHETIC_ONLY');
const checks=[];const same=(a,b)=>String(a)===b;
async function fault(name,owner,method,matches,code,run,expected=code){const saved=owner[method];let hit=false;owner[method]=function(...args){if(matches(...args)){hit=true;const e=Object.assign(Error('SYNTHETIC_PRIVATE_ERROR_TEXT'),{code});if(owner===fs.promises)return Promise.reject(e);throw e;}return saved.apply(this,args);};try{await assert.rejects(async()=>run(),e=>e.code===expected);}finally{owner[method]=saved;}assert(hit,name);assert.deepEqual(fs.readdirSync(output),[],name+' leaves no committed or staged output');checks.push(name);}
const archive=()=>packToTgz(pkg,path.join(output,'test.tgz'));
const pack=()=>createPrivateBackup({homeDir,profileDir,target:path.join(output,'test.zip'),dshVersion:'0.2.1-rc.3',confirmPrivate:true,sourceQuiescent:true});
for(const code of ['EACCES','EPERM','EIO','ENOENT']){
 await fault('tgz enumeration '+code,fs,'readdirSync',p=>same(p,path.join(pkg,'nested')),code,archive);
 await fault('tgz lstat '+code,fs,'lstatSync',p=>same(p,payload),code,archive);
 await fault('tgz open '+code,fs.promises,'open',p=>same(p,payload),code,archive);
 await fault('cold inventory '+code,fs,'readdirSync',p=>same(p,path.join(pkg,'nested')),code,pack);
 await fault('cold source open '+code,fs,'openSync',p=>same(p,payload),code,pack);
}
await fault('cold profile metadata maps read failure safely',fs,'openSync',p=>same(p,path.join(profileDir,'package.json')),'EACCES',pack,'PROFILE_PACKAGE_INVALID');
await fault('cold installed metadata maps read failure safely',fs,'openSync',p=>same(p,path.join(pkg,'package.json')),'EIO',pack,'INSTALLED_PACKAGE_INVALID');
const originalOpen=fs.openSync,originalRead=fs.readFileSync;let wanted;
fs.openSync=function(file,...args){const fd=originalOpen.call(this,file,...args);if(same(file,payload))wanted=fd;return fd;};
try{await fault('cold descriptor read failure after successful open',fs,'readFileSync',fd=>typeof fd==='number'&&fd===wanted,'EIO',pack);}finally{fs.openSync=originalOpen;fs.readFileSync=originalRead;}
const result=pack();assert(result.cleanup.tempRemoved);assert.equal(result.files,3);checks.push('all I/O restored: cold backup succeeds with mandatory confirmations');
const bytes=fs.readFileSync(result.path);assert.throws(pack,{code:'TARGET_EXISTS'});assert(bytes.equals(fs.readFileSync(result.path)));checks.push('existing ZIP preserved after read-fault recovery');
console.log(JSON.stringify({status:'PASS',passed:checks.length,checks,root,syntheticOnly:true}));
