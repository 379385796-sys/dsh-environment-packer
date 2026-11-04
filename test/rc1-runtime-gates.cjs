'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),z=require('node:zlib');
const E=require('../assets/migration-engine.cjs'),R=require('../assets/migration-archive.cjs'),C=require('../assets/recovery-core.cjs');
const [root,fixture,target,rc5]=process.argv.slice(2);if(![root,fixture,target,rc5].every(p=>p&&path.isAbsolute(p)))throw Error('Explicit isolated paths required');
fs.mkdirSync(root,{recursive:true});const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2));
(async()=>{
 const good=JSON.parse(fs.readFileSync(path.join(fixture,'state.json'))),checks=[];
 const legacy=await E.plan({zipFile:good.zip,installation:rc5,workspace:path.join(root,'rc5-regression')});assert.deepEqual(legacy.issues,[]);await E.apply(legacy,{confirmPrivate:true,confirmExecution:true});const rc5Boot=await E.boot(legacy,'rc5-http-and-session');assert(rc5Boot.checks.includes('known-preference-bootstrap'));assert(rc5Boot.checks.includes('actual-session-owner-read'));await E.rollback(legacy);checks.push('actual rc5 still loads Packer and validates HTTP preference import, Session owner, Skills and storage');
 const pref=path.join(good.plan.layout.home,'PACKER-CLIENT-PREFERENCES.json'),saved=fs.readFileSync(pref);fs.renameSync(pref,pref+'.test-saved');try{await assert.rejects(()=>E.boot(good.plan,'missing-preference'),e=>e.code==='CLIENT_PREFERENCE_IMPORT_UNVERIFIED');}finally{fs.renameSync(pref+'.test-saved',pref);assert(fs.readFileSync(pref).equals(saved));}checks.push('missing real HTTP preference bootstrap is refused');
 const bad=path.join(root,'invalid-session.zip'),arc=R.readArchive(good.zip),writer=new C.ZipWriter(bad);try{
  const m=structuredClone(arc.manifest),f=m.files.find(f=>f.path.includes('/sessions/')&&f.path.endsWith('.zstd')),decoded=require('../assets/migration-data.cjs').decodeSession(arc.zip.get(f.path),f.path),body=Buffer.from(JSON.stringify({type:'working-directory/change',seq:'invalid-sequence',time:2,data:{cwd:decoded.header.cwd}})+'\n');
  const bytes=Buffer.concat([z.zstdCompressSync(Buffer.from(JSON.stringify(decoded.header)+'\n')),z.zstdCompressSync(body)]);f.bytes=bytes.length;f.sha256=C.sha(bytes);
  for(const record of arc.zip.records.values())writer.add(record.name,record.name==='manifest.json'?Buffer.from(JSON.stringify(m)):record.name===f.path?bytes:arc.zip.get(record.name));writer.finish();
 }finally{writer.close();arc.zip.close();}
 const p=await E.plan({zipFile:bad,installation:target,workspace:path.join(root,'invalid-session-target')});assert.deepEqual(p.issues,[]);await E.apply(p,{confirmPrivate:true,confirmExecution:true});await assert.rejects(()=>E.verify(p));await assert.rejects(()=>E.commit(p),e=>e.code==='CRITICAL_DATA_UNVERIFIED');const stderr=fs.readFileSync(path.join(p.layout.state,'logs/runtime-1.stderr.log'),'utf8');assert(!stderr.includes('ERR_IPC_CHANNEL_CLOSED'));await E.rollback(p);assert.equal(E.state(p).phase,'rolled-back');checks.push('target Session owner rejects invalid events before commit; failure rolls back without IPC uncaught error');
 const result={status:'PASS',checks,rc5Boot,invalidSessionState:E.state(p).phase};write(path.join(root,'result.json'),result);console.log(JSON.stringify({status:'PASS',checks:checks.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
