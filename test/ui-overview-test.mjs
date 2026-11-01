import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {readUiOverview} from '../lib/ui-overview.js';
import {createRequire} from 'node:module';
const {coverageReport}=createRequire(import.meta.url)('../assets/backup-coverage.cjs');
const oldCoverage=coverageReport({files:[]});assert.equal(oldCoverage.omissionInventoryRecorded,false);assert.equal(oldCoverage.externalReferenceInventoryRecorded,false);assert.equal(oldCoverage.requiresExternalResourceReview,true);
const knownCoverage=coverageReport({files:[{path:'profile/config.json',text:'SYNTHETIC_PRIVATE_PAYLOAD'},{path:'home/memory/db.sqlite'}],scope:{profile:'entire-selected-profile',home:['memory']},homeEntriesNotCaptured:['unknown-business-db','profiles'],exclusions:[],externalReferences:[]});assert.equal(knownCoverage.omissionInventoryRecorded,true);assert.equal(knownCoverage.home[0].files,1);assert.equal(knownCoverage.homeEntriesNotCaptured[0].needsManualReview,true);assert.equal(knownCoverage.fileIntegrityIsNotBusinessCoverage,true);assert(!JSON.stringify(knownCoverage).includes('SYNTHETIC_PRIVATE_PAYLOAD'));
if(!process.env.DSH_PACKER_TEST_ROOT)throw Error('Explicit isolated test root required');
const home=fs.mkdtempSync(path.join(process.env.DSH_PACKER_TEST_ROOT,'ui-overview-')),root=path.join(home,'.packer-cold'),id='a'.repeat(32),other='b'.repeat(32);
assert.equal(readUiOverview(home).state,'no-records');assert.deepEqual(fs.readdirSync(home),[]);
fs.mkdirSync(path.join(root,id),{recursive:true});fs.mkdirSync(path.join(root,other));
const lock=path.join(root,'active.lock'),status=path.join(root,id,'status.json');fs.writeFileSync(lock,id);fs.writeFileSync(status,JSON.stringify({id,phase:'failed',files:21064,error:'HOST_BROWSER_PEER_UNPROVEN',privateValue:'DO_NOT_EXPOSE'}));
fs.writeFileSync(path.join(root,other,'terminal.json'),JSON.stringify({id:other,phase:'success',files:69}));
fs.writeFileSync(path.join(root,id,'dependency-check.json'),JSON.stringify({id,issues:[{code:'HOST_BROWSER_PEER_UNPROVEN',package:'synthetic-plugin',name:'react',range:'^18.3.1',privateValue:'DO_NOT_EXPOSE'}],hostRequirements:{secret:'DO_NOT_EXPOSE'}}));
function fingerprint(){return fs.readdirSync(root,{recursive:true}).sort().map(name=>{const file=path.join(root,name),s=fs.statSync(file);return [name,s.mtimeMs,s.isFile()?fs.readFileSync(file).toString('base64'):null]})}
const before=fingerprint(),snapshot=readUiOverview(home);assert.equal(snapshot.state,'lock-present');assert.equal(snapshot.displayOnly,true);assert.equal(snapshot.current.phase,'failed');assert.equal(snapshot.current.diagnostic.issueCount,1);assert.equal(snapshot.history[0].id,other);assert(!JSON.stringify(snapshot).includes('DO_NOT_EXPOSE'));assert.deepEqual(fingerprint(),before);
fs.writeFileSync(lock,'../../private.json');assert.equal(readUiOverview(home).state,'corrupt');assert.equal(fs.readFileSync(lock,'utf8'),'../../private.json');
fs.writeFileSync(lock,id);fs.writeFileSync(status,'{broken');assert.equal(readUiOverview(home).current.record,'corrupt');
fs.writeFileSync(status,JSON.stringify({id:other,phase:'success'}));assert.equal(readUiOverview(home).current.record,'corrupt');
fs.writeFileSync(status,'x'.repeat(65537));assert.equal(readUiOverview(home).current.record,'corrupt');
fs.unlinkSync(status);fs.writeFileSync(path.join(root,id,'dependency-check.json'),'x'.repeat(2*1024*1024+1));assert.equal(readUiOverview(home).current.diagnostic.unavailable,true);
const receipt=path.join(root,id,'ui-result.json');
fs.writeFileSync(status,JSON.stringify({id,phase:'waiting',files:12}));
fs.writeFileSync(receipt,'\uFEFF'+JSON.stringify({id,outcome:'unknown',code:'ASSISTANT_COORDINATOR_EXITED',workerExited:true,privateValue:'DO_NOT_EXPOSE'}));
const receiptBefore=fingerprint(),unknown=readUiOverview(home);assert.equal(unknown.current.phase,'unknown');assert.equal(unknown.current.error,'ASSISTANT_COORDINATOR_EXITED');assert(!JSON.stringify(unknown).includes('DO_NOT_EXPOSE'));assert.deepEqual(fingerprint(),receiptBefore);assert.equal(fs.readFileSync(lock,'utf8'),id);
fs.writeFileSync(status,JSON.stringify({id,phase:'success',files:69}));assert.equal(readUiOverview(home).current.phase,'success');
fs.writeFileSync(receipt,JSON.stringify({id:other,outcome:'unknown',workerExited:true}));assert.equal(readUiOverview(home).current.assistant,undefined);
const linkHome=fs.mkdtempSync(path.join(process.env.DSH_PACKER_TEST_ROOT,'ui-overview-link-'));fs.symlinkSync(root,path.join(linkHome,'.packer-cold'),'junction');assert.equal(readUiOverview(linkHome).state,'unavailable');
const original=fs.readSync;let reads=0;fs.readSync=function(...args){const n=original(...args);if(++reads===1)fs.writeFileSync(lock,other);return n};try{assert.equal(readUiOverview(home).state,'changed')}finally{fs.readSync=original}
console.log('PASS read-only UI snapshot: absence, immutable evidence, whitelisted fields, corrupt IDs/JSON, bounds, links, concurrent change; never recovery proof');
