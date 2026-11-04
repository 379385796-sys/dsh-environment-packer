'use strict';
// Explicit paths only; this fixture never loads the user's Profile or third-party plugins.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),z=require('node:zlib');
const E=require('../assets/migration-engine.cjs'),R=require('../assets/migration-archive.cjs'),A=require('../assets/migration-data.cjs'),C=require('../assets/recovery-core.cjs');
const [root,target,rc5,mode]=process.argv.slice(2);
if(![root,target,rc5].every(p=>p&&path.isAbsolute(p)))throw Error('Explicit isolated root and both installations required');
C.noLinks(root);fs.mkdirSync(root,{recursive:true});
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);};
const source=path.join(root,'source'),home=path.join(source,'home'),profile=path.join(home,'profiles/desktop'),workspace=path.join(source,'旧工作区 Ω'),memory=path.join(source,'external-memory'),zip=path.join(root,'rc5-to-rc1.zip');
const sid='00000000-0000-4000-8000-000000000005';
async function fixture(){
  assert.equal(require('../assets/migration-host.cjs').metadata(rc5).version,'0.2.1-rc.5');
  fs.mkdirSync(workspace,{recursive:true});
  const product=path.join(profile,'node_modules/dsh-environment-packer');
  for(const n of ['package.json','index.js','client.js','cordis.patch.yml','icon.svg','lib','assets','bin','locale','vendor'])fs.cpSync(path.join(__dirname,'..',n),path.join(product,n),{recursive:true});
  const plugin=path.join(profile,'node_modules/packer-synthetic-state');
  write(path.join(plugin,'package.json'),JSON.stringify({name:'packer-synthetic-state',version:'1.0.0',type:'module',exports:'./index.js',engines:{node:'^24'},peerDependencies:{'@deepseek-ai/cordis':'^4.0.0'},dsh:{bundle:{patch:'./cordis.patch.yml'}}}));
  write(path.join(plugin,'cordis.patch.yml'),'- insert:\n    - id: synthetic-memory\n      name: packer-synthetic-state\n');
  write(path.join(plugin,'index.js'),String.raw`import fs from 'node:fs';import path from 'node:path';
export function apply(ctx,config={}){
 const file=path.join(process.env.DSH_HOME,'dsh-claude-style','synthetic-state.json');
 const old=JSON.parse(fs.readFileSync(file,'utf8'));old.starts++;fs.writeFileSync(file,JSON.stringify(old));
 let dispose;const route=()=>{if(dispose)return;const server=ctx.get('webServer');if(!server)return;dispose=server.register({kind:'prefix',path:'/packer-synthetic-proof',handler:async(req,res)=>{
  try{const persistence=ctx.get('sessionPersistence'),handle=await persistence.open('00000000-0000-4000-8000-000000000005','read');let session;try{session={cwd:handle.header.cwd,events:(await handle.read()).events};}finally{await handle.close();}
  res.setHeader('content-type','application/json');res.end(JSON.stringify({label:config.label,starts:old.starts,note:config.note,memory:fs.readFileSync(path.join(config.dataDir,'memory.md'),'utf8'),session}));}
  catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.code||e.message}));}
 }});};ctx.effect(()=>{route();const off=ctx.on('internal/service',route);return()=>{off?.();dispose?.();};});
}
`);
  write(path.join(profile,'package.json'),JSON.stringify({name:'synthetic-rc5-profile',private:true,dependencies:{'dsh-environment-packer':'0.6.0','packer-synthetic-state':'1.0.0'},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-environment-packer','packer-synthetic-state']}}}));
  write(path.join(profile,'cordis.yml'),'[]\n');
  write(path.join(profile,'cordis.patch.yml'),'- id: workspace-controller\n  config:\n    documentsDirectory: '+JSON.stringify(workspace)+'\n- id: synthetic-memory\n  config:\n    dataDir: '+JSON.stringify(memory)+'\n    label: SYNTHETIC_RC5_CONFIG\n    note: '+JSON.stringify('literal '+workspace)+'\n- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: 2026-09-28.1\n');
  const child=path.join(workspace,'子目录');fs.mkdirSync(child,{recursive:true});
  write(path.join(home,'sessions',A.projectKey(workspace),sid,'session.v4.jsonl.zstd'),Buffer.concat([z.zstdCompressSync(Buffer.from(JSON.stringify({type:'session',version:4,id:sid,createdAt:1,delegationDepth:0,isSeeded:false,cwd:workspace})+'\n')),z.zstdCompressSync(Buffer.from(JSON.stringify({type:'working-directory/change',seq:0,time:2,data:{cwd:child}})+'\n'))]));
  write(path.join(home,'storages/workspace.json'),JSON.stringify({unit:{name:'workspace',version:2},global:null,tables:{workspaces:{main:{path:workspace,title:'Synthetic',sessionIds:[sid],createdAt:'2026-11-05T00:00:00.000Z',updatedAt:'2026-11-05T00:00:00.000Z'},history:{path:'Z:\\OldUser\\Historical',title:'Synthetic historical cwd',sessionIds:[],createdAt:'2026-11-05T00:00:00.000Z',updatedAt:'2026-11-05T00:00:00.000Z'}}}}));
  write(path.join(workspace,'.agents/skills/synthetic-rc1/SKILL.md'),'---\nname: synthetic-rc1\ndescription: isolated cross-version skill\n---\nSYNTHETIC_SKILL_BODY');
  write(path.join(workspace,'engineering-source.js'),'MUST_NOT_BE_PACKED');write(path.join(memory,'memory.md'),'SYNTHETIC_EXTERNAL_MEMORY');
  write(path.join(home,'dsh-claude-style/synthetic-state.json'),JSON.stringify({starts:0,marker:'SYNTHETIC_PERSISTENT'}));
  const b=await R.createBackup({homeDir:home,profileDir:profile,workspaceRoot:workspace,target:zip,dshVersion:'0.2.1-rc.5',confirmPrivate:true,sourceQuiescent:true,clientPreferences:{'dsh-chat-comfort.settings.v1':{enabled:true,density:'compact'}}});
  assert(!b.manifest.files.some(f=>f.path.endsWith('engineering-source.js')));
  write(path.join(root,'source-backup.json'),JSON.stringify({format:b.manifest.format,bytes:b.bytes,sha256:b.sha256,files:b.files,syntheticOnly:true},null,2));
}
async function run(){
  const child=cp.spawnSync(path.join(rc5,'DeepSeek Harness.exe'),['--expose-internals',__filename,root,target,rc5,'fixture'],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',DSH_HOME:home,DSH_AGENTS_HOME:path.join(source,'agents')},windowsHide:true,encoding:'utf8',timeout:120000});
  write(path.join(root,'source-generation.log'),(child.stdout||'')+(child.stderr||''));assert.equal(child.status,0,child.stderr);
  const checks=[],p=await E.plan({zipFile:zip,installation:target,workspace:path.join(root,'NEW Workspace 中文')});
  write(path.join(root,'plan.json'),JSON.stringify(p,null,2));assert.equal(p.host.version,'0.2.2-rc.1');assert.deepEqual(p.issues,[]);checks.push('rc5 archive plans on actual rc1; real engines/peers/native ABI and host proofs checked');
  await E.apply(p,{confirmPrivate:true,confirmExecution:true});
  const receipt=await E.verify(p);assert.equal(receipt.rounds.length,2);const committed=await E.commit(p);assert.equal(committed.startupVerified,true);checks.push('inspect/plan/apply/verify/commit with two actual starts and normal shutdowns');
  const runProof=await E.boot(p,'persisted-read',{onReady:async({url,headers})=>{const response=await fetch(new URL('packer-synthetic-proof',url),{headers});const proof=await response.json();assert.equal(response.status,200,JSON.stringify(proof));assert.equal(proof.label,'SYNTHETIC_RC5_CONFIG');assert.equal(proof.memory,'SYNTHETIC_EXTERNAL_MEMORY');assert(proof.starts>=3);assert.equal(proof.note,'literal '+workspace);assert.equal(proof.session.cwd,p.layout.workspace);assert.equal(proof.session.events[0].data.cwd,path.join(p.layout.workspace,'子目录'));write(path.join(root,'business-proof.json'),JSON.stringify(proof,null,2));}});
  checks.push('actual rc1 session persistence owner reads mapped header and cwd event; config/memory and restart state preserved; literal text untouched');
  const mapped=JSON.parse(fs.readFileSync(path.join(p.layout.home,'storages/workspace.json')));assert.equal(mapped.tables.workspaces.main.path,p.layout.workspace);assert.deepEqual(mapped.tables.workspaces.main.sessionIds,[sid]);assert.notEqual(mapped.tables.workspaces.history.path,p.layout.workspace);checks.push('Workspace v2/sessionIds and distinct historical cwd mapping');
  await E.rollback(p);assert.equal(E.state(p).phase,'rolled-back');assert(!fs.existsSync(committed.launcher));assert(fs.existsSync(committed.launcher+'.disabled'));checks.push('safe post-commit rollback disables activation and preserves diagnostic data');
  const corrupt=path.join(root,'corrupt.zip');fs.copyFileSync(zip,corrupt);fs.appendFileSync(corrupt,Buffer.from([0]));await assert.rejects(()=>E.inspect({zipFile:corrupt}));checks.push('corrupt archive refused');
  const arc=R.readArchive(zip),missing=path.join(root,'missing.zip'),w=new C.ZipWriter(missing);try{const omitted=arc.manifest.files.find(f=>f.path.endsWith('/memory.md')).path;for(const record of arc.zip.records.values())if(record.name!==omitted)w.add(record.name,arc.zip.get(record.name));w.finish();}finally{w.close();arc.zip.close();}await assert.rejects(()=>E.inspect({zipFile:missing}),e=>e.code==='ARCHIVE_SET_MISMATCH');checks.push('missing manifest payload refused');
  const legacy=require('../assets/verify-private.cjs'),compatibility={dshVersion:'0.2.1-rc.5',platform:process.platform,arch:process.arch,nodeModules:process.versions.modules,nodeMajor:process.versions.node.split('.')[0]};
  for(const format of ['dsh-private-recovery/2','dsh-private-recovery/3'])assert.throws(()=>legacy.assertCompatibility({format,compatibility,files:[]},{},p.host.version),e=>e.code==='INCOMPATIBLE_RUNTIME');
  assert.throws(()=>legacy.assertCompatibility({format:'dsh-private-recovery/3',compatibility:{...compatibility,dshVersion:p.host.version},files:[]},{},p.host.version),e=>e.code==='HOST_PROOF_INVALID');checks.push('strict formats 2/3 retain exact runtime equality and format3 host proof refusal');
  const prior=path.resolve(__dirname,'../../phase3-isolated/backups/Packer-0.6.0-rc5-isolated-synthetic.zip');const unknown=await E.plan({zipFile:prior,installation:target,workspace:path.join(root,'Unknown SQLite stage')});assert(unknown.issues.some(i=>i.code==='DATABASE_SCHEMA_UNKNOWN'&&i.path.endsWith('.sqlite')));await E.apply(unknown,{confirmPrivate:true,confirmExecution:true});await assert.rejects(()=>E.verify(unknown),e=>e.code==='CRITICAL_DATA_UNVERIFIED');await assert.rejects(()=>E.commit(unknown),e=>e.code==='CRITICAL_DATA_UNVERIFIED');await E.rollback(unknown);assert.equal(E.state(unknown).phase,'rolled-back');checks.push('existing immutable rc5 ZIP remains readable; unknown SQLite prevents verify/commit and safely rolls back');
  const result={status:'PASS',syntheticOnly:true,checks,receipt,committed,postRestart:runProof,sqlites:'unknown SQLite blocked; no native Mnemon compatibility certification',thirdPartyPluginsCertified:false};write(path.join(root,'result.json'),JSON.stringify(result,null,2));write(path.join(root,'state.json'),JSON.stringify({plan:p,zip},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,root}));
}
(mode==='fixture'?fixture():run()).catch(e=>{console.error(e);process.exitCode=1;});
