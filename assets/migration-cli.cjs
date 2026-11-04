#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),C=require('./recovery-core.cjs');
async function run(action,request){
  if(action==='host')return require('./migration-host.cjs').inspect(request.installation,request.names);
  const E=require('./migration-engine.cjs');if(action==='inspect')return E.inspect(request);if(action==='plan')return E.plan(request);
  if(['apply','verify','commit','rollback'].includes(action))return E[action](request.plan,request);
  if(action==='restore'){
    const p=request.plan;try{await E.apply(p,request);await E.verify(p);return await E.commit(p);}catch(e){if(fs.existsSync(path.join(p.layout.state,'transaction.json')))await E.rollback(p);throw e;}
  }C.fail('INVALID_ARGUMENT');
}
module.exports={run};
if(require.main===module)(async()=>{try{
  const [action,flag,input,...rest]=process.argv.slice(2);let request;
  if(action==='host'&&flag&&input===undefined)request=JSON.parse(Buffer.from(flag,'base64'));
  else{if(flag!=='--request'||!input||rest.length)C.fail('INVALID_ARGUMENT');C.noLinks(path.resolve(input));request=JSON.parse(C.readStable(path.resolve(input)).toString('utf8').replace(/^\uFEFF/,''));}
  const result=await run(action,request);console.log(JSON.stringify({ok:true,result}));
}catch(e){console.log(JSON.stringify({ok:false,code:/^[A-Z0-9_]{1,100}$/.test(e.code||'')?e.code:'MIGRATION_FAILED'}));process.exitCode=1;}})();
