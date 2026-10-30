'use strict';
const path=require('node:path'),semver=require('../vendor/semver'),H=require('./host-proof.cjs'),C=require('./recovery-core.cjs');
const B=require('./browser-contract.cjs');
// DSH peers and engines.dsh use dsh-app-boot's includePrerelease policy.
// Other peers retain npm's default prerelease rules.
const rangeOptions=name=>name==='@deepseek-ai/dsh'||name.startsWith('@deepseek-ai/dsh-')?{includePrerelease:true}:{};
function analyze(packages,{dshVersion,host,readSource}={}) {
  const installed=new Map(packages.map(p=>[p.path.toLowerCase(),p])),issues=[],optionalMissing=[],requirements=[],hostCandidates=new Set();
  const issue=(code,p,name,range,extra={})=>issues.push({code,package:p.manifest?.name,packagePath:p.path,name,range,...extra});
  const resolve=(from,name)=>{let dir=path.posix.dirname(from);while(dir!=='.'){if(path.posix.basename(dir)!=='node_modules'){const hit=installed.get(`${dir}/node_modules/${name}/package.json`.toLowerCase());if(hit)return hit;}dir=path.posix.dirname(dir);}return undefined;};
  for(const p of packages){const m=p.manifest;
    if(typeof m?.name!=='string'||typeof m.version!=='string'||!semver.valid(m.version)){issue('INSTALLED_PACKAGE_INVALID',p);continue;}
    const malformed=['dependencies','optionalDependencies','peerDependencies','peerDependenciesMeta'].find(key=>m[key]!==undefined&&(!m[key]||typeof m[key]!=='object'||Array.isArray(m[key])));if(malformed){issue('INSTALLED_PACKAGE_INVALID',p,malformed);continue;}
    if(m.engines?.dsh!==undefined&&(typeof m.engines.dsh!=='string'||!semver.validRange(m.engines.dsh)||!semver.satisfies(dshVersion||'',m.engines.dsh,{includePrerelease:true})))issue('DSH_ENGINE_MISMATCH',p,'dsh',m.engines.dsh,{actual:dshVersion});
    const names=new Set([...Object.keys(m.dependencies||{}),...Object.keys(m.optionalDependencies||{}),...Object.keys(m.peerDependencies||{})]);
    for(const name of names){if(!H.validName(name)){issue('PACKAGE_NAME_INVALID',p,name);continue;}
      const peer=Object.hasOwn(m.peerDependencies||{},name),ordinary=Object.hasOwn(m.dependencies||{},name)||Object.hasOwn(m.optionalDependencies||{},name),optional=Object.hasOwn(m.optionalDependencies||{},name)||(!ordinary&&m.peerDependenciesMeta?.[name]?.optional===true),range=peer?m.peerDependencies[name]:undefined;
      const found=resolve(p.path,name);
      if(peer&&(typeof range!=='string'||!semver.validRange(range))){issue('PEER_RANGE_INVALID',p,name,range);continue;}
      if(found){if(peer&&(!semver.valid(found.manifest.version)||!semver.satisfies(found.manifest.version,range,rangeOptions(name))))issue('PEER_VERSION_MISMATCH',p,name,range,{actual:found.manifest.version});continue;}
      // Only a pure peer can come from the installation. Ordinary declared
      // dependencies must remain in the payload; no hidden new scope expansion.
      if(peer&&!ordinary){hostCandidates.add(name);const provider=host?.providers.find(x=>x.name===name);if(provider){if(!semver.valid(provider.version)||!semver.satisfies(provider.version,range,rangeOptions(name)))issue('HOST_PEER_VERSION_MISMATCH',p,name,range,{actual:provider.version});else requirements.push({packagePath:p.path,name,range,version:provider.version});continue;}}
      if(peer&&!ordinary&&host?.browserSeeds?.some(p=>p.name===name)){
        if(p.manifest?.dsh?.client?.platform==='web'){
          const provider=host.browserProviders?.find(x=>x.name===name),consumer=provider&&readSource?B.consumer(p,name,readSource,provider.words):undefined;
          if(provider&&consumer?.ok){
            if(!semver.valid(provider.version)||!semver.satisfies(provider.version,range,rangeOptions(name)))issue('HOST_PEER_VERSION_MISMATCH',p,name,range,{actual:provider.version,realm:'browser'});
            else requirements.push({packagePath:p.path,name,range,version:provider.version,realm:'browser',consumer});
          }else issue('HOST_BROWSER_PEER_UNPROVEN',p,name,range,{reason:consumer?.reason||'browser-version-or-consumer-unproven'});
          continue;
        }
        // A browser seed does not install a Node optional peer. Keep Node's
        // absence/required semantics instead of treating browser presence as Node presence.
      }
      if(optional)optionalMissing.push({package:m.name,name,reason:'optional-not-installed'});else issue('TRANSITIVE_DEPENDENCY_MISSING',p,name,range,{kind:peer&&!ordinary?'peer':'dependency'});
    }
  }
  return {issues,optionalMissing,requirements,hostCandidates:[...hostCandidates].sort()};
}
function verifyContract(manifest,packages,dshVersion,readSource) {
  const proof=manifest.hostRequirements;
  if(manifest.format==='dsh-private-recovery/3'&&!proof)C.fail('HOST_PROOF_INVALID');
  if(proof&&manifest.format!=='dsh-private-recovery/3')C.fail('HOST_PROOF_INVALID');
  const host=proof?H.verifyHost(proof,dshVersion):undefined;
  const result=analyze(packages,{dshVersion,host,readSource});
  if(result.issues.length)C.fail(result.issues[0].code);
  const used=[...new Set(result.requirements.map(r=>r.name))].sort();
  if(proof&&(JSON.stringify(used)!==JSON.stringify([...proof.providers,...(proof.browserProviders||[])].map(p=>p.name).sort())||JSON.stringify(result.requirements)!==JSON.stringify(manifest.hostPeerBindings)))C.fail('HOST_PROOF_INVALID');
  return result;
}
module.exports={analyze,verifyContract};
