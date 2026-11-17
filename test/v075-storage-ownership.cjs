'use strict';
// Positive and negative proof for storage-domain classification and for the
// staged-medium verification that replaced the boot-time owner-only gate.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../assets/migration-plan.cjs'),R=require('../assets/migration-runtime.cjs');
const results=[];
const test=(name,fn)=>{fn();results.push({name,status:'PASS'});};
const json=value=>Buffer.from(JSON.stringify(value));
const files=list=>list.map(([p,value])=>({path:p}));
const reader=map=>f=>{const value=map[f.path];if(value===undefined)throw Error('MISSING_FIXTURE_FILE');return Buffer.isBuffer(value)?value:typeof value==='string'?Buffer.from(value):json(value);};
const classify=(entries,issues=[])=>({units:P.classifyStorage(files(entries),reader(Object.fromEntries(entries)),issues),issues});
const expectCode=(fn,code)=>assert.throws(fn,error=>error&&error.message===code,`expected ${code}`);

test('single unit with a unit header is a storage domain',()=>{
  const {units}=classify([['home-data/storages/workspace.json',{unit:{name:'workspace',version:2},global:{initialized:true},tables:{workspaces:{a:{path:'x'},b:{path:'y'}}}}]]);
  assert.deepEqual(units,[{name:'workspace',version:2,layout:'single',records:2,source:'home-data/storages/workspace.json',critical:true}]);
});
test('legacy whole-unit file at the documented top-level path is kept',()=>{
  const {units}=classify([['home-data/storages/token_total_history.json',{version:1,value:{total:5}}]]);
  assert.equal(units.length,1);assert.equal(units[0].name,'token_total_history');assert.equal(units[0].layout,'single-legacy');assert.equal(units[0].version,1);
});
test('plugin cache files no longer invent a phantom domain (cost-meter regression)',()=>{
  const cache={version:2,key:'k',generatedAt:'x',source:'y',value:{rows:[]}};
  assert.equal(cache.version,2);assert.ok(Object.hasOwn(cache,'value'));
  const {units,issues}=classify([
    ['home-data/storages/cost-meter/billion-context-bridge.json',{protocol:1,root:'C:/x'}],
    ['home-data/storages/cost-meter/ledger.json',{version:1,config:{},value:[1,2]}],
    ['home-data/storages/cost-meter/ledger.json.details-cache/abc.json',cache],
    ['home-data/storages/cost-meter/ledger.json.details-cache/calls/abc/def.jsonl',{version:2,value:1}],
    ['home-data/storages/anime-schedule/subjects/456078.json',{id:456078}],
    ['home-data/storages/dsh-context/index.json',{version:3,value:'plugin-private'}]
  ]);
  assert.deepEqual(units,[],'plugin-private data must not become a critical storage domain');
  assert.deepEqual(issues,[]);
});
test('per-record unit is recognised from global.json and table documents',()=>{
  const {units}=classify([
    ['home-data/storages/schedule/global.json',{version:2,record:{defaultView:'week'}}],
    ['home-data/storages/schedule/tasks/a.json',{version:2,record:{id:'a'}}],
    ['home-data/storages/schedule/tasks/b.json',{version:2,record:{id:'b'}}],
    ['home-data/storages/schedule/notes/readme.txt','SYNTHETIC']
  ]);
  assert.equal(units.length,1);assert.equal(units[0].name,'schedule');assert.equal(units[0].layout,'per-record');assert.equal(units[0].version,2);assert.equal(units[0].records,2);
});
test('damaged top-level storage JSON and identity drift stay critical',()=>{
  const issues=[];
  const {units}=classify([
    ['home-data/storages/broken.json','{not json'],
    ['home-data/storages/workspace.json',{unit:{name:'other',version:2},tables:{}}]
  ],issues);
  assert.deepEqual(units,[],'unreadable or foreign units are never silently accepted');
  assert.deepEqual(issues.map(i=>i.code).sort(),['STORAGE_JSON_INVALID','STORAGE_UNIT_IDENTITY_MISMATCH']);
  assert.ok(issues.every(i=>i.critical===true));
});
test('session_projcache stays non-critical and per-record wins over a legacy file',()=>{
  const {units}=classify([
    ['home-data/storages/session_projcache.json',{unit:{name:'session_projcache',version:1},tables:{}}],
    ['home-data/storages/schedule.json',{version:1,value:{old:true}}],
    ['home-data/storages/schedule/global.json',{version:2,record:{}}]
  ]);
  assert.equal(units.find(u=>u.name==='session_projcache').critical,false);
  assert.equal(units.find(u=>u.name==='schedule').layout,'per-record');
  assert.equal(units.find(u=>u.name==='schedule').version,2);
});

