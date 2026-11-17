'use strict';
// v0.7.4 targeted validation: the dsh-chat-import transcript scan index is a
// known plugin Home area, so a real cache no longer blocks recovery as an
// unclassified Home entry. Ownership is proven by the documented marker shape,
// not by the directory name: a lookalike or a corrupted marker still goes to
// pending review and keeps the archive recovery-blocked.
// Synthetic data only. No real Home, Profile, DSH installation or private ZIP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const cp=require('node:child_process'),realSpawnSync=cp.spawnSync;
cp.spawnSync=(cmd,args,opts)=>{
  if(/whoami/i.test(String(cmd)))return {status:0,stdout:'"V074\\user","S-1-5-21-0-0-0-1001"\n',stderr:''};
  if(/icacls/i.test(String(cmd)))return {status:0,stdout:'',stderr:''};
  return realSpawnSync(cmd,args,opts);
};
fs.linkSync=(a,b)=>fs.copyFileSync(a,b);
const root=process.env.DSH_PACKER_TEST_ROOT;
if(!root||!path.isAbsolute(root))throw Error('Explicit isolated test root required');
const R=require('../assets/migration-archive.cjs');
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,Buffer.isBuffer(b)?b:Buffer.from(typeof b==='string'?b:JSON.stringify(b)));};
const checks=[];const ok=(name,fn)=>{fn();checks.push(name);};
const baseOptions=f=>({homeDir:f.home,profileDir:f.profile,dshVersion:'0.2.2-rc.3',confirmPrivate:true,sourceQuiescent:true});
const cache={version:7,bookmarks:{codex:{'C:\\sources\\rollout-01.jsonl.zst':{sizeBytes:540532,sig:'[["mtimeMs",null],["sizeBytes",540532]]',entries:[]}},dsh4:{'C:\\sources\\session.jsonl.zstd':{sizeBytes:63011,sig:'[["mtimeMs",null],["sizeBytes",63011]]',entries:[]}}}};

function fixture(name,{cacheFile}={}){
  const dir=fs.mkdtempSync(path.join(root,name+'-')),home=path.join(dir,'home'),profile=path.join(home,'profiles/desktop');
  write(path.join(profile,'package.json'),{name:'dsh-profile-desktop',private:true,dependencies:{},dsh:{profile:{bundles:[]}}});
  write(path.join(home,'storages/workspace.json'),{unit:{name:'workspace',version:2},tables:{workspaces:{}}});
  write(path.join(home,'sessions/.keep'),'');
  if(cacheFile!==undefined)write(path.join(home,'dsh-chat-import/scan-cache.json'),cacheFile);
  return {dir,home,profile};
}

(async()=>{
  // ---- 1. A real scan index is classified, captured and no longer blocks ----
  const real=fixture('v074-chat-import',{cacheFile:cache}),zip=path.join(real.dir,'import.zip');
  const backup=await R.createBackup({...baseOptions(real),target:zip});
  ok('the chat-import scan index is declared as known plugin Home data',()=>{
    const entry=backup.manifest.pluginHomes.find(t=>t.name==='dsh-chat-import');
    assert(entry);assert.equal(entry.owner,'dsh-chat-import');assert.equal(entry.evidence,'scan-cache-v1');
    assert.equal(entry.complete,true);assert.equal(entry.archivePrefix,'home-data/dsh-chat-import');
    assert.equal(entry.fileCount,1);assert(entry.bytes>0);
    assert.equal(backup.manifest.pendingReview.length,0);
  });
  ok('the scan index is archived and creates no HOME_ITEM_UNCLASSIFIED gap',()=>{
    const excluded=backup.manifest.coverage.excluded.find(i=>i.name==='dsh-chat-import');
    assert(excluded);assert.equal(excluded.reason,'captured-plugin-data');
    assert.equal(excluded.needsReview,false);assert.equal(excluded.captured,true);
    assert(backup.manifest.files.some(f=>f.path==='home-data/dsh-chat-import/scan-cache.json'));
    assert.deepEqual(backup.coverageSummary.criticalCodes,[]);
    assert.equal(backup.coverageSummary.state,'no-known-critical-gaps');
    assert.equal(backup.coverageSummary.recoveryBlocked,false);
    assert.equal(backup.manifest.coverage.completeWithinDeclaredScope,true);
  });
  ok('strict archive validation accepts the classified plugin Home record',()=>{
    const a=R.readArchive(zip);
    try{
      assert.equal(a.manifest.pluginHomes.length,1);
      assert.equal(a.manifest.pluginHomes[0].evidence,'scan-cache-v1');
      assert.equal(a.manifest.coverage.summary.recoveryBlocked,false);
    }finally{a.zip.close();}
  });

  // ---- 2. A same-named directory without the marker stays pending review ----
  const lookalike=fixture('v074-chat-import-lookalike');
  write(path.join(lookalike.home,'dsh-chat-import/notes.txt'),'private unknown data\n');
  const lookZip=path.join(lookalike.dir,'lookalike.zip');
  const lookBackup=await R.createBackup({...baseOptions(lookalike),target:lookZip});
  ok('a same-named directory without the documented marker stays unclassified',()=>{
    assert.equal(lookBackup.manifest.pluginHomes.length,0);
    assert.deepEqual(lookBackup.manifest.pendingReview.map(t=>t.name),['dsh-chat-import']);
    const excluded=lookBackup.manifest.coverage.excluded.find(i=>i.name==='dsh-chat-import');
    assert(excluded);assert.equal(excluded.reason,'unclassified-home-entry');assert.equal(excluded.needsReview,true);
    assert.equal(lookBackup.coverageSummary.recoveryBlocked,true);
    assert.deepEqual(lookBackup.coverageSummary.criticalCodes,['HOME_ITEM_UNCLASSIFIED']);
  });

  // ---- 3. A corrupted marker is not trusted as ownership evidence ----
  for(const [label,bad] of [['wrong version',{version:'7',bookmarks:cache.bookmarks}],['array bookmarks',{version:7,bookmarks:[]}],['no entries',{version:7,bookmarks:{codex:{'C:\\sources\\a.jsonl':{sizeBytes:1}}}}],['not json','{not json']]){
    const broken=fixture('v074-chat-import-broken');
    write(path.join(broken.home,'dsh-chat-import/scan-cache.json'),typeof bad==='string'?bad:bad);
    const brokenZip=path.join(broken.dir,'broken.zip');
    const brokenBackup=await R.createBackup({...baseOptions(broken),target:brokenZip});
    ok('a corrupted marker ('+label+') does not activate the plugin Home area',()=>{
      assert.equal(brokenBackup.manifest.pluginHomes.length,0,label);
      assert.deepEqual(brokenBackup.manifest.pendingReview.map(t=>t.name),['dsh-chat-import'],label);
      assert.equal(brokenBackup.coverageSummary.recoveryBlocked,true,label);
    });
  }

  fs.writeFileSync(path.join(root,'v074-chat-import-home-result.json'),JSON.stringify({status:'PASS',checks,syntheticOnly:true,realHomeUntouched:true},null,2));
  console.log('PASS v0.7.4 chat-import Home classification: '+checks.length+' checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
