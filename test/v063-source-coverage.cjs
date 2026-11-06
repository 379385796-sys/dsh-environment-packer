'use strict';
// v0.6.3 targeted validation: local plugin source capture, superseded cache
// backups, restore mapping, source-tree fidelity and conservative handling.
// Synthetic data only. No real Home, Profile, DSH installation or private ZIP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.DSH_PACKER_TEST_ROOT;if(!root||!path.isAbsolute(root))throw Error('Explicit isolated test root required');
const R=require('../assets/migration-archive.cjs'),P=require('../assets/migration-plan.cjs'),E=require('../assets/migration-engine.cjs'),C=require('../assets/recovery-core.cjs');
const H=require('../assets/migration-host.cjs');
// Synthetic host evidence only: no real DSH executable is inspected or started.
const installation=path.join(root,'v063-synthetic-installation');
const fakeHost={installation,exe:path.join(installation,'DeepSeek Harness.exe'),version:'0.2.2-rc.1',proof:{platform:process.platform,arch:process.arch,node:process.versions.node,nodeModules:process.versions.modules,electron:'39.0.0',providers:[],browserProviders:[],browserSeeds:[]},capabilities:{sessionVersion:4,zstd:true,projectKeyV1:true,workspaceV2:true,desktopCli:true}};
H.inspect=()=>fakeHost;
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,Buffer.isBuffer(b)?b:Buffer.from(typeof b==='string'?b:JSON.stringify(b)));};
const checks=[];const ok=(name,fn)=>{fn();checks.push(name);};
const okAsync=async(name,fn)=>{await fn();checks.push(name);};
const baseOptions=f=>({homeDir:f.home,profileDir:f.profile,dshVersion:'0.2.2-rc.1',confirmPrivate:true,sourceQuiescent:true});

function fixture(name,{unknown=false,liveCache=true,sources=true}={}){
  const dir=fs.mkdtempSync(path.join(root,name+'-')),home=path.join(dir,'home'),profile=path.join(home,'profiles/desktop');
  write(path.join(profile,'package.json'),{name:'dsh-profile-desktop',private:true,dependencies:{},dsh:{profile:{bundles:[]}}});
  fs.mkdirSync(path.join(home,'storages'),{recursive:true});
  if(sources){
    write(path.join(home,'plugins-local/demo-plugin/package.json'),{name:'demo-plugin',version:'1.2.3',private:true});
    write(path.join(home,'plugins-local/demo-plugin/lib/index.js'),'export default 1;\n');
    write(path.join(home,'plugins-local/demo-plugin/assets/theme.css'),'body{color:red}\n');
    write(path.join(home,'plugins-local/demo-plugin/data/cache.db'),'not a sqlite database\n');
    write(path.join(home,'plugins-local/demo-plugin/native/prebuilt.node'),Buffer.from([0,1,2,3]));
    write(path.join(home,'plugins-local/demo-plugin/node_modules/demo-dep/package.json'),{name:'demo-dep',version:'9.9.9'});
    write(path.join(home,'plugins-local/demo-plugin/node_modules/demo-dep/index.js'),'module.exports={};\n');
    write(path.join(home,'plugins-local/notes.txt'),'local notes\n');
  }
  if(liveCache)write(path.join(home,'.dshw-usage.json'),{date:'2026-10-18',lastBalance:null,todayUsage:1,history:{},events:[]});
  write(path.join(home,'.dshw-usage.json.before-recharge-fix.bak'),{date:'2026-10-16',lastBalance:null,todayUsage:1,history:{},events:[]});
  if(unknown)write(path.join(home,'mystery.bin'),Buffer.from([1,2,3]));
  return {dir,home,profile};
}

