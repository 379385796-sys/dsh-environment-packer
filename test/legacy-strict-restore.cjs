const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.DSH_PACKER_TEST_ROOT;if(!root||!path.isAbsolute(root))throw Error('Explicit test root required');
const V=require('../assets/verify-private.cjs'),R=require('../assets/restore-private.cjs');
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof b==='string'?b:Buffer.from(JSON.stringify(b)));};
(async()=>{
  const {createPrivateBackup}=await import('../lib/private-backup.js');
  const dir=fs.mkdtempSync(path.join(root,'legacy-strict-')),home=path.join(dir,'home'),profile=path.join(home,'profiles/desktop'),zip=path.join(dir,'private.zip');
  write(path.join(profile,'package.json'),{name:'synthetic-profile',private:true,dependencies:{'synthetic-alpha':'1.0.0'},dsh:{profile:{bundles:[]}}});
  write(path.join(profile,'node_modules/synthetic-alpha/package.json'),{name:'synthetic-alpha',version:'1.0.0'});
  write(path.join(profile,'node_modules/synthetic-alpha/index.js'),'module.exports={ok:true};\n');
  write(path.join(profile,'cordis.yml'),'[]\n');
  write(path.join(home,'storages/workspace.json'),{unit:{name:'workspace',version:2},global:null,tables:{workspaces:{}}});
  const backup=createPrivateBackup({profileDir:profile,homeDir:home,target:zip,dshVersion:'0.2.2-rc.1',confirmPrivate:true,sourceQuiescent:true});
  assert.equal(backup.manifest.format,'dsh-private-recovery/2');
  const inspected=V.inspectBackup({zipFile:zip,dshVersion:'0.2.2-rc.1'});
  assert.equal(inspected.archiveIntegrity.state,'valid');
  assert.equal(inspected.recoveryCompatibility.state,'compatible');
  assert.equal(inspected.canRestore,true);
  const restoredHome=path.join(dir,'restored-home');
  const restored=R.restore({zipFile:zip,targetHome:restoredHome,dshVersion:'0.2.2-rc.1',confirmPrivate:true,expectedZipSHA256:backup.sha256});
  assert.equal(restored.verifiedFiles,backup.files);
  assert.equal(fs.readFileSync(path.join(restoredHome,'profiles/desktop/node_modules/synthetic-alpha/index.js'),'utf8'),'module.exports={ok:true};\n');

  // Strict runtime/source gates stay intact.
  const incompatible=V.inspectBackup({zipFile:zip,dshVersion:'0.2.1-rc.5'});
  assert.equal(incompatible.recoveryCompatibility.code,'INCOMPATIBLE_RUNTIME');
  assert.equal(incompatible.canRestore,false);
  assert.throws(()=>R.restore({zipFile:zip,targetHome:path.join(dir,'wrong-runtime'),dshVersion:'0.2.1-rc.5',confirmPrivate:true,expectedZipSHA256:backup.sha256}),e=>e.code==='INCOMPATIBLE_RUNTIME');
  assert.throws(()=>R.restore({zipFile:zip,targetHome:restoredHome,dshVersion:'0.2.2-rc.1',confirmPrivate:true,expectedZipSHA256:backup.sha256}),e=>e.code==='TARGET_EXISTS');
  assert.throws(()=>R.restore({zipFile:zip,targetHome:path.join(dir,'no-consent'),dshVersion:'0.2.2-rc.1',confirmPrivate:false,expectedZipSHA256:backup.sha256}),e=>e.code==='PRIVATE_CONFIRMATION_REQUIRED');
  assert.throws(()=>R.restore({zipFile:zip,targetHome:path.join(dir,'wrong-sha'),dshVersion:'0.2.2-rc.1',confirmPrivate:true,expectedZipSHA256:'0'.repeat(64)}),e=>e.code==='ARCHIVE_CHANGED');

  // A mutated payload is rejected before a target is created.
  const tampered=path.join(dir,'tampered.zip'),bytes=fs.readFileSync(zip);
  bytes[Math.floor(bytes.length/2)]^=0xff;fs.writeFileSync(tampered,bytes);
  const bad=V.inspectBackup({zipFile:tampered,dshVersion:'0.2.2-rc.1'});
  assert.equal(bad.canRestore,false);
  assert.notEqual(bad.archiveIntegrity.state,'valid');
  const badTarget=path.join(dir,'tampered-home');
  assert.throws(()=>R.restore({zipFile:tampered,targetHome:badTarget,dshVersion:'0.2.2-rc.1',confirmPrivate:true}),()=>true);
  assert.equal(fs.existsSync(badTarget),false);

  fs.writeFileSync(path.join(root,'legacy-strict-restore-result.json'),JSON.stringify({status:'PASS',checks:['format2 backup+inspect+restore','exact runtime gate','no-overwrite gate','private consent gate','zip SHA binding','tampered payload rejected before target creation'],syntheticOnly:true},null,2));
  console.log('PASS legacy strict restore: format2 inspect/restore plus runtime, consent, no-overwrite, SHA and tamper gates');
})().catch(e=>{console.error(e);process.exitCode=1;});
