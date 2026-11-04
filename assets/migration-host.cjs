'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const C=require('./recovery-core.cjs'),H=require('./host-proof.cjs');
const physical=process.versions.electron?require('original-fs'):fs;
function asarReader(file){
  C.noLinks(file);const fd=physical.openSync(file,'r'),h=Buffer.alloc(16);physical.readSync(fd,h,0,16,0);const size=h.readUInt32LE(12);if(size>16*1024*1024)C.fail('HOST_SOURCE_UNTRUSTED');const b=Buffer.alloc(size);physical.readSync(fd,b,0,size,16);const tree=JSON.parse(b),base=8+h.readUInt32LE(4);
  return {close:()=>physical.closeSync(fd),read(name){let v=tree;for(const part of name.split('/'))v=v.files?.[part];if(!v||v.files||v.link||!Number.isSafeInteger(v.size)||v.size>16*1024*1024)C.fail('HOST_CAPABILITY_UNAVAILABLE');if(v.unpacked)return C.readStable(file+'.unpacked/'+name);const b=Buffer.alloc(v.size);if(physical.readSync(fd,b,0,b.length,base+Number(v.offset))!==b.length)C.fail('HOST_SOURCE_CHANGED');return b;}};
}
function metadata(installation){
  C.noLinks(installation);const exe=path.join(installation,'DeepSeek Harness.exe'),asar=path.join(installation,'resources/app.asar');C.noLinks(exe);
  const r=asarReader(asar);try{
    const app=JSON.parse(r.read('package.json')),dsh=JSON.parse(r.read('dsh/node_modules/@deepseek-ai/dsh/package.json'));
    if(app.name!=='@deepseek-ai/dsh-desktop'||dsh.name!=='@deepseek-ai/dsh'||app.version!==dsh.version)C.fail('HOST_SOURCE_UNTRUSTED');
    const s=n=>{try{return r.read('dsh/node_modules/@deepseek-ai/'+n+'/lib/index.js').toString('utf8');}catch{return '';}},session=s('dsh-session'),workspace=s('dsh-workspace'),persist=s('dsh-session-persistence-jsonl');
    const sessionVersion=Number(session.match(/const SESSION_FORMAT_VERSION = (\d+);/)?.[1]);
    return {installation,exe,version:dsh.version,capabilities:{sessionVersion:Number.isSafeInteger(sessionVersion)?sessionVersion:null,workspaceV2:/version: 2,/.test(workspace)&&workspace.includes('sessionIds'),projectKeyV1:persist.includes('function projectKey(cwd)')&&persist.includes('readable.replace(/^-+/, "")'),zstd:persist.includes('zstdDecompressSync'),desktopCli:true},schemaEvidence:{session:C.sha(Buffer.from(session)),workspace:C.sha(Buffer.from(workspace)),persistence:C.sha(Buffer.from(persist))}};
  }finally{r.close();}
}
function inspect(installation,names=[]){
  const m=metadata(installation);let proof;
  let proofError;
  if(path.resolve(process.execPath).toLowerCase()===path.resolve(m.exe).toLowerCase()&&process.versions.electron){try{proof=H.inspectHost(names,m.version,undefined,true);}catch(e){
    proofError=/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'HOST_CAPABILITY_UNAVAILABLE';
    const digest=file=>{C.noLinks(file);const fd=physical.openSync(file,'r'),hash=require('node:crypto').createHash('sha256'),chunk=Buffer.alloc(1024*1024);try{let n;while((n=physical.readSync(fd,chunk,0,chunk.length,null)))hash.update(chunk.subarray(0,n));return hash.digest('hex');}finally{physical.closeSync(fd);}};
    proof={platform:process.platform,arch:process.arch,node:process.versions.node,nodeModules:process.versions.modules,electron:process.versions.electron,providers:[],browserProviders:[],browserSeeds:[],exeSHA256:digest(m.exe),asarSHA256:digest(path.join(installation,'resources/app.asar'))};
  }}
  else{
    const q=spawnSync(m.exe,['--expose-internals',path.join(__dirname,'migration-cli.cjs'),'host',Buffer.from(JSON.stringify({installation,names})).toString('base64')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
    if(q.error||q.status!==0)C.fail('TARGET_HOST_INSPECTION_FAILED');let response;try{response=JSON.parse(q.stdout);}catch{C.fail('TARGET_HOST_INSPECTION_FAILED');}if(!response.ok)C.fail(response.code||'TARGET_HOST_INSPECTION_FAILED');proof=response.result.proof;proofError=response.result.proofError;
  }
  return {...m,proof,...(proofError?{proofError}:{})};
}
module.exports={asarReader,metadata,inspect};
