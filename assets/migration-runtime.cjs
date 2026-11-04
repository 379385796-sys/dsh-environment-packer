'use strict';
// Verification child: only the selected installation and staged Profile are loaded.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{syncBuiltinESMExports}=require('node:module');
async function run(request){
  const {layout,installation,native,tools=[]}=request;
  if(!process.versions.electron||path.resolve(process.execPath).toLowerCase()!==path.resolve(installation,'DeepSeek Harness.exe').toLowerCase())throw Error('TARGET_RUNTIME_REQUIRED');
  const allowed=[layout.state,layout.workspace].map(p=>path.resolve(p).toLowerCase());
  const mayWrite=p=>{if(typeof p==='number')return;const s=path.resolve(p instanceof URL?require('node:url').fileURLToPath(p):Buffer.isBuffer(p)?p.toString():String(p)).toLowerCase();if(!allowed.some(r=>s===r||s.startsWith(r+path.sep)))throw Error('ISOLATED_WRITE_REFUSED');};
  for(const [name,indices]of Object.entries({writeFile:[0],appendFile:[0],mkdir:[0],mkdtemp:[0],unlink:[0],rm:[0],rmdir:[0],truncate:[0],rename:[0,1],copyFile:[1],link:[0,1],symlink:[0,1],chmod:[0],chown:[0],utimes:[0]}))for(const target of [fs,fs.promises])for(const key of [name,name+'Sync'])if(typeof target[key]==='function'){const old=target[key];target[key]=function(...args){indices.forEach(i=>mayWrite(args[i]));return old.apply(this,args);};}
  for(const target of [fs,fs.promises])for(const key of ['open','openSync'])if(typeof target[key]==='function'){const old=target[key];target[key]=function(p,flags,...rest){if(typeof flags==='number'?(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT)):/[wa+]/.test(flags||''))mayWrite(p);return old.call(this,p,flags,...rest);};}
  // No remote requests, DNS discovery or subprocess install hooks during verification.
  const loopback=h=>h===undefined||['127.0.0.1','localhost','::1','[::1]'].includes(h);
  const net=require('node:net'),connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const x=args[0],host=typeof x==='object'?(x.host||x.hostname):typeof args[1]==='string'?args[1]:undefined;if(typeof x==='string'&&!/^\d+$/.test(x))throw Error('ISOLATED_NETWORK_REFUSED');if(!loopback(host))throw Error('ISOLATED_NETWORK_REFUSED');return connect.apply(this,args);};
  const dns=require('node:dns');for(const key of ['lookup','resolve','resolve4','resolve6']){const old=dns[key];dns[key]=function(host,...args){if(!loopback(host))throw Error('ISOLATED_NETWORK_REFUSED');return old.call(this,host,...args);};}
  const cp=require('node:child_process');for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']){
    const old=cp[key];cp[key]=function(command,args=[],...rest){
      const tool=tools.find(t=>t.name==='mnemon'&&path.resolve(t.to).toLowerCase()===path.resolve(command).toLowerCase());
      const safe=Array.isArray(args)&&(args.length===1&&['--version','-v'].includes(args[0])||['status','show','search','recall'].includes(args[0])||args[0]==='store'&&args[1]==='list');
      if(!tool||!safe||!['spawn','spawnSync','execFile','execFileSync'].includes(key))throw Error('ISOLATED_SUBPROCESS_REFUSED');
      for(let i=0;i<args.length;i++)if(args[i]==='--data-dir'){mayWrite(args[i+1]);i++;}
      if(!args.includes('--version')&&!args.includes('-v')&&!args.includes('--readonly'))args=[...args,'--readonly'];
      return old.call(this,command,args,...rest);
    };
  }
  syncBuiltinESMExports();
  const loaded=[];for(const n of native||[]){const p=path.join(layout.profile,n.path.replace(/^profiles\/desktop\//,''));require(p);loaded.push(n.path);}
  const installAnchor=path.join(installation,'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json');
  const resolve=require('node:module').createRequire(installAnchor);
  const {loadProfileDirectory,reportSkippedBundles,loadLayeredEnv}=await import(pathToFileURL(resolve.resolve('@deepseek-ai/dsh-app-boot')).href);
  const {runProfile}=await import(pathToFileURL(resolve.resolve('@deepseek-ai/dsh/profile-boot')).href);
  const {DomainFacility}=await import(pathToFileURL(resolve.resolve('@deepseek-ai/dsh-storage-domain')).href),open=DomainFacility.prototype.open,observedStorage=new Set();
  DomainFacility.prototype.open=async function(spec){
    for(const source of request.expectedStorage||[])if(source.name===spec.name&&source.critical&&!([spec.version,...spec.compatibleVersions||[]].includes(source.version)))throw Error('STORAGE_SCHEMA_UNSUPPORTED');
    // Tighten verification: do not allow a business record to be silently backed up and skipped.
    const domain=await open.call(this,{...spec,invalidRecords:undefined});observedStorage.add(spec.name);return domain;
  };
  const profile=loadProfileDirectory('dsh',layout.profile,installAnchor);reportSkippedBundles('dsh',profile);
  process.send?.({type:'native-loaded',paths:loaded});
  const application=await runProfile({environment:loadLayeredEnv('dsh'),profile:'desktop',resolvedProfile:{profile,installAnchor},patchFiles:[],args:['--no-open','--host','127.0.0.1','--port',String(request.port||0)]});
  let stopping;
  const stop=()=>stopping??=(async()=>{await application.shutdown.shutdown(0);if(process.connected)process.send({type:'shutdown-complete'},()=>process.disconnect());})();
  process.on('message',m=>{if(m?.type==='shutdown')stop().catch(()=>{process.exitCode=1;process.disconnect();});});
  process.once('disconnect',()=>{if(!stopping)application.shutdown.shutdown(0);});
  try{
    await application.ctx.get('loader')?.await();
    const checks=[];for(const expected of request.expectedStorage||[])if(expected.critical&&!observedStorage.has(expected.name))throw Error('STORAGE_OWNER_UNAVAILABLE');if(request.expectedStorage?.length)checks.push('actual-storage-schema-and-records');
    if(request.expectedSessionIds?.length){
      const persistence=application.ctx.get('sessionPersistence');if(!persistence)throw Error('SESSION_OWNER_UNAVAILABLE');
      for(const id of request.expectedSessionIds){if(typeof id!=='string')throw Error('SESSION_OWNER_UNVERIFIED');const handle=await persistence.open(id,'read');try{await handle.read();}finally{await handle.close();}}
      checks.push('actual-session-owner-read');
    }
    // rc.5 Web/Desktop mounts filesystem skills inside Agent preset scopes, not in the root registry.
    // Exercise the target's real filesystem provider without changing the recovered preset composition.
    if(request.expectedSkills?.length){
      const {FileSystemSkillProvider}=await import(pathToFileURL(resolve.resolve('@deepseek-ai/dsh-skill-filesystem')).href),lifetime=new AbortController();
      const provider=new FileSystemSkillProvider(application.ctx,{invalidate(){},signal:lifetime.signal},{providerName:'packer-verification',watch:false,dshHome:layout.home,agentsHome:layout.agents});
      try{for(const expected of request.expectedSkills){const listed=await provider.list({cwd:expected.cwd}),candidate=(Array.isArray(listed)?listed:listed.candidates).find(c=>c.name===expected.name),definition=candidate&&await provider.get(candidate,{signal:lifetime.signal});if(!definition||require('./recovery-core.cjs').sha(Buffer.from(definition.content))!==expected.bodySHA256)throw Error('SKILL_BUSINESS_READ_FAILED');checks.push('skill-body-read');}}finally{lifetime.abort();await provider.dispose();}
    }
    process.send?.({type:'data-verified',checks});
  }catch(e){const code=/^[A-Z0-9_]+$/.test(e.message)?e.message:'RUNTIME_DATA_VALIDATION_FAILED';console.error(code);process.send?.({type:'failed',code});await application.shutdown.shutdown(1);if(process.connected)process.disconnect();throw e;}
}
if(require.main===module){run(JSON.parse(Buffer.from(process.argv[2],'base64'))).catch(e=>{process.send?.({type:'failed',code:/^[A-Z_]+$/.test(e.message)?e.message:'RUNTIME_BOOT_FAILED'},()=>{});console.error('RUNTIME_BOOT_FAILED');process.exitCode=1;});}
module.exports={run};
