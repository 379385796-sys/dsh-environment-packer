const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const primary=Object.assign(Error('primary'),{code:'RUNTIME_BOOT_FAILED'}),rollback=Object.assign(Error('rollback'),{code:'RESTORED_ENVIRONMENT_RUNNING_OR_UNPROVEN'}),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/migration-cli.cjs'),'utf8'),{module,require:n=>n==='node:fs'?{existsSync:()=>true}:n==='node:path'?path:n==='./migration-engine.cjs'?{apply:async()=>{},verify:async()=>{throw primary},rollback:async()=>{throw rollback}}:{fail:()=>{throw Error('unexpected')}}});
 await assert.rejects(()=>module.exports.run('restore',{plan:{layout:{state:'D:/synthetic'}}}),e=>e===primary&&e.rollbackCode===rollback.code);
 let component,posts=0,release;const pending=new Promise(r=>release=r),ref={current:false};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>[v,()=>{}],useRef:()=>ref,useEffect:()=>{}};
 const api={slots:{inject:(_,fn)=>fn(),register:(_,fn)=>component=fn}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../client.js'),'utf8'),{window:{__ModuleLoader__:{load:({factory})=>factory(()=>React).apply(api)}},fetch:async()=>{posts++;await pending;return {ok:true,json:async()=>({ok:true,cancelled:true})}},localStorage:{getItem:()=>null}});
 const tree=component(),find=(n,action)=>n&&typeof n==='object'?(n.props?.['data-action']===action?n:n.children?.flat(Infinity).map(c=>find(c,action)).find(Boolean)):undefined;
 const button=find(tree,'create');assert(button);const first=button.props.onClick();await button.props.onClick();assert.equal(posts,1,'stale render must not post a second backup');release();await first;assert.equal(ref.current,false,'request lock released');
 assert(!fs.readFileSync(path.join(__dirname,'../index.js'),'utf8').includes("import { PRIVATE_WARNING }"));
 const result={status:'PASS',checks:['primary failure retained if protective rollback also fails','stale-render double activation posts only once','request guard released after completion','unused warning import removed']};
 const root=process.env.DSH_PACKER_TEST_ROOT;if(!root)throw Error('explicit isolated test root required');fs.writeFileSync(path.join(root,'phase25-quality-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1});
