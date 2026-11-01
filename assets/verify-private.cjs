#!/usr/bin/env node
'use strict';
// Independent, read-only checks. No mkdir, extraction, Profile loader or install.
const fs=require('node:fs'),path=require('node:path');
const C=require('./recovery-core.cjs'),D=require('./dependency-contract.cjs');
const {coverageReport}=require('./backup-coverage.cjs');
const code=e=>/^[A-Z0-9_]{1,100}$/.test(e?.code||'')?e.code:'BACKUP_CHECK_FAILED';
function validateArchive(zip) {
  let header;try{header=JSON.parse(zip.get('manifest.json').toString('utf8'));}catch(e){C.fail(e.code||'INVALID_MANIFEST');}
  if(typeof header?.format==='string'&&!['dsh-private-recovery/2','dsh-private-recovery/3'].includes(header.format))C.fail('UNSUPPORTED_RECOVERY_FORMAT');
  const m=C.validateManifest(zip);
  if(m.files.some(f=>f.path.startsWith('home/profiles/'))||m.directories.some(n=>n.startsWith('home/profiles/')))C.fail('INVALID_MANIFEST_SCOPE');
  return m;
}
function assertCompatibility(m,zip,dshVersion) {
  const c=m.compatibility;
  if(c.dshVersion!==dshVersion||c.platform!==process.platform||c.arch!==process.arch||c.nodeModules!==process.versions.modules||c.nodeMajor!==process.versions.node.split('.')[0])C.fail('INCOMPATIBLE_RUNTIME');
  const packages=m.files.filter(f=>/\/node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(f.path)).map(f=>{
    let manifest;try{manifest=JSON.parse(zip.get(f.path));}catch{C.fail('INSTALLED_PACKAGE_INVALID');}return {path:f.path,manifest};
  });
  const entries=new Set(m.files.map(f=>f.path));
  return D.verifyContract(m,packages,dshVersion,name=>entries.has(name)?zip.get(name):undefined);
}
function runtimeDshVersion() {
  if(process.platform!=='win32'||!process.versions.electron)C.fail('HOST_DESKTOP_REQUIRED');
  const root=path.join(path.dirname(process.execPath),'resources/app.asar');
  let app,dsh;try{app=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));dsh=JSON.parse(fs.readFileSync(path.join(root,'dsh/node_modules/@deepseek-ai/dsh/package.json'),'utf8'));}catch{C.fail('HOST_SOURCE_UNTRUSTED');}
  if(dsh.name!=='@deepseek-ai/dsh'||app.version!==dsh.version||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(app.version||''))C.fail('HOST_SOURCE_UNTRUSTED');
  return app.version;
}
function inspectBackup({zipFile,dshVersion}={}) {
  const report={archiveIntegrity:{state:'invalid'},recoveryCompatibility:{state:'not-checked',code:'ARCHIVE_REQUIRED'},postRestoreUsability:{state:'not-verified',requiresStartupValidation:true},canRestore:false};
  let zip;
  try {
    zip=C.openZip(zipFile);const m=validateArchive(zip),sha256=zip.fingerprint();
    report.archiveIntegrity={state:'valid',sha256,files:m.files.length,bytes:m.files.reduce((n,f)=>n+f.bytes,0)};
    const short=v=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,'').slice(0,128):null;
    report.backup={format:m.format,createdAt:short(m.createdAt),packerVersion:short(m.packerVersion),dshVersion:short(m.compatibility.dshVersion),platform:short(m.compatibility.platform),arch:short(m.compatibility.arch),nodeMajor:short(m.compatibility.nodeMajor),nodeModules:short(m.compatibility.nodeModules),requiresHostProof:m.format==='dsh-private-recovery/3'};
    report.coverage=coverageReport(m);
    if(!dshVersion){try{dshVersion=runtimeDshVersion();}catch(e){report.recoveryCompatibility={state:'unavailable',code:code(e),dependencyContract:'not-checked'};return report;}}
    try {
      assertCompatibility(m,zip,dshVersion);
      report.recoveryCompatibility={state:'compatible',dependencyContract:'verified',hostProof:m.format==='dsh-private-recovery/3'?'verified':'not-recorded-in-format-2'};report.canRestore=true;
    }catch(e){report.recoveryCompatibility={state:'blocked',code:code(e),dependencyContract:'not-satisfied'};}
    zip.assertUnchanged();
  }catch(e){report.archiveIntegrity={state:['UNSUPPORTED_RECOVERY_FORMAT','UNSUPPORTED_ZIP'].includes(e.code)?'unsupported':'invalid',code:code(e)};report.recoveryCompatibility={state:'not-checked',code:'ARCHIVE_INVALID'};report.canRestore=false;}
  finally{zip?.close();}
  return report;
}
module.exports={validateArchive,assertCompatibility,runtimeDshVersion,inspectBackup,code};
if(require.main===module){
  try{const args=process.argv.slice(2),allowed=new Set(['--zip','--dsh-version']);for(let i=0;i<args.length;i+=2)if(!allowed.has(args[i])||!args[i+1]||args[i+1].startsWith('--')||args.indexOf(args[i])!==i)C.fail('INVALID_ARGUMENT');const get=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1]};if(!get('--zip'))C.fail('MISSING_ARGUMENT');const result=inspectBackup({zipFile:get('--zip'),dshVersion:get('--dsh-version')});console.log(JSON.stringify(result));if(!result.canRestore)process.exitCode=1;}
  catch(e){console.log(JSON.stringify({archiveIntegrity:{state:'not-checked',code:code(e)},recoveryCompatibility:{state:'not-checked'},postRestoreUsability:{state:'not-verified'},canRestore:false}));process.exitCode=1;}
}
