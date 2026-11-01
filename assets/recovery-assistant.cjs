#!/usr/bin/env node
'use strict';
// Standalone assistant protocol. Never loads a Profile or starts the Desktop UI.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const C=require('./recovery-core.cjs'),V=require('./verify-private.cjs'),R=require('./restore-private.cjs');
function assertToolPackage() {
  const root=path.dirname(__dirname);C.noLinks(root);
  const pkg=JSON.parse(C.readStable(path.join(root,'package.json')));
  if(pkg.name!=='dsh-environment-packer')C.fail('TRUSTED_TOOL_PACKAGE_REQUIRED');
  for(const name of ['assets/recovery-core.cjs','assets/verify-private.cjs','assets/backup-coverage.cjs','assets/restore-private.cjs','assets/dependency-contract.cjs','assets/host-proof.cjs','assets/provider-runtime.cjs','assets/browser-contract.cjs','vendor/semver/index.js']){
    const file=path.join(root,name);C.noLinks(file);if(!fs.statSync(file).isFile())C.fail('TRUSTED_TOOL_PACKAGE_REQUIRED');
  }
}
function assertFreshTarget(targetHome) {
  C.noLinks(targetHome);
  C.safeName(path.basename(targetHome));
  const official=[path.join(os.homedir(),'.dsh'),process.env.DSH_HOME].filter(Boolean).map(p=>path.resolve(p));
  for(const home of official){const relative=path.relative(home,targetHome);if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))C.fail('OFFICIAL_HOME_REFUSED');}
  if(C.exists(targetHome))C.fail('TARGET_EXISTS');
}
function run(options) {
  assertToolPackage();
  if(options.action==='inspect')return V.inspectBackup({zipFile:options.zipFile});
  if(options.action!=='restore')C.fail('INVALID_ARGUMENT');
  if(options.confirmPrivate!==true)C.fail('PRIVATE_CONFIRMATION_REQUIRED');
  if(!/^[a-f0-9]{64}$/.test(options.expectedZipSHA256||''))C.fail('ZIP_INSPECTION_REQUIRED');
  const dshVersion=V.runtimeDshVersion();assertFreshTarget(options.targetHome);
  // No cached "compatible" Boolean is accepted. The original restorer reopens
  // and verifies the archive, current runtime and host proof before staging.
  return R.restore({...options,dshVersion});
}
function parse(args) {
  const allowed=new Set(['--action','--zip','--home','--zip-sha256','--confirm-private']),values={};
  for(let i=0;i<args.length;i++){const key=args[i];if(!allowed.has(key)||Object.hasOwn(values,key))C.fail('INVALID_ARGUMENT');if(key==='--confirm-private')values[key]=true;else{const value=args[++i];if(!value||value.startsWith('--'))C.fail('INVALID_ARGUMENT');values[key]=value;}}
  if(!['inspect','restore'].includes(values['--action'])||!values['--zip'])C.fail('INVALID_ARGUMENT');
  if(values['--action']==='inspect'&&Object.keys(values).some(k=>!['--action','--zip'].includes(k)))C.fail('INVALID_ARGUMENT');
  if(values['--action']==='restore'&&(!values['--home']||!values['--zip-sha256']))C.fail('MISSING_ARGUMENT');
  return {action:values['--action'],zipFile:values['--zip'],targetHome:values['--home'],expectedZipSHA256:values['--zip-sha256'],confirmPrivate:values['--confirm-private']===true};
}
module.exports={run,parse,assertFreshTarget,assertToolPackage};
if(require.main===module){try{const result=run(parse(process.argv.slice(2)));console.log(JSON.stringify({ok:true,result}));if(result.canRestore===false)process.exitCode=1;}catch(e){console.log(JSON.stringify({ok:false,code:V.code(e)}));process.exitCode=1;}}
