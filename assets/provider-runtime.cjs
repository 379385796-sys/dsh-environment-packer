'use strict';
const semver=require('../vendor/semver'),C=require('./recovery-core.cjs');
function validateProviderRuntime(manifest,runtime,dshVersion) {
  const engines=manifest.engines===undefined?{}:manifest.engines;
  if(!engines||typeof engines!=='object'||Array.isArray(engines))C.fail('HOST_PROVIDER_RUNTIME_MISMATCH');
  for(const [field,actual,options] of [['node',runtime.node,{}],['electron',runtime.electron,{}],['dsh',dshVersion,{includePrerelease:true}]]) {
    const range=engines[field];if(range!==undefined&&(typeof range!=='string'||!range.trim()||!semver.validRange(range)||!semver.satisfies(actual||'',range,options)))C.fail('HOST_PROVIDER_RUNTIME_MISMATCH');
  }
  function target(list,actual){if(list===undefined)return;const values=typeof list==='string'?[list]:list;if(!Array.isArray(values)||values.some(v=>typeof v!=='string'||!/^!?[a-z0-9_-]+$/.test(v)))C.fail('HOST_PROVIDER_RUNTIME_MISMATCH');const positive=values.filter(v=>!v.startsWith('!'));if(values.includes('!'+actual)||values.includes('!any')||(positive.length&&!positive.includes(actual)&&!positive.includes('any')))C.fail('HOST_PROVIDER_RUNTIME_MISMATCH');}
  target(manifest.os,runtime.platform);target(manifest.cpu,runtime.arch);
  return {engines:Object.fromEntries(['node','electron','dsh'].filter(k=>engines[k]!==undefined).map(k=>[k,engines[k]])),os:manifest.os??null,cpu:manifest.cpu??null};
}
module.exports={validateProviderRuntime};
