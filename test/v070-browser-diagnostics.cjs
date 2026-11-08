'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
const browser=path.resolve(__dirname,'../assets/browser-contract.cjs');
const fixture=`const B=require(${JSON.stringify(browser)});const root='profile/node_modules/synthetic/';const pkg={path:root+'package.json',manifest:{name:'synthetic',dsh:{client:{platform:'web'}},exports:{'.':'./index.js','./client':'./client.js'}}};const files=new Map([[root+'index.js',Buffer.from('export const value=1;')],[root+'client.js',Buffer.from('window.__ModuleLoader__.load({id:"synthetic",factory(require){return {};}})')]]);`;
function run(code,expose=false){const r=cp.spawnSync(process.execPath,[...(expose?['--expose-internals']:[]),'-e',fixture+code],{encoding:'utf8',windowsHide:true,env:process.env});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
assert.deepEqual(run(`console.log(JSON.stringify(B.consumer(pkg,'react',n=>files.get(n))));`),{ok:false,reason:'browser-parser-unavailable'});
assert.equal(run(`console.log(JSON.stringify(B.consumer(pkg,'react',n=>files.get(n))));`,true).ok,true);
assert.deepEqual(run(`files.set(root+'client.js',Buffer.from('export const = private_bad_source'));console.log(JSON.stringify(B.consumer(pkg,'react',n=>files.get(n))));`,true),{ok:false,reason:'consumer-source-syntax-invalid'});
assert.deepEqual(run(`files.delete(root+'client.js');console.log(JSON.stringify(B.consumer(pkg,'react',n=>files.get(n))));`,true),{ok:false,reason:'consumer-source-unproven'});
assert.deepEqual(run(`console.log(JSON.stringify(B.consumer(pkg,'react',()=>{throw new SyntaxError('SENSITIVE_READ_ERROR')})));`,true),{ok:false,reason:'consumer-source-unproven'});
const denied=run(`const M=require('node:module'),load=M._load;M._load=function(id,...args){if(id==='internal/deps/acorn/acorn/dist/acorn')throw Error('SENSITIVE_DETAIL');return load.call(this,id,...args);};console.log(JSON.stringify(B.consumer(pkg,'react',n=>files.get(n))));`,true);
assert.deepEqual(denied,{ok:false,reason:'browser-parser-unavailable'});
// Real dependency analysis retains its existing critical refusal code.
const diagnostic=run(`const D=require(${JSON.stringify(path.resolve(__dirname,'../assets/dependency-contract.cjs'))});pkg.manifest.version='1.0.0';pkg.manifest.peerDependencies={react:'^18'};console.log(JSON.stringify(D.analyze([pkg],{host:{providers:[],browserSeeds:[{name:'react'}],browserProviders:[{name:'react',version:'18.3.1'}]},readSource:n=>files.get(n)})));`);
assert.equal(diagnostic.issues[0].code,'HOST_BROWSER_PEER_UNPROVEN');assert.equal(diagnostic.issues[0].reason,'browser-parser-unavailable');assert.equal(diagnostic.requirements.length,0);
console.log('PASS v0.7 browser diagnostics: 7 cases; missing parser, syntax, missing source and read errors remain refused');
