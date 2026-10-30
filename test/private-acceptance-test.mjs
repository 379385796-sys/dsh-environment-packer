import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import zlib from 'node:zlib';
import {createPrivateBackup} from '../lib/private-backup.js';
import {collectSafeConfiguration} from '../lib/safe-export.js';
import {createZip} from '../lib/zip.js';
import {readAsarVersion} from '../lib/collect.js';
import {packToTgz} from '../lib/tgz.js';
const require=createRequire(import.meta.url),C=require('../assets/recovery-core.cjs'),{restore}=require('../assets/restore-private.cjs');
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
fs.writeFileSync(path.join(base,'acceptance-state.json'),JSON.stringify({run,sourceHome:home,sourceProfile:profile,restoredHome:target,restoredProfile:path.join(target,'profiles','restored'),zip:output,version,files:backup.files,bytes:backup.bytes,syntheticOnly:true,results},null,2));
console.log(JSON.stringify({run,checks:results.length,files:backup.files,status:'PASS'}));

