const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),z=require('node:zlib');
const root=process.env.DSH_PACKER_TEST_ROOT;if(!root||!path.isAbsolute(root))throw Error('Explicit test root required');
const R=require('../assets/migration-archive.cjs'),E=require('../assets/migration-engine.cjs'),A=require('../assets/migration-data.cjs');
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);};
(async()=>{
 const dir=fs.mkdtempSync(path.join(root,'migration-smoke-')),home=path.join(dir,'source-home'),profile=path.join(home,'profiles/desktop'),workspace=path.join(dir,'old workspace Ω'),out=path.join(dir,'backup.zip');
 fs.mkdirSync(workspace,{recursive:true});write(path.join(profile,'package.json'),JSON.stringify({name:'dsh-profile-desktop',private:true,dependencies:{},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}}));
 write(path.join(profile,'cordis.yml'),'[]\n');write(path.join(profile,'cordis.patch.yml'),'- id: workspace-controller\n  config:\n    documentsDirectory: '+JSON.stringify(workspace)+'\n- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: 2026-09-28.1\n');
 write(path.join(home,'storages/workspace.json'),JSON.stringify({unit:{name:'workspace',version:2},global:null,tables:{workspaces:{sample:{path:workspace,title:'Synthetic',sessionIds:[],createdAt:'2026-11-04T00:00:00.000Z',updatedAt:'2026-11-04T00:00:00.000Z'}}}}));
 const sourceBody=Buffer.from('');const header={type:'session',version:4,id:'00000000-0000-4000-8000-000000000001',createdAt:1,delegationDepth:0,isSeeded:false,cwd:workspace};
 write(path.join(home,'sessions',A.projectKey(workspace),header.id,'session.v4.jsonl.zstd'),z.zstdCompressSync(Buffer.concat([Buffer.from(JSON.stringify(header)+'\n'),sourceBody])));
 const backup=await R.createBackup({homeDir:home,profileDir:profile,target:out,workspaceRoot:workspace,dshVersion:'0.2.1-rc.5',confirmPrivate:true,sourceQuiescent:true});assert.equal(backup.manifest.format,R.FORMAT);
 const plan=await E.plan({zipFile:out,installation:'D:/DeepSeek Harness',workspace:path.join(dir,'NEW workspace 中文')});write(path.join(dir,'plan.json'),JSON.stringify(plan,null,2));assert.deepEqual(plan.issues,[]);assert.equal(plan.canApply,true);
 await E.apply(plan,{confirmPrivate:true,confirmExecution:true});const verified=await E.verify(plan);assert.equal(verified.rounds.length,2);const committed=await E.commit(plan);assert.equal(committed.startupVerified,true);
 const source=R.readArchive(out);try{assert.equal(source.zip.fingerprint(),plan.zipSHA256);}finally{source.zip.close();}
 await E.rollback(plan);assert.equal(E.state(plan).phase,'rolled-back');
 const result={status:'PASS',dir,checks:['format4-backup','real-rc5-host-inspection','session-v4-path-mapping','workspace-v2','actual-target-start-shutdown-restart','verified-commit','rollback'],committed};write(path.join(root,'migration-smoke-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
