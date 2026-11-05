const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
// Synthetic Packer-only profile: real target runtime, no official plugin/data reads.
const repo=path.resolve(__dirname,'..'),R=require(path.join(repo,'assets/migration-archive.cjs')),E=require(path.join(repo,'assets/migration-engine.cjs'));
const base=process.env.DSH_PACKER_TEST_ROOT;if(!base||!path.isAbsolute(base))throw Error('isolated root required');
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof b==='string'?b:JSON.stringify(b));};
(async()=>{
 const dir=fs.mkdtempSync(path.join(base,'codex-preference-')),home=path.join(dir,'home'),profile=path.join(home,'profiles/desktop'),workspace=path.join(dir,'source-workspace');fs.mkdirSync(workspace,{recursive:true});
 const dest=path.join(profile,'node_modules/dsh-environment-packer');
 for(const n of ['package.json','index.js','client.js','cordis.patch.yml','icon.svg','lib','assets','bin','locale','vendor'])fs.cpSync(path.join(repo,n),path.join(dest,n),{recursive:true});
 write(path.join(profile,'package.json'),{name:'dsh-profile-desktop',private:true,dependencies:{'dsh-environment-packer':'0.6.2'},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-environment-packer']}}});
 write(path.join(profile,'cordis.yml'),'[]\n');write(path.join(profile,'cordis.patch.yml'),'- id: workspace-controller\n  config:\n    documentsDirectory: '+JSON.stringify(workspace)+'\n');
 const value={enabled:false,density:'compact'},zip=path.join(dir,'backup.zip');
 const backup=await R.createBackup({homeDir:home,profileDir:profile,workspaceRoot:workspace,target:zip,dshVersion:'0.2.2-rc.1',confirmPrivate:true,sourceQuiescent:true,clientPreferences:{'dsh-chat-comfort.settings.v1':value}});
 const plan=await E.plan({zipFile:zip,installation:'D:/DeepSeek Harness',workspace:path.join(dir,'restored-workspace')});assert.deepEqual(plan.issues,[]);assert.equal(plan.requiresPreferenceImport,true);
 write(path.join(dir,'plan.json'),plan);console.log(JSON.stringify({fixture:dir,stage:'apply',capture:backup.coverageSummary}));
 await E.apply(plan,{confirmPrivate:true,confirmExecution:true});
 const pref=JSON.parse(fs.readFileSync(path.join(plan.layout.home,'PACKER-CLIENT-PREFERENCES.json')));assert.deepEqual(pref.value,value);assert.equal(pref.planId,plan.planId);
 const receipt=await E.verify(plan);const committed=await E.commit(plan);
 // Inspect the emitted script after commit; starting an extra runtime before
 // verify would correctly invalidate the staged-data binding.
 const injection=await E.boot(plan,'preference-script',{onReady:async({url,headers})=>{
   const response=await fetch(url,{headers}),html=await response.text();
   const script=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('dsh-packer.preference-import.')&&s.includes(plan.planId));assert(script,'plan-bound head script missing');
   const storage=new Map(),localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
   require('node:vm').runInNewContext(script,{localStorage});assert.deepEqual(JSON.parse(storage.get(pref.key)),value);
   assert.equal(storage.get('dsh-packer.preference-import.'+plan.planId),'1');
   const changed={enabled:true,density:'comfortable'};storage.set(pref.key,JSON.stringify(changed));require('node:vm').runInNewContext(script,{localStorage});assert.deepEqual(JSON.parse(storage.get(pref.key)),changed,'bootstrap must not overwrite subsequent user settings');
 }});
 const result={status:'PASS',dir,syntheticOnly:true,preference:pref,injection,scriptExecution:'isolated JS localStorage model; not browser certification',rounds:receipt.rounds,committed};write(path.join(base,'v062-preference-restore-result.json'),result);console.log(JSON.stringify({status:'PASS',rounds:receipt.rounds.length,dir}));
})().catch(e=>{console.error(e);process.exitCode=1;});
