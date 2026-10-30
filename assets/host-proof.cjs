'use strict';
// Invoked only in the current Desktop executable. Never imports Profile code.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url'),{spawnSync}=require('node:child_process');
const C=require('./recovery-core.cjs');
const {validateProviderRuntime}=require('./provider-runtime.cjs');
const B=require('./browser-contract.cjs');
const physical=process.versions.electron?require('original-fs'):fs;
function digest(file) {
  C.noLinks(file);const before=physical.statSync(file),fd=physical.openSync(file,'r'),hash=crypto.createHash('sha256'),b=Buffer.alloc(1024*1024);
  try {if(!before.isFile()||C.identity(before)!==C.identity(physical.fstatSync(fd)))C.fail('HOST_SOURCE_CHANGED');let n;while((n=physical.readSync(fd,b,0,b.length,null)))hash.update(b.subarray(0,n));const after=physical.fstatSync(fd);if(C.identity(before)!==C.identity(after)||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)C.fail('HOST_SOURCE_CHANGED');return hash.digest('hex');}finally{physical.closeSync(fd);}
}
function unpackedDigest(dir) {
  const hash=crypto.createHash('sha256');let files=0,bytes=0;
  if(!fs.existsSync(dir))return {sha256:hash.digest('hex'),files,bytes};
  C.noLinks(dir);function walk(d,rel=''){for(const name of fs.readdirSync(d).sort()){const p=path.join(d,name),r=rel+'/'+name,s=fs.lstatSync(p);if(s.isSymbolicLink())C.fail('HOST_SOURCE_UNTRUSTED');if(s.isDirectory()){hash.update('D'+r+'\0');walk(p,r);}else if(s.isFile()){hash.update('F'+r+'\0'+s.size+'\0'+digest(p)+'\0');files++;bytes+=s.size;}else C.fail('HOST_SOURCE_UNTRUSTED');}}walk(dir);return {sha256:hash.digest('hex'),files,bytes};
}
function inspectHost(names,dshVersion,task,browser=false) {
  const nonce=crypto.randomBytes(16).toString('hex'),payload=Buffer.from(JSON.stringify({names,dshVersion,nonce,...(task?{task}:{}),...(browser?{browser:true}:{})})).toString('base64');
  if(task){
    if(!/^[a-f0-9]{32}$/.test(task.id||''))C.fail('HOST_PROOF_INVALID');
    const dir=path.join(task.homeDir,'.packer-cold',task.id);C.noLinks(dir);
    const read=p=>JSON.parse(C.readStable(path.join(dir,p)).toString('utf8').replace(/^\uFEFF/,''));
    const job=read('job.json'),owner=read('coordinator-owner.json');
    if(job.id!==task.id||job.lockProtocol!==2||owner.pid!==process.pid||!/^\d+$/.test(owner.born))C.fail('HOST_PROOF_INVALID');
    const file=path.join(dir,'host-probe-'+nonce+'.json'),fd=fs.openSync(file,'wx',0o600);
    try{fs.writeFileSync(fd,JSON.stringify({protocol:1,id:task.id,parentPid:owner.pid,parentBorn:owner.born,nonce,payload,scriptSHA256:C.sha(C.readStable(__filename))}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }
  const r=spawnSync(process.execPath,['--expose-internals',__filename,'--probe64',payload],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024});
  if(r.error||r.status!==0)C.fail('HOST_PROOF_UNAVAILABLE');let result;try{result=JSON.parse(r.stdout);}catch{C.fail('HOST_PROOF_UNAVAILABLE');}if(result.error)C.fail(result.error);return result;
}
async function probe({names,dshVersion,nonce,task,browser=false}) {
  if(!process.versions.electron||process.platform!=='win32')C.fail('HOST_DESKTOP_REQUIRED');
  if(!Array.isArray(names)||names.some(n=>!validName(n))||new Set(names).size!==names.length)C.fail('HOST_PROOF_INVALID');
  if(!/^[a-f0-9]{32}$/.test(nonce||''))C.fail('HOST_PROOF_INVALID');
  if(typeof browser!=='boolean')C.fail('HOST_PROOF_INVALID');
  if(task){
    if(!/^[a-f0-9]{32}$/.test(task.id||''))C.fail('HOST_PROOF_INVALID');
    const dir=path.join(task.homeDir,'.packer-cold',task.id);C.noLinks(dir);
    const record=JSON.parse(C.readStable(path.join(dir,'host-probe-'+nonce+'.json'))),owner=JSON.parse(C.readStable(path.join(dir,'coordinator-owner.json')));
    const scriptSHA256=C.sha(C.readStable(__filename));
    if(record.id!==task.id||record.nonce!==nonce||record.payload!==process.argv[3]||record.scriptSHA256!==scriptSHA256||record.parentPid!==process.ppid||owner.pid!==process.ppid||owner.born!==record.parentBorn)C.fail('HOST_PROOF_INVALID');
    // Capture the child's exact OS birth identity before lengthy reads. The
    // monitor can then identify a stale CIM row during process teardown.
    const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
    const command=`$ErrorActionPreference='Stop';$p=[Diagnostics.Process]::GetProcessById(${process.pid});$c=Get-CimInstance Win32_Process -Filter 'ProcessId=${process.pid}';$parent=[Diagnostics.Process]::GetProcessById(${process.ppid});@{pid=${process.pid};born=$p.StartTime.ToUniversalTime().Ticks.ToString();cimBorn=$c.CreationDate.ToUniversalTime().Ticks.ToString();parentPid=[int]$c.ParentProcessId;parentBorn=$parent.StartTime.ToUniversalTime().Ticks.ToString()}|ConvertTo-Json -Compress`;
    const query=spawnSync(ps,['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:15000});
    if(query.status!==0||query.error)C.fail('HOST_PROOF_UNAVAILABLE');let identity;try{identity=JSON.parse(query.stdout);}catch{C.fail('HOST_PROOF_UNAVAILABLE');}
    if(identity.pid!==process.pid||identity.parentPid!==process.ppid||identity.parentBorn!==record.parentBorn||!/^\d+$/.test(identity.born)||!/^\d+$/.test(identity.cimBorn))C.fail('HOST_PROOF_INVALID');
    const precision=BigInt(identity.born)-BigInt(identity.cimBorn);if(precision<0n||precision>9n)C.fail('HOST_PROOF_UNAVAILABLE');
    const fd=fs.openSync(path.join(dir,'host-probe-live-'+nonce+'.json'),'wx',0o600);
    try{fs.writeFileSync(fd,JSON.stringify({...identity,id:task.id,nonce,scriptSHA256,payloadSHA256:C.sha(Buffer.from(process.argv[3]))}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }
  const asar=path.join(path.dirname(process.execPath),'resources/app.asar'),unpacked=asar+'.unpacked',root=path.join(asar,'dsh'),modules=path.join(root,'node_modules');
  const exeSHA256=digest(process.execPath),asarSHA256=digest(asar),unpackedFiles=unpackedDigest(unpacked);
  const read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{C.fail('HOST_SOURCE_UNTRUSTED');}};
  const app=read(path.join(asar,'package.json')),dsh=read(path.join(modules,'@deepseek-ai/dsh/package.json'));
  if(app.version!==dshVersion||dsh.version!==dshVersion||dsh.name!=='@deepseek-ai/dsh')C.fail('HOST_VERSION_MISMATCH');
  const boot=await import(pathToFileURL(path.join(modules,'@deepseek-ai/dsh-app-boot/lib/index.js')).href);
  if(typeof boot.createRuntimeResolution!=='function')C.fail('HOST_RESOLVER_UNSUPPORTED');
  // No loadProfile/loadProfileDirectory: those can normalize a real Profile on disk.
  const table=await boot.createRuntimeResolution({installAnchor:path.join(modules,'@deepseek-ai/dsh/package.json')});
  if(!Array.isArray(table.entries))C.fail('HOST_RESOLVER_UNSUPPORTED');
  const providers=[];
  for(const name of [...names].sort()) {
    const matches=table.entries.filter(e=>e.name===name&&e.scope==='installation');if(!matches.length)continue;if(matches.length!==1)C.fail('HOST_SOURCE_UNTRUSTED');
    const e=matches[0],relative=path.relative(root,e.packageDir),declarer=path.relative(root,e.declarer);
    if(relative.startsWith('..')||path.isAbsolute(relative)||declarer.startsWith('..')||path.isAbsolute(declarer))C.fail('HOST_SOURCE_UNTRUSTED');
    const bytes=fs.readFileSync(path.join(e.packageDir,'package.json')),m=JSON.parse(bytes);
    if(m.name!==name||m.version!==e.version)C.fail('HOST_SOURCE_UNTRUSTED');
    const runtimeRequirements=validateProviderRuntime(m,{...process.versions,platform:process.platform,arch:process.arch},dshVersion);
    providers.push({name,version:m.version,scope:'installation',packagePath:relative.replaceAll('\\','/'),declarer:declarer.replaceAll('\\','/'),manifestSHA256:C.sha(bytes),runtimeRequirements});
  }
  // Browser seeds are a different resolver realm. A compiled name proves
  // presence, not a package version or Node importability. Diagnostic only.
  const browserSeeds=[],browserProviders=[];
  const frontend=path.join(modules,'@deepseek-ai/dsh-web-frontend/dist');
  if(fs.existsSync(path.join(frontend,'index.html'))){const html=fs.readFileSync(path.join(frontend,'index.html'),'utf8'),scripts=[...html.matchAll(/src="(?:\.\/|\/)?(assets\/[A-Za-z0-9_-]+\.js)"/g)];
    for(const [,script]of scripts){const body=fs.readFileSync(path.join(frontend,script),'utf8'),call=body.match(/staticModules:([A-Za-z_$][\w$]*)\(\)/);if(!call)continue;
      const safe=call[1].replace(/[$]/g,'\\$&'),factory=body.match(new RegExp('function '+safe+'\\(\\)\\{return\\{([^{}]+)\\}\\}'));if(!factory)continue;
      for(const pair of factory[1].split(',')){const m=pair.match(/^(?:"([^"\\]+)"|([A-Za-z_$][\w$]*)):([A-Za-z_$][\w$]*)$/);if(m&&validName(m[1]||m[2]))browserSeeds.push({name:m[1]||m[2],scope:'browser-seed',versionProven:false,script:'node_modules/@deepseek-ai/dsh-web-frontend/dist/'+script,scriptSHA256:C.sha(Buffer.from(body))});}
      if(browser){
        const manifestPath=path.join(modules,'@deepseek-ai/dsh-web-frontend/package.json'),bytes=fs.readFileSync(manifestPath),manifest=JSON.parse(bytes);
        if(manifest.name!=='@deepseek-ai/dsh-web-frontend'||manifest.version!==dshVersion)C.fail('HOST_SOURCE_UNTRUSTED');
        for(const provider of B.providers(body,manifest,names))browserProviders.push({...provider,manifestPath:'node_modules/@deepseek-ai/dsh-web-frontend/package.json',manifestSHA256:C.sha(bytes),script:'node_modules/@deepseek-ai/dsh-web-frontend/dist/'+script,scriptSHA256:C.sha(Buffer.from(body))});
      }
    }
  }
  browserSeeds.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  if(digest(asar)!==asarSHA256||digest(process.execPath)!==exeSHA256||JSON.stringify(unpackedDigest(unpacked))!==JSON.stringify(unpackedFiles))C.fail('HOST_SOURCE_CHANGED');
  return {protocol:browser?'dsh-desktop-asar/2':'dsh-desktop-asar/1',dshVersion,platform:process.platform,arch:process.arch,node:process.versions.node,nodeModules:process.versions.modules,electron:process.versions.electron,exeSHA256,asarSHA256,unpacked:unpackedFiles,providers,browserSeeds,...(browser?{browserProviders:browserProviders.sort((a,b)=>a.name.localeCompare(b.name,'en'))}:{})};
}
const validName=n=>typeof n==='string'&&/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(n)&&!n.split('/').some(s=>s==='.'||s==='..');
function verifyHost(proof,dshVersion,task) {
  const browser=proof?.protocol==='dsh-desktop-asar/2',list=[...(Array.isArray(proof?.providers)?proof.providers:[]),...(browser&&Array.isArray(proof.browserProviders)?proof.browserProviders:[])];
  if(!proof||!['dsh-desktop-asar/1','dsh-desktop-asar/2'].includes(proof.protocol)||!Array.isArray(proof.providers)||(browser&&!Array.isArray(proof.browserProviders))||!list.length||list.length>2000||list.some(p=>!validName(p.name))||new Set(list.map(p=>p.name)).size!==list.length)C.fail('HOST_PROOF_INVALID');
  const actual=inspectHost(list.map(p=>p.name),dshVersion,task,browser);
  if(JSON.stringify(actual)!==JSON.stringify(proof))C.fail('HOST_REQUIREMENTS_MISMATCH');return actual;
}
module.exports={inspectHost,verifyHost,validName};
if(require.main===module){(async()=>{try{if(process.argv[2]!=='--probe64'||process.argv.length!==4||!/^[A-Za-z0-9+/=]+$/.test(process.argv[3]))C.fail('HOST_PROOF_INVALID');console.log(JSON.stringify(await probe(JSON.parse(Buffer.from(process.argv[3],'base64').toString('utf8')))));}catch(e){console.log(JSON.stringify({error:/^HOST_[A-Z0-9_]+$/.test(e.code||'')?e.code:e.code==='REPARSE_REFUSED'?'HOST_SOURCE_UNTRUSTED':'HOST_PROOF_UNAVAILABLE'}));}})();}
