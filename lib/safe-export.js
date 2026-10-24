import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const C=createRequire(import.meta.url)('../assets/recovery-core.cjs');
// Never export arbitrary strings, names, packages, documents or user prompts.
export function collectSafeConfiguration({profileDir,entries=[]}) {
  C.noLinks(profileDir);
  const data=C.readStable(path.join(profileDir,'package.json'));
  let pkg; try { pkg=JSON.parse(data); } catch { C.fail('PROFILE_PACKAGE_INVALID'); }
  const counts={dependencies:Object.keys(pkg.dependencies||{}).length,bundles:Array.isArray(pkg.dsh?.profile?.bundles)?pkg.dsh.profile.bundles.length:0};
  const settings=[];
  const allow={'dsh-smooth-stream':{enabled:'boolean'},'dsh-ui-appearance':{fontSize:'number'}};
  for(const e of entries) {
    const o=e?.options; if(!o||!Object.hasOwn(allow,o.name)) continue;
    const values={}; for(const [k,type] of Object.entries(allow[o.name])) {
      const v=o.config?.[k]; if(typeof v===type&&(type!=='number'||(Number.isFinite(v)&&v>=8&&v<=48))) values[k]=v;
    }
    if(Object.keys(values).length) settings.push({name:o.name,values});
  }
  const manifest={format:'dsh-safe-configuration/1',mode:'safe-config',complete:false,restorableEnvironment:false,
    counts,settings,exclusions:[
      {scope:'all-raw-profile-files',reason:'unverified-nested-content',impact:'不能还原 Profile、模型、凭据或完整插件配置'},
      {scope:'all-plugin-and-local-packages',reason:'opaque-code-and-tgz-can-contain-secrets',impact:'需要重新安装插件与依赖，不能离线恢复'},
      {scope:'all-sessions-attachments-memory-prompts-documents',reason:'private-free-text',impact:'私人内容、技能与文档没有导出'},
      {scope:'all-identifiers-paths-versions-and-unknown-settings',reason:'arbitrary-strings-may-contain-secrets',impact:'仅保留计数和明确支持的布尔/有限数字配置，无插件安装清单'}]};
  return {manifest,files:[{path:'manifest.json',data:JSON.stringify(manifest,null,2)+'\n'}]};
}
