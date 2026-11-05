'use strict';
// v0.6.2 targeted validation (Codex verdict section 7, item 3).
// Synthetic host evidence only: no real DSH executable is started or inspected.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.DSH_PACKER_TEST_ROOT;if(!root||!path.isAbsolute(root))throw Error('Explicit isolated test root required');
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof b==='string'?b:Buffer.from(JSON.stringify(b)));};
const H=require('../assets/migration-host.cjs');
const installation=path.join(root,'synthetic-dsh-installation');
const fakeHost={
  installation,exe:path.join(installation,'DeepSeek Harness.exe'),version:'0.2.2-rc.1',
  proof:{platform:process.platform,arch:process.arch,node:process.versions.node,nodeModules:process.versions.modules,electron:'39.0.0',providers:[],browserProviders:[],browserSeeds:[]},
  capabilities:{sessionVersion:4,zstd:true,projectKeyV1:true,workspaceV2:true,desktopCli:true}
};
// Replace only host inspection inside this test process. All other plan/engine
// functions (archive validation, dependency contract, layout, toolkit binding)
// are the real implementation.
H.inspect=()=>fakeHost;
const P=require('../assets/migration-plan.cjs'),E=require('../assets/migration-engine.cjs'),R=require('../assets/migration-archive.cjs');
const checks=[];const ok=(n,f)=>{f();checks.push(n);};

function fixture(name,{preference}={}){
  const dir=fs.mkdtempSync(path.join(root,name+'-')),home=path.join(dir,'home'),profile=path.join(home,'profiles/desktop');
  write(path.join(profile,'package.json'),{name:'dsh-profile-desktop',private:true,dependencies:{},dsh:{profile:{bundles:[]}}});
  write(path.join(profile,'node_modules/dsh-chat-comfort/package.json'),{name:'dsh-chat-comfort',version:'1.1.0'});
  fs.mkdirSync(path.join(home,'storages'),{recursive:true});
  const zip=path.join(dir,'backup.zip');
  return {dir,home,profile,zip,options:{homeDir:home,profileDir:profile,target:zip,dshVersion:'0.2.2-rc.1',confirmPrivate:true,sourceQuiescent:true,...(preference?{clientPreferences:preference}:{})}};
}
(async()=>{
  ok('critical predicate is shared and matches verify/commit policy',()=>{
    assert.equal(P.hasUnresolvedCritical([]),false);
    assert.equal(P.hasUnresolvedCritical([{critical:false,state:'unknown'}]),false);
    assert.equal(P.hasUnresolvedCritical([{critical:true,state:'unknown'}]),true);
    assert.equal(P.hasUnresolvedCritical([{state:'blocked'}]),true);
  });

  // A: known critical coverage gap -> plan refuses, apply refuses before writes.
  const a=fixture('v062-apply-gap');await R.createBackup(a.options);
  const gapPlan=await E.plan({zipFile:a.zip,installation,workspace:path.join(a.dir,'Restored-Workspace')});
  ok('critical unknown coverage gap sets canApply=false and is visible in the plan',()=>{
    assert.equal(gapPlan.canApply,false);
    assert(gapPlan.issues.some(i=>i.code==='CLIENT_PREFERENCE_NOT_CAPTURED'&&i.critical===true&&i.state==='unknown'));
    assert.equal(P.hasUnresolvedCritical(gapPlan.issues),true);
    assert.equal(gapPlan.archiveIntegrity.state,'valid');
  });
  await assert.rejects(()=>E.apply(gapPlan,{confirmPrivate:true,confirmExecution:true}),e=>['MIGRATION_PLAN_BLOCKED','CRITICAL_DATA_UNVERIFIED'].includes(e.code));
  ok('apply refuses before creating state/workspace or an activation launcher',()=>{
    assert.equal(fs.existsSync(gapPlan.layout.state),false);
    assert.equal(fs.existsSync(gapPlan.layout.workspace),false);
    assert.equal(fs.existsSync(path.join(gapPlan.layout.state,'Start-Restored-DSH.ps1')),false);
    assert.equal(fs.existsSync(path.join(gapPlan.layout.state,'transaction.json')),false);
  });
  await assert.rejects(()=>E.verify(gapPlan));await assert.rejects(()=>E.commit(gapPlan));
  checks.push('verify/commit remain blocked as defence in depth after the apply refusal');

  // B: an explicitly non-critical issue does not block; clean plan still applies.
  const b=fixture('v062-apply-clean',{preference:{'dsh-chat-comfort.settings.v1':{enabled:true,density:'comfortable'}}});await R.createBackup(b.options);
  const cleanPlan=await E.plan({zipFile:b.zip,installation,workspace:path.join(b.dir,'Restored-Workspace')});
  ok('clean synthetic payload still has canApply=true (existing verification path preserved)',()=>{
    assert.deepEqual(cleanPlan.issues,[]);assert.equal(cleanPlan.canApply,true);
    assert.equal(P.hasUnresolvedCritical(cleanPlan.issues),false);
  });
  // The full clean apply/verify/commit path is covered by the existing
  // migration-smoke.cjs run in this validation round; here we only assert the
  // gate input so no synthetic recovery directory is written by this test.
  assert.equal(E.hasUnresolvedCritical(cleanPlan.issues),false);
  checks.push('clean plan carries no unresolved critical issue for the apply gate');

  fs.writeFileSync(path.join(root,'v062-apply-gate-result.json'),JSON.stringify({status:'PASS',checks,syntheticOnly:true,realHostInspected:false},null,2));
  console.log('PASS v0.6.2 apply gate: '+checks.length+' checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
