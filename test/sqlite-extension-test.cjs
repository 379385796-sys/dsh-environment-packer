'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../assets/migration-plan.cjs');
const base=process.env.DSH_PACKER_TEST_ROOT;if(!base||!path.isAbsolute(base))throw Error('Explicit isolated root required');
(async()=>{
  const bytes=Buffer.concat([Buffer.from('SQLite format 3\0'),Buffer.alloc(100)]),checks=[];
  for(const suffix of ['db','sqlite','sqlite3','SQLITE']){
    const name='workspaces/memory/data/unclassified.'+suffix;
    const result=await P.scanData({manifest:{roots:[],files:[{path:name}]},zip:{get:()=>bytes}});
    assert(result.issues.some(i=>i.code==='DATABASE_SCHEMA_UNKNOWN'&&i.path===name&&i.critical));
    assert(result.datasets.some(d=>d.path===name&&d.adapter==='sqlite-preserve'&&d.state==='unknown'));
    checks.push('unknown '+suffix+' database remains critical');
  }
  const name='workspaces/memory/data/store/mnemon.db';
  const known=await P.scanData({manifest:{roots:[],tools:[{name:'mnemon'}],files:[{path:name}]},zip:{get:()=>bytes}});
  assert.equal(known.datasets[0].state,'requires-owner-validation');
  assert.equal(known.issues.length,0);checks.push('known Mnemon database still requires owner validation');
  const dependency=await P.scanData({manifest:{roots:[],files:[{path:'profiles/desktop/node_modules/example/test.sqlite'}]},zip:{get:()=>bytes}});
  assert.equal(dependency.datasets.length,0);checks.push('dependency payload remains outside user database classification');
  fs.writeFileSync(path.join(base,'sqlite-extension-result.json'),JSON.stringify({status:'PASS',checks},null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
