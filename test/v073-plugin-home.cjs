'use strict';
// v0.7.3 targeted validation: known plugin Home data is classified explicitly;
// pre-0.7.3 pending-review archives are reclassified only from complete marker
// evidence; unknown and incomplete trees stay blocked.
// Synthetic data only. No real Home, Profile, DSH installation or private ZIP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const cp=require('node:child_process'),realSpawnSync=cp.spawnSync,realLinkSync=fs.linkSync;
cp.spawnSync=(cmd,args,opts)=>{
  if(/whoami/i.test(String(cmd)))return {status:0,stdout:'"V073\\user","S-1-5-21-0-0-0-1001"\n',stderr:''};
  if(/icacls/i.test(String(cmd)))return {status:0,stdout:'',stderr:''};
  return realSpawnSync(cmd,args,opts);
};
fs.linkSync=(a,b)=>fs.copyFileSync(a,b);
const root=process.env.DSH_PACKER_TEST_ROOT;
if(!root||!path.isAbsolute(root))throw Error('Explicit isolated test root required');
const R=require('../assets/migration-archive.cjs'),P=require('../assets/migration-plan.cjs'),E=require('../assets/migration-engine.cjs'),C=require('../assets/recovery-core.cjs'),H=require('../assets/migration-host.cjs');
const installation=path.join(root,'v073-synthetic-installation');
const fakeHost={installation,exe:path.join(installation,'DeepSeek Harness.exe'),version:'0.2.2-rc.1',proof:{platform:process.platform,arch:process.arch,node:process.versions.node,nodeModules:process.versions.modules,electron:'39.0.0',providers:[],browserProviders:[],browserSeeds:[]},capabilities:{sessionVersion:4,zstd:true,projectKeyV1:true,workspaceV2:true,desktopCli:true}};
H.inspect=()=>fakeHost;
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,Buffer.isBuffer(b)?b:Buffer.from(typeof b==='string'?b:JSON.stringify(b)));};
const checks=[];const ok=(name,fn)=>{fn();checks.push(name);};const okAsync=async(name,fn)=>{await fn();checks.push(name);};
const baseOptions=f=>({homeDir:f.home,profileDir:f.profile,dshVersion:'0.2.2-rc.1',confirmPrivate:true,sourceQuiescent:true});

function fixture(name,{unknown=false,paperMarker=true,musicMarker=true,emptyMoveBackup=false}={}){
  const dir=fs.mkdtempSync(path.join(root,name+'-')),home=path.join(dir,'home'),profile=path.join(home,'profiles/desktop');
  write(path.join(profile,'package.json'),{name:'dsh-profile-desktop',private:true,dependencies:{},dsh:{profile:{bundles:[]}}});
  write(path.join(home,'storages/workspace.json'),{unit:{name:'workspace',version:2},tables:{workspaces:{}}});
  if(paperMarker)write(path.join(home,'.dsh-paper-reader/theme.json'),{pdfTheme:'follow',pdfDarkStrength:1,pdfDarkChrome:true});
  else write(path.join(home,'.dsh-paper-reader/embed.json'),{endpoint:'https://example.invalid',keyMasked:'****'});
  if(emptyMoveBackup)fs.mkdirSync(path.join(home,'dsham-move-backup'),{recursive:true});
  else write(path.join(home,'dsham-move-backup/workspaces/'+'a'.repeat(64)+'/session.json'),{id:'moved-session',version:4});
  if(musicMarker){
    write(path.join(home,'music/settings.json'),{roots:['E:\\ACG Hi-Res'],depth:6,extensions:['mp3','flac','m4a','wav','ogg','oga','opus','aac','mp4']});
    write(path.join(home,'music/stats.json'),{version:2,tracks:{'E:\\ACG Hi-Res\\a.flac':{plays:2,playSeconds:120}}});
  }else{
    write(path.join(home,'music/settings.json'),{volume:3});
    write(path.join(home,'music/stats.json'),{plays:1200});
  }
  if(unknown)write(path.join(home,'.acme-unknown/notes.txt'),'private unknown data\n');
  return {dir,home,profile};
}
function rewrite(source,target,mutate){
  const arc=R.readArchive(source);let w=null;
  try{
    const m=JSON.parse(JSON.stringify(arc.manifest));mutate(m);
    w=new C.ZipWriter(target);
    for(const rec of arc.zip.records.values())if(rec.name!=='manifest.json')w.add(rec.name,arc.zip.get(rec.name));
    w.add('manifest.json',Buffer.from(JSON.stringify(m,null,2)+'\n'));w.finish();w=null;
  }finally{if(w)w.close();arc.zip.close();}
}
function asLegacy(m){
  const trees=m.pluginHomes||[];
  delete m.pluginHomes;
  m.pendingReview=trees.map(t=>({name:t.name,archivePrefix:t.archivePrefix,fileCount:t.fileCount,bytes:t.bytes,complete:true,skippedCount:0,skipped:[]}));
  m.coverage.excluded=m.pendingReview.map(t=>({name:t.name,reason:'unclassified-home-entry',needsReview:true,captured:true}));
  m.coverage.missing=[];
  m.coverage.summary=R.coverageSummary([],m.coverage.excluded);
  m.coverage.completeWithinDeclaredScope=false;
}

