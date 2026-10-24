window.__ModuleLoader__.load({
  id:'dsh-environment-packer',
  factory(require) {
    const React=require('react'),h=React.createElement;
    const labels={
      TARGET_EXISTS:'目标 ZIP 已存在，请选择新名称；没有覆盖文件。',
      COLD_TASK_ACTIVE:'已有离线任务或异常中断留下的任务锁。请查看独立助手；不要重复启动。',
      ASSISTANT_START_FAILED:'独立助手无法启动。请保持 DSH 运行，未执行备份。',
      ASSISTANT_HANDOFF_TIMEOUT:'助手未在期限内接管，任务已取消。请保持 DSH 运行。',
      SAVE_DIALOG_FAILED:'原生保存窗口启动失败，可在下方输入完整 ZIP 路径后重试。',
      SAVE_DIALOG_TIMEOUT:'原生窗口等待超时，未启动备份。请重试或使用路径后备。',
      SAVE_DIALOG_UNAVAILABLE:'本功能需要 Windows 交互桌面。',
      COLD_WINDOWS_REQUIRED:'离线桌面助手目前仅支持 Windows。',
      TARGET_PARENT_MISSING:'目标文件夹必须已经存在。',
      TARGET_INSIDE_SOURCE:'ZIP 不能保存在正在备份的 DSH_HOME 内。',
      HOT_BACKUP_DISABLED:'运行中完整备份已停用，请使用离线备份。'
    };
    function Section() {
      const [busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(''),[fallback,setFallback]=React.useState(false),[target,setTarget]=React.useState('');
      const go=async(manual=false)=>{
        if(busy)return;setBusy(true);setMessage('正在打开原生 Save As；选择路径后还需最终确认。');
        try{
          const response=await fetch('/plugins/dsh-environment-packer/cold-backup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(manual?{manualTarget:target}:{}),cache:'no-store'});
          const r=await response.json();
          if(r.cancelled){setMessage('已取消；没有创建备份任务，DSH 继续运行。');return;}
          if(!response.ok||!r.ok){setMessage(labels[r.error]||`未启动备份（${r.error||response.status}）。请保持 DSH 运行，检查路径、权限和助手状态。`);if(/^SAVE_DIALOG_/.test(r.error||''))setFallback(true);return;}
          setMessage(`独立助手已接管任务 ${r.taskId}。请保存工作，通过 DSH 菜单或托盘正常退出所有 DSH 实例，再到独立助手点击“我已正常退出，检查后继续”。检测未通过不会开始备份。进度和结果请看独立窗口。`);
        }catch{setMessage('交接结果未确认。请先查看独立助手窗口；若无接管成功提示，请保持 DSH 运行，不要重复创建任务。');}
        finally{setBusy(false);}
      };
      return h('section',{style:{display:'grid',gap:12,padding:18,border:'1px solid rgba(127,127,127,.3)',borderRadius:12}},
        h('h3',{style:{margin:0}},'环境离线恢复包'),
        h('p',{style:{margin:0,lineHeight:1.6}},'退出 DSH 后生成经过完整性校验的私人恢复包，适用于重装、迁移和长期归档。'),
        h('p',{style:{margin:0,lineHeight:1.6,fontWeight:600}},'本机流程：选择 ZIP → 确认 → 助手接管 → 你手动正常退出 DSH → 在助手中确认 → 检测通过后备份。本机不会自动退出 DSH。'),
        h('p',{role:'note',style:{margin:0,lineHeight:1.6}},'私人警告：可能包含 API Key、Token、密码、私人 Prompt、会话、记忆和附件。ZIP 没有加密，仅保存本地，不适合公开分享。'),
        h('button',{type:'button',disabled:busy,onClick:()=>go(false),style:{padding:'11px 18px',fontWeight:600,borderRadius:8,background:'#1f6f5c',color:'white',border:0,cursor:busy?'wait':'pointer'}},busy?'正在准备…':'创建完整环境备份（离线）'),
        h('div',{role:'status','aria-live':'polite',style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.6}},message),
        fallback?h('div',null,h('label',null,'原生窗口不可用时的完整 ZIP 路径：',h('input',{value:target,disabled:busy,onChange:e=>setTarget(e.target.value),placeholder:'D:\\Backups\\private.zip',style:{width:'100%',boxSizing:'border-box'}})),h('button',{disabled:busy||!target.trim(),onClick:()=>go(true)},'使用此路径并继续确认')):null,
        h('p',{style:{margin:0,fontSize:12,opacity:.7,lineHeight:1.6}},'0.4.2 候选。先保存工作，再确认本次私人备份。当前 Desktop 需手动正常退出；助手不强杀进程，不自动重启 DSH。仅包含当前 Profile 及已声明的 home 状态，外部数据库和写入程序也须停止；外部工作区、模型、系统凭据与运行时不包含。'),
        h('p',{style:{margin:0,fontSize:12,opacity:.7}},'恢复只写全新兼容环境。ZIP 校验通过不等于已证明恢复运行。安全配置导出仅保留专家兼容接口，不能恢复完整环境。')
      );
    }
    return {inject:['slots'],apply(ctx){ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'environment-packer',order:60,label:'环境恢复包'},Section));}};
  }
});
