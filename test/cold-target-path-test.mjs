import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {validateJob} from '../lib/cold-task.js';
assert.equal(process.platform,'win32');assert(process.env.DSH_PACKER_TEST_ROOT,'Explicit D workspace required');
const root=fs.mkdtempSync(path.join(process.env.DSH_PACKER_TEST_ROOT,'cold-target-')),home=path.join(root,'home'),profile=path.join(home,'profiles/synthetic');fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'package.json'),'{}');
const base={schema:1,id:'a'.repeat(32),homeDir:home,profileDir:profile,target:path.join(root,'outside.zip'),runtime:process.execPath,dshVersion:'0.2.1-rc.5',hostPid:process.pid,confirmPrivate:true,confirmExternal:true,waitMs:1000};
assert.equal(validateJob(base).target,path.join(root,'outside.zip'));
for(const name of ['inside.zip','..inside.zip'])assert.throws(()=>validateJob({...base,target:path.join(home,name)}),{code:'TARGET_INSIDE_SOURCE'});
// Virtual source metadata on another drive: no directory or file is created on
// C:, and no private Profile is read. All link and target checks remain real.
const otherDrive=path.parse(root).root[0].toUpperCase()==='C'?'D':'C',virtualHome=otherDrive+':\\__PACKER_SYNTHETIC_NO_FILES__\\home',virtualProfile=path.join(virtualHome,'profiles/synthetic'),virtualPackage=path.join(virtualProfile,'package.json'),originalStat=fs.statSync;
assert(!fs.existsSync(virtualHome));fs.statSync=function(p,...args){if(p===virtualPackage)return {isFile:()=>true};return originalStat.call(this,p,...args)};
try{const accepted=validateJob({...base,homeDir:virtualHome,profileDir:virtualProfile});assert.equal(accepted.target,base.target)}finally{fs.statSync=originalStat}
assert(!fs.existsSync(virtualHome));console.log('PASS cold target: same-drive external accepted; Home descendants (including ..name) refused; Windows cross-drive external accepted; no C files created');
