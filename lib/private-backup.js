import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const C=createRequire(import.meta.url)('../assets/recovery-core.cjs');
const D=createRequire(import.meta.url)('../assets/dependency-contract.cjs');
const H=createRequire(import.meta.url)('../assets/host-proof.cjs');
const {coverageReport}=createRequire(import.meta.url)('../assets/backup-coverage.cjs');
const VERSION=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url))).version;
export const PRIVATE_WARNING='私人完整备份可能包含 API Key、Token、密码、私人 Prompt、会话、附件与记忆。仅保存本地；ZIP 没有加密，不适合公开分享。包含所选 Profile 文件及已安装插件/依赖（包链接实体化，不重复打包 node_modules/.pnpm 虚拟存储），另含 DSH_HOME 白名单 storages、sessions、attachments、memory、skills、AGENTS.md 和 .credentials.yaml/.yml。未知 Home 项、其他 Profile、外部工作区/插件数据、浏览器登录、系统凭据和运行时不保证收录，须核对覆盖报告。必须完全退出 DSH 并停止相关写入者后备份；ZIP 校验不等于全部业务数据均已备份或恢复可用。';
export const HOME_SCOPE=['storages','sessions','attachments','memory','skills','AGENTS.md','.credentials.yaml','.credentials.yml'];
const EXCLUSIONS=[
  {scope:'package-manager-virtual-store',impact:'node_modules/.pnpm 虚拟存储不重复打包；实际包文件和包链接实体化，Profile 根 lockfile 保留'},
  {scope:'other-profiles',impact:'其他 Profile 必须分别备份'},
  {scope:'other-home-entries',impact:'未列入 HOME_SCOPE 的全局文件、运行时、缓存、日志、浏览器状态不恢复'},
  {scope:'external-workspaces-and-paths',impact:'配置引用的外部项目、模型、可执行程序、系统/浏览器凭据及绝对路径需要手工迁移'},
  {scope:'filesystem-metadata',impact:'不还原原机器 ACL、所有者、硬链接关系、时间戳、NTFS ADS；包内文件为主数据流'},
  {scope:'package-manager-store',impact:'恢复直接物化已装文件，非 pnpm 重装；原 lock integrity 保留，后续安装管理可能需联网及修正本地 link/file 路径'},
];
function inventory(profileDir,homeDir) {
  C.noLinks(profileDir); C.noLinks(homeDir);
  const files=[], directories=[], links=[], seen=new Set();
  function walk(abs,rel,ancestors=new Set(),packageTree=false) {
    C.safeName(rel);
    const key=rel.toLowerCase(); if(seen.has(key)) C.fail('SOURCE_PATH_COLLISION'); seen.add(key);
    let st=fs.lstatSync(abs), actual=abs;
    if(st.isSymbolicLink()) {
      // Only actual package-root links are installation edges. A link inside
      // package data must never expand the selected scope to arbitrary files.
      if(!packageTree||!/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/.][^/]*$/.test(rel)) C.fail('SOURCE_LINK_REFUSED');
      actual=fs.realpathSync.native(abs); C.noLinks(actual); st=fs.lstatSync(actual);
      if(!st.isDirectory()||!C.exists(path.join(actual,'package.json'))) C.fail('SOURCE_LINK_REFUSED');
      links.push({path:rel,action:'materialized-package-link'});
    }
    if(st.isDirectory()) {
      const id=C.identity(st); if(ancestors.has(id)) C.fail('PACKAGE_LINK_CYCLE');
      const next=new Set(ancestors); next.add(id); directories.push(rel);
      for(const name of fs.readdirSync(actual).sort()) {
        if(rel==='profile/node_modules' && name==='.pnpm') continue;
        walk(path.join(actual,name),`${rel}/${name}`,next,packageTree||rel==='profile/node_modules');
      }
    } else if(st.isFile()) {
      if(st.size>C.MAX_FILE) C.fail('SOURCE_TYPE_OR_SIZE');
      files.push({path:rel,source:actual,identity:C.identity(st),bytes:st.size,mtime:st.mtimeMs,ctime:st.ctimeMs});
    } else C.fail('SOURCE_TYPE_OR_SIZE');
    if(files.length+directories.length>C.MAX_ENTRIES-1) C.fail('ARCHIVE_LIMIT');
  }
  for(const name of fs.readdirSync(profileDir).sort()) walk(path.join(profileDir,name),`profile/${name}`);
  for(const name of HOME_SCOPE) if(C.exists(path.join(homeDir,name))) walk(path.join(homeDir,name),`home/${name}`);
  return {files,directories,links};
}
function dependencies(profileDir) {
  let pkg; try { pkg=JSON.parse(C.readStable(path.join(profileDir,'package.json'))); } catch { C.fail('PROFILE_PACKAGE_INVALID'); }
  for(const name of Object.keys({...pkg.dependencies,...pkg.optionalDependencies})) {
    if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)||name.split('/').some(x=>x==='..'||x==='.') ) C.fail('PACKAGE_NAME_INVALID');
    if(!C.exists(path.join(profileDir,'node_modules',name,'package.json'))) C.fail('DECLARED_DEPENDENCY_MISSING');
  }
  const externalReferences=Object.entries({...pkg.dependencies,...pkg.optionalDependencies}).flatMap(([name,spec])=>
    typeof spec==='string'&&/^(file:|link:|https?:|git)/i.test(spec)?[{name,kind:spec.split(':')[0],originalInstallSourceIncluded:false,impact:'已安装文件会恢复；原外部安装源或绝对路径可能需要另行迁移，不能保证重新安装'}]:[]);
  return {declared:Object.keys(pkg.dependencies||{}),externalReferences};
}
function packageMetadata(files) {
  return files.filter(f=>/\/node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(f.path)).map(f=>{
    let manifest;try{manifest=JSON.parse(C.readStable(f.source));}catch{C.fail('INSTALLED_PACKAGE_INVALID');}return {path:f.path,manifest};
  });
}
function checkPayload(files,options={}) {
  const packages=packageMetadata(files),initial=D.analyze(packages,options);
  let host;
  if(initial.hostCandidates.length&&process.versions.electron)host=H.inspectHost(initial.hostCandidates,options.dshVersion,options.probeTask,true);
  const sourceFiles=new Map(files.map(f=>[f.path,f]));
  const result=D.analyze(packages,{...options,host,readSource:name=>{const f=sourceFiles.get(name);return f?C.readStable(f.source):undefined;}});
  // The proof contains exactly the providers actually used, in canonical order.
  if(result.requirements.length){const used=new Set(result.requirements.filter(r=>r.realm!=='browser').map(r=>r.name)),browserUsed=new Set(result.requirements.filter(r=>r.realm==='browser').map(r=>r.name));host.providers=host.providers.filter(p=>used.has(p.name));host.browserProviders=host.browserProviders.filter(p=>browserUsed.has(p.name));if(!host.browserProviders.length){delete host.browserProviders;host.protocol='dsh-desktop-asar/1';}}else host=undefined;
  for(const f of files) {
    if(f.path.startsWith('profile/local-packages/')&&f.path.endsWith('.tgz')) {
      let tar; try {tar=zlib.gunzipSync(C.readStable(f.source),{maxOutputLength:C.MAX_FILE});} catch {C.fail('LOCAL_PACKAGE_CORRUPT');}
      let pos=0,entries=0,ended=false;
      while(pos+512<=tar.length) {
        const h=tar.subarray(pos,pos+512);
        if(h.every(b=>b===0)) {ended=true;break;}
        const sizeText=h.subarray(124,136).toString('ascii').replace(/\0.*$/,'').trim();
        const sumText=h.subarray(148,156).toString('ascii').replace(/\0.*$/,'').trim();
        if(!/^[0-7]+$/.test(sizeText)||!/^[0-7]+$/.test(sumText)) C.fail('LOCAL_PACKAGE_CORRUPT');
        const size=parseInt(sizeText,8); let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:h[i];
        if(sum!==parseInt(sumText,8)||pos+512+size>tar.length) C.fail('LOCAL_PACKAGE_CORRUPT');
        pos+=512+Math.ceil(size/512)*512;entries++;
      }
      if(!ended||!entries||tar.length%512) C.fail('LOCAL_PACKAGE_CORRUPT');
    }
  }
  return {...result,hostRequirements:host,packages:packages.length};
}
// Explicitly read-only. Does not call a DSH Profile loader, start a task,
// create a ZIP, acquire/retire a task lock or read chat/credential contents.
export function precheckPrivateSource({profileDir,homeDir,dshVersion}) {
  const direct=dependencies(profileDir),before=inventory(profileDir,homeDir),result=checkPayload(before.files,{dshVersion});
  const coverage=coverageReport({scope:{profile:'entire-selected-profile',home:HOME_SCOPE},files:before.files,exclusions:EXCLUSIONS,homeEntriesNotCaptured:fs.readdirSync(homeDir).filter(n=>!HOME_SCOPE.includes(n)),externalReferences:direct.externalReferences});
  return {...result,direct,files:before.files.length,directories:before.directories.length,coverage};
}
export function createPrivateBackup(options) {
  if(options.confirmPrivate!==true) C.fail('PRIVATE_CONFIRMATION_REQUIRED');
  if(options.sourceQuiescent!==true) C.fail('QUIESCENT_CONFIRMATION_REQUIRED');
  const {profileDir,homeDir,target,dshVersion}=options;
  if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(dshVersion||'')) C.fail('DSH_VERSION_REQUIRED');
  if(!path.isAbsolute(target)||path.extname(target).toLowerCase()!=='.zip') C.fail('TARGET_MUST_BE_ZIP');
  C.safeName(path.basename(target)); C.noLinks(target);
  if(C.exists(target)) C.fail('TARGET_EXISTS');
  const parent=path.dirname(target), parentId=C.identity(fs.statSync(parent));
  if([profileDir,homeDir].some(root=>!path.relative(root,parent).startsWith('..')&&!path.isAbsolute(path.relative(root,parent)))) C.fail('TARGET_INSIDE_SOURCE');
  options.onPhase?.('scanning');
  const {declared,externalReferences}=dependencies(profileDir), before=inventory(profileDir,homeDir);
  // Optional Windows assistant lease: hold every inventoried source against
  // write/delete throughout packing. CLI remains an explicitly offline expert tool.
  options.onInventory?.(before.files.map(f=>f.source));
  options.onPhase?.('checking-dependencies');
  const probeTask=options.id?{id:options.id,homeDir}:undefined;
  const dependencyCheck=checkPayload(before.files,{dshVersion,probeTask});
  options.onDependencyCheck?.(dependencyCheck);
  if(dependencyCheck.issues.length) C.fail(dependencyCheck.issues[0].code);
  const {optionalMissing,hostRequirements,requirements:hostPeerBindings}=dependencyCheck;
  const temp=path.join(parent,`.${path.basename(target)}.private-${crypto.randomBytes(8).toString('hex')}.tmp`);
  let writer,committed=false,tempIdentity;
  try {
    options.onPhase?.('writing');
    writer=new C.ZipWriter(temp);
    const records=[]; let total=0;
    for(const f of before.files) {
      if(options.signal?.aborted) C.fail('BACKUP_ABORTED');
      const data=C.readStable(f.source); total+=data.length; if(total>C.MAX_TOTAL-16*1024*1024) C.fail('ARCHIVE_LIMIT');
      records.push({path:f.path,bytes:data.length,sha256:C.sha(data)}); writer.add(f.path,data); options.onFile?.(records.length);
    }
    if(JSON.stringify(before)!==JSON.stringify(inventory(profileDir,homeDir))) C.fail('SOURCE_CHANGED');
    for(let i=0;i<before.files.length;i++) if(C.sha(C.readStable(before.files[i].source))!==records[i].sha256) C.fail('SOURCE_CHANGED');
    const manifest={format:hostRequirements?'dsh-private-recovery/3':'dsh-private-recovery/2',...(hostRequirements?{hostRequirements,hostPeerBindings}:{}),mode:'private-full',packerVersion:VERSION,createdAt:new Date().toISOString(),
      warning:PRIVATE_WARNING,encrypted:false,sharing:'private-only',
      compatibility:{dshVersion,platform:process.platform,arch:process.arch,nodeMajor:process.versions.node.split('.')[0],nodeModules:process.versions.modules},
      scope:{profile:'entire-selected-profile',home:HOME_SCOPE},exclusions:EXCLUSIONS,
      homeEntriesNotCaptured:fs.readdirSync(homeDir).filter(n=>!HOME_SCOPE.includes(n)),externalReferences,
      limitations:['须使用可信外部恢复器；哈希只能发现损坏，不能验证发送者身份','必须完全停止 DSH 与相关写入者；文件完整性不证明外部事务一致或业务恢复','链接依赖被物化；循环链接安全失败；未执行生命周期脚本；同平台同架构同 Node ABI 同 DSH 精确版本恢复'],
      declaredDependencies:declared,optionalMissing,directories:before.directories,materializedLinks:before.links,files:records,completeWithinScope:true};
    writer.add('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')); writer.finish();
    options.onPhase?.('verifying');
    const z=C.openZip(temp); try { C.validateManifest(z); } finally { z.close(); }
    const hasher=crypto.createHash('sha256'), hashFd=fs.openSync(temp,'r'), chunk=Buffer.alloc(1024*1024);
    try { let n; while((n=fs.readSync(hashFd,chunk,0,chunk.length,null))>0) hasher.update(chunk.subarray(0,n)); } finally { fs.closeSync(hashFd); }
    const sha256=hasher.digest('hex');
    if(options.signal?.aborted) C.fail('BACKUP_ABORTED');
    if(hostRequirements) H.verifyHost(hostRequirements,dshVersion,probeTask);
    options.beforeCommit?.();
    C.noLinks(parent); if(C.identity(fs.statSync(parent))!==parentId) C.fail('TARGET_IDENTITY_CHANGED');
    tempIdentity=C.identity(fs.statSync(temp));
    fs.linkSync(temp,target); committed=true;
    // A durable receipt precedes publication of success to the coordinator/UI.
    options.onCommitted?.({path:target,sha256,bytes:fs.statSync(target).size,files:records.length,verified:true});
    const result={path:target,sha256,bytes:fs.statSync(target).size,files:records.length,manifest,cleanup:{tempRemoved:false}};
    try { fs.unlinkSync(temp); result.cleanup.tempRemoved=true; } catch { C.fail('BACKUP_CLEANUP_FAILED'); }
    return result;
  } catch(e) {
    writer?.close();
    if(!options.preserveFailureArtifacts && committed && C.exists(target) && C.identity(fs.lstatSync(target))===tempIdentity) {
      try { fs.unlinkSync(target); } catch { C.fail('BACKUP_CLEANUP_FAILED'); }
    }
    if(!options.preserveFailureArtifacts && C.exists(temp)) { try { fs.unlinkSync(temp); } catch { C.fail('BACKUP_CLEANUP_FAILED'); } }
    C.fail(/^[A-Z0-9_]+$/.test(e.code||'') ? e.code : 'BACKUP_FAILED');
  }
}
