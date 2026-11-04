'use strict';
// Native-shell acceptance only; no production Home or userData is opened.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),assert=require('node:assert/strict');const E=require('../assets/migration-engine.cjs');
const root=process.env.DSH_PACKER_TEST_ROOT;if(!root)throw Error('Explicit isolated root required');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=120000){const end=Date.now()+timeout;while(Date.now()<end){const r=await fn();if(r)return r;await sleep(100);}throw Error('NATIVE_DESKTOP_TIMEOUT');}
async function cdp(url){const ws=new WebSocket(url),pending=new Map();let id=0;await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const {resolve,reject,timer}=pending.get(m.id);pending.delete(m.id);clearTimeout(timer);m.error?reject(Error(m.error.message)):resolve(m.result);}};return {send(method,params={},sessionId){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP_TIMEOUT '+method));},15000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});},close(){ws.close();}};}
(async()=>{
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'migration-business-state.json'))),p=fixture.plan;let denied=0;
 const proxy=http.createServer((req,res)=>{denied++;res.writeHead(503);res.end('Offline acceptance');});proxy.on('connect',(_,socket)=>{denied++;socket.end('HTTP/1.1 502 Offline acceptance\r\n\r\n');});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const proxyPort=proxy.address().port,rounds=[];
 try{for(let round=1;round<=2;round++){
   const userData=path.join(p.layout.state,'native-desktop-userdata'),portFile=path.join(userData,'DevToolsActivePort');if(fs.existsSync(portFile))fs.unlinkSync(portFile);
   const log=path.join(p.layout.state,'logs','desktop-'+round+'-'+Date.now()),out=fs.openSync(log+'.stdout.log','wx'),err=fs.openSync(log+'.stderr.log','wx');
   const env=E.childEnvironment(p);delete env.ELECTRON_RUN_AS_NODE;env.HTTP_PROXY='http://127.0.0.1:'+proxyPort;env.HTTPS_PROXY=env.HTTP_PROXY;env.NO_PROXY='127.0.0.1,localhost';
   const child=cp.spawn(p.host.exe,['--user-data-dir='+userData,'--crash-dumps-dir='+path.join(p.layout.state,'crashes'),'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--proxy-server=http://127.0.0.1:'+proxyPort,'--no-first-run'],{env,cwd:p.layout.workspace,windowsHide:true,stdio:['ignore',out,err]});let exited=false,code;const ended=new Promise(r=>child.once('exit',c=>{exited=true;code=c;r(c);}));let client;
   try{
     const debug=await until(()=>{if(exited)throw Error('DESKTOP_EXITED '+code);if(!fs.existsSync(portFile))return false;const a=fs.readFileSync(portFile,'utf8').trim().split('\n');return a.length>=2&&'ws://127.0.0.1:'+a[0]+a[1];});client=await cdp(debug);
     const target=await until(async()=>{const {targetInfos}=await client.send('Target.getTargets');return targetInfos.find(t=>t.type==='page'&&/^dsh-app:\/\//.test(t.url));});
     const {sessionId}=await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});await client.send('Runtime.enable',{},sessionId);
     const state=await until(async()=>{const r=await client.send('Runtime.evaluate',{expression:"({ready:document.readyState,account:!![...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='账号菜单'),comfort:localStorage.getItem('dsh-chat-comfort.settings.v1')})",returnByValue:true},sessionId);return r.result?.value?.account&&r.result.value;});
     assert.equal(JSON.parse(state.comfort).density,'compact');
     await Promise.race([client.send('Browser.close'),ended]);await Promise.race([ended,sleep(30000)]);assert(exited,'Native shell must exit normally');assert.equal(code,0);
     rounds.push({round,nativeShell:true,realInstallation:p.host.version,rendererReady:true,knownPreferenceLoaded:true,normalExit:true,exitCode:code});
   }finally{client?.close();if(!exited){child.kill();await ended;}fs.closeSync(out);fs.closeSync(err);}
 }}finally{await new Promise(r=>proxy.close(r));}
 const report={status:'PASS',syntheticOnly:true,rounds,externalRequestsForwarded:0,externalRequestsDenied:denied};fs.writeFileSync(path.join(root,'migration-desktop-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
