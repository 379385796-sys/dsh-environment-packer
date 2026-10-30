'use strict';
// Reuse the parser in the pinned Node executable; never evaluate Profile code.
const path=require('node:path').posix,crypto=require('node:crypto'),semver=require('../vendor/semver');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function parse(text){return require('internal/deps/acorn/acorn/dist/acorn').parse(text,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});}
function walk(root,visit,skipFunctions=false){const pending=[root];while(pending.length){const n=pending.pop();if(!n||typeof n.type!=='string')continue;visit(n);if(skipFunctions&&n!==root&&/Function|ArrowFunction/.test(n.type))continue;for(const v of Object.values(n)){if(Array.isArray(v)){for(const x of v)if(x?.type)pending.push(x);}else if(v?.type)pending.push(v);}}}
const key=n=>n?.type==='Identifier'?n.name:n?.type==='Literal'?n.value:undefined;
const literal=n=>n?.type==='Literal'&&typeof n.value==='string'?n.value:n?.type==='TemplateLiteral'&&!n.expressions.length?n.quasis[0].value.cooked:undefined;
function providers(body,manifest,names){
  const ast=parse(body),variables=new Map(),functions=new Map();
  for(const n of ast.body){if(n.type==='FunctionDeclaration')functions.set(n.id.name,n);if(n.type==='VariableDeclaration')for(const d of n.declarations)if(d.id.type==='Identifier')variables.set(d.id.name,d.init);}
  const factories=new Set();walk(ast,n=>{if(n.type==='Property'&&key(n.key)==='staticModules'&&n.value?.type==='CallExpression'&&n.value.callee.type==='Identifier'&&!n.value.arguments.length)factories.add(n.value.callee.name);});
  const maps=[];for(const id of factories){const f=functions.get(id);if(!f)continue;const r=f.body.body.find(n=>n.type==='ReturnStatement'&&n.argument?.type==='ObjectExpression');if(!r)continue;const entries=r.argument.properties;if(entries.some(p=>p.type!=='Property'||p.value.type!=='Identifier'))continue;maps.push(new Map(entries.map(p=>[key(p.key),p.value.name])));}
  if(maps.length!==1)return [];const seed=maps[0];
  function factory(id,seen=new Set()){
    if(seen.has(id))return undefined;seen.add(id);const v=variables.get(id);
    if(v?.type==='Identifier')return factory(v.name,seen);
    if(v?.type==='CallExpression'){
      const namespace=v.arguments.find(a=>a.type==='ArrayExpression'&&a.elements.length===1&&a.elements[0]?.type==='Identifier');
      if(namespace)return factory(namespace.elements[0].name,seen);
      if(v.callee.type==='Identifier')return factory(v.callee.name,seen);
    }
    const f=functions.get(id);if(!f)return undefined;const delegated=[];
    walk(f.body,n=>{if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&key(n.left.property)==='exports'&&n.right.type==='CallExpression'&&n.right.callee.type==='Identifier')delegated.push(n.right.callee.name);},true);
    if(delegated.length===1)return factory(delegated[0],seen);return f;
  }
  function reactVersion(name){
    const f=factory(seed.get(name));if(!f)return undefined;const assignments=new Map(),renderers=[];
    walk(f.body,n=>{
      if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.type==='Identifier'){
        const object=n.left.object.name,prop=key(n.left.property);if(!assignments.has(object))assignments.set(object,new Map());assignments.get(object).set(prop,n.right);
      }
      if(n.type==='ObjectExpression'){const props=new Map(n.properties.filter(p=>p.type==='Property').map(p=>[key(p.key),literal(p.value)]));if(props.get('rendererPackageName')==='react-dom'&&semver.valid(props.get('version')))renderers.push(props.get('version'));}
    },true);
    const candidates=[];
    for(const props of assignments.values()){
      const version=literal(props.get('version'));if(!semver.valid(version))continue;
      if(name==='react'&&props.has('createElement')&&props.has('useState')&&!semver.prerelease(version))candidates.push({version,exportedVersion:version});
      if(name==='react-dom'&&props.has('createPortal')&&props.has('render'))for(const renderer of new Set(renderers)){
        // The published React DOM artifact exposes an internal -next build tag;
        // its own renderer metadata carries the stable package version.
        const v=semver.parse(version);if(!semver.prerelease(renderer)&&`${v.major}.${v.minor}.${v.patch}`===renderer)candidates.push({version:renderer,exportedVersion:version});
      }
    }
    return candidates.length===1?candidates[0]:undefined;
  }
  const result=[];
  for(const name of [...names].sort()){
    if(!seed.has(name))continue;
    let version,versionSource,exportedVersion;
    const declared=manifest.dependencies?.[name]??manifest.devDependencies?.[name];
    if(name==='react'||name==='react-dom'){
      const runtime=reactVersion(name);if(!runtime||!semver.validRange(declared)||!semver.satisfies(runtime.version,declared))continue;
      ({version,exportedVersion}=runtime);versionSource='seed-linked-runtime-and-renderer';
    }else if(name.startsWith('@deepseek-ai/dsh-client-')&&semver.valid(declared)){
      version=declared;versionSource='frontend-exact-build-dependency';
    }else continue;
    result.push({name,version,scope:'browser-seed',versionSource,...(exportedVersion?{exportedVersion}:{}),words:[...seed.keys()].filter(word=>word===name||word.startsWith(name+'/')).sort()});
  }
  return result;
}
function imports(ast,clientRequires=[]){
  const specs=[],requires=new Set(['require','__require']),creators=new Set(['createRequire']);let unknown=false;
  walk(ast,n=>{if(n.type==='ImportDeclaration'&&['node:module','module'].includes(literal(n.source)))for(const item of n.specifiers)if(item.imported?.name==='createRequire')creators.add(item.local.name);});
  const createsRequire=n=>n?.type==='CallExpression'&&(n.callee.type==='Identifier'&&creators.has(n.callee.name)||n.callee.type==='MemberExpression'&&key(n.callee.property)==='createRequire');
  const clientRequire=Symbol('client-require'),nodeRequire=Symbol('node-require'),pending=[{node:ast,scope:{values:new Map(clientRequires.map(name=>[name,clientRequire])),parent:null}}];
  while(pending.length){let {node:n,scope}=pending.pop();
    if(n.type==='Program'||n.type==='BlockStatement'||/Function/.test(n.type)){
      const values=new Map();if(n.params)for(const param of n.params)if(param.type==='Identifier')values.set(param.name,undefined);
      for(const statement of Array.isArray(n.body)?n.body:[]){
        if(statement.type==='VariableDeclaration')for(const d of statement.declarations)if(d.id.type==='Identifier')values.set(d.id.name,createsRequire(d.init)?nodeRequire:statement.kind==='const'?literal(d.init):undefined);
        if(['FunctionDeclaration','ClassDeclaration'].includes(statement.type)&&statement.id)values.set(statement.id.name,undefined);
      }
      scope={values,parent:scope};
    }
    const value=node=>{if(node?.type!=='Identifier')return literal(node);for(let s=scope;s;s=s.parent)if(s.values.has(node.name)){const v=s.values.get(node.name);return typeof v==='string'?v:undefined;}return undefined;};
    if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(n.type)&&n.source)specs.push(literal(n.source));
    else if(n.type==='ImportExpression'){const s=value(n.source);if(s===undefined)unknown=true;else specs.push(s);}
    else if(n.type==='CallExpression'&&n.callee.type==='Identifier'){
      let loader=false;for(let s=scope;s;s=s.parent)if(s.values.has(n.callee.name)){loader=[clientRequire,nodeRequire].includes(s.values.get(n.callee.name));break;}
      if(loader||requires.has(n.callee.name)||/^require\$\d+$/.test(n.callee.name)){const s=value(n.arguments[0]);if(s===undefined)unknown=true;else specs.push(s);}
    }
    for(const v of Object.values(n)){if(Array.isArray(v)){for(const x of v)if(x?.type)pending.push({node:x,scope});}else if(v?.type)pending.push({node:v,scope});}
  }return {specs:specs.filter(Boolean),unknown};
}
function consumer(pkg,name,read,words=[name]){
  const m=pkg.manifest,decl=m?.dsh?.client;if(decl?.platform!=='web')return {ok:false,reason:'no-web-client-contract'};
  const strings=(value)=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.entries(value).filter(([k])=>k!=='types'&&k!=='browser').flatMap(([,v])=>strings(v)):[];
  const client=strings(m.exports?.['./client']);if(client.length!==1)return {ok:false,reason:'client-entry-unproven'};
  const base=path.dirname(pkg.path),files=new Map(),seen=new Set(),bare=new Set();let dynamic=false;
  function resolve(from,spec){const value=path.normalize(path.join(path.dirname(from),spec));if(!value.startsWith(base+'/'))throw Error('outside package');for(const f of [value,value+'.js',value+'.mjs',value+'.cjs',value+'/index.js']){const bytes=read(f);if(bytes!==undefined)return {path:f,bytes};}throw Error('missing source');}
  function graph(entries){const queue=[...entries];while(queue.length){const item=queue.shift();if(seen.has(item.path))continue;seen.add(item.path);if(seen.size>1024)throw Error('graph limit');files.set(item.path,hash(item.bytes));if(!/\.(?:c?js|mjs)$/.test(item.path))continue;const found=imports(parse(item.bytes.toString('utf8')));dynamic||=found.unknown;
      for(const spec of found.specs){if(spec.startsWith('.'))queue.push(resolve(item.path,spec));else bare.add(spec);}
    }}
  try{
    const entry=resolve(pkg.path,client[0]),ast=parse(entry.bytes.toString('utf8'));let registration;
    walk(ast,n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&key(n.callee.property)==='load'&&n.arguments[0]?.type==='ObjectExpression'){const p=new Map(n.arguments[0].properties.filter(x=>x.type==='Property').map(x=>[key(x.key),x.value]));if([m.name,m.name+'/client'].includes(literal(p.get('id')))&&/Function/.test(p.get('factory')?.type||''))registration=p.get('factory');}});
    if(!registration)return {ok:false,reason:'client-registration-unproven'};
    const clientImports=imports(registration.body,registration.params[0]?.type==='Identifier'?[registration.params[0].name]:[]);
    // The web factory's dynamic callbacks are not Node imports. Check known
    // peer subpaths here; this is not a verifier of arbitrary client behavior.
    if(decl.external!==undefined&&(!Array.isArray(decl.external)||decl.external.some(x=>typeof x!=='string')))return {ok:false,reason:'client-contract-invalid'};
    const requests=[...new Set([...clientImports.specs,...(decl.external||[])].filter(s=>s===name||s.startsWith(name+'/')))].sort();
    if(requests.some(s=>!words.includes(s)))return {ok:false,reason:'browser-subpath-unavailable'};
    const hostEntries=[];
    // The DSH Loader activates the package root. Testing/SDK subpath exports
    // are not startup roots; relative imports from the actual root are followed.
    if(m.exports){const entry=typeof m.exports==='string'?m.exports:m.exports['.']??m.exports;for(const file of strings(entry))if(/\.(?:c?js|mjs)$/.test(file))hostEntries.push(resolve(pkg.path,file));}
    else if(m.main)hostEntries.push(resolve(pkg.path,m.main));
    if(!hostEntries.length)return {ok:false,reason:'host-entry-unproven'};
    graph(hostEntries);if(dynamic)return {ok:false,reason:'dynamic-host-import-unproven'};
    if([...bare].some(s=>s===name||s.startsWith(name+'/')))return {ok:false,reason:'peer-consumed-by-node'};
    const hostFiles=[...files].sort(([a],[b])=>a.localeCompare(b,'en')).map(([path,sha256])=>({path,sha256}));
    return {ok:true,clientPath:entry.path,clientSHA256:hash(entry.bytes),requests,hostFiles};
  }catch{return {ok:false,reason:'consumer-source-unproven'};}
}
module.exports={providers,consumer};
