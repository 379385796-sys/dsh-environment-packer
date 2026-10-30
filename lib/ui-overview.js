import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const C=createRequire(import.meta.url)('../assets/recovery-core.cjs');
const idPattern=/^[a-f0-9]{32}$/;
const phases=new Set(['waiting','exit-verified','scanning','checking-dependencies','writing','verifying','success','failed']);
const text=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').slice(0,256):null;
function readSmall(file,limit=65536){
  C.noLinks(file);
  const fd=fs.openSync(file,'r');
  try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>limit)throw Error('UI_RECORD_INVALID');
    const bytes=Buffer.alloc(limit+1),length=fs.readSync(fd,bytes,0,bytes.length,0);
    if(length>limit)throw Error('UI_RECORD_INVALID');C.noLinks(file);return bytes.subarray(0,length).toString('utf8').replace(/^\uFEFF/,'');
  }finally{fs.closeSync(fd)}
}
function json(file,limit){return JSON.parse(readSmall(file,limit))}
function task(root,id){
  const dir=path.join(root,id);C.noLinks(dir);
  let state=null,record='unknown';
  for(const file of ['terminal.json','status.json']){try{state=json(path.join(dir,file));record='available';break}catch(e){if(e.code!=='ENOENT'){record='corrupt';break}}}
  if(state?.id!==id||!phases.has(state?.phase)){state=null;if(record==='available')record='corrupt'}
  let assistant=null;
  try{const observation=json(path.join(dir,'ui-result.json'));if(observation.id!==id||observation.workerExited!==true||!['success','failed','cancelled','unknown'].includes(observation.outcome))throw Error('UI_RECORD_INVALID');
    assistant={outcome:observation.outcome,code:/^[A-Z0-9_]{1,100}$/.test(observation.code)?observation.code:null};
    // This receipt only explains the UI's exit. It never proves lock expiry or
    // replaces a coordinator's valid terminal success/failure record.
    if(assistant.outcome==='unknown'&&!['success','failed'].includes(state?.phase))state=null;
  }catch{}
  let diagnostic=null;
  try{const d=json(path.join(dir,'dependency-check.json'),2*1024*1024);if(d.id!==id||!Array.isArray(d.issues))throw Error();
    diagnostic={issueCount:d.issues.length,issues:d.issues.slice(0,100).map(x=>({code:/^[A-Z0-9_]{1,100}$/.test(x.code)?x.code:'UNKNOWN',package:text(x.package),name:text(x.name),range:text(x.range),actual:text(x.actual)})),truncated:d.issues.length>100};
  }catch(e){if(e.code!=='ENOENT')diagnostic={unavailable:true}}
  return {id,record,phase:state?.phase||'unknown',files:Number.isSafeInteger(state?.files)&&state.files>=0?state.files:null,error:/^[A-Z0-9_]{1,100}$/.test(state?.error)?state.error:assistant?.code||null,diagnostic,...(assistant?{assistant}: {})};
}
/** Display-only bounded snapshot. Never creates a guard, checks liveness, retires a lock or proves recovery safety. */
export function readUiOverview(home){
  const root=path.join(home,'.packer-cold');
  try{
    C.noLinks(root);if(!fs.statSync(root).isDirectory())throw Error();
    let before=null;try{before=readSmall(path.join(root,'active.lock'),128)}catch(e){if(e.code!=='ENOENT')throw e}
    if(before!==null&&!idPattern.test(before))return {state:'corrupt',current:null,history:[],displayOnly:true};
    const entries=fs.readdirSync(root,{withFileTypes:true}).filter(e=>idPattern.test(e.name)&&e.isDirectory()&&!e.isSymbolicLink()).map(e=>({id:e.name,at:fs.statSync(path.join(root,e.name)).mtimeMs})).sort((a,b)=>b.at-a.at);
    const current=before?task(root,before):null;
    const history=entries.filter(e=>e.id!==before).slice(0,5).map(e=>task(root,e.id));
    let after=null;try{after=readSmall(path.join(root,'active.lock'),128)}catch(e){if(e.code!=='ENOENT')throw e}
    if(before!==after)return {state:'changed',current:null,history:[],displayOnly:true};
    return {state:before?'lock-present':'no-lock',current,history,displayOnly:true};
  }catch(e){return {state:e.code==='ENOENT'&&!fs.existsSync(root)?'no-records':'unavailable',current:null,history:[],displayOnly:true}}
}