(async()=>{
  // ---- 1. Known plugin Home data is captured as user data, not unknown cache ----
  const f=fixture('v073-plugin',{unknown:true}),zip=path.join(f.dir,'plugin.zip');
  const backup=await R.createBackup({...baseOptions(f),target:zip});
  ok('known plugin Home directories are declared with owner and marker evidence',()=>{
    assert.equal(backup.manifest.pluginHomes.length,3);
    const byName=Object.fromEntries(backup.manifest.pluginHomes.map(t=>[t.name,t]));
    assert.equal(byName['.dsh-paper-reader'].owner,'@ggboy123/dsh-paper-reader');
    assert.equal(byName['.dsh-paper-reader'].evidence,'directory-name');
    assert.equal(byName['dsham-move-backup'].owner,'@michengai/dsh-archive-manager');
    assert.equal(byName['music'].owner,null);
    assert.equal(byName['music'].evidence,'music-settings-v2');
    assert.equal(backup.manifest.pendingReview.length,1);
    assert.equal(backup.manifest.pendingReview[0].name,'.acme-unknown');
  });
  ok('plugin files are in the archive and no longer create HOME_ITEM_UNCLASSIFIED',()=>{
    const entry=backup.manifest.coverage.excluded.find(i=>i.name==='music');
    assert(entry);assert.equal(entry.reason,'captured-plugin-data');assert.equal(entry.needsReview,false);assert.equal(entry.captured,true);
    assert.equal(backup.coverageSummary.criticalCount,1);
    assert.deepEqual(backup.coverageSummary.criticalCodes,['HOME_ITEM_UNCLASSIFIED']);
    assert.equal(backup.manifest.coverage.summary.recoveryBlocked,true);
    for(const p of ['home-data/.dsh-paper-reader/theme.json','home-data/dsham-move-backup/workspaces/'+'a'.repeat(64)+'/session.json','home-data/music/settings.json','home-data/music/stats.json'])assert(backup.manifest.files.some(x=>x.path===p),p);
  });
  await okAsync('the rewritten plugin manifest is accepted by strict validation',async()=>{
    const a=R.readArchive(zip);try{assert.equal(a.manifest.pluginHomes.length,3);assert.equal(a.manifest.pendingReview.length,1);}finally{a.zip.close();}
  });

  // ---- 2. A clean plugin-only Home is complete; generic lookalikes stay unknown ----
  const clean=fixture('v073-clean'),cleanZip=path.join(clean.dir,'clean.zip');
  const cleanBackup=await R.createBackup({...baseOptions(clean),target:cleanZip});
  ok('plugin-only Home has no critical gap and is complete within its declared scope',()=>{
    assert.equal(cleanBackup.manifest.coverage.missing.length,0);
    assert.equal(cleanBackup.manifest.pendingReview.length,0);
    assert.equal(cleanBackup.coverageSummary.state,'no-known-critical-gaps');
    assert.equal(cleanBackup.coverageSummary.recoveryBlocked,false);
    assert.equal(cleanBackup.manifest.coverage.completeWithinDeclaredScope,true);
    assert.equal(cleanBackup.manifest.pluginHomes.length,3);
  });
  const look=fixture('v073-lookalike',{paperMarker:false,musicMarker:false,emptyMoveBackup:true}),lookZip=path.join(look.dir,'look.zip');
  const lookBackup=await R.createBackup({...baseOptions(look),target:lookZip});
  ok('generic music stays pending while a paper-reader directory with only embed.json is classified',()=>{
    const pending=lookBackup.manifest.pendingReview.map(t=>t.name).sort();
    assert.deepEqual(pending,['music']);
    const music=lookBackup.manifest.coverage.excluded.find(i=>i.name==='music');
    assert(music);assert.equal(music.needsReview,true);assert.equal(music.reason,'unclassified-home-entry');
    assert.equal(lookBackup.manifest.pluginHomes.length,2);
    assert.deepEqual(lookBackup.manifest.pluginHomes.map(t=>t.name).sort(),['.dsh-paper-reader','dsham-move-backup']);
    assert.equal(lookBackup.manifest.files.some(f=>f.path==='home-data/.dsh-paper-reader/embed.json'),true);
    assert.equal(lookBackup.coverageSummary.recoveryBlocked,true);
  });

  // ---- 3. Pre-0.7.3 pending review is reclassified from complete marker evidence ----
  const legacyZip=path.join(clean.dir,'legacy-pending.zip');
  rewrite(cleanZip,legacyZip,asLegacy);
  const legacyPlan=await E.plan({zipFile:legacyZip,installation,workspace:path.join(clean.dir,'Legacy-Restored')});
  ok('legacy pending-review plugin data is resolved and mapped back into the new Home',()=>{
    assert.equal(legacyPlan.pluginData.length,3);
    assert.equal(legacyPlan.pendingReview.length,0);
    assert.equal(legacyPlan.issues.some(i=>i.code==='HOME_ITEM_UNCLASSIFIED'),false);
    assert.equal(legacyPlan.canApply,true);
    const music=legacyPlan.pluginData.find(t=>t.name==='music');
    assert(music);assert.equal(music.source,'legacy-pending-review');assert.equal(music.activation,'data-only');
    assert.equal(music.to,path.join(legacyPlan.layout.home,'music'));
    assert.equal(legacyPlan.coverageReview.recorded.recoveryBlocked,true);
    assert.equal(legacyPlan.coverageReview.classified.length,3);
    assert.equal(legacyPlan.coverageReview.unresolved.length,0);
    assert(legacyPlan.actions.includes('preserve-classified-plugin-data'));
    assert.equal(E.destination(legacyPlan,{path:'home-data/music/stats.json'}),path.join(legacyPlan.layout.home,'music','stats.json'));
  });
  ok('plugin data internal workspaces/<hash> paths are not rewritten as memory IDs',()=>{
    const file=path.join(legacyPlan.layout.home,'dsham-move-backup','workspaces','a'.repeat(64),'session.json');
    assert.equal(E.memoryPath(legacyPlan,file),file);
  });

  // ---- 4. Incomplete legacy pending data is not silently activated ----
  const partialZip=path.join(clean.dir,'legacy-partial.zip');
  rewrite(cleanZip,partialZip,m=>{asLegacy(m);const t=m.pendingReview.find(x=>x.name==='music');t.complete=false;t.skippedCount=1;t.skipped=[{path:'home-data/music/link',kind:'link'}];});
  const partialPlan=await E.plan({zipFile:partialZip,installation,workspace:path.join(clean.dir,'Partial-Restored')});
  ok('incomplete legacy pending data stays blocked and outside the new Home',()=>{
    assert.equal(partialPlan.pluginData.length,2);
    assert.equal(partialPlan.pendingReview.length,1);
    assert.equal(partialPlan.pendingReview[0].name,'music');
    assert.equal(partialPlan.pendingReview[0].to,path.join(partialPlan.layout.state,'pending-review','music'));
    assert(partialPlan.issues.some(i=>i.code==='HOME_ITEM_UNCLASSIFIED'&&i.name==='music'));
    assert.equal(partialPlan.canApply,false);
    assert.equal(partialPlan.coverageReview.unresolved[0].complete,false);
  });

  // ---- 5. Plan layout validation refuses a redirected plugin-data target ----
  const tampered=JSON.parse(JSON.stringify(legacyPlan));
  tampered.pluginData[0].to=path.join(tampered.layout.state,'redirected');
  const unsigned={...tampered};delete unsigned.planSHA256;
  tampered.planSHA256=P.digest(unsigned);
  ok('a plan cannot redirect classified plugin data outside the new Home',()=>{
    assert.throws(()=>P.validatePlan(tampered),e=>e.code==='PLAN_LAYOUT_INVALID');
  });

  fs.writeFileSync(path.join(root,'v073-plugin-home-result.json'),JSON.stringify({status:'PASS',checks,syntheticOnly:true,realHomeUntouched:true},null,2));
  console.log('PASS v0.7.3 plugin Home classification: '+checks.length+' checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
