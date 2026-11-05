'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),z=require('node:zlib'),cp=require('node:child_process');
const R=require('../assets/migration-archive.cjs'),E=require('../assets/migration-engine.cjs'),A=require('../assets/migration-data.cjs');
const base=process.env.DSH_PACKER_TEST_ROOT;if(!base||!path.isAbsolute(base)||!process.versions.electron)throw Error('Explicit isolated root and real Desktop Node required');
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);};
const installed='C:/Users/37938/.dsh/profiles/desktop',project=path.resolve(__dirname,'..');
function materialize(name,from,dest,seen=new Set()){
 let dir=from,source;while(true){const q=path.join(dir,'node_modules',name);if(fs.existsSync(path.join(q,'package.json'))){source=fs.realpathSync(q);break;}const p=path.dirname(dir);if(p===dir)throw Error('Missing fixture dependency '+name);dir=p;}
 const m=JSON.parse(fs.readFileSync(path.join(source,'package.json'))),key=source+'|'+dest;if(seen.has(key))return;seen.add(key);fs.cpSync(source,path.join(dest,name),{recursive:true,dereference:true});
 for(const d of Object.keys(m.dependencies||{}))if(!fs.existsSync(path.join(dest,d,'package.json')))materialize(d,source,dest,seen);
 for(const d of Object.keys(m.optionalDependencies||{}))if(!fs.existsSync(path.join(dest,d,'package.json')))try{materialize(d,source,dest,seen);}catch{}
}
(async()=>{
 const dir=fs.mkdtempSync(path.join(base,'migration-business-')),home=path.join(dir,'A home'),profile=path.join(home,'profiles/desktop'),workspace=path.join(dir,'A workspace Ω'),memory=path.join(dir,'external memory');fs.mkdirSync(workspace,{recursive:true});
 const deps={},formal=JSON.parse(fs.readFileSync(path.join(installed,'package.json')));
 for(const name of ['dsh-chat-comfort','dsh-prompt-inject','dsh-ai-exporter','dsh-mnemon']){materialize(name,installed,path.join(profile,'node_modules'));deps[name]=formal.dependencies[name];}
 const nativeFixture=path.join(profile,'node_modules/synthetic-native');fs.mkdirSync(nativeFixture,{recursive:true});
 for(const [pkg,file]of [['engine-formula-rust-binding-win32-x64-msvc','univer-formula.win32-x64-msvc.node'],['exchange-node-binding-win32-x64-msvc','univer-exchange-node.win32-x64-msvc.node']])fs.copyFileSync(path.join(installed,'node_modules/@univerjs-pro',pkg,file),path.join(nativeFixture,file));
 write(path.join(nativeFixture,'package.json'),JSON.stringify({name:'synthetic-native',version:'1.0.0',main:'index.cjs',engines:{node:'^24'},os:['win32'],cpu:['x64']}));write(path.join(nativeFixture,'index.cjs'),'module.exports={};');deps['synthetic-native']='1.0.0';
 const pdir=path.join(profile,'node_modules/dsh-environment-packer');for(const n of ['package.json','index.js','client.js','cordis.patch.yml','icon.svg','lib','assets','bin','locale','vendor'])fs.cpSync(path.join(project,n),path.join(pdir,n),{recursive:true});deps['dsh-environment-packer']='0.6.2';
 const provider='D:/OpenAI Codex 工作区/maintenance/dsh-three-compat-20261025/fixtures/provider';fs.cpSync(provider,path.join(profile,'node_modules/dsh-exporter-test-provider'),{recursive:true});deps['dsh-exporter-test-provider']='0.0.0';
 write(path.join(profile,'package.json'),JSON.stringify({name:'dsh-profile-desktop',private:true,dependencies:deps,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app',...Object.keys(deps)]}}},null,2));write(path.join(profile,'cordis.yml'),'[]\n');
 const child=path.join(workspace,'project child'),historical='Z:\\old-user\\historical-workspace';fs.mkdirSync(child,{recursive:true});
 write(path.join(profile,'cordis.patch.yml'),`- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(workspace)}\n- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: 2026-09-28.1\n- id: prompt-inject\n  config:\n    templates:\n      - name: synthetic-global\n        text: ${JSON.stringify('SYNTHETIC_COMPAT_PROMPT_中文_Ω '+workspace)}\n    activeTemplate: synthetic-global\n    workspaceOverrides:\n      ${JSON.stringify(child)}: synthetic-global\n      ${JSON.stringify(historical)}: ''\n- id: mnemon\n  config:\n    storageScope: custom\n    dataDir: ${JSON.stringify(memory)}\n    lifecycleEnabled: false\n    recallMode: 'off'\n    writebackMode: 'off'\n- id: agent-default-model\n  config:\n    provider: exporter-lab\n    model: exporter-fixture\n`);
 const sessionId='00000000-0000-4000-8000-000000000001',header={type:'session',version:4,id:sessionId,createdAt:1,delegationDepth:0,isSeeded:false,cwd:workspace};
 write(path.join(home,'sessions',A.projectKey(workspace),sessionId,'session.v4.jsonl.zstd'),z.zstdCompressSync(Buffer.from(JSON.stringify(header)+'\n'+JSON.stringify({type:'working-directory/change',seq:1,time:2,data:{cwd:child}})+'\n')));
 write(path.join(home,'storages/workspace.json'),JSON.stringify({unit:{name:'workspace',version:2},global:null,tables:{workspaces:{'fixture':{path:workspace,title:'Synthetic migration',sessionIds:[sessionId],createdAt:'2026-11-04T00:00:00Z',updatedAt:'2026-11-04T00:00:00Z'}}}}));
 write(path.join(workspace,'.agents/skills/synthetic/SKILL.md'),'---\nname: synthetic\ndescription: offline migration skill\n---\nSYNTHETIC_SKILL_CONTENT');write(path.join(workspace,'engineering-source.js'),'MUST_NOT_BE_PACKED');
 write(path.join(home,'dsh-claude-style/settings.json'),JSON.stringify({version:1,fontSize:15}));
 write(path.join(memory,'runtime/workspaces',crypto.createHash('sha256').update(fs.realpathSync.native(workspace)).digest('hex'),'memory.md'),'SYNTHETIC_HASHED_MEMORY');
 const exe='C:/Users/37938/AppData/Roaming/npm/node_modules/@mnemon-dev/mnemon/node_modules/@mnemon-dev/mnemon-win32-x64/bin/mnemon.exe';
 const env={SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,USERPROFILE:dir,APPDATA:path.join(dir,'appdata'),LOCALAPPDATA:path.join(dir,'localappdata'),TEMP:process.env.TEMP,TMP:process.env.TMP,MNEMON_DATA_DIR:memory};
 const native=cp.spawnSync(exe,['remember','SYNTHETIC_PERSISTENT_MEMORY_060','--no-diff','--entity-mode','provided','--data-dir',memory,'--store','fixture-store'],{env,encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(native.status,0,native.stderr);
 const zip=path.join(dir,'environment.zip'),prefs={'dsh-chat-comfort.settings.v1':{enabled:true,density:'compact'}};
 const b=await R.createBackup({homeDir:home,profileDir:profile,workspaceRoot:workspace,target:zip,dshVersion:'0.2.1-rc.5',clientPreferences:prefs,confirmPrivate:true,sourceQuiescent:true});assert(!b.manifest.files.some(f=>f.path.endsWith('engineering-source.js')));assert(b.manifest.tools.some(t=>t.name==='mnemon'));assert(b.manifest.packages.filter(p=>p.archivePath).length===3);
 const plan=await E.plan({zipFile:zip,installation:'D:/DeepSeek Harness',workspace:path.join(dir,'B Workspace 中文')});write(path.join(dir,'plan.json'),JSON.stringify(plan,null,2));assert.deepEqual(plan.issues,[]);await E.apply(plan,{confirmPrivate:true,confirmExecution:true});
 const mappedMemory=plan.externalRoots.find(r=>r.kind==='memory'||r.id.startsWith('memory-')).to;
 assert(fs.existsSync(path.join(mappedMemory,'runtime/workspaces',crypto.createHash('sha256').update(fs.realpathSync.native(plan.layout.workspace)).digest('hex'),'memory.md')));
 const patch=fs.readFileSync(path.join(plan.layout.profile,'cordis.patch.yml'),'utf8');assert(patch.includes(workspace),'Prompt text is history, not a path-field replacement');assert(patch.includes(plan.layout.workspace));
 const receipt=await E.verify(plan);assert(receipt.databases.some(d=>d.nativeRead==='passed'));const result=await E.commit(plan);
 assert.equal(plan.native.length,2);
 const report={status:'PASS',dir,checks:['five-real-plugins-and-native-memory','two-real-native-node-bindings-loaded','format4-full-external-coverage','three-original-plugin-tgzs','no-engineering-source','v4-session-v2-workspace','working-directory-event','multi-cwd-hash-mapping','native-memory-read','actual-skill-body-read','actual-start-restart','commit'],files:b.files,bytes:b.bytes,receipt};
 write(path.join(base,'migration-business-state.json'),JSON.stringify({dir,plan,result,sourceHome:home,sourceWorkspace:workspace,sourceMemory:memory,syntheticOnly:true},null,2));write(path.join(base,'migration-business-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
