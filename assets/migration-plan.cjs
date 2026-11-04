'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const C=require('./recovery-core.cjs'),A=require('./migration-data.cjs'),R=require('./migration-archive.cjs'),H=require('./migration-host.cjs'),D=require('./dependency-contract.cjs'),semver=require('../vendor/semver');
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const digest=value=>C.sha(Buffer.from(stable(value)));
function toolkitEvidence(){
  const files=['package.json'];function walk(relative){const dir=path.join(__dirname,'..',relative);C.noLinks(dir);for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const name=relative+'/'+entry.name;if(entry.isSymbolicLink())C.fail('TOOLKIT_CHANGED');if(entry.isDirectory())walk(name);else if(/\.(?:cjs|js|mjs|ps1|exe|xaml|manifest|json)$/.test(name))files.push(name);}}
  for(const dir of ['assets','lib','vendor','bin'])walk(dir);return Object.fromEntries(files.sort().map(name=>[name,C.sha(C.readStable(path.join(__dirname,'..',name)))]));
}
const get=(arc,f)=>arc.zip.get(f.archivePath||f.path);
function packageRecords(arc){return arc.manifest.files.filter(f=>/\/node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(f.path)).map(f=>{let m;try{m=JSON.parse(get(arc,f));}catch{C.fail('INSTALLED_PACKAGE_INVALID');}return {path:f.path,manifest:m};});}
function compatibility(manifest,packages,host,readSource){
  const proof=host.proof,result=D.analyze(packages,{dshVersion:host.version,host:proof,readSource}),issues=result.issues.map(i=>({...i,state:'blocked',critical:true}));
  if(host.proofError)issues.push({code:'TARGET_CAPABILITY_UNVERIFIED',reason:host.proofError,state:'unknown',critical:true});
  const byPath=new Map(packages.map(p=>[p.path.toLowerCase(),p]));
  for(const p of packages)for(const [name,spec]of Object.entries(p.manifest.dependencies||{})){
    if(typeof spec!=='string')continue;let dir=path.posix.dirname(p.path),found;
    while(dir!=='.'){if(path.posix.basename(dir)!=='node_modules'){found=byPath.get((dir+'/node_modules/'+name+'/package.json').toLowerCase());if(found)break;}dir=path.posix.dirname(dir);}
    if(found&&semver.validRange(spec)&&!semver.satisfies(found.manifest.version,spec))issues.push({code:'ORDINARY_DEPENDENCY_VERSION_MISMATCH',plugin:p.manifest.name,name,state:'blocked',critical:true});
  }
  for(const p of packages){try{require('./provider-runtime.cjs').validateProviderRuntime(p.manifest,{node:proof.node,electron:proof.electron,platform:proof.platform,arch:proof.arch},host.version);}catch{issues.push({code:'PLUGIN_RUNTIME_MISMATCH',plugin:p.manifest.name,state:'blocked',critical:true});}}
  for(const p of packages)if(/^@deepseek-ai\/dsh(?:-|$)/.test(p.manifest.name)&&proof.providers.some(v=>v.name===p.manifest.name))issues.push({code:'HOST_PACKAGE_SHADOWING',plugin:p.manifest.name,state:'unknown',critical:true});
  if(manifest.sourceRuntime.platform!==proof.platform||manifest.sourceRuntime.arch!==proof.arch)issues.push({code:'PLATFORM_OR_ARCH_CHANGED',state:'blocked',critical:true});
  const native=manifest.files.filter(f=>f.path.endsWith('.node')).map(f=>({path:f.path,state:manifest.sourceRuntime.nodeModules===proof.nodeModules?'requires-load-test':'unknown'}));
  if(native.some(n=>n.state==='unknown'))issues.push({code:'NATIVE_RUNTIME_UNVERIFIED',state:'unknown',critical:true});
  if(host.capabilities.sessionVersion!==4||!host.capabilities.zstd||!host.capabilities.projectKeyV1||!host.capabilities.workspaceV2)issues.push({code:'TARGET_DATA_CAPABILITY_UNKNOWN',state:'unknown',critical:true});
  // Version differences themselves never add an issue. Declared engines/peers still apply.
  return {issues,native,requirements:result.requirements,optionalMissing:result.optionalMissing};
}
function targetLayout(workspace,planId){
  if(typeof workspace!=='string'||!path.isAbsolute(workspace))C.fail('ABSOLUTE_PATH_REQUIRED');workspace=path.resolve(workspace);C.noLinks(workspace);C.safeName(path.basename(workspace));
  const parent=path.dirname(workspace);if(!fs.statSync(parent).isDirectory())C.fail('TARGET_PARENT_MISSING');
  const state=path.join(parent,'.'+path.basename(workspace)+'.dsh-state-'+planId.slice(0,12));
  for(const p of [workspace,state]){
    C.noLinks(p);for(const official of [path.join(os.homedir(),'.dsh'),process.env.DSH_HOME].filter(Boolean))if(A.inside(official,p)||A.inside(p,official))C.fail('OFFICIAL_HOME_REFUSED');
    if(fs.existsSync(p))C.fail('TARGET_EXISTS');
  }
  return {workspace,state,home:path.join(state,'home'),profile:path.join(state,'home/profiles/desktop'),agents:path.join(state,'agents'),userData:path.join(state,'electron'),parent,parentIdentity:C.identity(fs.statSync(parent))};
}
async function scanData(arc){
  const roots=[...arc.manifest.roots],issues=[],datasets=[],skills=[],storage=[],files=arc.manifest.files;
  function workspace(p){if(!roots.some(r=>r.kind==='workspace'&&A.canonical(r.path)===A.canonical(p)))roots.push({id:'workspace-'+A.id(p),kind:'workspace',path:p,exists:false});}
  for(const f of files){
    if(f.path.startsWith('home-data/sessions/')&&/\.jsonl(?:\.zstd)?$/.test(f.path)){
      const bytes=get(arc,f),{header}=A.decodeSession(bytes,f.path);for(const cwd of A.sessionPaths(bytes,f.path))workspace(cwd);
      datasets.push({path:f.path,adapter:'session-v4',sessionId:header.id,version:header.version,state:header.version===4?'converted':'unknown',critical:true});if(header.version!==4)issues.push({code:'SESSION_SCHEMA_UNKNOWN',path:f.path,state:'unknown',critical:true});
    }
    if(f.path==='home-data/storages/workspace.json'){
      let j;try{j=JSON.parse(get(arc,f));}catch{C.fail('WORKSPACE_SCHEMA_UNKNOWN');}
      for(const r of Object.values(j.tables?.workspaces||{}))if(typeof r.path==='string')workspace(r.path);
      const known=j.unit?.name==='workspace'&&j.unit.version===2;
      datasets.push({path:f.path,adapter:'workspace-v2',version:j.unit?.version,state:known?'converted':'unknown',critical:true});if(!known)issues.push({code:'WORKSPACE_SCHEMA_UNKNOWN',path:f.path,state:'unknown',critical:true});
    }
    if(['profiles/desktop/cordis.patch.yml','home-data/cordis.patch.yml'].includes(f.path)){
      const Y=await A.yaml();let tree;try{tree=Y.load(get(arc,f).toString('utf8'));}catch{C.fail('PROFILE_PATCH_INVALID');}
      for(const p of A.configPaths(tree))if(p.kind==='workspace')workspace(p.value);
      for(const e of A.entries(tree))if(e.id==='prompt-inject')Object.keys(e.config.workspaceOverrides||{}).forEach(workspace);
      for(const r of A.unknownConfigPaths(tree,{mnemonTool:(arc.manifest.tools||[]).some(t=>t.name==='mnemon')}))issues.push({code:'UNMAPPED_EXTERNAL_PATH_FIELD',owner:r.owner,key:r.key,state:'unknown',critical:true});
    }
    if(/\.(?:db|sqlite|sqlite3)$/i.test(f.path)&&!f.path.includes('/node_modules/')){
      const known=A.sqliteHeader(get(arc,f))&&f.path.endsWith('/mnemon.db')&&(arc.manifest.tools||[]).some(t=>t.name==='mnemon');datasets.push({path:f.path,adapter:'sqlite-preserve',state:known?'requires-owner-validation':'unknown',critical:true});if(!known)issues.push({code:'DATABASE_SCHEMA_UNKNOWN',path:f.path,state:'unknown',critical:true});
    }
    if(f.path.startsWith('preferences/')){try{const pref=JSON.parse(get(arc,f));if(f.path!=='preferences/dsh-chat-comfort.settings.v1.json'||pref.key!=='dsh-chat-comfort.settings.v1')throw Error();A.knownPreference(pref.value);}catch{issues.push({code:'PREFERENCE_SCHEMA_UNKNOWN',path:f.path,state:'unknown',critical:true});}}
    if(f.path.startsWith('home-data/storages/')&&f.path.endsWith('.json')){let j;try{j=JSON.parse(get(arc,f));}catch{issues.push({code:'STORAGE_JSON_INVALID',path:f.path,state:'unknown',critical:true});}
      if(j?.unit&&typeof j.unit.name==='string'&&Number.isSafeInteger(j.unit.version))storage.push({name:j.unit.name,version:j.unit.version,critical:!j.unit.name.startsWith('session_projcache')});
      else if(j&&Number.isSafeInteger(j.version)&&Object.hasOwn(j,'value')){const name=f.path.slice('home-data/storages/'.length).split('/')[0];storage.push({name,version:j.version,critical:!name.startsWith('session_projcache')});}
    }
    if(f.path==='home-data/settings.yaml')issues.push({code:'LEGACY_SETTINGS_REQUIRE_ADAPTER',path:f.path,state:'unknown',critical:true});
    if((/\/(?:\.agents|\.dsh)\/skills\//.test(f.path)||f.path.startsWith('home-data/skills/'))&&f.path.endsWith('.md')){
      const raw=get(arc,f).toString('utf8'),match=raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
      if(match){try{const meta=(await A.yaml()).load(match[1]);if(typeof meta.name==='string'&&typeof meta.description==='string')skills.push({path:f.path,name:meta.name,bodySHA256:C.sha(Buffer.from(match[2].trim()))});else throw Error();}catch{issues.push({code:'SKILL_METADATA_INVALID',path:f.path,state:'unknown',critical:true});}}
    }
  }
  return {roots,datasets,skills,storage:[...new Map(storage.map(s=>[s.name+':'+s.version,s])).values()],issues};
}
async function inspect({zipFile}){
  const arc=R.readArchive(zipFile);try{const data=await scanData(arc);return {format:arc.manifest.format,producerVersion:arc.manifest.producerVersion,archiveIntegrity:{state:'valid',sha256:arc.zip.fingerprint(),files:arc.manifest.files.length,bytes:arc.manifest.files.reduce((n,f)=>n+f.bytes,0)},coverage:arc.manifest.coverage,data,postRestoreUsability:{state:'not-verified'}};}finally{arc.zip.close();}
}
async function plan({zipFile,installation,workspace}){
  const arc=R.readArchive(zipFile);try{
    const zipSHA256=arc.zip.fingerprint(),packages=packageRecords(arc),byPath=new Map(arc.manifest.files.map(f=>[f.path,f]));
    const preliminary=D.analyze(packages,{dshVersion:arc.manifest.sourceRuntime.dshVersion});
    const names=[...new Set([...preliminary.hostCandidates,...packages.map(p=>p.manifest.name).filter(n=>/^@deepseek-ai\/dsh(?:-|$)/.test(n))])].sort();
    const host=H.inspect(path.resolve(installation),names),data=await scanData(arc);
    const compatibilityResult=compatibility(arc.manifest,packages,host,n=>byPath.has(n)?get(arc,byPath.get(n)):undefined);
    const planId=digest({zipSHA256,host:host.proof,workspace:path.resolve(workspace)}),layout=targetLayout(workspace,planId),map=A.mappings(data.roots,layout.workspace);
    const external=data.roots.filter(r=>['memory','skills','agents'].includes(r.kind)).map(r=>({id:r.id,kind:r.kind,owners:r.owners||[],workspaceRelative:r.workspaceRelative===true,from:r.path,to:r.kind==='agents'?layout.agents:r.workspaceRelative?A.mapPath(r.path,map):path.join(layout.state,'data',r.id)}));
    const issues=[...compatibilityResult.issues,...data.issues,...(arc.manifest.coverage.missing||[]).map(i=>({...i,state:'unknown'})),...(arc.manifest.coverage.excluded||[]).filter(i=>i.needsReview).map(i=>({code:'HOME_ITEM_UNCLASSIFIED',name:i.name,state:'unknown',critical:true}))];
    const result={planSchemaVersion:1,mode:'migrate',planId,zipFile:path.resolve(zipFile),zipSHA256,format:arc.manifest.format,archiveIntegrity:{state:'valid',sha256:zipSHA256,files:arc.manifest.files.length,bytes:arc.manifest.files.reduce((n,f)=>n+f.bytes,0)},coverage:arc.manifest.coverage,host,layout,mappings:map,externalRoots:external,tools:(arc.manifest.tools||[]).map(t=>({...t,to:path.join(layout.state,t.archivePath)})),datasets:data.datasets,plugins:packages.map(p=>({path:p.path,name:p.manifest.name,version:p.manifest.version,manifestSHA256:digest(p.manifest)})),native:compatibilityResult.native,requirements:compatibilityResult.requirements,optionalMissing:compatibilityResult.optionalMissing,issues,actions:['preserve-archive','stage-files','map-structured-paths','bind-profile-package-sources','verify-data','isolated-start-restart','publish-launcher'],canApply:!issues.some(i=>i.state==='blocked'),canCommit:false,spaceBudgetBytes:arc.manifest.files.reduce((n,f)=>n+f.bytes,0)*3+128*1024*1024};
    result.expectedSkills=data.skills.map(s=>({...s,cwd:s.path.startsWith('workspaces/')?map.find(r=>r.id===s.path.split('/')[1])?.to||layout.workspace:layout.workspace}));
    result.requiresPreferenceImport=arc.manifest.files.some(f=>f.path==='preferences/dsh-chat-comfort.settings.v1.json');
    result.expectedStorage=data.storage;
    result.classification={direct:[],converted:data.datasets.filter(d=>d.state==='converted').map(d=>d.path),blocked:issues.filter(i=>i.state==='blocked'),unknown:issues.filter(i=>i.state==='unknown'),runtimeValidationRequired:true};
    for(const plugin of result.plugins){
      const record=packages.find(r=>r.path===plugin.path).manifest,related=issues.filter(i=>i.plugin===plugin.name||i.package===plugin.name);
      plugin.state=related.some(i=>i.state==='blocked')?'blocked':related.some(i=>i.state==='unknown')||host.proofError?'unknown':'direct';
      plugin.engines=record.engines||{};plugin.peerDependencies=record.peerDependencies||{};plugin.materializeInstalledPayload=true;plugin.executeInstallScripts=false;
      if(plugin.state==='direct')result.classification.direct.push(plugin.name);
    }
    result.toolkitEvidence=toolkitEvidence();
    result.planSHA256=digest(result);arc.zip.assertUnchanged();return result;
  }finally{arc.zip.close();}
}
function validatePlan(p){
  const {planSHA256,...unsigned}=p;if(p.mode!=='migrate'||p.planSchemaVersion!==1||digest(unsigned)!==planSHA256)C.fail('PLAN_CHANGED');
  if(!p.toolkitEvidence||digest(p.toolkitEvidence)!==digest(toolkitEvidence()))C.fail('TOOLKIT_CHANGED');
  const l=p.layout,expectedState=path.join(path.dirname(l.workspace),'.'+path.basename(l.workspace)+'.dsh-state-'+p.planId.slice(0,12));
  for(const [key,expected]of Object.entries({state:expectedState,parent:path.dirname(l.workspace),home:path.join(expectedState,'home'),profile:path.join(expectedState,'home/profiles/desktop'),agents:path.join(expectedState,'agents'),userData:path.join(expectedState,'electron')}))if(l[key]!==expected)C.fail('PLAN_LAYOUT_INVALID');
  for(const r of p.mappings)if(!A.inside(l.workspace,r.to))C.fail('PLAN_LAYOUT_INVALID');for(const r of p.externalRoots)if(!A.inside(l.state,r.to)&&!(r.workspaceRelative&&A.inside(l.workspace,r.to)))C.fail('PLAN_LAYOUT_INVALID');
}
module.exports={stable,digest,get,packageRecords,compatibility,targetLayout,scanData,inspect,plan,validatePlan};
