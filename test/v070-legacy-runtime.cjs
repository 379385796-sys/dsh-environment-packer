// Real /2 fixture under the WPF worker's runtime; standalone Node ABI differs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=process.env.DSH_PACKER_TEST_ROOT;assert(root&&path.isAbsolute(root));assert(process.versions.electron);
 const run=fs.mkdtempSync(path.join(root,'v070-legacy-runtime-')),home=path.join(run,'home'),profile=path.join(home,'profiles/synthetic');fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'synthetic',private:true,dependencies:{}}));fs.writeFileSync(path.join(home,'.credentials.yaml'),'synthetic: not-a-real-credential\n');
 const {createPrivateBackup}=await import('../lib/private-backup.js'),V=require('../assets/verify-private.cjs'),version=V.runtimeDshVersion(),zip=path.join(run,'legacy.zip');
 const backup=createPrivateBackup({homeDir:home,profileDir:profile,target:zip,dshVersion:version,confirmPrivate:true,sourceQuiescent:true});assert.equal(backup.manifest.format,'dsh-private-recovery/2');assert.equal(V.inspectBackup({zipFile:zip}).canRestore,true);
 fs.writeFileSync(path.join(root,'wpf-legacy-state.json'),JSON.stringify({zip,version,run,syntheticOnly:true,runtime:{node:process.versions.node,abi:process.versions.modules}}));console.log('PASS exact-runtime legacy archive fixture');
})().catch(e=>{console.error(e);process.exitCode=1});
