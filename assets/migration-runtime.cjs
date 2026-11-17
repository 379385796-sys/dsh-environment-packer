'use strict';
// Verification child: only the selected installation and staged Profile are loaded.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{syncBuiltinESMExports}=require('node:module');
const STORAGE_UNIT_NAME=/^[a-z][a-z0-9_]*$/;
function readStorageJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return undefined;}}
// Verify the staged storage medium itself, independently of any plugin owner.
// A missing medium is the only condition that keeps the historical
// STORAGE_OWNER_UNAVAILABLE code; damaged or version-drifted data fails with its
// own code so a real loss cannot be mistaken for a lazy or absent owner.
function verifyStorageMedium(home,name,expected={}){
  const fail=code=>{throw Error(code);};
  const single=path.join(home,'storages',name+'.json'),dir=path.join(home,'storages',name);
  if(fs.existsSync(single)){
    let stat;try{stat=fs.statSync(single);}catch{fail('STORAGE_MEDIUM_UNREADABLE');}
    if(!stat.isFile())fail('STORAGE_MEDIUM_INVALID');
    const doc=readStorageJson(single);if(!doc||typeof doc!=='object'||Array.isArray(doc))fail('STORAGE_DATA_INVALID');
    if(doc.unit&&typeof doc.unit.name==='string'){
      if(doc.unit.name!==name||!STORAGE_UNIT_NAME.test(name))fail('STORAGE_UNIT_IDENTITY_MISMATCH');
      if(!Number.isSafeInteger(doc.unit.version))fail('STORAGE_DATA_INVALID');
      if(Number.isSafeInteger(expected.version)&&doc.unit.version!==expected.version)fail('STORAGE_VERSION_UNSUPPORTED');
      if(!doc.tables||typeof doc.tables!=='object'||Array.isArray(doc.tables))fail('STORAGE_DATA_INVALID');
      let records=0;for(const table of Object.values(doc.tables)){if(table===null||typeof table!=='object'||Array.isArray(table))fail('STORAGE_DATA_INVALID');records+=Object.keys(table).length;}
      return {name,layout:'single',version:doc.unit.version,records,tables:Object.keys(doc.tables).sort(),hasGlobal:Object.hasOwn(doc,'global')};
    }
    if(Number.isSafeInteger(doc.version)&&Object.hasOwn(doc,'value')){
      if(Number.isSafeInteger(expected.version)&&doc.version!==expected.version)fail('STORAGE_VERSION_UNSUPPORTED');
      return {name,layout:'single-legacy',version:doc.version,records:0,tables:[],hasGlobal:false};
    }
    fail('STORAGE_DATA_INVALID');
  }
  if(fs.existsSync(dir)){
    let stat;try{stat=fs.statSync(dir);}catch{fail('STORAGE_MEDIUM_UNREADABLE');}
    if(!stat.isDirectory())fail('STORAGE_MEDIUM_INVALID');
    const globalFile=path.join(dir,'global.json');let version=expected.version,hasGlobal=false,tables=[],records=0;
    if(fs.existsSync(globalFile)){
      const doc=readStorageJson(globalFile);if(!doc||!Number.isSafeInteger(doc.version))fail('STORAGE_DATA_INVALID');
      hasGlobal=true;version=doc.version;
      if(Number.isSafeInteger(expected.version)&&doc.version!==expected.version)fail('STORAGE_VERSION_UNSUPPORTED');
    }
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(!entry.isDirectory()||!STORAGE_UNIT_NAME.test(entry.name))continue;
      tables.push(entry.name);
      for(const record of fs.readdirSync(path.join(dir,entry.name),{withFileTypes:true})){
        if(!record.isFile()||!record.name.endsWith('.json'))continue;
        const doc=readStorageJson(path.join(dir,entry.name,record.name));
        if(!doc||!Number.isSafeInteger(doc.version)||!Object.hasOwn(doc,'record'))fail('STORAGE_DATA_INVALID');
        if(doc.version!==version)fail('STORAGE_VERSION_UNSUPPORTED');
        records++;
      }
    }
    if(!hasGlobal&&records===0)fail('STORAGE_OWNER_UNAVAILABLE');
    if(!Number.isSafeInteger(version))fail('STORAGE_DATA_INVALID');
    return {name,layout:'per-record',version,records,tables:tables.sort(),hasGlobal};
  }
  fail('STORAGE_OWNER_UNAVAILABLE');
}
function verifyStorageMediums(home,expected=[]){
  return expected.filter(entry=>entry&&entry.critical===true).map(entry=>verifyStorageMedium(home,String(entry.name),entry));
}
async function run(request){
  const {layout,installation,native,tools=[]}=request;
  if(!process.versions.electron||path.resolve(process.execPath).toLowerCase()!==path.resolve(installation,'DeepSeek Harness.exe').toLowerCase())throw Error('TARGET_RUNTIME_REQUIRED');
  const allowed=[layout.state,layout.workspace].map(p=>path.resolve(p).toLowerCase());
  const mayWrite=p=>{if(typeof p==='number')return;const s=path.resolve(p instanceof URL?require('node:url').fileURLToPath(p):Buffer.isBuffer(p)?p.toString():String(p)).toLowerCase();if(!allowed.some(r=>s===r||s.startsWith(r+path.sep)))throw Error('ISOLATED_WRITE_REFUSED');};
  for(const [name,indices]of Object.entries({writeFile:[0],appendFile:[0],mkdir:[0],mkdtemp:[0],unlink:[0],rm:[0],rmdir:[0],truncate:[0],rename:[0,1],copyFile:[1],link:[0,1],symlink:[0,1],chmod:[0],chown:[0],utimes:[0]}))for(const target of [fs,fs.promises])for(const key of [name,name+'Sync'])if(typeof target[key]==='function'){const old=target[key];target[key]=function(...args){indices.forEach(i=>mayWrite(args[i]));return old.apply(this,args);};}
  for(const target of [fs,fs.promises])for(const key of ['open','openSync'])if(typeof target[key]==='function'){const old=target[key];target[key]=function(p,flags,...rest){if(typeof flags==='number'?(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT)):/[wa+]/.test(flags||''))mayWrite(p);return old.call(this,p,flags,...rest);};}
  // No remote requests, DNS discovery or subprocess install hooks during verification.
  const loopback=h=>h===undefined||['127.0.0.1','localhost','::1','[::1]'].includes(h);
  const net=require('node:net'),connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const x=args[0],host=typeof x==='object'?(x.host||x.hostname):typeof args[1]==='string'?args[1]:undefined;if(typeof x==='string'&&!/^\d+$/.test(x))throw Error('ISOLATED_NETWORK_REFUSED');if(!loopback(host))throw Error('ISOLATED_NETWORK_REFUSED');return connect.apply(this,args);};
  const dns=require('node:dns');for(const key of ['lookup','resolve','resolve4','resolve6']){const old=dns[key];dns[key]=function(host,...args){if(!loopback(host))throw Error('ISOLATED_NETWORK_REFUSED');return old.call(this,host,...args);};}
  const cp=require('node:child_process');for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']){
    const old=cp[key];cp[key]=function(command,args=[],...rest){
      const tool=tools.find(t=>t.name==='mnemon'&&path.resolve(t.to).toLowerCase()===path.resolve(command).toLowerCase());
      const safe=Array.isArray(args)&&(args.length===1&&['--version','-v'].includes(args[0])||['status','show','search','recall'].includes(args[0])||args[0]==='store'&&args[1]==='list');
      if(!tool||!safe||!['spawn','spawnSync','execFile','execFileSync'].includes(key))throw Error('ISOLATED_SUBPROCESS_REFUSED');
      for(let i=0;i<args.length;i++)if(args[i]==='--data-dir'){mayWrite(args[i+1]);i++;}
      if(!args.includes('--version')&&!args.includes('-v')&&!args.includes('--readonly'))args=[...args,'--readonly'];
      return old.call(this,command,args,...rest);
    };
  }
  syncBuiltinESMExports();
  // Prove the staged storage medium before any plugin can open (and, for a
  // missing single-layout file, silently materialize) a default empty unit.
  const storageMediums=verifyStorageMediums(layout.home,request.expectedStorage||[]);
  const loaded=[];for(const n of native||[]){const p=path.join(layout.profile,n.path.replace(/^profiles\/desktop\//,''));require(p);loaded.push(n.path);}
  const installAnchor=path.join(installation,'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json');
  const resolve=require('node:module').createRequire(installAnchor);
  const {loadProfileDirectory,reportSkippedBundles,loadLayeredEnv}=await import(pathToFileURL(resolve.resolve('@deepseek-ai/dsh-app-boot')).href);
  const {runProfile}=await import(pathToFileURL(resolve.resolve('@deepseek-ai/dsh/profile-boot')).href);
  const {DomainFacility}=await import(pathToFileURL(resolve.resolve('@deepseek-ai/dsh-storage-domain')).href),open=DomainFacility.prototype.open,observedStorage=new Set(),openingStorage=new Set(),storageFailures=new Map();let facility;
  DomainFacility.prototype.open=async function(spec){
    facility=this;const name=spec?.name;if(typeof name==='string')openingStorage.add(name);
    try{
      for(const source of request.expectedStorage||[])if(source.name===spec.name&&source.critical&&!([spec.version,...spec.compatibleVersions||[]].includes(source.version)))throw Error('STORAGE_SCHEMA_UNSUPPORTED');
      // Tighten verification: do not allow a business record to be silently backed up and skipped.
      const domain=await open.call(this,{...spec,invalidRecords:undefined});observedStorage.add(name);return domain;
    }catch(error){if(typeof name==='string')storageFailures.set(name,error?.code||error?.message||'unknown');throw error;}
    finally{if(typeof name==='string')openingStorage.delete(name);}
  };
  const profile=loadProfileDirectory('dsh',layout.profile,installAnchor);reportSkippedBundles('dsh',profile);
  process.send?.({type:'native-loaded',paths:loaded});
  const application=await runProfile({environment:loadLayeredEnv('dsh'),profile:'desktop',resolvedProfile:{profile,installAnchor},patchFiles:[],args:['--no-open','--host','127.0.0.1','--port',String(request.port||0)]});
  let stopping;
  const stop=()=>stopping??=(async()=>{await application.shutdown.shutdown(0);if(process.connected)process.send({type:'shutdown-complete'},()=>process.disconnect());})();
  process.on('message',m=>{if(m?.type==='shutdown')stop().catch(()=>{process.exitCode=1;process.disconnect();});});
  process.once('disconnect',()=>{if(!stopping)application.shutdown.shutdown(0);});
  try{
    await application.ctx.get('loader')?.await();
    const checks=[],storageOwnership=[];
    // Normal lazy loading and disabled/absent plugins are not data loss: the
    // medium was already proven byte-for-byte before boot. Only an opened owner
    // counts as an ownership claim; every other critical domain must still be
    // readable by the target's own storage backend, and the receipt names it
    // archived-only instead of pretending a live owner consumed it.
    const settleOwner=async name=>{const end=Date.now()+5000;while(Date.now()<end){if(observedStorage.has(name))return true;if(!openingStorage.has(name))return observedStorage.has(name);await new Promise(resolve=>setTimeout(resolve,50));}return observedStorage.has(name);};
    for(const record of storageMediums){
      let owner='archived-only';
      if(observedStorage.has(record.name))owner='opened';
      else if(openingStorage.has(record.name)){
        owner=await settleOwner(record.name)?'opened':'owner-opening';
        if(owner==='owner-opening'&&storageFailures.has(record.name)){const failure=storageFailures.get(record.name);throw Error(/^[A-Z0-9_]{1,100}$/.test(failure)?failure:'STORAGE_OWNER_OPEN_FAILED');}
      }
      else if(storageFailures.has(record.name)){const failure=storageFailures.get(record.name);throw Error(/^[A-Z0-9_]{1,100}$/.test(failure)?failure:'STORAGE_OWNER_OPEN_FAILED');}
      storageOwnership.push({...record,owner,engine:owner.startsWith('opened')?'owner':undefined});
    }
    if(storageOwnership.length)checks.push('actual-storage-schema-and-records');
    for(const record of storageOwnership){
      if(record.owner==='opened'){record.engine='owner';continue;}
      // A plugin may still be opening this domain right now; its own open already
      // validates the schema, so do not race a second handle against it.
      if(record.owner==='owner-opening'){record.engine='owner-opening';continue;}
      if(record.layout==='single-legacy'){record.engine='legacy-format-not-readable-by-current-owner';continue;}
      const storage=application.ctx.get('storage'),backendName=facility?.config?.routes?.[record.name]??facility?.config?.backend??'json';
      let backend;try{backend=storage?.backend?.get(backendName);}catch{backend=undefined;}
      if(!backend?.kv){record.engine='structural-only';continue;}
      const descriptor={name:record.name,version:record.version,tables:record.tables,hasGlobal:record.hasGlobal,...(record.layout==='per-record'?{layout:'per-record'}:{})};
      let unit;try{
        unit=await backend.kv.open(descriptor);const snapshot=await unit.loadAll();
        let records=0;for(const table of Object.values(snapshot.tables||{}))records+=Object.keys(table||{}).length;
        if(records!==record.records)throw Error('STORAGE_RECORD_COUNT_MISMATCH');
        record.engine='backend-read';
      }catch(error){
        if(error?.code==='already-open'||/already open/.test(String(error?.message))){record.owner='opened';record.engine='owner';continue;}
        if(error?.code==='version-mismatch')throw Error('STORAGE_VERSION_UNSUPPORTED');
        if(error?.code==='malformed-medium')throw Error('STORAGE_DATA_INVALID');
        throw error;
      }finally{if(unit)await unit.close();}
    }
    if(storageOwnership.some(x=>x.owner==='opened'))checks.push('storage-owner-read');
    if(storageOwnership.some(x=>x.engine==='backend-read'||x.engine==='structural-only'||x.engine==='owner-opening'))checks.push('storage-medium-read-without-owner');
    if(request.expectedSessionIds?.length){
      const persistence=application.ctx.get('sessionPersistence');if(!persistence)throw Error('SESSION_OWNER_UNAVAILABLE');
      for(const id of request.expectedSessionIds){if(typeof id!=='string')throw Error('SESSION_OWNER_UNVERIFIED');const handle=await persistence.open(id,'read');try{await handle.read();}finally{await handle.close();}}
      checks.push('actual-session-owner-read');
    }
    // rc.5 Web/Desktop mounts filesystem skills inside Agent preset scopes, not in the root registry.
    // Exercise the target's real filesystem provider without changing the recovered preset composition.
    if(request.expectedSkills?.length){
      const {FileSystemSkillProvider}=await import(pathToFileURL(resolve.resolve('@deepseek-ai/dsh-skill-filesystem')).href),lifetime=new AbortController();
      const provider=new FileSystemSkillProvider(application.ctx,{invalidate(){},signal:lifetime.signal},{providerName:'packer-verification',watch:false,dshHome:layout.home,agentsHome:layout.agents});
      try{for(const expected of request.expectedSkills){const listed=await provider.list({cwd:expected.cwd}),candidate=(Array.isArray(listed)?listed:listed.candidates).find(c=>c.name===expected.name),definition=candidate&&await provider.get(candidate,{signal:lifetime.signal});if(!definition||require('./recovery-core.cjs').sha(Buffer.from(definition.content))!==expected.bodySHA256)throw Error('SKILL_BUSINESS_READ_FAILED');checks.push('skill-body-read');}}finally{lifetime.abort();await provider.dispose();}
    }
    process.send?.({type:'data-verified',checks,storage:storageOwnership});
  }catch(e){const mapped={'version-mismatch':'STORAGE_VERSION_UNSUPPORTED','malformed-medium':'STORAGE_DATA_INVALID','already-open':'STORAGE_ALREADY_OPEN'}[e?.code],code=/^[A-Z0-9_]+$/.test(e.message)?e.message:mapped||'RUNTIME_DATA_VALIDATION_FAILED';console.error(code+(e?.code?' ('+String(e.code).slice(0,40)+')':''));process.send?.({type:'failed',code});await application.shutdown.shutdown(1);if(process.connected)process.disconnect();throw e;}
}
if(require.main===module){run(JSON.parse(Buffer.from(process.argv[2],'base64'))).catch(e=>{process.send?.({type:'failed',code:/^[A-Z_]+$/.test(e.message)?e.message:'RUNTIME_BOOT_FAILED'},()=>{});console.error('RUNTIME_BOOT_FAILED');process.exitCode=1;});}
module.exports={run,verifyStorageMedium,verifyStorageMediums};
