import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import zlib from 'node:zlib';
import {createPrivateBackup,precheckPrivateSource} from '../lib/private-backup.js';
import {collectSafeConfiguration} from '../lib/safe-export.js';
import {createZip} from '../lib/zip.js';
import {readAsarVersion} from '../lib/collect.js';
import {packToTgz} from '../lib/tgz.js';
const require=createRequire(import.meta.url),C=require('../assets/recovery-core.cjs'),{restore}=require('../assets/restore-private.cjs');
const V=require('../assets/verify-private.cjs'),A=require('../assets/recovery-assistant.cjs');
const base=path.resolve(process.env.DSH_PACKER_TEST_ROOT),run=fs.mkdtempSync(path.join(base,'合成 验收-'));
const results=[],test=(name,fn)=>{fn();results.push({name,status:'PASS'});}, expect=(fn,code)=>assert.throws(fn,e=>e.code===code);
const write=(p,data)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);};
const home=path.join(run,'原始 DSH home'),profile=path.join(home,'profiles','synthetic'),output=path.join(run,'私人 恢复.zip');
const version=readAsarVersion('D:/DeepSeek Harness/resources/app.asar'); assert.match(version,/^\d+\.\d+\.\d+/);
write(path.join(profile,'package.json'),JSON.stringify({name:'synthetic-profile',private:true,dependencies:{'synthetic-alpha':'1.0.0','synthetic-beta':'1.0.0','synthetic-gamma':'1.0.0','dsh-environment-packer':JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../package.json'))).version},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','synthetic-alpha','synthetic-beta','synthetic-gamma','dsh-environment-packer']}}},null,2));
write(path.join(profile,'cordis.yml'),'[]\n'); write(path.join(profile,'cordis.patch.yml'),'[]\n');
write(path.join(profile,'pnpm-lock.yaml'),'lockfileVersion: 9.0\n'); write(path.join(profile,'pnpm-workspace.yaml'),'packages: []\n');
const secret='SYNTHETIC_ONLY_secret_NEVER_REAL_67932';
write(path.join(home,'.credentials.yaml'),'apiKey: '+secret+'\n');
write(path.join(profile,'config','嵌套 设置.json'),JSON.stringify({auth:{token:secret},prompt:'private '+secret}));
for(const d of ['storages','sessions','attachments','memory','skills']) write(path.join(home,d,'合成 数据.json'),JSON.stringify({synthetic:true,body:secret}));
fs.mkdirSync(path.join(profile,'empty folder'),{recursive:true});
write(path.join(profile,'node_modules','synthetic-dep','package.json'),JSON.stringify({name:'synthetic-dep',version:'1.0.0',type:'module',exports:'./index.js'}));
write(path.join(profile,'node_modules','synthetic-dep','index.js'),'export const value=41;\n');
for(const name of ['alpha','beta','gamma']) {
 const dir=path.join(profile,'node_modules','synthetic-'+name);
 write(path.join(dir,'package.json'),JSON.stringify({name:'synthetic-'+name,version:'1.0.0',type:'module',exports:'./index.js',dependencies:{'synthetic-dep':'1.0.0'},dsh:{bundle:{patch:'./cordis.patch.yml'}}}));
 write(path.join(dir,'cordis.patch.yml'),`- insert:\n    - id: synthetic-${name}\n      name: synthetic-${name}\n      config:\n        enabled: true\n`);
 write(path.join(dir,'index.js'),`import {value} from 'synthetic-dep';\nexport function apply(ctx,config){let dispose;const ensure=()=>{if(dispose)return;const server=ctx.get('webServer')||ctx.get('httpServer');if(!server)return;dispose=server.register({kind:'prefix',path:'/synthetic-${name}',handler(req,res){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({value:value+1,enabled:config.enabled===true,plugin:'${name}'}));}});};ctx.effect(()=>{ensure();const off=ctx.on('internal/service',ensure);return()=>{off?.();dispose?.();};});}\n`);
}
// Install candidate bytes into the synthetic environment; do not import the development tree at host startup.
const project=path.resolve(import.meta.dirname,'..'),installed=path.join(profile,'node_modules','dsh-environment-packer');
fs.mkdirSync(installed,{recursive:true});
for(const name of ['package.json','index.js','client.js','cordis.patch.yml','icon.svg','lib','assets','bin','locale','vendor']) fs.cpSync(path.join(project,name),path.join(installed,name),{recursive:true});
const tgzSource=path.join(run,'tgz-content'); write(path.join(tgzSource,'package.json'),JSON.stringify({name:'synthetic-local',version:'1.0.0'})); write(path.join(tgzSource,'nested','config.json'),JSON.stringify({token:secret}));
await packToTgz(tgzSource,path.join(run,'synthetic-local.tgz'));
write(path.join(profile,'local-packages','synthetic-local.tgz'),fs.readFileSync(path.join(run,'synthetic-local.tgz')));
const opts={homeDir:home,profileDir:profile,target:output,dshVersion:version,confirmPrivate:true,sourceQuiescent:true};
test('explicit private confirmation required',()=>expect(()=>createPrivateBackup({...opts,confirmPrivate:false}),'PRIVATE_CONFIRMATION_REQUIRED'));
test('quiescence confirmation required',()=>expect(()=>createPrivateBackup({...opts,sourceQuiescent:false}),'QUIESCENT_CONFIRMATION_REQUIRED'));
let backup; test('full private ZIP generated with Chinese and spaces',()=>{backup=createPrivateBackup(opts); assert(backup.cleanup.tempRemoved);assert(backup.manifest.completeWithinScope);});
test('no backup overwrite',()=>expect(()=>createPrivateBackup(opts),'TARGET_EXISTS'));
const target=path.join(run,'全新 恢复 home');
test('isolated restore into nonexistent home and no-callback count',()=>{const r=restore({zipFile:output,targetHome:target,profileName:'restored',dshVersion:version,confirmPrivate:true});assert(r.ok);assert.equal(r.verifiedFiles,backup.files);assert.equal(JSON.parse(fs.readFileSync(path.join(target,'PACKER-RESTORE-RESULT.json'))).verifiedFiles,backup.files);});
test('complete WPF toolkit and console-free managed launcher survive backup and restore byte-for-byte',()=>{
 for(const name of ['restore-assistant.exe','restore-launcher.cs','restore-launcher.manifest','restore-assistant.ps1','restore-window-view.ps1','restore-window.xaml']){
  const relative='node_modules/dsh-environment-packer/bin/'+name,source=fs.readFileSync(path.join(profile,relative));
  assert(source.equals(fs.readFileSync(path.join(target,'profiles/restored',relative))),name);
 }
 const pe=fs.readFileSync(path.join(installed,'bin/restore-assistant.exe')),offset=pe.readUInt32LE(0x3c);assert.equal(pe.toString('ascii',offset,offset+4),'PE\0\0');assert.equal(pe.readUInt16LE(offset+4),0x8664);assert.equal(pe.readUInt16LE(offset+24+68),2);assert(pe.readUInt32LE(offset+24+112+14*8)>0);
});
test('restore count and written report also match with progress callback',()=>{const home=path.join(run,'count-with-callback'),events=[];const r=restore({zipFile:output,targetHome:home,dshVersion:version,confirmPrivate:true,onFile:n=>events.push(n)});assert.equal(r.verifiedFiles,backup.files);assert.equal(events.length,backup.files);assert.equal(events.at(-1),backup.files);assert.equal(JSON.parse(fs.readFileSync(path.join(home,'PACKER-RESTORE-RESULT.json'))).verifiedFiles,backup.files);});
test('every file SHA256 and exact restored set before startup',()=>{
 for(const f of backup.manifest.files) {const to=f.path.startsWith('profile/')?path.join(target,'profiles','restored',f.path.slice(8)):path.join(target,f.path.slice(5));assert.equal(C.sha(fs.readFileSync(to)),f.sha256);}
 assert(fs.statSync(path.join(target,'profiles','restored','empty folder')).isDirectory());
 const count=p=>fs.readdirSync(p,{withFileTypes:true}).reduce((n,e)=>n+(e.isDirectory()?count(path.join(p,e.name)):1),0);
 assert.equal(count(target),backup.files+1);
});
test('embedded and tgz synthetic credentials preserved privately',()=>{
 assert(fs.readFileSync(path.join(target,'profiles','restored','config','嵌套 设置.json'),'utf8').includes(secret));
 assert(zlib.gunzipSync(fs.readFileSync(path.join(target,'profiles','restored','local-packages','synthetic-local.tgz'))).includes(Buffer.from(secret)));
});
test('existing target rejected including empty directory',()=>{expect(()=>restore({zipFile:output,targetHome:target,dshVersion:version,confirmPrivate:true}),'TARGET_EXISTS');const empty=path.join(run,'empty-target');fs.mkdirSync(empty);expect(()=>restore({zipFile:output,targetHome:empty,dshVersion:version,confirmPrivate:true}),'TARGET_EXISTS');});
test('incompatible DSH version rejected before writes',()=>{const p=path.join(run,'bad-version');expect(()=>restore({zipFile:output,targetHome:p,dshVersion:'99.0.0',confirmPrivate:true}),'INCOMPATIBLE_RUNTIME');assert(!fs.existsSync(p));});
test('restore interruption rolls back only staging',()=>{const p=path.join(run,'abort-target'),signal={aborted:false};expect(()=>restore({zipFile:output,targetHome:p,dshVersion:version,confirmPrivate:true,signal,onFile:()=>{signal.aborted=true;}}),'RESTORE_ABORTED');assert(!fs.existsSync(p));assert(!fs.readdirSync(run).some(x=>x.startsWith('.dsh-restore-')));});
test('backup interruption removes unfinished ZIP',()=>{const p=path.join(run,'abort.zip'),signal={aborted:false};expect(()=>createPrivateBackup({...opts,target:p,signal,onFile:()=>{signal.aborted=true;}}),'BACKUP_ABORTED');assert(!fs.existsSync(p));assert(!fs.readdirSync(run).some(x=>x.includes('.private-')));});
test('safe configuration export excludes arbitrary strings and opaque packages',()=>{
 const s=collectSafeConfiguration({profileDir:profile,entries:[{options:{name:'dsh-smooth-stream',config:{enabled:true,token:secret,nested:{secret}}}},{options:{name:secret,config:{token:secret}}},{options:{name:'dsh-ui-appearance',config:{fontSize:secret}}}]});
 const bytes=createZip(s.files);assert(!bytes.includes(Buffer.from(secret)));assert(!s.manifest.complete);assert(!s.manifest.restorableEnvironment);assert.equal(s.files.length,1);assert.equal(s.manifest.settings[0].values.enabled,true);
 write(path.join(run,'安全 配置.zip'),bytes);
});
test('ZIP corruption rejected',()=>{const p=path.join(run,'corrupt.zip'),data=fs.readFileSync(output);data[150]^=1;write(p,data);assert.throws(()=>restore({zipFile:p,targetHome:path.join(run,'corrupt-target'),dshVersion:version,confirmPrivate:true}));assert(!fs.existsSync(path.join(run,'corrupt-target')));});
test('ZIP truncation rejected',()=>{const p=path.join(run,'truncated.zip');write(p,fs.readFileSync(output).subarray(0,100));assert.throws(()=>restore({zipFile:p,targetHome:path.join(run,'truncated-target'),dshVersion:version,confirmPrivate:true}));});
test('ZIP Slip, ADS, device names, case aliases, backslashes rejected',()=>{
 for(const n of ['../escape','/absolute','C:/escape','profile/a:stream','profile/CON.txt','profile/a.','profile/a\\b']) expect(()=>C.safeName(n),'UNSAFE_ARCHIVE_PATH');
 const p=path.join(run,'dupe.zip'),w=new C.ZipWriter(p);try {w.add('profile/A',Buffer.from('a'));expect(()=>w.add('profile/a',Buffer.from('b')),'DUPLICATE_ARCHIVE_PATH');}finally{w.close();}
});
test('missing declared plugin rejects backup',()=>{const p=path.join(profile,'node_modules','synthetic-gamma','package.json'),original=fs.readFileSync(p);fs.unlinkSync(p);try{expect(()=>createPrivateBackup({...opts,target:path.join(run,'missing.zip')}),'DECLARED_DEPENDENCY_MISSING');}finally{write(p,original);}});
test('source changes during backup fail closed',()=>{const p=path.join(profile,'config','嵌套 设置.json'),original=fs.readFileSync(p);try{expect(()=>createPrivateBackup({...opts,target:path.join(run,'changing.zip'),onFile:n=>{if(n===1)fs.appendFileSync(p,' ');}}),'SOURCE_CHANGED');}finally{write(p,original);}});
test('data junction and destination junction rejected',()=>{
 const junction=path.join(home,'memory','link');fs.symlinkSync(tgzSource,junction,'junction');try{expect(()=>createPrivateBackup({...opts,target:path.join(run,'link.zip')}),'SOURCE_LINK_REFUSED');}finally{fs.unlinkSync(junction);}
 const link=path.join(run,'destination-link');fs.symlinkSync(target,link,'junction');try{expect(()=>restore({zipFile:output,targetHome:path.join(link,'child'),dshVersion:version,confirmPrivate:true}),'REPARSE_REFUSED');}finally{fs.unlinkSync(link);}
});
test('source dependency junction safely materialized',()=>{
 const dir=path.join(profile,'node_modules','linked-package');fs.symlinkSync(tgzSource,dir,'junction');
 try {const p=path.join(run,'linked.zip'),b=createPrivateBackup({...opts,target:p});assert(b.manifest.materializedLinks.some(x=>x.path.endsWith('/linked-package')));assert(b.manifest.files.some(x=>x.path.endsWith('/linked-package/nested/config.json')));}finally{fs.unlinkSync(dir);}
});
test('private Windows ACL excludes inherited broad access',()=>{
 const r=spawnSync('icacls.exe',[output],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0);assert(!r.stdout.includes('(I)'));assert(!/S-1-1-0|Everyone|BUILTIN\\Users|Authenticated Users/i.test(r.stdout));write(path.join(run,'acl-check.txt'),r.stdout);
});
test('missing transitive dependency rejected',()=>{
 const p=path.join(profile,'node_modules','synthetic-dep','package.json'),original=fs.readFileSync(p);fs.unlinkSync(p);
 try{expect(()=>createPrivateBackup({...opts,target:path.join(run,'missing-dep.zip')}),'TRANSITIVE_DEPENDENCY_MISSING');}finally{write(p,original);}
});
test('corrupt local plugin tgz rejected before archive creation',()=>{
 const p=path.join(profile,'local-packages','synthetic-local.tgz'),original=fs.readFileSync(p);write(p,'not gzip');
 try{expect(()=>createPrivateBackup({...opts,target:path.join(run,'bad-tgz.zip')}),'LOCAL_PACKAGE_CORRUPT');}finally{write(p,original);}
});
test('manifest missing files and wrong hashes fail before staging',()=>{
 const z=C.openZip(output);try{
  for(const kind of ['missing','hash','scope']) {
   const m=JSON.parse(z.get('manifest.json'));if(kind==='hash')m.files[0].sha256='0'.repeat(64);
   if(kind==='scope')m.directories.push('home/profiles');
   const files=[...z.records.values()].filter(r=>r.name!=='manifest.json'&&(kind!=='missing'||r.name!==m.files[0].path)).map(r=>({path:r.name,data:z.get(r.name)}));
   files.push({path:'manifest.json',data:JSON.stringify(m)});const file=path.join(run,'manifest-'+kind+'.zip');write(file,createZip(files));
   const dest=path.join(run,'manifest-'+kind);assert.throws(()=>restore({zipFile:file,targetHome:dest,dshVersion:version,confirmPrivate:true}));assert(!fs.existsSync(dest));
  }
 }finally{z.close();}
});
test('archive symlink attributes and traversal entries refused by reader',()=>{
 const b=createZip([{path:'profile/a',data:'abc'}]),slip=Buffer.from(b);
 for(let p=0;p<=slip.length-9;p++)if(slip.subarray(p,p+9).toString()==='profile/a')slip.write('../xxxx/a',p);
 const p=path.join(run,'zip-slip.zip');write(p,slip);expect(()=>C.openZip(p),'UNSAFE_ARCHIVE_PATH');
 const link=Buffer.from(b),central=link.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));link.writeUInt32LE((0xa1ff<<16)>>>0,central+38);
 const l=path.join(run,'zip-link.zip');write(l,link);expect(()=>C.openZip(l),'UNSUPPORTED_ZIP');
});
test('target parent missing produces no partial backup or restore',()=>{
 assert.throws(()=>createPrivateBackup({...opts,target:path.join(run,'absent','backup.zip')}));
 assert.throws(()=>restore({zipFile:output,targetHome:path.join(run,'absent','home'),dshVersion:version,confirmPrivate:true}));assert(!fs.existsSync(path.join(run,'absent')));
});
test('write permission failure rolls back staging without leaking raw error text',()=>{
 const original=fs.writeFileSync,dest=path.join(run,'permission-failure');let writes=0;
 fs.writeFileSync=function(file,...args){if(typeof file==='number'&&++writes===2)throw Object.assign(new Error(secret),{code:'EACCES'});return original.call(fs,file,...args);};
 try{expect(()=>restore({zipFile:output,targetHome:dest,dshVersion:version,confirmPrivate:true}),'EACCES');}finally{fs.writeFileSync=original;}
 assert(!fs.existsSync(dest));assert(!fs.readdirSync(run).some(x=>x.startsWith('.dsh-restore-')));
});
test('restore works with outbound network APIs disabled',()=>{
 const net=require('node:net'),tls=require('node:tls'),http=require('node:http'),https=require('node:https');
 const saves=[];for(const [obj,key] of [[net,'connect'],[net,'createConnection'],[tls,'connect'],[http,'request'],[https,'request']]){saves.push([obj,key,obj[key]]);obj[key]=()=>{throw Error('NETWORK_DISABLED');};}
 try{assert(restore({zipFile:output,targetHome:path.join(run,'offline-home'),dshVersion:version,confirmPrivate:true}).ok);}finally{for(const [obj,key,fn] of saves)obj[key]=fn;}
});
// Reuse the same synthetic backup, collector and assertions for recovery tools.
function rewrite(file,change){const z=C.openZip(output);try{const m=JSON.parse(z.get('manifest.json'));change(m);write(file,createZip([...z.records.values()].map(r=>({path:r.name,data:r.name==='manifest.json'?JSON.stringify(m):z.get(r.name)}))));}finally{z.close();}}
test('read-only v2 inspection distinguishes archive, compatibility and unverified startup',()=>{
 const before=fs.readFileSync(output),names=fs.readdirSync(run).sort(),stat=fs.statSync(output),r=V.inspectBackup({zipFile:output,dshVersion:version});
 assert.equal(r.archiveIntegrity.state,'valid');assert.equal(r.archiveIntegrity.sha256,C.sha(before));assert.equal(r.recoveryCompatibility.state,'compatible');assert.equal(r.canRestore,true);assert.equal(r.postRestoreUsability.state,'not-verified');assert.equal(r.postRestoreUsability.requiresStartupValidation,true);assert(!JSON.stringify(r).includes(secret));
 assert.deepEqual(fs.readdirSync(run).sort(),names);assert.equal(fs.statSync(output).mtimeMs,stat.mtimeMs);assert(fs.readFileSync(output).equals(before));
});
test('coverage reports unknown Home data, external sources and intentional virtual-store omission',()=>{
 write(path.join(home,'unknown-plugin-db','business.sqlite'),'SYNTHETIC_DATABASE');write(path.join(profile,'node_modules','.pnpm','uncollected-marker'),'VIRTUAL_STORE_DUPLICATE');
 const p=path.join(profile,'package.json'),original=fs.readFileSync(p),m=JSON.parse(original);m.dependencies['synthetic-alpha']='file:D:/synthetic-external/alpha.tgz';write(p,JSON.stringify(m));
 try{const pre=precheckPrivateSource({homeDir:home,profileDir:profile,dshVersion:version}),b=createPrivateBackup({...opts,target:path.join(run,'coverage.zip')}),r=V.inspectBackup({zipFile:b.path,dshVersion:version});
   assert.equal(pre.coverage.homeEntriesNotCaptured.find(x=>x.name==='unknown-plugin-db').needsManualReview,true);assert.equal(r.coverage.homeEntriesNotCaptured.find(x=>x.name==='unknown-plugin-db').needsManualReview,true);
   assert(r.coverage.exclusions.some(x=>x.scope==='package-manager-virtual-store'));assert(r.coverage.externalReferences.some(x=>x.name==='synthetic-alpha'&&x.originalInstallSourceIncluded===false));assert.equal(r.coverage.requiresExternalResourceReview,true);assert.equal(r.coverage.fileIntegrityIsNotBusinessCoverage,true);
   assert(!b.manifest.files.some(x=>x.path.startsWith('profile/node_modules/.pnpm/')));assert(!b.manifest.files.some(x=>x.path.includes('unknown-plugin-db')));assert.deepEqual(b.manifest.scope.home,backup.manifest.scope.home);
 }finally{write(p,original)}
});
test('readonly CLI without Desktop still validates bytes but cannot assert recovery compatibility',()=>{
 const standalone=path.join(process.env.ProgramFiles||'C:/Program Files','nodejs/node.exe'),r=spawnSync(standalone,[path.resolve('assets/verify-private.cjs'),'--zip',output],{encoding:'utf8',windowsHide:true,env:process.env});
 assert.equal(r.status,1);const report=JSON.parse(r.stdout);assert.equal(report.archiveIntegrity.state,'valid');assert.equal(report.recoveryCompatibility.state,'unavailable');assert.equal(report.recoveryCompatibility.code,'HOST_DESKTOP_REQUIRED');assert.equal(report.canRestore,false);
});
test('runtime mismatch is separate from archive corruption',()=>{
 const r=V.inspectBackup({zipFile:output,dshVersion:'99.0.0'});assert.equal(r.archiveIntegrity.state,'valid');assert.equal(r.recoveryCompatibility.state,'blocked');assert.equal(r.recoveryCompatibility.code,'INCOMPATIBLE_RUNTIME');assert.equal(r.canRestore,false);
});
test('unsupported recovery format is explicitly identified without creating a target',()=>{
 const p=path.join(run,'unsupported.zip');rewrite(p,m=>{m.format='dsh-private-recovery/1'});const r=V.inspectBackup({zipFile:p,dshVersion:version});assert.equal(r.archiveIntegrity.state,'unsupported');assert.equal(r.archiveIntegrity.code,'UNSUPPORTED_RECOVERY_FORMAT');assert.equal(r.canRestore,false);
});
test('CRC, payload hashes, manifest scope and archive set failures remain read-only refusals',()=>{
 const corrupt=path.join(run,'inspect-crc.zip'),data=fs.readFileSync(output),z=C.openZip(output);let pos;try{pos=z.records.get(backup.manifest.files[0].path.toLowerCase()).pos}finally{z.close()}data[pos]^=1;write(corrupt,data);
 assert.equal(V.inspectBackup({zipFile:corrupt,dshVersion:version}).archiveIntegrity.code,'ZIP_CRC_MISMATCH');
 for(const [label,change]of [['hash',m=>{m.files[0].sha256='0'.repeat(64)}],['scope',m=>{m.directories.push('home/not-allowed')}],['unsafe',m=>{m.directories.push('profile/../escape')}],['missing',m=>{m.files.pop()}]]){
   const p=path.join(run,'inspect-'+label+'.zip');rewrite(p,change);const r=V.inspectBackup({zipFile:p,dshVersion:version});assert.equal(r.canRestore,false);assert.equal(r.archiveIntegrity.state,'invalid');
 }
 const p=path.join(run,'inspect-truncated.zip');write(p,fs.readFileSync(output).subarray(0,100));assert.equal(V.inspectBackup({zipFile:p,dshVersion:version}).canRestore,false);
});
test('valid hashes do not hide dependency contract or missing host-proof failures',()=>{
 const p=path.join(run,'dependency-incomplete.zip'),z=C.openZip(output);try{const m=JSON.parse(z.get('manifest.json')),item=m.files.find(x=>x.path.endsWith('/synthetic-alpha/package.json')),pkg=JSON.parse(z.get(item.path));pkg.dependencies['not-installed']='1.0.0';const changed=Buffer.from(JSON.stringify(pkg));item.bytes=changed.length;item.sha256=C.sha(changed);write(p,createZip([...z.records.values()].map(r=>({path:r.name,data:r.name==='manifest.json'?JSON.stringify(m):r.name===item.path?changed:z.get(r.name)}))));}finally{z.close()}
 const result=V.inspectBackup({zipFile:p,dshVersion:version});assert.equal(result.archiveIntegrity.state,'valid');assert.equal(result.recoveryCompatibility.code,'TRANSITIVE_DEPENDENCY_MISSING');assert.equal(result.canRestore,false);
 const missing=path.join(run,'proof-missing.zip');rewrite(missing,m=>{m.format='dsh-private-recovery/3'});assert.equal(V.inspectBackup({zipFile:missing,dshVersion:version}).recoveryCompatibility.code,'HOST_PROOF_INVALID');
});
test('assistant refuses missing confirmation, unsupported runtime and known configured Home',()=>{
 const dest=path.join(run,'unconfirmed');expect(()=>A.run({action:'restore',zipFile:output,targetHome:dest,expectedZipSHA256:backup.sha256}),'PRIVATE_CONFIRMATION_REQUIRED');assert(!fs.existsSync(dest));
 const previous=process.env.DSH_HOME;process.env.DSH_HOME=home;try{expect(()=>A.assertFreshTarget(path.join(home,'must-not-restore')),'OFFICIAL_HOME_REFUSED');}finally{if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous}
 for(const leaf of ['CON','unsafe.','unsafe '])expect(()=>A.assertFreshTarget(path.join(run,leaf)),'UNSAFE_ARCHIVE_PATH');
 const standalone=path.join(process.env.ProgramFiles||'C:/Program Files','nodejs/node.exe'),r=spawnSync(standalone,[path.resolve('assets/recovery-assistant.cjs'),'--action','restore','--zip',output,'--home',dest,'--zip-sha256',backup.sha256,'--confirm-private'],{encoding:'utf8',windowsHide:true,env:process.env});assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).code,'HOST_DESKTOP_REQUIRED');assert(!fs.existsSync(dest));
});
test('assistant parse cannot accept cached approval, duplicate arguments or destination in readonly mode',()=>{
 for(const args of [['--action','inspect','--zip',output,'--home',run],['--action','inspect','--zip',output,'--zip',output],['--action','restore','--zip',output,'--skip-checks']])expect(()=>A.parse(args),'INVALID_ARGUMENT');
});
test('a different valid ZIP after inspection cannot replace the explicitly inspected backup',()=>{
 const p=path.join(run,'replace-after-check.zip');write(p,fs.readFileSync(output));const inspected=V.inspectBackup({zipFile:p,dshVersion:version});rewrite(p,m=>{m.createdAt='2000-01-01T00:00:00.000Z'});const dest=path.join(run,'must-not-create-changed');expect(()=>restore({zipFile:p,targetHome:dest,dshVersion:version,confirmPrivate:true,expectedZipSHA256:inspected.archiveIntegrity.sha256}),'ARCHIVE_CHANGED');assert(!fs.existsSync(dest));
});
test('target creation or junction after inspection is refused again at execution',()=>{
 const inspected=V.inspectBackup({zipFile:output,dshVersion:version}),dest=path.join(run,'created-after-check');fs.mkdirSync(dest);expect(()=>restore({zipFile:output,targetHome:dest,dshVersion:version,confirmPrivate:true,expectedZipSHA256:inspected.archiveIntegrity.sha256}),'TARGET_EXISTS');
 const linked=path.join(run,'linked-after-check');fs.symlinkSync(dest,linked,'junction');try{expect(()=>restore({zipFile:output,targetHome:path.join(linked,'child'),dshVersion:version,confirmPrivate:true,expectedZipSHA256:inspected.archiveIntegrity.sha256}),'REPARSE_REFUSED');assert.equal(V.inspectBackup({zipFile:path.join(linked,'unavailable.zip'),dshVersion:version}).archiveIntegrity.code,'REPARSE_REFUSED')}finally{fs.unlinkSync(linked)}
});
test('archive mutation while writing is detected before commit and staging is cleaned',()=>{
 const p=path.join(run,'change-during-restore.zip');write(p,fs.readFileSync(output));const dest=path.join(run,'change-during-target');let changed=false;
 expect(()=>restore({zipFile:p,targetHome:dest,dshVersion:version,confirmPrivate:true,onFile(){if(!changed){changed=true;fs.appendFileSync(p,'SYNTHETIC_CHANGE')}}}),'ARCHIVE_CHANGED');assert(!fs.existsSync(dest));assert(!fs.readdirSync(run).some(x=>x.startsWith('.dsh-restore-')));
});
test('original restore CLI remains compatible and the assistant uses the same restorer',()=>{
 const legacyHome=path.join(run,'original-cli'),r=spawnSync(process.execPath,['--expose-internals',path.resolve('assets/restore-private.cjs'),'--zip',output,'--home',legacyHome,'--dsh-version',version,'--confirm-private'],{encoding:'utf8',windowsHide:true,env:process.env});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).verifiedFiles,backup.files);
 const dest=path.join(run,'assistant-new-home'),options={action:'restore',zipFile:output,targetHome:dest,confirmPrivate:true,expectedZipSHA256:backup.sha256};
 if(process.versions.electron){const result=A.run(options);assert.equal(result.ok,true);assert.equal(result.verifiedFiles,backup.files);assert.equal(result.requiresStartupValidation,true);assert(fs.readFileSync(path.join(dest,'.credentials.yaml'),'utf8').includes(secret))}else expect(()=>A.run(options),'HOST_DESKTOP_REQUIRED');
});
if(process.versions.electron)
test('v3 archive and exact real Desktop proof are accepted; mismatched proof stays blocked',()=>{
 const file=path.join(profile,'node_modules/synthetic-alpha/package.json'),original=fs.readFileSync(file),pkg=JSON.parse(original);pkg.peerDependencies={'@deepseek-ai/cordis':'^4.0.0'};write(file,JSON.stringify(pkg));
 try{const b=createPrivateBackup({...opts,target:path.join(run,'host-proof-v3.zip')});assert.equal(b.manifest.format,'dsh-private-recovery/3');assert.equal(V.inspectBackup({zipFile:b.path,dshVersion:version}).canRestore,true);
   const restored=restore({zipFile:b.path,targetHome:path.join(run,'v3-new-home'),dshVersion:version,confirmPrivate:true,expectedZipSHA256:b.sha256});assert.equal(restored.verifiedFiles,b.files);assert.equal(restored.requiresStartupValidation,true);
   const z=C.openZip(b.path),dest=path.join(run,'host-proof-mismatch.zip');try{const m=JSON.parse(z.get('manifest.json'));m.hostRequirements.asarSHA256='0'.repeat(64);write(dest,createZip([...z.records.values()].map(r=>({path:r.name,data:r.name==='manifest.json'?JSON.stringify(m):z.get(r.name)}))));}finally{z.close()}
   const checked=V.inspectBackup({zipFile:dest,dshVersion:version});assert.equal(checked.archiveIntegrity.state,'valid');assert.equal(checked.canRestore,false);assert.equal(checked.recoveryCompatibility.code,'HOST_REQUIREMENTS_MISMATCH');
 }finally{write(file,original)}
});
test('cleanup failure is explicit and preserves only the synthetic staging evidence',()=>{
 const original=fs.rmSync,signal={aborted:false},dest=path.join(run,'cleanup-failed-target');fs.rmSync=function(p,...args){if(path.basename(String(p)).startsWith('.dsh-restore-'))throw Object.assign(Error('SYNTHETIC'),{code:'EACCES'});return original.call(this,p,...args)};
 try{expect(()=>restore({zipFile:output,targetHome:dest,dshVersion:version,confirmPrivate:true,signal,onFile(){signal.aborted=true}}),'RESTORE_CLEANUP_FAILED')}finally{fs.rmSync=original}
 assert(!fs.existsSync(dest));assert.equal(fs.readdirSync(run).filter(x=>x.startsWith('.dsh-restore-')).length,1);
});
fs.writeFileSync(path.join(base,'acceptance-state.json'),JSON.stringify({run,sourceHome:home,sourceProfile:profile,restoredHome:target,restoredProfile:path.join(target,'profiles','restored'),zip:output,version,files:backup.files,bytes:backup.bytes,syntheticOnly:true,requiresSecondRoundDesktopValidation:true,results},null,2));
console.log(JSON.stringify({run,checks:results.length,files:backup.files,status:'PASS'}));

