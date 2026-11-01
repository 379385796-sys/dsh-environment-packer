'use strict';
// Display-only projection of existing scope/diagnostics. Never reads payload text
// or infers that an unknown Home item, external path or database is disposable.
const text=v=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,'').slice(0,256):'';
function coverageReport(manifest) {
  const files=Array.isArray(manifest.files)?manifest.files:[];
  const home=Array.isArray(manifest.scope?.home)?manifest.scope.home:[];
  const omitted=Array.isArray(manifest.homeEntriesNotCaptured)?manifest.homeEntriesNotCaptured:[];
  return {
    fileIntegrityIsNotBusinessCoverage:true,
    omissionInventoryRecorded:Array.isArray(manifest.homeEntriesNotCaptured),
    exclusionsRecorded:Array.isArray(manifest.exclusions),
    externalReferenceInventoryRecorded:Array.isArray(manifest.externalReferences),
    profile:{scope:text(manifest.scope?.profile),files:files.filter(f=>f.path?.startsWith('profile/')).length,note:'所选 Profile；实际安装包链接实体化。当前收集器不重复打包 node_modules/.pnpm 虚拟存储。'},
    home:home.map(name=>({name:text(name),files:files.filter(f=>f.path===`home/${name}`||f.path?.startsWith(`home/${name}/`)).length})),
    homeEntriesNotCaptured:omitted.map(name=>({name:text(name),needsManualReview:true,note:name==='profiles'?'仅所选 Profile 已收录，其他 Profile 未备份。':'该 Home 项未收录；可能包含重要数据，请自行核对。'})),
    exclusions:(Array.isArray(manifest.exclusions)?manifest.exclusions:[]).map(x=>({scope:text(x?.scope),impact:text(x?.impact)})),
    externalReferences:(Array.isArray(manifest.externalReferences)?manifest.externalReferences:[]).map(x=>({name:text(x?.name),kind:text(x?.kind),originalInstallSourceIncluded:x?.originalInstallSourceIncluded===true,impact:text(x?.impact)})),
    externalReferenceLimits:'这里只列出已识别的包安装源；未扫描任意配置正文中的工作区、数据库连接或绝对路径，不能保证列全。外部工作区/插件数据/数据库文件、模型、系统和浏览器凭据、DSH 运行时需另行准备。',
    requiresExternalResourceReview:true,
  };
}
module.exports={coverageReport};
