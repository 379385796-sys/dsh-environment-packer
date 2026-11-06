'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const C=require('./recovery-core.cjs'),A=require('./migration-data.cjs'),R=require('./migration-archive.cjs'),P=require('./migration-plan.cjs'),H=require('./migration-host.cjs');
function json(file,value,exclusive=false){C.noLinks(file);const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');if(exclusive){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}else{const temp=file+'.'+require('node:crypto').randomBytes(8).toString('hex')+'.tmp';json(temp,value,true);fs.renameSync(temp,file);}}
function journal(p){return path.join(p.layout.state,'transaction.json');}
function state(p){P.validatePlan(p);C.noLinks(p.layout.state);C.noLinks(p.layout.workspace);const s=JSON.parse(C.readStable(journal(p)));const noWorkspace=s.workspaceIdentity===undefined&&!fs.existsSync(p.layout.workspace);if(s.planSHA256!==p.planSHA256||s.planId!==p.planId||C.identity(fs.statSync(p.layout.state))!==s.stateIdentity||(!noWorkspace&&C.identity(fs.statSync(p.layout.workspace))!==s.workspaceIdentity))C.fail('TRANSACTION_IDENTITY_CHANGED');return s;}
function save(p,s,phase){json(journal(p),{...s,phase,updatedAt:new Date().toISOString()});}
async function lock(p,prepare=false){
  P.validatePlan(p);const {pathToFileURL}=require('node:url'),G=await import(pathToFileURL(path.join(__dirname,'../lib/task-guard.js')).href),file=path.join(p.layout.state,'migration.guard');
  C.noLinks(file);if(prepare)G.prepareGuard(file);
  try{return await G.holdGuard(file,true);}catch(e){if(e.code==='COLD_OPERATION_BUSY')C.fail('MIGRATION_OPERATION_BUSY');throw e;}
}
async function guarded(p,operation){const guard=await lock(p);try{guard.assertHeld();return await operation(guard);}finally{await guard.release();}}
function assertBinding(p,{staged=false}={}){
  P.validatePlan(p);const l=p.layout;C.noLinks(l.parent);if(C.identity(fs.statSync(l.parent))!==l.parentIdentity)C.fail('TARGET_IDENTITY_CHANGED');
  if(!staged)for(const q of [l.workspace,l.state]){C.noLinks(q);if(fs.existsSync(q))C.fail('TARGET_EXISTS');}
  const arc=R.readArchive(p.zipFile);try{if(arc.zip.fingerprint()!==p.zipSHA256)C.fail('ARCHIVE_CHANGED');}finally{arc.zip.close();}
  const current=H.inspect(p.host.installation,p.host.proof.providers.map(v=>v.name).concat((p.host.proof.browserProviders||[]).map(v=>v.name)));
  if(P.digest(current)!==P.digest(p.host))C.fail('TARGET_HOST_CHANGED');
}
function destination(p,f){
  const l=p.layout,n=f.path;
  if(n.startsWith('profiles/desktop/'))return path.join(l.profile,n.slice(17));
  if(n.startsWith('home-data/'))return path.join(l.home,n.slice(10));
  if(n.startsWith('packages/'))return path.join(l.state,n);
  if(n.startsWith('preferences/'))return path.join(l.state,n);
  const m=n.match(/^workspaces\/([^/]+)\/(config|data)\/(.+)$/);if(!m)C.fail('INVALID_MIGRATION_SCOPE');
  const r=m[2]==='config'?p.mappings.find(r=>r.id===m[1]):p.externalRoots.find(r=>r.id===m[1]);if(!r)C.fail('PATH_MAPPING_MISSING');return path.join(r.to,m[3]);
}
function writeNew(file,bytes){C.noLinks(file);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(C.sha(C.readStable(file))!==C.sha(bytes))C.fail('RESTORE_VERIFY_FAILED');}
function memoryPath(p,file){
  return file.replace(/([\\/]workspaces[\\/])([a-f0-9]{64})(?=[\\/])/g,(all,prefix,hash)=>{
    const r=p.mappings.find(r=>C.sha(Buffer.from(r.from))===hash);if(!r)C.fail('MEMORY_WORKSPACE_ID_UNKNOWN');return prefix+C.sha(Buffer.from(fs.realpathSync.native(r.to)));
  });
}
function sourceStateHash(p){
  const records=[];function walk(root){C.noLinks(root);for(const d of fs.readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const q=path.join(root,d.name);if(d.isSymbolicLink())C.fail('REPARSE_REFUSED');if(d.isDirectory())walk(q);else if(d.isFile())records.push({path:q,sha256:C.sha(C.readStable(q))});else C.fail('SOURCE_TYPE_OR_SIZE');}}
  for(const r of [p.layout.home,p.layout.agents,p.layout.workspace,path.join(p.layout.state,'data'),path.join(p.layout.state,'packages'),path.join(p.layout.state,'preferences')])if(fs.existsSync(r))walk(r);
  return P.digest(records);
}
// Source trees are restored as inert data. Hash exactly what was written so
// verification can prove the staged tree still matches the archive mapping.
function sourceTreeDigest(p){
  const out=[];
  for(const t of p.sourceTrees||[]){
    const root=path.join(p.layout.home,t.name);if(!fs.existsSync(root))C.fail('SOURCE_TREE_MISSING');C.noLinks(root);
    const rows=[];
    function walk(dir,rel){
      C.noLinks(dir);
      for(const d of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
        const q=path.join(dir,d.name),r=rel?rel+'/'+d.name:d.name;
        if(d.isSymbolicLink())C.fail('SOURCE_TREE_CHANGED');
        if(d.isDirectory())walk(q,r);
        else if(d.isFile())rows.push({path:r,bytes:fs.statSync(q).size,sha256:C.sha(C.readStable(q))});
        else C.fail('SOURCE_TREE_CHANGED');
      }
    }
    walk(root,'');rows.sort((a,b)=>a.path.localeCompare(b.path,'en'));
    out.push({name:t.name,files:rows.length,bytes:rows.reduce((n,r)=>n+r.bytes,0),sha256:P.digest(rows)});
  }
  return out;
}
async function apply(p,{confirmPrivate=false,confirmExecution=false,signal,onFile}={}){
  if(!confirmPrivate||!confirmExecution)C.fail('MIGRATION_CONFIRMATION_REQUIRED');P.validatePlan(p);if(!p.canApply)C.fail('MIGRATION_PLAN_BLOCKED');
  const fresh=await P.plan({zipFile:p.zipFile,installation:p.host.installation,workspace:p.layout.workspace});if(P.digest(fresh)!==P.digest(p))C.fail('PLAN_CHANGED');
  // Defence in depth: refuse before creating state/workspace when the current
  // policy guarantees verify/commit can never succeed. No diagnostic staging.
  if(P.hasUnresolvedCritical(p.issues))C.fail('CRITICAL_DATA_UNVERIFIED');assertBinding(p);
  const l=p.layout;const stat=fs.statfsSync(l.parent);if(Number(stat.bavail)*Number(stat.bsize)<p.spaceBudgetBytes)C.fail('INSUFFICIENT_SPACE');
  fs.mkdirSync(l.state,{mode:0o700});C.privateAccess(l.state,true);
  const guard=await lock(p,true);
  let s={planId:p.planId,planSHA256:p.planSHA256,stateIdentity:C.identity(fs.statSync(l.state)),phase:'preparing',createdAt:new Date().toISOString()};
  try{
    json(journal(p),s,true);json(path.join(l.state,'plan.json'),p,true);guard.assertHeld();fs.mkdirSync(l.workspace,{mode:0o700});C.privateAccess(l.workspace,true);s.workspaceIdentity=C.identity(fs.statSync(l.workspace));save(p,s,'preparing');
    for(const q of [l.home,l.profile,l.agents,l.userData,path.join(l.state,'logs'),path.join(l.state,'tmp')])fs.mkdirSync(q,{recursive:true,mode:0o700});
    for(const r of [...p.mappings,...p.externalRoots])fs.mkdirSync(r.to,{recursive:true,mode:0o700});
    const arc=R.readArchive(p.zipFile);try{
      if(arc.zip.fingerprint()!==p.zipSHA256)C.fail('ARCHIVE_CHANGED');let count=0;const outputs=new Set();
      for(const directory of arc.manifest.directories){
        guard.assertHeld();let logical=directory;
        if(logical.startsWith('home-data/sessions/')){const parts=logical.slice('home-data/sessions/'.length).split('/'),root=p.mappings.find(r=>A.projectKey(r.from)===parts[0]);if(root)parts[0]=A.projectKey(root.to);logical='home-data/sessions/'+parts.join('/');}
        const to=path.dirname(memoryPath(p,destination(p,{path:logical+'/.packer-directory'})));C.noLinks(to);fs.mkdirSync(to,{recursive:true,mode:0o700});
      }
      for(const f of arc.manifest.files){
        guard.assertHeld();if(signal?.aborted)C.fail('MIGRATION_ABORTED');let bytes=P.get(arc,f),to=destination(p,f);
        if(f.path.startsWith('home-data/sessions/')&&/\.jsonl(?:\.zstd)?$/.test(f.path)){
          const t=A.transformSession(bytes,f.path,p.mappings);bytes=t.data;
          if(t.old){const parts=f.path.slice('home-data/sessions/'.length).split('/');if(parts[0]!==A.projectKey(t.old))C.fail('SESSION_DIRECTORY_MISMATCH');parts[0]=A.projectKey(t.header.cwd);to=path.join(l.home,'sessions',...parts);}
        }else if(f.path==='home-data/storages/workspace.json')bytes=A.mapWorkspace(bytes,p.mappings);
        else if(['profiles/desktop/cordis.patch.yml','home-data/cordis.patch.yml'].includes(f.path))bytes=await A.mapPatch(bytes,p.mappings,p.externalRoots,p.tools);
        to=memoryPath(p,to);const key=to.toLowerCase();if(outputs.has(key))C.fail('PATH_MAPPING_COLLISION');outputs.add(key);writeNew(to,bytes);onFile?.(++count);
      }
      const file=path.join(l.profile,'package.json'),pkg=JSON.parse(C.readStable(file));
      for(const [name,spec]of Object.entries(pkg.dependencies||{}))if(typeof spec==='string'&&/^(file:|link:|https?:|git)/i.test(spec)){
        const record=arc.manifest.packages.find(v=>v.name===name);pkg.dependencies[name]=record?.archivePath&&!record.sourceAuditIssues?.length?'file:'+path.join(l.state,record.archivePath).replaceAll('\\','/'):JSON.parse(C.readStable(path.join(l.profile,'node_modules',name,'package.json'))).version;
      }
      json(file,pkg);
      const preference=arc.manifest.files.find(f=>f.path==='preferences/dsh-chat-comfort.settings.v1.json');
      if(preference){const pref=JSON.parse(P.get(arc,preference));json(path.join(l.home,'PACKER-CLIENT-PREFERENCES.json'),{planId:p.planId,key:pref.key,value:A.knownPreference(pref.value)},true);}
      const mnemon=p.tools.find(t=>t.name==='mnemon');if(mnemon)json(path.join(l.home,'PACKER-TOOL-PROVENANCE.json'),{name:mnemon.name,version:mnemon.version,sha256:mnemon.sha256,planId:p.planId},true);
      save(p,s,'staged');arc.zip.assertUnchanged();
    }finally{arc.zip.close();}
    guard.assertHeld();s=state(p);s.sourceTrees=sourceTreeDigest(p);s.stagedSHA256=sourceStateHash(p);save(p,s,'staged');return {ok:true,phase:'staged',planId:p.planId,canCommit:false,issues:p.issues};
  }catch(e){if(fs.existsSync(journal(p))){s.error=/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'MIGRATION_FAILED';save(p,s,'needs-attention');}throw e;}finally{await guard.release();}
}
function childEnvironment(p){
  const env={};for(const k of ['SystemRoot','WINDIR','PATH','PATHEXT','COMSPEC','PSModuleAnalysisCachePath','NODE_COMPILE_CACHE'])if(process.env[k])env[k]=process.env[k];
  return {...env,USERPROFILE:p.layout.state,APPDATA:path.join(p.layout.state,'appdata'),LOCALAPPDATA:path.join(p.layout.state,'localappdata'),DSH_HOME:p.layout.home,DSH_AGENTS_HOME:p.layout.agents,DSH_CLIENT_VERSION:p.host.version,DSH_TELEMETRY_DISABLED:'1',DSH_DESKTOP_ROOT:p.host.installation,ELECTRON_RUN_AS_NODE:'1',TEMP:path.join(p.layout.state,'tmp'),TMP:path.join(p.layout.state,'tmp'),npm_config_cache:path.join(p.layout.state,'cache/npm'),pnpm_config_store_dir:path.join(p.layout.state,'cache/pnpm'),DSH_EXPORTER_TEMP:path.join(p.layout.state,'tmp/exporter')};
}
async function boot(p,round,{onReady,port=0}={}){
  const file=path.join(p.layout.state,'logs','runtime-'+round),out=fs.openSync(file+'.stdout.log','wx',0o600),err=fs.openSync(file+'.stderr.log','wx',0o600);
  let child,output='',errorOutput='',ready,loaded=false,dataVerified=false,dataChecks=[],exited=false,exitCode;
  try{
    child=spawn(p.host.exe,['--expose-internals',path.join(__dirname,'migration-runtime.cjs'),Buffer.from(JSON.stringify({layout:p.layout,installation:p.host.installation,native:p.native,tools:p.tools,port,expectedSkills:p.expectedSkills||[],expectedStorage:p.expectedStorage||[],expectedSessionIds:(p.datasets||[]).filter(d=>d.adapter==='session-v4').map(d=>d.sessionId),requiresPreferenceImport:p.requiresPreferenceImport===true})).toString('base64')],{cwd:p.layout.workspace,env:childEnvironment(p),windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
    child.stdout.on('data',b=>{fs.writeSync(out,b);output+=b.toString();const m=output.match(/dsh web: (http:\/\/[^\s]+)/);if(m)ready=m[1];});child.stderr.on('data',b=>{fs.writeSync(err,b);errorOutput+=b.toString();});child.on('message',m=>{if(m?.type==='native-loaded')loaded=true;if(m?.type==='data-verified'){dataVerified=true;dataChecks=m.checks||[];}if(m?.type==='failed')errorOutput+='\n'+m.code;});
    child.on('exit',c=>{exited=true;exitCode=c;});let spawnError;child.on('error',e=>{spawnError=e;});
    const deadline=Date.now()+60000;while(!ready||!dataVerified){if(spawnError||exited)C.fail('RUNTIME_BOOT_FAILED');if(Date.now()>deadline)C.fail('RUNTIME_BOOT_TIMEOUT');await new Promise(r=>setTimeout(r,100));}
    if(!loaded)C.fail('NATIVE_LOAD_UNVERIFIED');const url=new URL(ready);if(!['127.0.0.1','localhost'].includes(url.hostname))C.fail('RUNTIME_NONLOCAL_URL');
    let homepage=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000)});
    const cookie=homepage.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),headers=cookie?{cookie}:{};
    if(homepage.status>=300&&homepage.status<400){const to=new URL(homepage.headers.get('location'),url);if(to.origin!==url.origin)C.fail('RUNTIME_NONLOCAL_URL');homepage=await fetch(to,{headers,signal:AbortSignal.timeout(10000)});}
    if(!homepage.ok)C.fail('RUNTIME_WEB_FAILED');
    if(p.requiresPreferenceImport){const html=await homepage.text();if(!html.includes('dsh-packer.preference-import.')||!html.includes(p.planId))C.fail('CLIENT_PREFERENCE_IMPORT_UNVERIFIED');dataChecks.push('known-preference-bootstrap');}
    if(onReady)await onReady({url:ready,headers,layout:p.layout});
    const checks=['real-target-host-ready','web-http-ready','native-loads',...dataChecks];
    for(const plugin of p.plugins.filter(x=>!x.path.slice(0,-13).includes('/node_modules/',x.path.indexOf('/node_modules/')+14))){
      if(plugin.name==='dsh-ai-exporter'){
        const u=new URL('api/ai-exporter.sessions',url);const response=await fetch(u,{headers,signal:AbortSignal.timeout(10000)});if(!response.ok)C.fail('SESSION_BUSINESS_READ_FAILED');const rows=await response.json();if(!Array.isArray(rows))C.fail('SESSION_BUSINESS_READ_FAILED');checks.push('ai-exporter-session-list');
        for(const row of rows){const v=new URL('api/ai-exporter.snapshot',url);v.searchParams.set('sessionId',row.id);const r=await fetch(v,{headers,signal:AbortSignal.timeout(10000)});if(!r.ok)C.fail('SESSION_BUSINESS_READ_FAILED');const data=await r.json();if(data.error)C.fail('SESSION_BUSINESS_READ_FAILED');}checks.push('ai-exporter-session-snapshots');
      }
      if(plugin.name==='dsh-environment-packer'){const u=new URL('plugins/dsh-environment-packer/defaults',url),r=await fetch(u,{headers,signal:AbortSignal.timeout(10000)});if(!r.ok||(await r.json()).ok!==true)C.fail('PLUGIN_BUSINESS_READ_FAILED');checks.push('packer-settings-service');}
    }
    child.send({type:'shutdown'});const stop=Date.now()+15000;while(!exited&&Date.now()<stop)await new Promise(r=>setTimeout(r,100));if(!exited||exitCode!==0)C.fail('RUNTIME_SHUTDOWN_FAILED');
    if(/skipped bundle|entries did not activate|failed to load|unhandled|RUNTIME_BOOT_FAILED|ISOLATED_.*REFUSED/i.test(errorOutput))C.fail('RUNTIME_PLUGIN_FAILURE');
    return {round,status:'passed',checks,normalShutdown:true,exitCode};
  }finally{if(child&&!exited){child.kill();await new Promise(r=>{child.once('exit',r);setTimeout(r,5000);});}fs.closeSync(out);fs.closeSync(err);if(child&&!exited)C.fail('RUNTIME_EXIT_UNCONFIRMED');}
}
async function verifyCore(p,guard){
  assertBinding(p,{staged:true});let s=state(p);if(!['staged','verification-failed'].includes(s.phase))C.fail('TRANSACTION_STATE_INVALID');
  if(s.stagedSHA256!==sourceStateHash(p))C.fail('STAGED_DATA_CHANGED');
  const trees=sourceTreeDigest(p);if(JSON.stringify(trees)!==JSON.stringify(s.sourceTrees||[]))C.fail('SOURCE_TREE_CHANGED');
  if(P.hasUnresolvedCritical(p.issues))C.fail('CRITICAL_DATA_UNVERIFIED');
  try{
    const databases=[];for(const d of p.datasets.filter(d=>d.adapter==='sqlite-preserve')){
      const file=memoryPath(p,destination(p,d));C.noLinks(file);const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file,{readOnly:true});try{const result=db.prepare('PRAGMA integrity_check').all();if(result.length!==1||Object.values(result[0])[0]!=='ok')C.fail('DATABASE_INTEGRITY_FAILED');databases.push({path:d.path,integrity:'ok',userVersion:db.prepare('PRAGMA user_version').get().user_version,schemaSHA256:P.digest(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all())});}finally{db.close();}
      const tool=p.tools.find(t=>t.name==='mnemon');if(!tool||C.sha(C.readStable(tool.to))!==tool.sha256)C.fail('MNEMON_RUNTIME_UNVERIFIED');
      const run=require('node:child_process').spawnSync(tool.to,['status','--readonly','--data-dir',path.dirname(path.dirname(path.dirname(file))),'--store',path.basename(path.dirname(file))],{env:{...childEnvironment(p),MNEMON_DATA_DIR:path.dirname(path.dirname(path.dirname(file)))},encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});if(run.error||run.status!==0)C.fail('MEMORY_BUSINESS_READ_FAILED');databases.at(-1).nativeRead='passed';
    }
    const rounds=[];rounds.push(await boot(p,1));rounds.push(await boot(p,2));
    const receipt={planSHA256:p.planSHA256,zipSHA256:p.zipSHA256,status:'verified',rounds,databases,sourceTrees:trees,verifiedStateSHA256:sourceStateHash(p),hostSHA256:P.digest(p.host),requiresStartupValidation:false};
    guard.assertHeld();json(path.join(p.layout.state,'verification.json'),receipt,true);s=state(p);save(p,s,'verified');return receipt;
  }catch(e){s=state(p);s.error=e.code||'VERIFICATION_FAILED';save(p,s,'verification-failed');throw e;}
}
async function commitCore(p,guard){
  assertBinding(p,{staged:true});const s=state(p);if(s.phase!=='verified'||P.hasUnresolvedCritical(p.issues))C.fail('CRITICAL_DATA_UNVERIFIED');
  const receipt=JSON.parse(C.readStable(path.join(p.layout.state,'verification.json')));if(receipt.planSHA256!==p.planSHA256||receipt.status!=='verified'||receipt.verifiedStateSHA256!==sourceStateHash(p)||receipt.requiresStartupValidation!==false)C.fail('VERIFICATION_STALE');
  // A launch entry is published only after verification. The recovered Home stays a sibling of the workspace.
  const quote=v=>"'"+v.replaceAll("'","''")+"'";
  const lines=["$ErrorActionPreference='Stop'",`$transaction=Get-Content -LiteralPath ${quote(journal(p))} -Raw -Encoding UTF8|ConvertFrom-Json`,`if($transaction.phase -ne 'committed' -or $transaction.planSHA256 -cne ${quote(p.planSHA256)}){throw 'RESTORED_ENVIRONMENT_NOT_COMMITTED'}`,...Object.entries({DSH_HOME:p.layout.home,DSH_AGENTS_HOME:p.layout.agents,TEMP:path.join(p.layout.state,'tmp'),TMP:path.join(p.layout.state,'tmp'),npm_config_cache:path.join(p.layout.state,'cache/npm'),NODE_COMPILE_CACHE:path.join(p.layout.state,'cache/node-compile'),PSModuleAnalysisCachePath:path.join(p.layout.state,'cache/powershell')}).map(([k,v])=>`$env:${k}=${quote(v)}`),"Remove-Item Env:\\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue",`Start-Process -FilePath ${quote(p.host.exe)} -WorkingDirectory ${quote(p.layout.workspace)} -ArgumentList @(${quote('--user-data-dir="'+p.layout.userData+'"')},${quote('--crash-dumps-dir="'+path.join(p.layout.state,'crashes')+'"')}) -WindowStyle Hidden`];
  const launcher=path.join(p.layout.state,'Start-Restored-DSH.ps1'),bytes=Buffer.from('\ufeff'+lines.join('\r\n')+'\r\n','utf8');guard.assertHeld();
  if(fs.existsSync(launcher)){C.noLinks(launcher);if(!C.readStable(launcher).equals(bytes))C.fail('LAUNCHER_CHANGED');}else writeNew(launcher,bytes);
  save(p,s,'committed');return {ok:true,status:'committed',outcome:p.issues.length?'with-exceptions':'complete',exceptions:p.issues,startupVerified:true,launcher,workspace:p.layout.workspace,home:p.layout.home};
}
async function rollbackCore(p,guard){
  const s=state(p);if(s.phase==='rolled-back')return {ok:true,status:'rolled-back',diagnosticsPreserved:true};
  const {processSnapshot}=await import(require('node:url').pathToFileURL(path.join(__dirname,'../lib/cold-task.js')).href);
  if(processSnapshot({homeDir:p.layout.home,runtime:p.host.exe,sourceRoots:[p.layout.state,p.layout.workspace]},[process.pid,guard.record.pid]).length)C.fail('RESTORED_ENVIRONMENT_RUNNING_OR_UNPROVEN');
  guard.assertHeld();const launcher=path.join(p.layout.state,'Start-Restored-DSH.ps1');if(fs.existsSync(launcher)){C.noLinks(launcher);fs.renameSync(launcher,launcher+'.disabled');}
  save(p,s,'rolled-back');return {ok:true,status:'rolled-back',diagnosticsPreserved:true,sourceAndExistingEnvironmentsUntouched:true};
}
const verify=p=>guarded(p,g=>verifyCore(p,g)),commit=p=>guarded(p,g=>commitCore(p,g)),rollback=p=>guarded(p,g=>rollbackCore(p,g));
module.exports={...P,apply,verify,commit,rollback,state,assertBinding,destination,memoryPath,sourceStateHash,sourceTreeDigest,childEnvironment,boot};
