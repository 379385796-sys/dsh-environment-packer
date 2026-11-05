const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.DSH_PACKER_TEST_ROOT;if(!root||!path.isAbsolute(root))throw Error('Explicit test root required');
const R=require('../assets/migration-archive.cjs'),P=require('../assets/migration-plan.cjs'),D=require('../assets/dependency-contract.cjs');
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof b==='string'?b:Buffer.from(JSON.stringify(b)));};
function fixture(name,{schemastery='3.18.5',broken=false}={}){
  const dir=fs.mkdtempSync(path.join(root,name+'-')),home=path.join(dir,'home'),profile=path.join(home,'profiles/desktop');
  write(path.join(profile,'package.json'),{name:'dsh-profile-desktop',private:true,dependencies:{'dsh-rewind-plugin':'1.0.0','@deepseek-ai/schemastery':schemastery,...(broken?{'broken-plugin':'1.0.0'}:{})},dsh:{profile:{bundles:[]}}});
  write(path.join(profile,'node_modules/dsh-rewind-plugin/package.json'),{name:'dsh-rewind-plugin',version:'1.0.0',peerDependencies:{'@deepseek-ai/schemastery':'^3.19.0'},peerDependenciesMeta:{'@deepseek-ai/schemastery':{optional:true}},engines:{dsh:'>=0.2.2-rc.1 <0.3.0-0'}});
  write(path.join(profile,'node_modules/dsh-rewind-plugin/index.js'),'module.exports={};\n');
  write(path.join(profile,'node_modules/@deepseek-ai/schemastery/package.json'),{name:'@deepseek-ai/schemastery',version:schemastery});
  write(path.join(profile,'node_modules/@deepseek-ai/schemastery/index.js'),'module.exports={};\n');
  if(broken){write(path.join(profile,'node_modules/broken-plugin/package.json'),{name:'broken-plugin',version:'not-a-version'});write(path.join(profile,'node_modules/broken-plugin/index.js'),'module.exports={};\n');}
  fs.mkdirSync(path.join(home,'storages'),{recursive:true});
  return {dir,home,profile};
}
const fakeHost={version:'0.2.2-rc.1',proof:{platform:process.platform,arch:process.arch,node:process.versions.node,nodeModules:process.versions.modules,electron:'39.0.0',providers:[],browserProviders:[],browserSeeds:[]},capabilities:{sessionVersion:4,zstd:true,projectKeyV1:true,workspaceV2:true}};
(async()=>{
  // 1. The real rewind/schemastery shape: recovery/4 archives a readable tree.
  const f=fixture('dependency-gate');
  const out=path.join(f.dir,'backup.zip');
  const backup=await R.createBackup({homeDir:f.home,profileDir:f.profile,target:out,dshVersion:'0.2.2-rc.1',confirmPrivate:true,sourceQuiescent:true});
  assert.equal(fs.existsSync(out),true);
  assert.equal(backup.manifest.format,'dsh-private-recovery/4');
  assert.equal(backup.dependencyIssueCount,1);
  assert.equal(backup.manifest.compatibility.dependencyIssueCount,1);
  assert.equal(backup.manifest.compatibility.truncated,false);
  assert.equal(backup.manifest.compatibility.dependencyIssues[0].code,'PEER_VERSION_MISMATCH');
  assert.equal(backup.manifest.compatibility.dependencyIssues[0].package,'dsh-rewind-plugin');
  assert.equal(backup.manifest.compatibility.dependencyIssues[0].name,'@deepseek-ai/schemastery');
  assert.equal(backup.manifest.compatibility.dependencyIssues[0].range,'^3.19.0');
  assert.equal(backup.manifest.compatibility.dependencyIssues[0].actual,'3.18.5');
  assert.equal(backup.manifest.compatibility.dependencyIssues[0].state,'recorded');

  // 2. Restore re-evaluates the same contract and still blocks the unresolved conflict.
  const arc=R.readArchive(out);
  try{
    const packages=P.packageRecords(arc),compat=P.compatibility(arc.manifest,packages,fakeHost,name=>{const f=arc.manifest.files.find(x=>x.path===name);return f?arc.zip.get(f.path):undefined;});
    assert(compat.issues.some(i=>i.code==='PEER_VERSION_MISMATCH'&&i.state==='blocked'&&i.critical===true));
    assert.equal(!compat.issues.some(i=>i.state==='blocked'),false,'restore must not be applicable');
  }finally{arc.zip.close();}

  // 3. recovery/2 and recovery/3 keep their strict backup gate.
  const {createPrivateBackup}=await import('../lib/private-backup.js');
  await assert.rejects(async()=>createPrivateBackup({profileDir:f.profile,homeDir:f.home,target:path.join(f.dir,'legacy.zip'),dshVersion:'0.2.2-rc.1',confirmPrivate:true,sourceQuiescent:true}),e=>e.code==='PEER_VERSION_MISMATCH');
  assert.equal(fs.existsSync(path.join(f.dir,'legacy.zip')),false);

  // 4. Malformed package metadata is not a version conflict: fail before writing.
  const b=fixture('dependency-structural',{broken:true});
  await assert.rejects(R.createBackup({homeDir:b.home,profileDir:b.profile,target:path.join(b.dir,'broken.zip'),dshVersion:'0.2.2-rc.1',confirmPrivate:true,sourceQuiescent:true}),e=>e.code==='INSTALLED_PACKAGE_INVALID');
  assert.equal(fs.existsSync(path.join(b.dir,'broken.zip')),false);

  // 5. A satisfied peer records zero conflicts.
  const c=fixture('dependency-clean',{schemastery:'3.19.0'}),clean=await R.createBackup({homeDir:c.home,profileDir:c.profile,target:path.join(c.dir,'clean.zip'),dshVersion:'0.2.2-rc.1',confirmPrivate:true,sourceQuiescent:true});
  assert.equal(clean.dependencyIssueCount,0);
  assert.deepEqual(clean.manifest.compatibility.dependencyIssues,[]);

  // 6. The analyzer itself still reports the same real conflict (no global relaxation).
  const check=D.analyze([{path:'profiles/desktop/node_modules/dsh-rewind-plugin/package.json',manifest:{name:'dsh-rewind-plugin',version:'1.0.0',peerDependencies:{'@deepseek-ai/schemastery':'^3.19.0'},peerDependenciesMeta:{'@deepseek-ai/schemastery':{optional:true}}}},{path:'profiles/desktop/node_modules/@deepseek-ai/schemastery/package.json',manifest:{name:'@deepseek-ai/schemastery',version:'3.18.5'}}],{dshVersion:'0.2.2-rc.1'});
  assert(check.issues.some(i=>i.code==='PEER_VERSION_MISMATCH'));

  fs.writeFileSync(path.join(root,'migration-dependency-gate-result.json'),JSON.stringify({status:'PASS',checks:['recovery/4 archives and records the real peer conflict','restore re-analysis still blocks the conflict','recovery/2+3 strict backup gate unchanged','malformed package metadata still fails before writing','clean peer records zero conflicts','dependency analyzer not globally relaxed'],syntheticOnly:true},null,2));
  console.log('PASS recovery/4 dependency gate: archive records real conflicts; restore stays strict; recovery/2+3 unchanged');
})().catch(e=>{console.error(e);process.exitCode=1;});
