#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const C=require('./recovery-core.cjs');
const D=require('./dependency-contract.cjs'),H=require('./host-proof.cjs');
function restore(options) {
  if(options.confirmPrivate!==true) C.fail('PRIVATE_CONFIRMATION_REQUIRED');
  if(process.platform!=='win32') C.fail('RESTORE_WINDOWS_ONLY');
  const {zipFile,targetHome,profileName='desktop',dshVersion}=options;
  C.safeName(profileName); if(profileName.includes('/')) C.fail('PROFILE_NAME_INVALID');
  C.noLinks(zipFile); C.noLinks(targetHome); const parent=path.dirname(targetHome);
  if(C.exists(targetHome)) C.fail('TARGET_EXISTS');
  if(!fs.statSync(parent).isDirectory()) C.fail('TARGET_PARENT_MISSING');
  const parentId=C.identity(fs.statSync(parent)),zip=C.openZip(zipFile); let staging=null;
  try {
    const m=C.validateManifest(zip),c=m.compatibility;
    if(c.dshVersion!==dshVersion||c.platform!==process.platform||c.arch!==process.arch||c.nodeModules!==process.versions.modules||c.nodeMajor!==process.versions.node.split('.')[0]) C.fail('INCOMPATIBLE_RUNTIME');
    const packages=m.files.filter(f=>/\/node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(f.path)).map(f=>{
      let manifest;try{manifest=JSON.parse(zip.get(f.path));}catch{C.fail('INSTALLED_PACKAGE_INVALID');}return {path:f.path,manifest};
    });
    const entries=new Set(m.files.map(f=>f.path));
    D.verifyContract(m,packages,dshVersion,name=>entries.has(name)?zip.get(name):undefined);
    if(m.files.some(f=>f.path.startsWith('home/profiles/'))||m.directories.some(n=>n.startsWith('home/profiles/'))) C.fail('INVALID_MANIFEST_SCOPE');
    staging=fs.mkdtempSync(path.join(parent,'.dsh-restore-')); C.privateAccess(staging,true);
    const dest=n=>n.startsWith('profile/')?path.join(staging,'profiles',profileName,n.slice(8)):path.join(staging,n.slice(5));
    for(const d of m.directories) fs.mkdirSync(dest(d),{recursive:true,mode:0o700});
    let restored=0;
    for(const f of m.files) {
      if(options.signal?.aborted) C.fail('RESTORE_ABORTED');
      const to=dest(f.path); fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o700});
      const fd=fs.openSync(to,'wx',0o600); try { fs.writeFileSync(fd,zip.get(f.path)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      if(C.sha(C.readStable(to))!==f.sha256) C.fail('RESTORE_VERIFY_FAILED'); restored++; options.onFile?.(restored);
    }
    fs.writeFileSync(path.join(staging,'PACKER-RESTORE-RESULT.json'),JSON.stringify({format:m.format,verifiedFiles:restored,status:'verified',dshVersion,requiresStartupValidation:true},null,2),{flag:'wx',mode:0o600});
    C.noLinks(targetHome); if(C.identity(fs.statSync(parent))!==parentId) C.fail('TARGET_IDENTITY_CHANGED');
    if(m.hostRequirements) H.verifyHost(m.hostRequirements,dshVersion);
    if(C.exists(targetHome)) C.fail('TARGET_EXISTS');
    fs.renameSync(staging,targetHome); staging=null;
    return {ok:true,verifiedFiles:restored,requiresStartupValidation:true};
  } catch(e) {
    if(staging) { try { C.noLinks(staging); fs.rmSync(staging,{recursive:true}); } catch { C.fail('RESTORE_CLEANUP_FAILED'); } }
    C.fail(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'RESTORE_FAILED');
  } finally { zip.close(); }
}
module.exports={restore};
if(require.main===module) {
  const args=process.argv.slice(2), allowed=new Set(['--zip','--home','--profile-name','--dsh-version','--confirm-private']);
  try {
    for(let i=0;i<args.length;i++) { if(!allowed.has(args[i])) C.fail('INVALID_ARGUMENT'); if(args[i]!=='--confirm-private') i++; }
    const value=k=>{const i=args.indexOf(k); if(i<0||!args[i+1]||args[i+1].startsWith('--')) C.fail('MISSING_ARGUMENT'); return args[i+1];};
    console.log(JSON.stringify(restore({zipFile:value('--zip'),targetHome:value('--home'),profileName:args.includes('--profile-name')?value('--profile-name'):'desktop',dshVersion:value('--dsh-version'),confirmPrivate:args.includes('--confirm-private')})));
  } catch(e) { console.error(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'RESTORE_FAILED'); process.exitCode=1; }
}