(async()=>{
  // ---- 1. plugins-local: captured as inert source data, node_modules excluded ----
  const f=fixture('v063-source',{unknown:true}),zip=path.join(f.dir,'source.zip');
  const backup=await R.createBackup({...baseOptions(f),target:zip});
  const tree=backup.manifest.sourceTrees?.[0];
  ok('plugins-local is recorded as a complete source tree with an explicit dependency exclusion',()=>{
    assert(tree);assert.equal(tree.name,'plugins-local');
    assert.equal(tree.archivePrefix,'home-data/plugins-local');
    assert.equal(tree.restorePath,'plugins-local');
    assert.equal(tree.complete,true);
    assert.deepEqual(tree.excluded,['node_modules']);
    assert.equal(tree.fileCount,6);
    assert(tree.bytes>0);
  });
  ok('user-authored source files are captured and node_modules install artifacts are not',()=>{
    const paths=backup.manifest.files.map(x=>x.path);
    for(const p of ['home-data/plugins-local/notes.txt','home-data/plugins-local/demo-plugin/package.json','home-data/plugins-local/demo-plugin/lib/index.js','home-data/plugins-local/demo-plugin/assets/theme.css','home-data/plugins-local/demo-plugin/data/cache.db'])assert(paths.includes(p),p);
    assert.equal(paths.some(p=>p.includes('/plugins-local/')&&p.includes('/node_modules/')),false);
    assert.equal(backup.manifest.packages.some(p=>p.name==='demo-dep'),false);
  });
  ok('plugins-local is classified explicitly and no longer raises HOME_ITEM_UNCLASSIFIED',()=>{
    const entry=backup.manifest.coverage.excluded.find(i=>i.name==='plugins-local');
    assert(entry);assert.equal(entry.reason,'captured-local-plugin-source');assert.equal(entry.needsReview,false);
    assert.equal(backup.coverageSummary.criticalCount,1);
    assert.deepEqual(backup.coverageSummary.criticalCodes,['HOME_ITEM_UNCLASSIFIED']);
  });
  ok('an unrelated unknown home entry still stays a critical, conservative warning',()=>{
    const entry=backup.manifest.coverage.excluded.find(i=>i.name==='mystery.bin');
    assert(entry);assert.equal(entry.reason,'unclassified-home-entry');assert.equal(entry.needsReview,true);
    assert.equal(backup.manifest.coverage.summary.state,'critical-gaps');
    assert.equal(backup.manifest.coverage.summary.recoveryBlocked,true);
  });
  await okAsync('source tree files are never interpreted as storage, database or skill datasets',async()=>{
    const arc=R.readArchive(zip);
    try{
      const data=await P.scanData(arc);
      assert.equal(data.datasets.some(d=>d.path.startsWith('home-data/plugins-local/')),false);
      assert.equal(data.issues.some(i=>i.code==='DATABASE_SCHEMA_UNKNOWN'),false);
      assert.equal(data.issues.some(i=>i.code==='STORAGE_JSON_INVALID'),false);
    }finally{arc.zip.close();}
  });

  // ---- 2. Superseded cache backup: explicit exclusion, not silent ------------
  const bak=backup.manifest.coverage.excluded.find(i=>i.name==='.dshw-usage.json.before-recharge-fix.bak');
  ok('historical .bak is captured outside runtime Home even with live data',()=>{
    assert(bak);assert.equal(bak.reason,'captured-historical-data');assert.equal(bak.needsReview,false);
    assert(backup.manifest.files.some(x=>x.path==='packages/home-history/'+bak.name));
    assert.equal(backup.manifest.historicalData[0].activation,'archive-only');
    assert(backup.manifest.files.some(x=>x.path==='home-data/.dshw-usage.json'));
  });
  const noBase=fixture('v063-bak-only',{liveCache:false,sources:false}),noBaseZip=path.join(noBase.dir,'bak-only.zip');
  const noBaseBackup=await R.createBackup({...baseOptions(noBase),target:noBaseZip});
  ok('historical .bak without live file is preserved as the only copy',()=>{
    const entry=noBaseBackup.manifest.coverage.excluded.find(i=>i.name==='.dshw-usage.json.before-recharge-fix.bak');
    assert(entry);assert.equal(entry.reason,'captured-historical-data');assert.equal(entry.needsReview,false);
    assert.equal(noBaseBackup.coverageSummary.state,'no-known-critical-gaps');
    assert.equal(noBaseBackup.coverageSummary.recoveryBlocked,false);
    assert(noBaseBackup.manifest.files.some(x=>x.path==='packages/home-history/'+entry.name));
  });

  const linked=fixture('v063-linked',{sources:false});
  const outside=path.join(linked.dir,'outside');write(path.join(outside,'private.txt'),'must not traverse');
  fs.mkdirSync(path.join(linked.home,'plugins-local'),{recursive:true});
  fs.symlinkSync(outside,path.join(linked.home,'plugins-local/escape'),'junction');
  const linkedBackup=await R.createBackup({...baseOptions(linked),target:path.join(linked.dir,'links.zip')});
  ok('source junctions are refused without traversing external data; archive has critical gap',()=>{
    assert(linkedBackup.manifest.coverage.missing.some(i=>i.code==='LOCAL_SOURCE_TREE_INCOMPLETE'&&i.critical));
    assert.equal(linkedBackup.manifest.files.some(f=>f.path.includes('private.txt')),false);
    assert.equal(linkedBackup.manifest.sourceTrees.length,0);
  });
  const wrongType=fixture('v063-wrongtype',{sources:false});write(path.join(wrongType.home,'plugins-local'),'not a directory');
  const wrongBackup=await R.createBackup({...baseOptions(wrongType),target:path.join(wrongType.dir,'type.zip')});
  ok('a file masquerading as source root produces a critical gap',()=>{
    assert(wrongBackup.manifest.coverage.missing.some(i=>i.code==='LOCAL_SOURCE_TREE_INCOMPLETE'));
  });
  // ---- 3. A clean fixture has no critical coverage gaps ----------------------
  const clean=fixture('v063-clean'),cleanZip=path.join(clean.dir,'clean.zip');
  const cleanBackup=await R.createBackup({...baseOptions(clean),target:cleanZip});
  ok('classified source tree and superseded backup produce no synthetic success or gap',()=>{
    assert.equal(cleanBackup.manifest.coverage.missing.length,0);
    assert.equal(cleanBackup.manifest.coverage.excluded.some(i=>i.needsReview),false);
    assert.equal(cleanBackup.coverageSummary.state,'no-known-critical-gaps');
    assert.equal(cleanBackup.coverageSummary.recoveryBlocked,false);
  });

  // ---- 4. Restore mapping and staged fidelity --------------------------------
  const destination=E.destination({layout:{home:'C:\\Target\\Home',profile:'C:\\Target\\Home\\profiles\\desktop'},mappings:[],externalRoots:[]},{path:'home-data/plugins-local/demo-plugin/lib/index.js'});
  ok('source tree files have a deterministic Home-relative restore mapping',()=>{
    assert.equal(destination,path.join('C:\\Target\\Home','plugins-local/demo-plugin/lib/index.js'));
  });
  ok('opaque source paths never enter memory workspace-ID rewriting',()=>{
    const to=path.join(clean.dir,'new-home/plugins-local'),file=path.join(to,'demo/workspaces','0'.repeat(64),'keep.txt');
    assert.equal(E.memoryPath({sourceTrees:[{to}],mappings:[]},file),file);
    assert.throws(()=>E.memoryPath({sourceTrees:[],mappings:[]},file),e=>e.code==='MEMORY_WORKSPACE_ID_UNKNOWN');
  });
  const staged=path.join(clean.dir,'staged'),restoredHome=path.join(staged,'home');
  write(path.join(restoredHome,'plugins-local/demo-plugin/package.json'),{name:'demo-plugin',version:'1.2.3'});
  write(path.join(restoredHome,'plugins-local/demo-plugin/lib/index.js'),'export default 1;\n');
  const planLike={layout:{home:restoredHome},sourceTrees:[{name:'plugins-local'}]};
  const digest=E.sourceTreeDigest(planLike);
  const expectedBytes=Buffer.byteLength(JSON.stringify({name:'demo-plugin',version:'1.2.3'}))+Buffer.byteLength('export default 1;\n');
  ok('staged source trees have a reproducible file/byte/hash digest',()=>{
    assert.equal(digest.length,1);assert.equal(digest[0].files,2);assert.equal(digest[0].bytes,expectedBytes);
    assert.match(digest[0].sha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(E.sourceTreeDigest(planLike),digest);
  });
  ok('a changed or missing staged source tree is refused',()=>{
    write(path.join(restoredHome,'plugins-local/demo-plugin/lib/index.js'),'export default 2;\n');
    assert.notDeepEqual(E.sourceTreeDigest(planLike),digest);
    fs.rmSync(path.join(restoredHome,'plugins-local'),{recursive:true,force:true});
    assert.throws(()=>E.sourceTreeDigest(planLike),e=>e.code==='SOURCE_TREE_MISSING');
  });

  // ---- 5. Manifest tamper and backward compatibility ------------------------
  function rewrite(source,target,mutate){
    const arc=R.readArchive(source);let w=null;
    try{
      const m=JSON.parse(JSON.stringify(arc.manifest));mutate(m);
      w=new C.ZipWriter(target);
      for(const rec of arc.zip.records.values())if(rec.name!=='manifest.json')w.add(rec.name,arc.zip.get(rec.name));
      w.add('manifest.json',Buffer.from(JSON.stringify(m,null,2)+'\n'));w.finish();w=null;
    }finally{if(w)w.close();arc.zip.close();}
  }
  const tampered=path.join(f.dir,'tampered-tree.zip');
  rewrite(zip,tampered,m=>{m.sourceTrees[0].fileCount+=1;});
  ok('a rewritten source tree count cannot understate or overstate captured files',()=>{
    assert.throws(()=>{const a=R.readArchive(tampered);a.zip.close();},e=>e.code==='INVALID_MIGRATION_MANIFEST');
  });
  const badExclusion=path.join(f.dir,'bad-exclusion.zip');
  rewrite(zip,badExclusion,m=>{m.sourceTrees[0].excluded=['notes.txt'];});
  ok('a source tree cannot declare a captured path segment as excluded',()=>{
    assert.throws(()=>{const a=R.readArchive(badExclusion);a.zip.close();},e=>e.code==='INVALID_MIGRATION_MANIFEST');
  });
  const unsafeTree=path.join(f.dir,'unsafe-tree.zip');
  rewrite(zip,unsafeTree,m=>{m.sourceTrees=[{...m.sourceTrees[0],name:'storages',archivePrefix:'home-data/storages',restorePath:'storages',fileCount:0,bytes:0}];});
  ok('sourceTrees cannot exempt runtime storages from safety scans',()=>{
    assert.throws(()=>R.readArchive(unsafeTree),e=>e.code==='INVALID_MIGRATION_MANIFEST');
  });
  const emptyModules=path.join(f.dir,'empty-node-modules.zip');
  rewrite(zip,emptyModules,m=>{m.directories.push('home-data/plugins-local/demo-plugin/NODE_MODULES');});
  ok('excluded source directory names are enforced case insensitively even when empty',()=>{
    assert.throws(()=>R.readArchive(emptyModules),e=>e.code==='INVALID_MIGRATION_MANIFEST');
  });
  const legacyShape=path.join(f.dir,'legacy-shape.zip');
  rewrite(cleanZip,legacyShape,m=>{delete m.sourceTrees;});
  ok('archives produced before v0.6.3 (no sourceTrees field) remain readable',()=>{
    const a=R.readArchive(legacyShape);try{assert.equal(a.manifest.format,'dsh-private-recovery/4');assert.equal(a.manifest.sourceTrees,undefined);}finally{a.zip.close();}
  });

  // ---- 6. Apply/verify carry the explicit mapping and fidelity receipt ------
  const plan=await E.plan({zipFile:cleanZip,installation,workspace:path.join(clean.dir,'Restored-Workspace')});
  ok('plan exposes a Home-relative data-only destination for each source tree',()=>{
    assert.equal(plan.canApply,true);assert.deepEqual(plan.issues,[]);
    assert.equal(plan.sourceTrees.length,1);
    assert.equal(plan.sourceTrees[0].name,'plugins-local');
    assert.equal(plan.sourceTrees[0].to,path.join(plan.layout.home,'plugins-local'));
    assert.equal(plan.sourceTrees[0].activation,'data-only');
    assert.equal(plan.sourceTrees[0].files,6);
  });
  ok('prebuilt binaries inside source trees are not treated as environment native modules',()=>{
    assert.equal(plan.native.some(n=>n.path.includes('/plugins-local/')),false);
    assert.equal(plan.issues.some(i=>i.code==='NATIVE_RUNTIME_UNVERIFIED'),false);
  });
  await E.apply(plan,{confirmPrivate:true,confirmExecution:true});
  const transactionPath=path.join(plan.layout.state,'transaction.json');
  const applied=JSON.parse(fs.readFileSync(transactionPath,'utf8'));
  ok('apply stages source files under the new Home and records a fidelity digest',()=>{
    const restored=path.join(plan.layout.home,'plugins-local');
    assert(fs.existsSync(path.join(restored,'demo-plugin/lib/index.js')));
    assert(fs.existsSync(path.join(restored,'notes.txt')));
    assert.equal(fs.existsSync(path.join(restored,'demo-plugin/node_modules')),false);
    assert.equal(applied.phase,'staged');
    assert.equal(applied.sourceTrees.length,1);assert.equal(applied.sourceTrees[0].files,6);
    assert.deepEqual(E.sourceTreeDigest(plan),applied.sourceTrees);
  });
  write(path.join(plan.layout.home,'plugins-local/demo-plugin/lib/index.js'),'tampered after staging\n');
  fs.writeFileSync(transactionPath,JSON.stringify({...applied,stagedSHA256:E.sourceStateHash(plan)},null,2)+'\n');
  await assert.rejects(()=>E.verify(plan),e=>e.code==='SOURCE_TREE_CHANGED');
  checks.push('verify refuses a staged source tree that no longer matches the applied digest');

  fs.writeFileSync(path.join(root,'v063-source-coverage-result.json'),JSON.stringify({status:'PASS',checks,syntheticOnly:true,realHomeUntouched:true},null,2));
  console.log('PASS v0.6.3 source coverage: '+checks.length+' checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
