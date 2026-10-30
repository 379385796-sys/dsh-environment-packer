import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {apply} from '../index.js';
const home=fs.mkdtempSync(path.join(process.env.TEMP,'recovery-route-')),previous=process.env.DSH_HOME;process.env.DSH_HOME=home;
let route;apply({get:n=>n==='webServer'?{getOrigin:()=> 'http://localhost:9375',register:r=>{route=r;return()=>{};}}:undefined,effect:fn=>fn(),on:()=>()=>{}});
async function request(headers={},body='{}',method='POST'){
 const req={method,url:'/plugins/dsh-environment-packer/recover-cold-task',headers,async *[Symbol.asyncIterator](){yield Buffer.from(body);}};
 const res={status:0,writeHead(s){this.status=s;},end(b){this.body=JSON.parse(b);}};await route.handler(req,res);return res;
}
try{
 assert.equal((await request({origin:'https://untrusted.invalid'})).status,403);
 assert.equal((await request({'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await request({},'{}','GET')).status,404);
 const normal=await request({},'{"homeDir":"untrusted-source-override"}');assert.equal(normal.body.code,'COLD_NO_TASK');
 const concurrent=await Promise.all([request(),request()]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,429]);assert.equal(concurrent.find(r=>r.status===429).body.code,'COLD_OPERATION_BUSY');
 const root=path.join(home,'.packer-cold');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'active.lock'),'corrupt');const corrupt=await request();assert.equal(corrupt.status,409);assert.equal(corrupt.body.code,'COLD_STATE_CORRUPT');assert.equal(fs.readFileSync(path.join(root,'active.lock'),'utf8'),'corrupt');
 console.log('PASS recovery HTTP origin/method/busy guards, server-owned paths and corrupt-lock refusal');
}finally{if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;}
