const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),E=require('../assets/migration-engine.cjs');
const root=process.env.DSH_PACKER_TEST_ROOT;if(!root)throw Error('Explicit isolated root required');
(async()=>{
 const source=JSON.parse(fs.readFileSync(path.join(root,'migration-smoke-result.json'))),installation=path.join(root,'rc5-install-copy'),workspace=path.join(root,'Different installation and workspace Ω');
 const p=await E.plan({zipFile:path.join(source.dir,'backup.zip'),installation,workspace});assert.equal(p.host.version,'0.2.1-rc.5');assert.notEqual(p.host.installation,'D:/DeepSeek Harness');assert.deepEqual(p.issues,[]);await E.apply(p,{confirmPrivate:true,confirmExecution:true});const verified=await E.verify(p),result=await E.commit(p);
 const report={status:'PASS',installationCopiedOnlyForTesting:true,installerNotPacked:true,sameRealVersionDifferentInstallationPath:true,rounds:verified.rounds,result};fs.writeFileSync(path.join(root,'migration-install-path-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
