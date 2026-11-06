'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {pathToFileURL}=require('node:url'),C=require('./recovery-core.cjs'),A=require('./migration-data.cjs');
const FORMAT='dsh-private-recovery/4';
// recovery/4 archives a readable source tree even when installed packages do not
// satisfy declared peers/engines. The real conflicts are recorded in the manifest
// and the restore plan re-evaluates the same contract, so unresolved critical
// issues still block apply/commit. Malformed package metadata is not a version
// conflict and must still stop the archive before any bytes are written.
const RECORDABLE_DEPENDENCY_CODES=new Set(['DSH_ENGINE_MISMATCH','PEER_VERSION_MISMATCH','HOST_PEER_VERSION_MISMATCH','TRANSITIVE_DEPENDENCY_MISSING','HOST_BROWSER_PEER_UNPROVEN']);
const MAX_RECORDED_DEPENDENCY_ISSUES=200;
// A coverage summary contains stable codes and counts only. It never carries
// payload text, paths, credentials, arbitrary request objects or preference values.
const MAX_COVERAGE_CODES=8,GAP_CODE=/^[A-Z0-9_]{1,64}$/;
const COVERAGE_STATES=new Set(['critical-gaps','no-known-critical-gaps']);
function classifyClientPreferences(clientPreferences){
  if(clientPreferences===undefined)return {protocol:1,state:'absent',preferences:{}};
  if(!clientPreferences||typeof clientPreferences!=='object'||Array.isArray(clientPreferences))C.fail('CLIENT_PREFERENCE_INVALID');
  const keys=Object.keys(clientPreferences);
  if(keys.length!==1||keys[0]!=='dsh-chat-comfort.settings.v1')C.fail('CLIENT_PREFERENCE_INVALID');
  // A.knownPreference rejects extra/invalid fields; never substitute a default value.
  return {protocol:1,state:'present-valid',preferences:{'dsh-chat-comfort.settings.v1':A.knownPreference(clientPreferences['dsh-chat-comfort.settings.v1'])}};
}
function coverageSummary(missing,excluded){
  const gaps=Array.isArray(missing)?missing:[],omitted=Array.isArray(excluded)?excluded:[];
  const critical=gaps.filter(i=>i&&i.critical===true),needsReview=omitted.filter(i=>i&&i.needsReview===true);
  const codes=critical.map(i=>typeof i.code==='string'&&GAP_CODE.test(i.code)?i.code:'UNKNOWN_CRITICAL_GAP');
  if(needsReview.length)codes.push('HOME_ITEM_UNCLASSIFIED');
  const unique=[...new Set(codes)],count=critical.length+needsReview.length;
  return {schema:1,state:count?'critical-gaps':'no-known-critical-gaps',criticalCount:count,criticalCodes:unique.slice(0,MAX_COVERAGE_CODES),truncated:unique.length>MAX_COVERAGE_CODES,recoveryBlocked:count>0,blockReason:count>0?'CRITICAL_COVERAGE_GAPS':null};
}
const OMIT_HOME=new Set(['profiles','cache','logs','telemetry','dsh-runtimes','.packer-cold','subagent-gc-backup','.anonymous-user-id','dsh-skills-manager.log','PACKER-CLIENT-PREFERENCES.json','PACKER-RESTORE-RESULT.json','PACKER-TOOL-PROVENANCE.json']);
// `plugins-local` is a plain user source area, not a DSH runtime path: neither
// the desktop application nor any installed plugin reads it. Its packages are
// preserved as inert data so local edits are not lost, but their node_modules
// trees are install artifacts, may contain junctions/native payloads and must
// never become environment packages in the restore plan.
const LOCAL_SOURCE_HOME='plugins-local';
const LOCAL_SOURCE_EXCLUDED=new Set(['node_modules']);
// A manual `.bak` of a Packer-known home cache is a superseded snapshot, not a
// separate data set. Only classify it when the live, captured file still
// exists; otherwise the backup may be the only copy and stays a critical gap.
const CACHE_BACKUP=/^(\.dshw-(?:usage|size|turn)\.json)\..+\.bak$/i;
const USER_HOME=new Set(['storages','sessions','attachments','memory','skills','AGENTS.md','.credentials.yaml','.credentials.yml','settings.yaml','settings.yaml.imported','cordis.patch.yml','.env','dsh-claude-style','rewind-snapshots','skills-manager','llm-deepseek','archive-manager','aik_auto_memory_use','dsh-market','dsh-builtin-browser-host','models','emoji-packs','whale-audio','whale-bubble-imgs','whale-roles','.dshw-size.json','.dshw-turn.json','.dshw-usage.json']);
async function legacy(){return import(pathToFileURL(path.join(__dirname,'../lib/private-backup.js')).href);}
function fileRecord(source,relative){const s=fs.lstatSync(source);if(!s.isFile()||s.isSymbolicLink()||s.size>C.MAX_FILE)C.fail('SOURCE_TYPE_OR_SIZE');return {path:relative,source,identity:C.identity(s),bytes:s.size,mtime:s.mtimeMs,ctime:s.ctimeMs};}
function addTree(source,relative,files,dirs){
  C.noLinks(source);const s=fs.lstatSync(source);C.safeName(relative);
  if(s.isDirectory()){dirs.push(relative);for(const name of fs.readdirSync(source).sort())addTree(path.join(source,name),relative+'/'+name,files,dirs);}
  else files.push(fileRecord(source,relative));
  if(files.length+dirs.length>=C.MAX_ENTRIES)C.fail('ARCHIVE_LIMIT');
}
function addSourceTree(source,relative,files,dirs){
  C.noLinks(source);const s=fs.lstatSync(source);C.safeName(relative);
  if(s.isDirectory()){dirs.push(relative);for(const name of fs.readdirSync(source).sort()){if(LOCAL_SOURCE_EXCLUDED.has(name.toLowerCase()))continue;addSourceTree(path.join(source,name),relative+'/'+name,files,dirs);}}
  else files.push(fileRecord(source,relative));
  if(files.length+dirs.length>=C.MAX_ENTRIES)C.fail('ARCHIVE_LIMIT');
}
function sourceJson(p){try{return JSON.parse(C.readStable(p));}catch(e){C.fail(e.code||'SOURCE_JSON_INVALID');}}
async function discover({homeDir,profileDir,workspaceRoot,agentsDir,clientPreferences}={}){
  for(const p of [homeDir,profileDir])C.noLinks(p);
  const roots=[{id:'home',kind:'home',path:homeDir},{id:'profile',kind:'profile',path:profileDir}],missing=[],excluded=[],mnemonCliPaths=[];
  function root(kind,p,primary=false){if(typeof p!=='string'||!path.isAbsolute(p))C.fail('SOURCE_ROOT_INVALID');C.noLinks(p);const existing=roots.find(r=>A.canonical(r.path)===A.canonical(p));if(existing){if(existing.kind!==kind)C.fail('DATA_ROOT_OVERLAPS_WORKSPACE');if(primary)existing.primary=true;return existing;}const r={id:kind+'-'+A.id(p),kind,path:p,primary,exists:fs.existsSync(p)};roots.push(r);return r;}
  if(workspaceRoot)root('workspace',path.resolve(workspaceRoot),true);
  const w=path.join(homeDir,'storages/workspace.json');if(fs.existsSync(w)){const j=sourceJson(w);for(const r of Object.values(j.tables?.workspaces||{}))if(typeof r.path==='string')root('workspace',r.path,!roots.some(r=>r.kind==='workspace'&&r.primary));}
  let mnemonEntries=[];const Y=await A.yaml(),patch=path.join(profileDir,'cordis.patch.yml');if(fs.existsSync(patch)){
    let tree;try{tree=Y.load(C.readStable(patch).toString('utf8'));}catch{C.fail('PROFILE_PATCH_INVALID');}
    for(const p of A.configPaths(tree))root(p.kind,p.value,p.kind==='workspace'&&!roots.some(r=>r.kind==='workspace'&&r.primary));
    for(const e of A.entries(tree))if(e.id==='prompt-inject')for(const p of Object.keys(e.config.workspaceOverrides||{}))root('workspace',p);
    for(const e of A.entries(tree))if(/mnemon/.test(e.id)&&e.config.cliPath)mnemonCliPaths.push(e.config.cliPath);
    mnemonEntries=A.entries(tree).filter(e=>e.id==='mnemon');
  }
  function sessions(p){if(!fs.existsSync(p))return;for(const d of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,d.name);if(d.isSymbolicLink())C.fail('SOURCE_LINK_REFUSED');if(d.isDirectory())sessions(q);else if(/\.jsonl(?:\.zstd)?$/.test(q)){for(const cwd of A.sessionPaths(C.readStable(q),q))root('workspace',cwd);}}}sessions(path.join(homeDir,'sessions'));
  if(!mnemonEntries.length&&sourceJson(path.join(profileDir,'package.json')).dependencies?.['dsh-mnemon'])mnemonEntries=[{id:'mnemon',config:{storageScope:'global'}}];
  for(const e of mnemonEntries){const c=e.config;if(c.dataDir)continue;
    if(c.storageScope==='workspace')for(const w of roots.filter(r=>r.kind==='workspace')){const r=root('memory',path.join(w.path,'.mnemon'));r.workspaceRelative=true;r.defaultRoot=true;r.owners=[...new Set([...(r.owners||[]),e.id])];}
    else if(c.storageScope===undefined||['global','workspaces'].includes(c.storageScope)){const r=root('memory',path.resolve(process.env.MNEMON_DATA_DIR||path.join(os.homedir(),'.mnemon')));r.defaultRoot=true;r.owners=[...new Set([...(r.owners||[]),e.id])];}
  }
  const agents=agentsDir||process.env.DSH_AGENTS_HOME||path.join(os.homedir(),'.agents');if(fs.existsSync(path.join(agents,'skills')))root('agents',agents);
  for(const r of roots.filter(r=>['memory','skills'].includes(r.kind)))if(!r.exists&&!r.defaultRoot)missing.push({code:'EXTERNAL_DATA_MISSING',root:r.id,critical:true});
  for(const name of fs.readdirSync(homeDir).sort())if(!USER_HOME.has(name)){
    const captured=roots.some(r=>['memory','skills'].includes(r.kind)&&A.canonical(r.path)===A.canonical(path.join(homeDir,name)));
    const backupBase=CACHE_BACKUP.exec(name)?.[1],liveBase=backupBase?path.join(homeDir,backupBase):null,superseded=liveBase&&(()=>{try{return fs.lstatSync(liveBase).isFile();}catch{return false;}})()?backupBase:null;
    const reason=captured?'captured-as-data-root'
      :name===LOCAL_SOURCE_HOME?'captured-local-plugin-source'
      :OMIT_HOME.has(name)||name.startsWith('.deployment-rollback')?'runtime-cache-history-or-task'
      :superseded?'superseded-runtime-cache-backup'
      :'unclassified-home-entry';
    excluded.push({name,reason,...(superseded?{supersededBy:superseded}:{}),needsReview:!captured&&name!==LOCAL_SOURCE_HOME&&!OMIT_HOME.has(name)&&!name.startsWith('.deployment-rollback')&&!superseded});
  }
  const capture=classifyClientPreferences(clientPreferences),preferences=capture.preferences;
  // An absent field is a real, critical capture gap. Data preservation still
  // proceeds; it must never be reported as a successful capture.
  if(capture.state==='absent'&&fs.existsSync(path.join(profileDir,'node_modules/dsh-chat-comfort/package.json')))missing.push({code:'CLIENT_PREFERENCE_NOT_CAPTURED',critical:true});
  return {roots,missing,excluded,preferences,capture,mnemonCliPaths};
}
async function inventory(options){
  const base=await legacy(),layout=await discover(options),old=base.inventory(options.profileDir,options.homeDir);
  const files=old.files.map(f=>({...f,path:f.path.startsWith('profile/')?'profiles/desktop/'+f.path.slice(8):'home-data/'+f.path.slice(5)}));
  const directories=old.directories.map(n=>n.startsWith('profile/')?'profiles/desktop/'+n.slice(8):'home-data/'+n.slice(5));
  for(const name of [...USER_HOME].sort())if(!base.HOME_SCOPE.includes(name)&&fs.existsSync(path.join(options.homeDir,name)))addTree(path.join(options.homeDir,name),'home-data/'+name,files,directories);
  // Local plugin sources are captured as inert data. A failure inside that tree
  // is reported as a critical coverage gap instead of aborting the whole
  // archive: readable environment data must still be preserved.
  const sourceTrees=[],localSource=path.join(options.homeDir,LOCAL_SOURCE_HOME),localEntry=layout.excluded.find(i=>i.name===LOCAL_SOURCE_HOME);
  if(localEntry&&!fs.existsSync(localSource)){localEntry.needsReview=true;layout.missing.push({code:'LOCAL_SOURCE_TREE_INCOMPLETE',tree:LOCAL_SOURCE_HOME,critical:true});}
  else if(fs.existsSync(localSource)){
    const treeFiles=[],treeDirs=[];
    try{
      addSourceTree(localSource,'home-data/'+LOCAL_SOURCE_HOME,treeFiles,treeDirs);
      files.push(...treeFiles);directories.push(...treeDirs);
      sourceTrees.push({name:LOCAL_SOURCE_HOME,archivePrefix:'home-data/'+LOCAL_SOURCE_HOME,restorePath:LOCAL_SOURCE_HOME,fileCount:treeFiles.length,bytes:treeFiles.reduce((n,f)=>n+f.bytes,0),excluded:[...LOCAL_SOURCE_EXCLUDED].sort(),complete:true});
    }catch(e){
      if(!['REPARSE_REFUSED','SOURCE_TYPE_OR_SIZE','ARCHIVE_LIMIT','UNSAFE_ARCHIVE_PATH'].includes(e.code))throw e;
      const entry=layout.excluded.find(i=>i.name===LOCAL_SOURCE_HOME);if(entry)entry.needsReview=true;
      layout.missing.push({code:'LOCAL_SOURCE_TREE_INCOMPLETE',tree:LOCAL_SOURCE_HOME,critical:true});
    }
  }
  for(const r of layout.roots){
    if(!r.exists&&['memory','skills','agents','workspace'].includes(r.kind))continue;
    if(['memory','skills'].includes(r.kind)){
      if(A.inside(options.homeDir,r.path)&&USER_HOME.has(path.relative(options.homeDir,r.path).split(path.sep)[0]))continue;
      addTree(r.path,'workspaces/'+r.id+'/data',files,directories);
    }else if(r.kind==='workspace'){
      // No generic recursion into a workspace. In particular, no nested Home, project, or transaction directory.
      for(const n of ['AGENTS.md','.dsh/skills','.agents/skills'])if(fs.existsSync(path.join(r.path,n)))addTree(path.join(r.path,n),'workspaces/'+r.id+'/config/'+n,files,directories);
    }else if(r.kind==='agents')addTree(path.join(r.path,'skills'),'workspaces/'+r.id+'/data/skills',files,directories);
  }
  const pkg=sourceJson(path.join(options.profileDir,'package.json')),packages=[],tools=[];
  for(const [name,spec]of Object.entries({...pkg.dependencies,...pkg.optionalDependencies}).sort()){
    const installed=path.join(options.profileDir,'node_modules',name,'package.json');if(!fs.existsSync(installed))C.fail('DECLARED_DEPENDENCY_MISSING');const m=sourceJson(installed);
    const record={name,version:m.version,sourceKind:typeof spec==='string'&&spec.startsWith('file:')?'file':'declared',spec,manifestSHA256:C.sha(C.readStable(installed)),installedPayload:true};
    if(record.sourceKind==='file'){
      const p=path.resolve(options.profileDir,spec.slice(5));if(fs.existsSync(p)&&p.endsWith('.tgz')){
        const {inspectTgz}=await import(pathToFileURL(path.join(__dirname,'../lib/local-package.js')).href),audit=inspectTgz(C.readStable(p));
        if(!audit.packageJson||audit.packageJson.name!==name||audit.packageJson.version!==m.version)C.fail('PACKAGE_SOURCE_IDENTITY_MISMATCH');
        const dest='packages/'+A.id(name)+'/'+path.basename(p);files.push(fileRecord(p,dest));record.archivePath=dest;record.sourceSHA256=C.sha(C.readStable(p));record.sourceAuditIssues=audit.issues;record.installScriptsExecuted=false;
      }
      else layout.missing.push({code:'ORIGINAL_PACKAGE_MISSING',plugin:name,critical:false});
    }packages.push(record);
  }
  if(pkg.dependencies?.['dsh-mnemon']){
    const npmRoot=path.join(process.env.APPDATA||path.join(os.homedir(),'AppData/Roaming'),'npm/node_modules/@mnemon-dev/mnemon'),manifest=path.join(npmRoot,'package.json');
    if(fs.existsSync(manifest)){
      const m=sourceJson(manifest),alias='@mnemon-dev/mnemon-'+process.platform+'-'+process.arch,np=path.join(npmRoot,'node_modules',alias,'package.json');
      if(m.name==='@mnemon-dev/mnemon'&&fs.existsSync(np)){
        const native=sourceJson(np),expected=m.version+'-'+process.platform+'-'+process.arch,file=path.join(path.dirname(np),'bin/mnemon.exe');
        if(native.name==='@mnemon-dev/mnemon'&&native.version===expected&&m.optionalDependencies?.[alias]==='npm:@mnemon-dev/mnemon@'+expected&&fs.existsSync(file)){
          const configured=layout.mnemonCliPaths[0],actual=configured&&path.isAbsolute(configured)&&fs.existsSync(configured)?configured:file,sha256=C.sha(C.readStable(file));
          if(configured&&(!path.isAbsolute(configured)||!fs.existsSync(configured)||C.sha(C.readStable(actual))!==sha256))layout.missing.push({code:'MNEMON_RUNTIME_SOURCE_UNPROVEN',critical:true});
          else{const archivePath='packages/native-mnemon/mnemon.exe';files.push(fileRecord(actual,archivePath));tools.push({name:'mnemon',version:m.version,platform:process.platform,arch:process.arch,archivePath,sha256,source:'official-npm-platform-package'});}
        }
      }
    }
    if(!tools.length&&fs.existsSync(path.join(options.homeDir,'PACKER-TOOL-PROVENANCE.json'))){
      const provenance=sourceJson(path.join(options.homeDir,'PACKER-TOOL-PROVENANCE.json')),source=layout.mnemonCliPaths[0];
      if(source&&path.isAbsolute(source)&&fs.existsSync(source)&&provenance.name==='mnemon'&&provenance.sha256===C.sha(C.readStable(source))){const archivePath='packages/native-mnemon/mnemon.exe';files.push(fileRecord(source,archivePath));tools.push({name:'mnemon',version:provenance.version,platform:process.platform,arch:process.arch,archivePath,sha256:provenance.sha256,source:'prior-verified-recovery'});}
    }
    if(!tools.length)layout.missing.push({code:'MNEMON_RUNTIME_NOT_CAPTURED',critical:true});
  }
  const seen=new Set();for(const f of files){C.safeName(f.path);if(seen.has(f.path.toLowerCase()))C.fail('SOURCE_PATH_COLLISION');seen.add(f.path.toLowerCase());}
  const total=files.reduce((n,f)=>n+f.bytes,0);if(total>C.MAX_TOTAL-16*1024*1024||files.length+directories.length>=C.MAX_ENTRIES)C.fail('ARCHIVE_LIMIT');
  return {...layout,files:files.sort((a,b)=>a.path.localeCompare(b.path,'en')),directories:[...new Set(directories)].sort(),packages,tools,sourceTrees,legacyInventory:old};
}
function validate(zip){
  let m;try{m=JSON.parse(zip.get('manifest.json'));}catch{C.fail('INVALID_MANIFEST');}
  if(m.format!==FORMAT||m.schemaVersion!==1||m.mode!=='environment-migration'||!Array.isArray(m.files)||!Array.isArray(m.directories)||!Array.isArray(m.roots)||!Array.isArray(m.packages)||!m.sourceRuntime||!m.coverage)C.fail('INVALID_MIGRATION_MANIFEST');
  if(!m.files.length||m.files.length+m.directories.length>=C.MAX_ENTRIES||!m.files.some(f=>f.path==='profiles/desktop/package.json'))C.fail('INVALID_MIGRATION_MANIFEST');
  if(m.compatibility!==undefined){
    const c=m.compatibility;
    if(!c||typeof c!=='object'||Array.isArray(c)||!Number.isSafeInteger(c.dependencyIssueCount)||c.dependencyIssueCount<0||!Array.isArray(c.dependencyIssues)||c.dependencyIssues.length>c.dependencyIssueCount||!Array.isArray(c.optionalMissing))C.fail('INVALID_MIGRATION_MANIFEST');
    for(const i of c.dependencyIssues)if(!i||typeof i.code!=='string'||!/^[A-Z0-9_]{1,100}$/.test(i.code)||(i.actual!==null&&typeof i.actual!=='string')||(i.range!==null&&typeof i.range!=='string'))C.fail('INVALID_MIGRATION_MANIFEST');
  }
  // Old /4 archives have no summary; when present it must be a bounded, stable
  // code list so a rewritten manifest cannot fabricate a clean capture.
  if(m.coverage.summary!==undefined){
    const s=m.coverage.summary;
    const gapState=s&&s.state==='critical-gaps';
    if(!s||typeof s!=='object'||Array.isArray(s)||s.schema!==1||!COVERAGE_STATES.has(s.state)||!Number.isSafeInteger(s.criticalCount)||s.criticalCount<0||(gapState?!s.criticalCount:s.criticalCount>0)||!Array.isArray(s.criticalCodes)||s.criticalCodes.length>MAX_COVERAGE_CODES||s.criticalCodes.some(c=>typeof c!=='string'||!GAP_CODE.test(c))||!gapState&&s.criticalCodes.length>0||typeof s.recoveryBlocked!=='boolean'||s.recoveryBlocked!==gapState||s.blockReason!==(gapState?'CRITICAL_COVERAGE_GAPS':null))C.fail('INVALID_MIGRATION_MANIFEST');
    // The summary must be derivable from the recorded coverage; otherwise a
    // rewritten manifest could claim a clean capture while keeping the gaps.
    if(JSON.stringify(s)!==JSON.stringify(coverageSummary(m.coverage.missing,m.coverage.excluded)))C.fail('INVALID_MIGRATION_MANIFEST');
  }
  const all=new Map(),ids=new Set();for(const r of m.roots){if(typeof r.id!=='string'||!/^[a-z0-9-]+$/.test(r.id)||ids.has(r.id)||!['home','profile','workspace','memory','skills','agents'].includes(r.kind)||typeof r.path!=='string'||!path.win32.isAbsolute(r.path))C.fail('INVALID_MIGRATION_ROOT');ids.add(r.id);}
  for(const [list,type]of [[m.directories,'dir'],[m.files,'file']])for(const f of list){const n=type==='file'?f.path:f;C.safeName(n);if(!/^(profiles\/desktop\/|home-data\/|packages\/|preferences\/|workspaces\/)/.test(n)||all.has(n.toLowerCase()))C.fail('INVALID_MIGRATION_SCOPE');all.set(n.toLowerCase(),type);if(type==='file'&&(!/^[a-f0-9]{64}$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0))C.fail('INVALID_MANIFEST');}
  for(const [n]of all){if(n.startsWith('workspaces/')&&!ids.has(n.split('/')[1]))C.fail('INVALID_MIGRATION_ROOT');const parts=n.split('/');parts.pop();while(parts.length){if(all.get(parts.join('/'))==='file')C.fail('ARCHIVE_PATH_COLLISION');parts.pop();}}
  // Source trees are optional for backward compatibility with pre-0.6.3
  // archives. When declared they must match the recorded files exactly, so a
  // rewritten manifest cannot shrink or omit captured source data.
  if(m.sourceTrees!==undefined){
    if(!Array.isArray(m.sourceTrees)||m.sourceTrees.length>16)C.fail('INVALID_MIGRATION_MANIFEST');
    const trees=new Set();
    for(const t of m.sourceTrees){
      if(!t||typeof t!=='object'||Array.isArray(t)||typeof t.name!=='string'||!/^[A-Za-z0-9._-]{1,64}$/.test(t.name)||t.name==='.'||t.name==='..'||trees.has(t.name)||t.archivePrefix!=='home-data/'+t.name||t.restorePath!==t.name||t.complete!==true||!Number.isSafeInteger(t.fileCount)||t.fileCount<0||!Number.isSafeInteger(t.bytes)||t.bytes<0||!Array.isArray(t.excluded)||t.excluded.length>8||t.excluded.some(x=>typeof x!=='string'||!/^[A-Za-z0-9._-]{1,32}$/.test(x)))C.fail('INVALID_MIGRATION_MANIFEST');
      const prefix=t.archivePrefix+'/',under=m.files.filter(f=>f.path.startsWith(prefix));
      if(under.length!==t.fileCount||under.reduce((n,f)=>n+f.bytes,0)!==t.bytes)C.fail('INVALID_MIGRATION_MANIFEST');
      const excluded=new Set(t.excluded);
      if(under.some(f=>f.path.slice(prefix.length).split('/').some(part=>excluded.has(part))))C.fail('INVALID_MIGRATION_MANIFEST');
      trees.add(t.name);
    }
  }
  for(const p of m.packages)if(typeof p.name!=='string'||!require('./host-proof.cjs').validName(p.name)||typeof p.version!=='string')C.fail('INSTALLED_PACKAGE_INVALID');
  for(const tool of m.tools||[]){if(tool.name!=='mnemon'||tool.archivePath!=='packages/native-mnemon/mnemon.exe'||!m.files.some(f=>f.path===tool.archivePath&&f.sha256===tool.sha256)||tool.platform!=='win32'||tool.arch!=='x64')C.fail('TOOL_PAYLOAD_INVALID');}
  for(const p of m.packages)if(p.archivePath){C.safeName(p.archivePath);if(!p.archivePath.startsWith('packages/')||!m.files.some(f=>f.path===p.archivePath&&f.sha256===p.sourceSHA256))C.fail('PACKAGE_SOURCE_INVALID');}
  if(zip.records.size!==m.files.length+1)C.fail('ARCHIVE_SET_MISMATCH');for(const f of m.files){const b=zip.get(f.path);if(b.length!==f.bytes||C.sha(b)!==f.sha256)C.fail('HASH_MISMATCH');}return m;
}
async function createBackup(options){
  if(options.confirmPrivate!==true)C.fail('PRIVATE_CONFIRMATION_REQUIRED');if(options.sourceQuiescent!==true)C.fail('QUIESCENT_CONFIRMATION_REQUIRED');
  const {target}=options;C.noLinks(target);C.safeName(path.basename(target));if(path.extname(target).toLowerCase()!=='.zip')C.fail('TARGET_MUST_BE_ZIP');if(fs.existsSync(target))C.fail('TARGET_EXISTS');
  const parent=path.dirname(target),parentId=C.identity(fs.statSync(parent));options.onPhase?.('scanning');const before=await inventory(options);
  for(const r of before.roots)if(A.inside(r.path,target)&&r.kind!=='workspace')C.fail('TARGET_INSIDE_SOURCE');
  options.onInventory?.([...new Set(before.files.map(f=>f.source))]);
  const base=await legacy(),dependencyCheck=base.checkPayload(before.legacyInventory.files,{dshVersion:options.dshVersion,probeTask:options.id?{id:options.id,homeDir:options.homeDir}:undefined});
  options.onDependencyCheck?.(dependencyCheck);
  const structural=dependencyCheck.issues.find(issue=>!RECORDABLE_DEPENDENCY_CODES.has(issue.code));
  if(structural)C.fail(structural.code);
  const temp=path.join(parent,'.'+path.basename(target)+'.migration-'+crypto.randomBytes(8).toString('hex')+'.tmp');let writer,committed=false,tempId;
  try{
    writer=new C.ZipWriter(temp);const records=[];let bytes=0;options.onPhase?.('writing');
    for(const f of before.files){if(options.signal?.aborted)C.fail('BACKUP_ABORTED');const b=C.readStable(f.source);bytes+=b.length;if(bytes>C.MAX_TOTAL-16*1024*1024)C.fail('ARCHIVE_LIMIT');records.push({path:f.path,bytes:b.length,sha256:C.sha(b)});writer.add(f.path,b);options.onFile?.(records.length);}
    if(JSON.stringify(before)!==JSON.stringify(await inventory(options)))C.fail('SOURCE_CHANGED');
    for(let i=0;i<before.files.length;i++)if(C.sha(C.readStable(before.files[i].source))!==records[i].sha256)C.fail('SOURCE_CHANGED');
    for(const [key,value]of Object.entries(before.preferences)){const b=Buffer.from(JSON.stringify({key,value})),n='preferences/'+key+'.json';writer.add(n,b);records.push({path:n,bytes:b.length,sha256:C.sha(b)});}
    const dataSets=[];for(const f of before.files){if(f.path.startsWith('home-data/sessions/')&&/\.jsonl(?:\.zstd)?$/.test(f.path))dataSets.push({path:f.path,owner:'dsh-session',schemaVersion:A.decodeSession(C.readStable(f.source),f.path).header.version});else if(f.path==='home-data/storages/workspace.json')dataSets.push({path:f.path,owner:'dsh-workspace',schemaVersion:sourceJson(f.source).unit?.version});else if(f.path.endsWith('.db')&&!f.path.includes('/node_modules/')){
      const bytes=C.readStable(f.source),sqlite=bytes.length>=100&&A.sqliteHeader(bytes);
      dataSets.push({path:f.path,owner:sqlite&&f.path.endsWith('/mnemon.db')&&before.tools.length?'mnemon':'unknown',headerVersion:sqlite?bytes.readUInt32BE(60):null});
    }}
    const dependencyIssues=dependencyCheck.issues.map(i=>({code:i.code,package:i.package??null,name:i.name??null,range:i.range??null,actual:i.actual??null,kind:i.kind??null,realm:i.realm??null,state:'recorded'}));
    const recordedDependencyIssues=dependencyIssues.slice(0,MAX_RECORDED_DEPENDENCY_ISSUES);
    const compatibility={dependencyChecked:true,dependencyIssueCount:dependencyIssues.length,dependencyIssues:recordedDependencyIssues,truncated:dependencyIssues.length>recordedDependencyIssues.length,optionalMissing:dependencyCheck.optionalMissing.slice(0,100),sourceFilesVerified:true};
    const summary=coverageSummary(before.missing,before.excluded);
    const m={format:FORMAT,schemaVersion:1,mode:'environment-migration',archiveId:crypto.randomUUID(),producerVersion:JSON.parse(C.readStable(path.join(__dirname,'../package.json'))).version,createdAt:new Date().toISOString(),encrypted:false,sourceRuntime:{dshVersion:options.dshVersion,platform:process.platform,arch:process.arch,node:process.versions.node,nodeMajor:process.versions.node.split('.')[0],nodeModules:process.versions.modules,...(dependencyCheck.hostRequirements?{hostEvidence:dependencyCheck.hostRequirements}:{})},compatibility,roots:before.roots,packages:before.packages,tools:before.tools,sourceTrees:before.sourceTrees,dataSets,files:records,directories:before.directories,coverage:{missing:before.missing,excluded:before.excluded,summary,completeWithinDeclaredScope:before.missing.length===0,engineeringSourceExcluded:true,installerExcluded:true}};
    writer.add('manifest.json',Buffer.from(JSON.stringify(m,null,2)+'\n'));writer.finish();options.onPhase?.('verifying');let z=C.openZip(temp);try{validate(z);}finally{z.close();}
    if(options.signal?.aborted)C.fail('BACKUP_ABORTED');if(dependencyCheck.hostRequirements)require('./host-proof.cjs').verifyHost(dependencyCheck.hostRequirements,options.dshVersion,options.id?{id:options.id,homeDir:options.homeDir}:undefined);options.beforeCommit?.();C.noLinks(parent);if(C.identity(fs.statSync(parent))!==parentId)C.fail('TARGET_IDENTITY_CHANGED');
    z=C.openZip(temp);let sha256;try{sha256=z.fingerprint();}finally{z.close();}tempId=C.identity(fs.statSync(temp));fs.linkSync(temp,target);committed=true;
    const result={path:target,sha256,bytes:fs.statSync(target).size,files:records.length,manifest:m,dependencyIssueCount:dependencyIssues.length,dependencyIssues:recordedDependencyIssues,coverageSummary:summary,cleanup:{tempRemoved:false}};options.onCommitted?.({path:target,sha256,bytes:result.bytes,files:records.length,verified:true,coverageSummary:summary});fs.unlinkSync(temp);result.cleanup.tempRemoved=true;return result;
  }catch(e){writer?.close();if(!options.preserveFailureArtifacts){if(committed&&C.identity(fs.lstatSync(target))===tempId)fs.unlinkSync(target);if(fs.existsSync(temp))fs.unlinkSync(temp);}throw e;}
}
function readArchive(file){const zip=C.openZip(file);try{const head=JSON.parse(zip.get('manifest.json'));if(head.format===FORMAT)return {zip,manifest:validate(zip),legacy:false};const m=require('./verify-private.cjs').validateArchive(zip);return {zip,manifest:{format:m.format,schemaVersion:0,mode:'environment-migration',producerVersion:m.packerVersion,sourceRuntime:{...m.compatibility,nodeModules:m.compatibility.nodeModules,nodeMajor:m.compatibility.nodeMajor},roots:[{id:'home',kind:'home',path:'Z:\\legacy-unknown-home'},{id:'profile',kind:'profile',path:'Z:\\legacy-unknown-home\\profiles\\desktop'}],files:m.files.map(f=>({...f,path:f.path.startsWith('profile/')?'profiles/desktop/'+f.path.slice(8):'home-data/'+f.path.slice(5),archivePath:f.path})),directories:m.directories.map(n=>n.startsWith('profile/')?'profiles/desktop/'+n.slice(8):'home-data/'+n.slice(5)),packages:[],coverage:{missing:[{code:'LEGACY_COVERAGE_INCOMPLETE',critical:true}],excluded:m.exclusions||[]}},legacy:true};}catch(e){zip.close();throw e;}}
module.exports={FORMAT,classifyClientPreferences,coverageSummary,discover,inventory,createBackup,validate,readArchive};