const home=fs.mkdtempSync(path.join(process.env.DSH_PACKER_TEST_ROOT||os.tmpdir(),'storage-medium-'));
const write=(rel,value)=>{const file=path.join(home,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.isBuffer(value)?value:JSON.stringify(value));};
write('storages/workspace.json',{unit:{name:'workspace',version:2},global:{},tables:{workspaces:{a:{path:'x'}}}});
write('storages/schedule/global.json',{version:2,record:{}});
write('storages/schedule/tasks/a.json',{version:2,record:{id:'a'}});

test('valid single and per-record media pass without any live owner',()=>{
  const verified=R.verifyStorageMediums(home,[{name:'workspace',version:2,critical:true},{name:'schedule',version:2,critical:true,layout:'per-record'}]);
  assert.deepEqual(verified.map(v=>[v.name,v.layout,v.version,v.records]),[['workspace','single',2,1],['schedule','per-record',2,1]]);
});
test('missing medium is still STORAGE_OWNER_UNAVAILABLE',()=>{
  expectCode(()=>R.verifyStorageMediums(home,[{name:'dsh_prompt',version:0,critical:true}]),'STORAGE_OWNER_UNAVAILABLE');
  fs.mkdirSync(path.join(home,'storages/empty-unit'));
  expectCode(()=>R.verifyStorageMediums(home,[{name:'empty-unit',version:1,critical:true}]),'STORAGE_OWNER_UNAVAILABLE');
});
test('damaged, foreign or version-drifted data cannot masquerade as a lazy owner',()=>{
  write('storages/broken.json',Buffer.from('{"unit":{"name":"broken","version":1},'));
  expectCode(()=>R.verifyStorageMediums(home,[{name:'broken',version:1,critical:true}]),'STORAGE_DATA_INVALID');
  write('storages/foreign.json',{unit:{name:'someone-else',version:1},tables:{}});
  expectCode(()=>R.verifyStorageMediums(home,[{name:'foreign',version:1,critical:true}]),'STORAGE_UNIT_IDENTITY_MISMATCH');
  expectCode(()=>R.verifyStorageMediums(home,[{name:'workspace',version:3,critical:true}]),'STORAGE_VERSION_UNSUPPORTED');
  write('storages/schedule/tasks/b.json',{version:1,record:{id:'b'}});
  expectCode(()=>R.verifyStorageMediums(home,[{name:'schedule',version:2,critical:true,layout:'per-record'}]),'STORAGE_VERSION_UNSUPPORTED');
  write('storages/schedule/tasks/b.json',{version:2,record:{id:'b'}});
  write('storages/schedule/tasks/c.json',{version:2,notARecord:true});
  expectCode(()=>R.verifyStorageMediums(home,[{name:'schedule',version:2,critical:true,layout:'per-record'}]),'STORAGE_DATA_INVALID');
  assert.equal(R.verifyStorageMediums(home,[{name:'workspace',version:2,critical:false}]).length,0,'non-critical domains are reported but not gated');
});

// Optional real-archive proof: set DSH_PACKER_REAL_ARCHIVE to the accepted ZIP.
(async()=>{
  if(process.env.DSH_PACKER_REAL_ARCHIVE){
    const R4=require('../assets/migration-archive.cjs');
    const arc=R4.readArchive(process.env.DSH_PACKER_REAL_ARCHIVE);
    try{
      const scan=await P.scanData(arc),names=scan.storage.map(s=>s.name);
      assert.deepEqual(names,['archive_manager_favorites','dsh_prompt','schedule','session_projcache','session_projcache_archive_manager_v2','token_total_history','workspace']);
      assert.deepEqual(scan.storage.filter(s=>s.critical).map(s=>s.name),['archive_manager_favorites','dsh_prompt','schedule','token_total_history','workspace']);
      assert.ok(scan.storage.filter(s=>!s.critical).every(s=>s.name.startsWith('session_projcache')&&s.layout==='per-record'));
      assert.ok(!names.includes('cost-meter'),'the cost-meter details cache is not a domain');
      console.log(JSON.stringify({status:'PASS',checks:results.length,realArchive:{units:names,versions:scan.storage.map(s=>s.version),issues:scan.issues.map(i=>i.code)}}));
    }finally{arc.zip.close();}
  }else console.log(JSON.stringify({status:'PASS',checks:results.length,realArchive:'skipped (set DSH_PACKER_REAL_ARCHIVE)'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
