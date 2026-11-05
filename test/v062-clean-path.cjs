'use strict';
// v0.6.2 targeted validation (Codex verdict section 7, item 3, second half).
// Confirms a supported clean payload still reaches the original verification
// path. Stops at commit: rollback is covered by migration-faults.cjs and is
// intentionally blocked when the formal DSH writers are running.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),z=require('node:zlib');
const root=process.env.DSH_PACKER_TEST_ROOT;if(!root||!path.isAbsolute(root))throw Error('Explicit isolated test root required');
const R=require('../assets/migration-archive.cjs'),E=require('../assets/migration-engine.cjs'),A=require('../assets/migration-data.cjs');
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);};
(async()=>{
 const dir=fs.mkdtempSync(path.join(root,'v062-clean-path-')),home=path.join(dir,'source-home'),profile=path.join(home,'profiles/desktop'),workspace=path.join(dir,'old workspace'),out=path.join(dir,'backup.zip');
 fs.mkdirSync(workspace,{recursive:true});
 write(path.join(profile,'package.json'),JSON.stringify({name:'dsh-profile-desktop',private:true,dependencies:{},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}}));
 write(path.join(profile,'cordis.yml'),'[]\n');
 write(path.join(profile,'cordis.patch.yml'),'- id: workspace-controller\n  config:\n    documentsDirectory: '+JSON.stringify(workspace)+'\n');
 write(path.join(home,'storages/workspace.json'),JSON.stringify({unit:{name:'workspace',version:2},global:null,tables:{workspaces:{sample:{path:workspace,title:'Synthetic',sessionIds:[],createdAt:'2026-11-05T00:00:00.000Z',updatedAt:'2026-11-05T00:00:00.000Z'}}}}));
 const header={type:'session',version:4,id:'00000000-0000-4000-8000-000000000002',createdAt:1,delegationDepth:0,isSeeded:false,cwd:workspace};
 write(path.join(home,'sessions',A.projectKey(workspace),header.id,'session.v4.jsonl.zstd'),z.zstdCompressSync(Buffer.from(JSON.stringify(header)+'\n')));
 // No comfort plugin is installed in this fixture, so an absent field is not a
 // gap. Explicit preference byte-accuracy is covered by v062-coverage-chain.cjs.
 const backup=await R.createBackup({homeDir:home,profileDir:profile,target:out,workspaceRoot:workspace,dshVersion:'0.2.1-rc.5',confirmPrivate:true,sourceQuiescent:true});
 assert.equal(backup.coverageSummary.state,'no-known-critical-gaps');
 const plan=await E.plan({zipFile:out,installation:'D:/DeepSeek Harness',workspace:path.join(dir,'NEW workspace')});
 assert.deepEqual(plan.issues,[]);assert.equal(plan.canApply,true);
 await E.apply(plan,{confirmPrivate:true,confirmExecution:true});
 const verified=await E.verify(plan);assert.equal(verified.rounds.length,2);
 const committed=await E.commit(plan);assert.equal(committed.startupVerified,true);assert.equal(committed.status,'committed');
 assert(fs.existsSync(path.join(plan.layout.state,'Start-Restored-DSH.ps1')));
 assert.equal(JSON.parse(fs.readFileSync(path.join(plan.layout.state,'transaction.json'),'utf8')).phase,'committed');
 const result={status:'PASS',dir,checks:['clean /4 archive has no critical gaps','canApply stays true for supported payload','apply stages files','verify performs two real isolated runtime rounds','commit publishes guarded launcher','no critical precheck regression'],committed:{status:committed.status,startupVerified:committed.startupVerified},syntheticOnly:true,rollbackNotRun:'formal DSH writers running; rollback is an unchanged designed safety gate'};
 fs.writeFileSync(path.join(root,'v062-clean-path-result.json'),JSON.stringify(result,null,2));
 console.log('PASS v0.6.2 clean path: '+result.checks.length+' checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
