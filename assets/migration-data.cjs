'use strict';
// Data-only adapters. No Profile imports, expressions, SQL, or archive scripts execute here.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {pathToFileURL}=require('node:url'),C=require('./recovery-core.cjs');
const canonical=p=>path.win32.normalize(p).replace(/[\\/]+$/,'').toLowerCase();
const inside=(root,p)=>canonical(p)===canonical(root)||canonical(p).startsWith(canonical(root)+'\\');
const id=p=>C.sha(Buffer.from(canonical(p))).slice(0,16);
function projectKey(cwd) {
  if(!cwd)C.fail('SESSION_CWD_INVALID');let readable='',separator=false;
  for(let i=0;i<cwd.length;i++){const ch=cwd[i];if('/\\:'.includes(ch)){if(!separator)readable+='-';separator=true;}else if(ch!=='~'&&/^[A-Za-z0-9._-]$/.test(ch)){readable+=ch;separator=false;}else{readable+='~'+cwd.charCodeAt(i).toString(16).toUpperCase().padStart(4,'0');separator=false;}}
  return '--'+(readable.replace(/^-+/,'')||'root').slice(0,251)+'--';
}
function decodeSession(bytes,name){
  let plain;try{
    if(name.endsWith('.zstd')){
      const chunks=[];let offset=0,total=0;
      while(offset<bytes.length){const decoded=zlib.zstdDecompressSync(bytes.subarray(offset),{maxOutputLength:C.MAX_FILE-total,info:true}),used=decoded.engine.bytesWritten;
        if(!Number.isSafeInteger(used)||used<=0||used>bytes.length-offset)C.fail('SESSION_DECODE_FAILED');
        total+=decoded.buffer.length;if(total>C.MAX_FILE)C.fail('SESSION_DECODE_FAILED');chunks.push(decoded.buffer);offset+=used;
      }
      plain=Buffer.concat(chunks,total);
    }else plain=bytes;
  }catch{C.fail('SESSION_DECODE_FAILED');}
  const end=plain.indexOf(10);if(end<0)C.fail('SESSION_HEADER_INVALID');let header;try{header=JSON.parse(plain.subarray(0,end).toString('utf8'));}catch{C.fail('SESSION_HEADER_INVALID');}
  if(header.type!=='session'||!Number.isSafeInteger(header.version)||typeof header.id!=='string'||(header.cwd!==undefined&&!path.win32.isAbsolute(header.cwd)))C.fail('SESSION_HEADER_INVALID');
  return {header,body:plain.subarray(end+1)};
}
function mappings(roots,workspace){
  const ws=roots.filter(r=>r.kind==='workspace').sort((a,b)=>canonical(a.path).localeCompare(canonical(b.path),'en'));
  const primary=ws.find(r=>r.primary)||ws[0],result=[];
  for(const r of [...ws].sort((a,b)=>(a===primary?-1:b===primary?1:a.path.length-b.path.length))){
    const parent=result.filter(m=>inside(m.from,r.path)).sort((a,b)=>b.from.length-a.from.length)[0];
    const to=r===primary?workspace:parent?path.join(parent.to,...path.win32.relative(parent.from,r.path).split('\\')):path.join(workspace,'restored-workspaces',r.id);
    result.push({id:r.id,from:r.path,to,exists:r.exists});
  }return result.sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
function mapPath(p,map){
  if(typeof p!=='string'||!path.win32.isAbsolute(p))C.fail('PATH_REFERENCE_INVALID');
  const hit=[...map].sort((a,b)=>b.from.length-a.from.length).find(r=>inside(r.from,p));if(!hit)C.fail('PATH_MAPPING_MISSING');
  const suffix=path.win32.relative(hit.from,p);return suffix?path.join(hit.to,...suffix.split('\\')):hit.to;
}
let yamlPromise;
async function yaml(){
  if(!yamlPromise)yamlPromise=import(pathToFileURL(path.join(__dirname,'../vendor/js-yaml.mjs')).href).then(Y=>{
    class Expression{constructor(value){this.value=value;}}
    const js=new Y.Type('tag:yaml.org,2002:js',{kind:'scalar',construct:value=>new Expression(value),instanceOf:Expression,represent:value=>value.value});
    const schema=Y.DEFAULT_SCHEMA.extend([js]);return {load:text=>Y.load(text,{schema}),dump:value=>Y.dump(value,{schema,noRefs:true,lineWidth:-1,sortKeys:false})};
  });return yamlPromise;
}
function entries(tree){const out=[];function visit(v){if(Array.isArray(v)){v.forEach(visit);return;}if(!v||typeof v!=='object')return;if(typeof v.id==='string'&&v.config&&typeof v.config==='object')out.push(v);if(Array.isArray(v.insert))visit(v.insert);if(Array.isArray(v.config))visit(v.config);}visit(tree);return out;}
function configPaths(tree){
  const result=[];for(const e of entries(tree)){
    const c=e.config,owner=e.id.toLowerCase();
    if(owner==='workspace-controller'&&typeof c.documentsDirectory==='string')result.push({owner,key:'documentsDirectory',value:c.documentsDirectory,kind:'workspace',object:c});
    if(owner==='working-directory'&&typeof c.defaultDirectory==='string')result.push({owner,key:'defaultDirectory',value:c.defaultDirectory,kind:'workspace',object:c});
    if(/mnemon|memory/.test(owner)){
      if(typeof c.dataDir==='string')result.push({owner,key:'dataDir',value:c.dataDir,kind:'memory',object:c});
      for(const pack of [...c.packs||[],...c.customPacks||[]])if(typeof pack.dataDir==='string')result.push({owner,key:'dataDir',value:pack.dataDir,kind:'memory',object:pack});
    }
    if(/skill/.test(owner))for(const key of ['customSkillDirs'])if(Array.isArray(c[key]))c[key].forEach((value,index)=>result.push({owner,key:index,value,kind:'skills',object:c[key]}));
  }return result;
}
function unknownConfigPaths(tree,{mnemonTool=false}={}){
  const known=configPaths(tree),out=[];
  for(const entry of entries(tree)){
    function visit(value){if(!value||typeof value!=='object')return;for(const [key,v]of Object.entries(value)){
      if(typeof v==='string'&&path.win32.isAbsolute(v)&&/(path|directory|directories|dir|dirs|root|roots|cwd|file|command)$/i.test(key)&&!known.some(p=>p.object===value&&String(p.key)===key)&&!(mnemonTool&&entry.id==='mnemon'&&key==='cliPath'))out.push({owner:entry.id,key,reference:v});
      else if(v&&typeof v==='object')visit(v);
    }}visit(entry.config);
  }return out;
}
async function mapPatch(bytes,map,rootMap,tools=[]){
  const Y=await yaml(),tree=Y.load(bytes.toString('utf8'));
  if(Array.isArray(tree)&&!entries(tree).some(e=>e.id==='mnemon')&&rootMap.some(r=>r.owners?.includes('mnemon')&&!r.workspaceRelative))tree.push({id:'mnemon',config:{storageScope:'global'}});
  for(const p of configPaths(tree)){const explicit=rootMap.find(r=>canonical(r.from)===canonical(p.value));p.object[p.key]=explicit?explicit.to:mapPath(p.value,map);}
  for(const e of entries(tree))if(/mnemon/.test(e.id)&&!e.config.dataDir&&e.config.storageScope!=='workspace'){
    const r=rootMap.find(r=>r.owners?.includes(e.id)&&!r.workspaceRelative);if(r){e.config.dataDir=r.to;if(!e.config.storageScope||e.config.storageScope==='global')e.config.storageScope='custom';}
  }
  for(const e of entries(tree))if(/mnemon/.test(e.id)&&tools.find(t=>t.name==='mnemon'))e.config.cliPath=tools.find(t=>t.name==='mnemon').to;
  for(const e of entries(tree))if(e.id==='prompt-inject'&&e.config.workspaceOverrides){
    const next=Object.create(null);for(const [key,value]of Object.entries(e.config.workspaceOverrides)){const mapped=mapPath(key,map);if(Object.hasOwn(next,mapped))C.fail('PATH_MAPPING_COLLISION');next[mapped]=value;}e.config.workspaceOverrides=next;
  }
  return Buffer.from(Y.dump(tree));
}
function transformSession(bytes,name,map){
  const {header,body}=decodeSession(bytes,name);if(header.version!==4)C.fail('SESSION_SCHEMA_UNKNOWN');
  const old=header.cwd;if(old!==undefined)header.cwd=mapPath(old,map);
  const chunks=[];let offset=0;while(offset<body.length){let end=body.indexOf(10,offset);if(end<0)end=body.length;const raw=body.subarray(offset,end),newline=end<body.length?Buffer.from('\n'):Buffer.alloc(0);let row;try{row=JSON.parse(raw.toString('utf8'));}catch{if(raw.length)C.fail('SESSION_EVENT_INVALID');}
    if(row?.type==='working-directory/change'){if(typeof row.data?.cwd!=='string')C.fail('SESSION_EVENT_SCHEMA_UNKNOWN');row.data.cwd=mapPath(row.data.cwd,map);chunks.push(Buffer.from(JSON.stringify(row)),newline);}else chunks.push(raw,newline);offset=end+1;
  }
  const head=Buffer.from(JSON.stringify(header)+'\n'),events=Buffer.concat(chunks);
  const compress=bytes=>zlib.zstdCompressSync(bytes,{params:{[zlib.constants.ZSTD_c_checksumFlag]:1}});
  const data=name.endsWith('.zstd')?Buffer.concat([compress(head),...(events.length?[compress(events)]:[])]):Buffer.concat([head,events]);
  return {data,header,old,bodySHA256:C.sha(body)};
}
function sessionPaths(bytes,name){const {header,body}=decodeSession(bytes,name),paths=header.cwd?[header.cwd]:[];if(header.version!==4)return paths;for(const line of body.toString('utf8').split('\n'))if(line.trim()){let row;try{row=JSON.parse(line);}catch{C.fail('SESSION_EVENT_INVALID');}if(row.type==='working-directory/change'){if(typeof row.data?.cwd!=='string'||!path.win32.isAbsolute(row.data.cwd))C.fail('SESSION_EVENT_SCHEMA_UNKNOWN');paths.push(row.data.cwd);}}return [...new Set(paths)];}
function mapWorkspace(bytes,map){
  const j=JSON.parse(bytes);if(j.unit?.name!=='workspace'||j.unit.version!==2||!j.tables||!j.tables.workspaces)C.fail('WORKSPACE_SCHEMA_UNKNOWN');
  const next=Object.create(null);for(const [key,row]of Object.entries(j.tables.workspaces)){
    if(typeof row.path!=='string'||!Array.isArray(row.sessionIds))C.fail('WORKSPACE_SCHEMA_UNKNOWN');const to=mapPath(row.path,map);
    const nk=canonical(key)===canonical(row.path)?to:key;if(Object.hasOwn(next,nk))C.fail('PATH_MAPPING_COLLISION');next[nk]={...row,path:to};
  }j.tables.workspaces=next;return Buffer.from(JSON.stringify(j,null,2)+'\n');
}
function sqliteHeader(bytes){return bytes.subarray(0,16).equals(Buffer.from('SQLite format 3\0'));}
function knownPreference(value){if(!value||typeof value!=='object'||typeof value.enabled!=='boolean'||!['compact','comfortable'].includes(value.density)||Object.keys(value).some(k=>!['enabled','density'].includes(k)))C.fail('CLIENT_PREFERENCE_INVALID');return {enabled:value.enabled,density:value.density};}
module.exports={canonical,inside,id,projectKey,decodeSession,sessionPaths,mappings,mapPath,yaml,entries,configPaths,unknownConfigPaths,mapPatch,transformSession,mapWorkspace,sqliteHeader,knownPreference};
