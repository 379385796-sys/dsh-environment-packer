'use strict';
// v0.6.2 targeted validation (Codex verdict section 7, items 1/2/4).
// Synthetic data only. No real Home, Profile, DSH installation or private ZIP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=process.env.DSH_PACKER_TEST_ROOT;if(!root||!path.isAbsolute(root))throw Error('Explicit isolated test root required');
const R=require('../assets/migration-archive.cjs'),C=require('../assets/recovery-core.cjs');
const {readUiOverview,normalizeCoverage}=require('../lib/ui-overview.js');
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof b==='string'?b:Buffer.from(JSON.stringify(b)));};
const checks=[];const ok=(name,fn)=>{fn();checks.push(name);};

function fixture(name,{comfort=true}={}){
  const dir=fs.mkdtempSync(path.join(root,name+'-')),home=path.join(dir,'home'),profile=path.join(home,'profiles/desktop');
  write(path.join(profile,'package.json'),{name:'dsh-profile-desktop',private:true,dependencies:{},dsh:{profile:{bundles:[]}}});
  if(comfort)write(path.join(profile,'node_modules/dsh-chat-comfort/package.json'),{name:'dsh-chat-comfort',version:'1.1.0'});
  fs.mkdirSync(path.join(home,'storages'),{recursive:true});
  return {dir,home,profile};
}
const baseOptions=f=>({homeDir:f.home,profileDir:f.profile,dshVersion:'0.2.2-rc.1',confirmPrivate:true,sourceQuiescent:true});

(async()=>{
  // ---- 1. Capture states: absent / valid / not-installed / invalid ----
  ok('classifyClientPreferences reports absent, present-valid and rejects invalid shapes',()=>{
    assert.deepEqual(R.classifyClientPreferences(undefined),{protocol:1,state:'absent',preferences:{}});
    const valid=R.classifyClientPreferences({'dsh-chat-comfort.settings.v1':{enabled:true,density:'compact'}});
    assert.equal(valid.state,'present-valid');assert.deepEqual(valid.preferences['dsh-chat-comfort.settings.v1'],{enabled:true,density:'compact'});
    for(const bad of [null,[],{},'x',{'dsh-chat-comfort.settings.v1':{enabled:'yes',density:'compact'}},{'other':{enabled:true,density:'compact'}},{'dsh-chat-comfort.settings.v1':{enabled:true,density:'compact',script:'evil'}}]){
      assert.throws(()=>R.classifyClientPreferences(bad),e=>e.code==='CLIENT_PREFERENCE_INVALID');
    }
  });

  const gap=fixture('v062-gap'),gapZip=path.join(gap.dir,'gap.zip');
  const gapBackup=await R.createBackup({...baseOptions(gap),target:gapZip});
  ok('absent preference still produces a verified recovery/4 archive (data preservation continues)',()=>{
    assert(fs.existsSync(gapZip));assert.equal(gapBackup.manifest.format,'dsh-private-recovery/4');
    assert(gapBackup.manifest.files.some(f=>f.path==='profiles/desktop/package.json'));
    assert.equal(gapBackup.manifest.files.some(f=>f.path.startsWith('preferences/')),false);
    assert.equal(gapBackup.manifest.coverage.completeWithinDeclaredScope,false);
    assert.equal(gapBackup.manifest.coverage.missing.some(i=>i.code==='CLIENT_PREFERENCE_NOT_CAPTURED'&&i.critical===true),true);
  });
  ok('coverage summary is bounded, code-only and says recovery is blocked',()=>{
    const s=gapBackup.coverageSummary;
    assert.equal(s.schema,1);assert.equal(s.state,'critical-gaps');assert.equal(s.criticalCount,1);
    assert.deepEqual(s.criticalCodes,['CLIENT_PREFERENCE_NOT_CAPTURED']);
    assert.equal(s.recoveryBlocked,true);assert.equal(s.blockReason,'CRITICAL_COVERAGE_GAPS');
    assert.deepEqual(gapBackup.manifest.coverage.summary,s);
    assert(!JSON.stringify(s).includes(gap.home));
    const arc=R.readArchive(gapZip);try{assert.equal(arc.zip.records.size,arc.manifest.files.length+1);assert.equal(arc.zip.fingerprint().length,64);}finally{arc.zip.close();}
  });
  ok('a rewritten in-archive summary cannot fabricate a clean capture',()=>{
    const arc=R.readArchive(gapZip),tampered=path.join(gap.dir,'tampered.zip');let w=null;
    try{
      const m=JSON.parse(JSON.stringify(arc.manifest));
      Object.assign(m.coverage.summary,{state:'no-known-critical-gaps',criticalCount:0,criticalCodes:[],recoveryBlocked:false,blockReason:null});
      w=new C.ZipWriter(tampered);
      for(const rec of arc.zip.records.values())if(rec.name!=='manifest.json')w.add(rec.name,arc.zip.get(rec.name));
      w.add('manifest.json',Buffer.from(JSON.stringify(m,null,2)+'\n'));w.finish();w=null;
      assert.throws(()=>{const bad=R.readArchive(tampered);bad.zip.close();},e=>e.code==='INVALID_MIGRATION_MANIFEST');
    }finally{if(w)w.close();arc.zip.close();}
    assert.equal(fs.existsSync(gapZip),true);
  });

  const valid=fixture('v062-valid'),validZip=path.join(valid.dir,'valid.zip');
  const validBackup=await R.createBackup({...baseOptions(valid),target:validZip,clientPreferences:{'dsh-chat-comfort.settings.v1':{enabled:true,density:'compact'}}});
  ok('explicit legal preference is archived byte-accurately with no critical gaps',()=>{
    const pref=validBackup.manifest.files.find(f=>f.path==='preferences/dsh-chat-comfort.settings.v1.json');assert(pref);
    const arc=R.readArchive(validZip);try{assert.deepEqual(JSON.parse(arc.zip.get(pref.path).toString('utf8')),{key:'dsh-chat-comfort.settings.v1',value:{enabled:true,density:'compact'}});}finally{arc.zip.close();}
    assert.equal(validBackup.coverageSummary.state,'no-known-critical-gaps');
    assert.equal(validBackup.coverageSummary.recoveryBlocked,false);
    assert.equal(validBackup.manifest.coverage.completeWithinDeclaredScope,true);
  });

  const absent=fixture('v062-no-comfort',{comfort:false}),absentZip=path.join(absent.dir,'no-comfort.zip');
  const noComfort=await R.createBackup({...baseOptions(absent),target:absentZip});
  ok('comfort not installed never emits a false CLIENT_PREFERENCE_NOT_CAPTURED',()=>{
    assert.equal(noComfort.manifest.coverage.missing.length,0);
    assert.equal(noComfort.coverageSummary.state,'no-known-critical-gaps');
  });

  const bad=fixture('v062-invalid');
  await assert.rejects(()=>R.createBackup({...baseOptions(bad),target:path.join(bad.dir,'bad.zip'),clientPreferences:{'dsh-chat-comfort.settings.v1':{enabled:'yes',density:'compact'}}}),e=>e.code==='CLIENT_PREFERENCE_INVALID');
  ok('invalid preference fails clearly before any ZIP is written',()=>{assert.equal(fs.existsSync(path.join(bad.dir,'bad.zip')),false);});

  // ---- 2. Three-layer result semantics across five synthetic inputs ----
  const combos=[
    {name:'peer-only',issues:1,summary:{schema:1,state:'no-known-critical-gaps',criticalCount:0,criticalCodes:[],truncated:false,recoveryBlocked:false,blockReason:null},expect:'not-verified'},
    {name:'gap-only',issues:0,summary:gapBackup.coverageSummary,expect:'blocked'},
    {name:'both',issues:1,summary:gapBackup.coverageSummary,expect:'blocked'},
    {name:'clean',issues:0,summary:validBackup.coverageSummary,expect:'not-verified'},
  ];
  const taskHome=id=>{const h=fs.mkdtempSync(path.join(root,'v062-overview-')),d=path.join(h,'.packer-cold',id);fs.mkdirSync(d,{recursive:true});return {h,d};};
  const id='c'.repeat(32);
  for(const combo of combos){
    const {h,d}=taskHome(id);
    const terminal={id,phase:'success',files:69,bytes:4096,sha256:'d'.repeat(64),verified:true,cleanup:true,dependencyIssues:combo.issues,coverage:combo.summary,at:1793853731000};
    write(path.join(d,'terminal.json'),terminal);
    write(path.join(d,'job.json'),{id,target:'D:\\Synthetic\\private.zip'});
    write(path.join(d,'ui-result.json'),{id,outcome:'success',workerExited:true,bytes:4096,sha256:'d'.repeat(64),files:69,verified:true,integrity:'zip-crc-manifest-payload-verified',dependencyIssues:combo.issues,coverage:combo.summary,completedAt:1793853731000});
    const t=readUiOverview(h).history.find(x=>x.id===id);
    ok('result layer '+combo.name+': integrity independent from recovery conclusion',()=>{
      assert(t);assert.equal(t.result.outcome,'success');assert.equal(t.result.integrity,'verified');
      assert.equal(t.result.dependencyIssues,combo.issues);
      assert.equal(t.result.recoveryState,combo.expect);
      assert.equal(t.result.coverage.state,combo.summary.state);
      assert.notEqual(t.result.recoveryState,'compatible');
    });
  }
  { // old record without any coverage summary
    const {h,d}=taskHome(id);
    write(path.join(d,'terminal.json'),{id,phase:'success',files:69,bytes:4096,sha256:'d'.repeat(64),verified:true,cleanup:true,dependencyIssues:0,at:1793853731000});
    write(path.join(d,'ui-result.json'),{id,outcome:'success',workerExited:true,integrity:'zip-crc-manifest-payload-verified',verified:true,completedAt:1793853731000});
    const t=readUiOverview(h).history.find(x=>x.id===id);
    ok('old record without coverage stays unknown and is never upgraded to compatible',()=>{
      assert.equal(t.result.outcome,'success');assert.equal(t.result.coverage.state,'unknown');
      assert.equal(t.result.recoveryState,'unknown');assert.equal(t.result.coverage.recoveryBlocked,null);
    });
  }
  ok('normalizeCoverage bounds codes/counts and drops paths or free text',()=>{
    const hostile={schema:1,state:'critical-gaps',criticalCount:99999,criticalCodes:[...Array(100)].map((_,i)=>i===3?'D:\\PRIVATE\\secret.txt':i===4?'SYNTHETIC private text':i===5?'<script>alert(1)</script>':'CODE_'+i),truncated:true};
    const n=normalizeCoverage(hostile);
    assert.equal(n.criticalCodes.length,8);assert(n.criticalCodes.every(c=>/^[A-Z0-9_]{1,64}$/.test(c)));
    assert.equal(n.criticalCount,60000);
    assert(!JSON.stringify(n).includes('PRIVATE'));assert(!JSON.stringify(n).includes('private text'));assert(!JSON.stringify(n).includes('script'));
    assert.equal(n.recoveryBlocked,true);assert.equal(normalizeCoverage(null).state,'unknown');
    assert.equal(normalizeCoverage({schema:1,state:'no-known-critical-gaps',criticalCodes:['<script>']}).criticalCodes.length,0);
    assert.equal(normalizeCoverage({schema:2,state:'critical-gaps'}).state,'unknown');
  });

  // ---- 4. Canonical /4 independent inspection via the existing CLI ----
  const cli=path.resolve(__dirname,'../assets/migration-cli.cjs');
  const request=path.join(gap.dir,'inspect-request.json');write(request,{zipFile:gapZip});
  const before={size:fs.statSync(gapZip).size,mtimeMs:fs.statSync(gapZip).mtimeMs},entriesBefore=fs.readdirSync(gap.dir).sort();
  const run=cp.spawnSync(process.execPath,[cli,'inspect','--request',request],{encoding:'utf8',windowsHide:true,timeout:120000,env:process.env});
  ok('canonical migration-cli inspect reads a valid /4 ZIP without DSH or recovery directories',()=>{
    assert.equal(run.status,0,run.stderr);const out=JSON.parse(run.stdout.trim());
    assert.equal(out.ok,true);assert.equal(out.result.archiveIntegrity.state,'valid');
    assert.equal(out.result.postRestoreUsability.state,'not-verified');
    assert(out.result.coverage.missing.some(i=>i.code==='CLIENT_PREFERENCE_NOT_CAPTURED'));
    assert.equal(fs.statSync(gapZip).size,before.size);assert.equal(fs.statSync(gapZip).mtimeMs,before.mtimeMs);
    // inspect-request.json is the only allowed new sibling file.
    assert.deepEqual(fs.readdirSync(gap.dir).sort(),entriesBefore);
  });
  { // damaged payload hash is refused
    const corrupt=path.join(gap.dir,'corrupt.zip'),bytes=Buffer.from(fs.readFileSync(gapZip));
    const arc=R.readArchive(gapZip);try{const rec=arc.zip.records.get('profiles/desktop/package.json');assert(rec);bytes[rec.pos]^=1;}finally{arc.zip.close();}
    write(corrupt,bytes);
    const req=path.join(gap.dir,'corrupt-request.json');write(req,{zipFile:corrupt});
    const r=cp.spawnSync(process.execPath,[cli,'inspect','--request',req],{encoding:'utf8',windowsHide:true,timeout:120000,env:process.env});
    ok('damaged /4 payload or manifest is refused by the canonical inspector',()=>{
      const out=JSON.parse(r.stdout.trim());assert.equal(out.ok,false);assert.match(out.code,/^[A-Z0-9_]+$/);
    });
  }

  fs.writeFileSync(path.join(root,'v062-coverage-chain-result.json'),JSON.stringify({status:'PASS',checks,syntheticOnly:true,realHomeUntouched:true},null,2));
  console.log('PASS v0.6.2 coverage chain: '+checks.length+' checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
