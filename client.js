window.__ModuleLoader__.load({
  id:'dsh-environment-packer',
  factory(require) {
    const React=require('react'),h=React.createElement;
    const labels={
      TARGET_EXISTS:'目标 ZIP 已存在，请选择新名称；没有覆盖文件。',
      COLD_TASK_ACTIVE:'存在任务锁。请查看独立助手；若任务已结束，请关闭助手后点击“检查并恢复异常任务”。',
      COLD_OPERATION_BUSY:'另一项启动、确认、收尾或恢复操作仍在进行。请先完成或取消已打开的 Windows 窗口；没有窗口时请稍后刷新任务记录，不要重复启动。',
      COLD_CONFIRM_TIMEOUT:'私人冷备份确认窗口等待超时，没有创建备份任务。请重新打开并在 Windows 确认窗口中选择“是”或“否”。',
      COLD_CONFIRM_FAILED:'私人冷备份确认窗口未正常完成，没有创建备份任务。请保留 DSH 运行并检查 Windows 窗口后重试。',
      COLD_TASK_RUNNING_OR_UNPROVEN:'任务仍运行，或无法证明已经安全结束。请查看并关闭已结束的助手窗口；运行中的任务请等待。',
      COLD_STATE_CORRUPT:'任务锁或状态记录损坏，已拒绝恢复。请保留任务目录中的诊断记录。',
      COLD_IDENTITY_UNPROVEN:'无法可靠查询任务进程身份，已拒绝恢复。请保留诊断记录并检查进程查询权限。',
      COLD_LEGACY_UNPROVEN:'旧版任务缺少安全恢复协议，无法证明安全，已保留锁和全部证据。请保留现场交由维护者诊断。',
      COLD_LEGACY_REBOOT_REQUIRED:'未证明旧任务之后发生过完整 Windows 重启。请保存工作后通过 Windows“重新启动”，再回来检查；仅等待、休眠或关机后快速启动不算证明。Packer 不会替你重启。',
      COLD_LEGACY_FULL_BOOT_UNPROVEN:'完整启动证据不足或不一致（可能是快速启动/休眠）。已拒绝恢复并保留原锁。',
      COLD_LEGACY_CLOCK_UNPROVEN:'系统时间记录存在变化或无法与运行时长核对，旧任务先后顺序未获可靠证明。已拒绝恢复。',
      COLD_LEGACY_PROOF_UNAVAILABLE:'无法取得完整、可信的本机启动与文件证据。仅支持本机固定 NTFS 磁盘；原锁保持不变。',
      COLD_STATE_CHANGED:'任务已发生变化，请重新检查，不能使用先前的恢复确认。',
      COLD_LEGACY_RECOVERED:'旧任务已经安全退役，可以使用新 ZIP 名称重新备份。原始日志与残留 ZIP 均已保留，旧备份结果仍未确认。',
      COLD_RECOVERED:'异常任务已安全恢复，可以使用新 ZIP 名称重新备份。故障记录和残留 ZIP 已保留；旧结果仍未确认。',
      COLD_NO_TASK:'当前没有阻止备份的任务锁，可以重新发起备份。',
      ASSISTANT_START_FAILED:'独立助手无法启动。请保持 DSH 运行，未执行备份。',
      ASSISTANT_HANDOFF_TIMEOUT:'助手未在期限内接管，任务已取消。请保持 DSH 运行。',
      SAVE_DIALOG_FAILED:'原生保存窗口启动失败，可在下方输入完整 ZIP 路径后重试。',
      SAVE_DIALOG_TIMEOUT:'原生窗口等待超时，未启动备份。请重试或使用路径后备。',
      SAVE_DIALOG_UNAVAILABLE:'本功能需要 Windows 交互桌面。',
      COLD_WINDOWS_REQUIRED:'离线桌面助手目前仅支持 Windows。',
      TARGET_PARENT_MISSING:'目标文件夹必须已经存在。',
      TARGET_INSIDE_SOURCE:'ZIP 不能保存在正在备份的 DSH_HOME 内。',
      HOT_BACKUP_DISABLED:'运行中完整备份已停用，请使用离线备份。',
      HOST_BROWSER_PEER_UNPROVEN:'浏览器 peer 的版本、来源或运行时兼容性证据不足。recovery/4 会记录该冲突并允许归档；恢复计划会重新检查，未解决的关键问题不能提交。',
      PEER_VERSION_MISMATCH:'依赖版本不满足声明要求。recovery/4 会记录真实冲突并允许归档；恢复计划会重新检查，未解决的关键问题不能提交。',
      TRANSITIVE_DEPENDENCY_MISSING:'传递依赖检查未通过。recovery/4 会保留真实冲突并允许归档；恢复计划会重新检查缺失项、版本及宿主来源，未解决的关键问题不能提交。',
      CLIENT_PREFERENCE_INVALID:'客户端偏好采集数据格式不合法，未创建备份任务。请刷新设置页后重试；Packer 不会用默认值冒充已采集。'
    };
    const css = `
.ep{font:inherit;color:var(--dsw-alias-label-primary,CanvasText);line-height:1.6;min-width:0;container:packer / inline-size;--ep-muted:var(--dsw-alias-label-secondary,GrayText);--ep-subtle:var(--dsw-alias-label-tertiary,GrayText);--ep-line:var(--dsw-alias-border-l2,ButtonBorder);--ep-layer:var(--dsw-alias-bg-layer-2,Canvas);--ep-accent:var(--dsw-alias-brand-primary,Highlight);--ep-warn:var(--dsw-alias-state-warn-primary,CanvasText);--ep-error:var(--dsw-alias-state-error-primary,CanvasText)}
.ep *{box-sizing:border-box}.ep h2,.ep h3,.ep p{margin:0}.ep h2{font-size:1.29em;font-weight:600}.ep h3{font-size:1em;font-weight:500}.ep header{padding:1.6em 0 0}.ep .ep-version{font-size:.64em;font-weight:400;color:var(--ep-subtle);margin-inline-start:.6em}.ep .ep-sub{font-size:.86em;color:var(--ep-muted);margin-top:.35em}.ep .ep-small{font-size:.79em;color:var(--ep-subtle)}.ep .ep-path{font-family:var(--ds-font-family-code,monospace);overflow-wrap:anywhere}.ep svg{width:1.25em;height:1.25em;fill:none;stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;vertical-align:middle}
.ep button,.ep input{font:inherit;color:inherit}.ep button{display:inline-flex;gap:.5em;justify-content:center;align-items:center;padding:.5em 1em;min-height:2.6em;border:1px solid var(--ep-line);border-radius:.65em;background:transparent;cursor:pointer;line-height:1.5;transition:background var(--ds-transition-duration-fast,120ms)}.ep button:hover:enabled{background:var(--dsw-alias-interactive-bg-hover,ButtonFace)}.ep button:disabled{opacity:.5;cursor:wait}.ep button.ep-primary{background:var(--ep-accent);color:var(--dsw-alias-bg-base,Canvas);border-color:transparent;font-weight:500}.ep button.ep-primary:hover:enabled{background:var(--ep-accent);filter:brightness(.95)}.ep button.ep-link{min-height:0;border:0;border-radius:3px;padding:0;color:var(--ep-accent);font-size:.86em;background:transparent}.ep :is(button,summary,input):focus-visible{outline:2px solid var(--dsw-focus-ring-color,Highlight);outline-offset:3px}
.ep .ep-tabs{display:flex;gap:1.7em;border-bottom:1px solid var(--ep-line);margin:1.6em 0 1.7em}.ep .ep-tabs button{font-size:.86em;position:relative;padding:0 0 .8em;min-height:0;border:0;border-radius:0;background:transparent;color:var(--ep-muted)}.ep .ep-tabs button[aria-selected=true]{color:inherit;font-weight:600}.ep .ep-tabs button[aria-selected=true]:after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:currentColor}.ep .ep-profile{display:flex;align-items:center;justify-content:space-between;gap:1em;margin-bottom:1.3em}.ep .ep-profile-name{display:flex;gap:.65em;align-items:center}.ep .ep-profile-icon{display:grid;place-items:center;border:1px solid var(--ep-line);border-radius:.65em;width:2.25em;height:2.25em}.ep .ep-pill{font-size:.79em;padding:.2em .65em;border-radius:6px;color:var(--ep-muted);background:var(--ep-layer)}
.ep .ep-hero{padding:1.55em;border:1px solid var(--ep-line);border-radius:var(--dsw-radius-md,12px);background:linear-gradient(125deg,color-mix(in srgb,var(--ep-accent) 7%,var(--dsw-alias-bg-base,Canvas)),var(--dsw-alias-bg-base,Canvas) 80%)}.ep .ep-hero-top{display:flex;justify-content:space-between;align-items:center;gap:1.5em}.ep .ep-hero h3{font-size:1.43em;font-weight:600;line-height:1.4}.ep .ep-archive{display:grid;place-items:center;width:3.85em;height:3.85em;border:1px solid var(--ep-line);background:var(--dsw-alias-bg-base,Canvas);border-radius:1em;color:var(--ep-accent);flex-shrink:0}.ep .ep-archive svg{width:2em;height:2em}.ep .ep-create{display:flex;align-items:center;gap:1.1em;margin-top:1.55em;flex-wrap:wrap}.ep .ep-flow{font-size:.79em;color:var(--ep-muted);margin-top:1.3em;display:flex;gap:.55em;align-items:center;flex-wrap:wrap}.ep .ep-flow svg{width:.85em;height:.85em}.ep .ep-private{font-size:.79em;color:var(--ep-muted);display:flex;align-items:start;gap:.5em;margin-top:.85em}.ep .ep-private svg{color:var(--ep-warn);margin-top:.2em}
.ep .ep-notice{padding:1em;border-radius:.7em;background:color-mix(in srgb,var(--ep-warn) 8%,var(--dsw-alias-bg-base,Canvas));border:1px solid color-mix(in srgb,var(--ep-warn) 18%,var(--ep-line));margin-top:1.4em;color:var(--ep-warn);font-size:.86em}.ep .ep-notice p{color:var(--ep-muted);margin:.3em 0 .6em}.ep .ep-current{display:flex;align-items:center;gap:.8em;border-top:1px solid var(--ep-line);padding-top:1.4em;margin-top:1.6em}.ep .ep-current>svg{color:var(--ep-subtle)}.ep .ep-current>div{flex:1;min-width:0}.ep .ep-current h3{font-size:.93em}.ep .ep-more{display:flex;align-items:center;justify-content:space-between;gap:1em;margin:1.5em 0 1.7em}.ep .ep-status{font-size:.93em;overflow-wrap:anywhere;padding:1em;border-inline-start:3px solid var(--ep-subtle);background:var(--ep-layer);border-radius:0 .65em .65em 0;margin-bottom:1.5em}.ep .ep-status strong{display:block;font-size:.86em;margin-bottom:.4em}.ep .ep-status[data-tone=error]{border-color:var(--ep-error)}.ep .ep-status[data-tone=running]{border-color:var(--ep-accent)}.ep .ep-status[data-tone=success]{border-color:var(--dsw-alias-state-success-primary,CanvasText)}.ep .ep-status[data-tone=warning]{border-color:var(--ep-warn)}
.ep .ep-heading{display:flex;justify-content:space-between;align-items:center;gap:1em}.ep .ep-heading h3{font-size:1.08em;font-weight:600}.ep .ep-record{padding:1.1em 0;border-bottom:1px solid var(--ep-line)}.ep .ep-record strong{font-size:.93em;font-weight:500}.ep .ep-record p{font-size:.79em;color:var(--ep-muted);margin-top:.3em}.ep .ep-recovery{padding:1.3em;border:1px solid var(--ep-line);border-radius:.85em;margin:1.6em 0}.ep .ep-recovery .ep-sub{margin-bottom:1em}.ep .ep-proof{margin-top:1em;border-top:1px solid var(--ep-line);padding-top:1em}.ep details{padding:1em 0;border-bottom:1px solid var(--ep-line);font-size:.93em}.ep summary{cursor:pointer}.ep details>div{padding-top:1em;color:var(--ep-muted);font-size:.92em}.ep details>div p+p{margin-top:.6em}.ep code{display:block;margin-top:.7em;padding:.85em;background:var(--ep-layer);border-radius:.6em;overflow-wrap:anywhere}.ep input{display:block;width:100%;margin:.7em 0;padding:.7em;border:1px solid var(--ep-line);border-radius:.5em;background:var(--dsw-alias-bg-base,Canvas)}.ep .ep-bottom{padding:1em 0 1.6em;color:var(--ep-muted);font-size:.79em}
@container packer (max-width:440px){.ep .ep-archive{display:none}.ep .ep-hero{padding:1.2em}.ep .ep-profile{align-items:flex-start;flex-wrap:wrap}.ep .ep-more{align-items:flex-start;flex-direction:column;gap:.5em}.ep .ep-tabs{gap:1.1em}.ep button{max-width:100%;white-space:normal}}@media(prefers-reduced-motion:reduce){.ep *{transition:none!important;animation:none!important}}
.ep{--ep-radius:14px}.ep header{padding-top:1.2em}.ep button{border-radius:10px;transition:background 120ms,border-color 120ms,box-shadow 120ms}.ep button:hover:enabled{border-color:color-mix(in srgb,var(--ep-accent) 28%,var(--ep-line));box-shadow:0 2px 6px #00000008}.ep button:active:enabled{box-shadow:none}.ep button:disabled{cursor:not-allowed}.ep .ep-tabs{margin:1.4em 0;gap:1.5em}.ep .ep-profile{padding:.9em 1em;border:1px solid var(--ep-line);border-radius:var(--ep-radius);background:var(--ep-layer);margin-bottom:1em}.ep .ep-profile-icon{background:var(--dsw-alias-bg-base,Canvas);border-radius:10px}.ep .ep-pill{border-radius:20px}.ep .ep-hero{border-radius:18px;padding:1.6em;box-shadow:0 3px 14px #00000006;background:linear-gradient(135deg,color-mix(in srgb,var(--ep-accent) 5%,var(--dsw-alias-bg-base,Canvas)),var(--dsw-alias-bg-base,Canvas) 75%)}.ep .ep-hero h3{font-size:1.35em}.ep .ep-create{margin-top:1.35em}.ep .ep-flow{padding-top:1em;border-top:1px solid var(--ep-line);margin-top:1.3em}.ep .ep-private{padding:.8em 1em;border-radius:12px;background:color-mix(in srgb,var(--ep-warn) 5%,var(--dsw-alias-bg-base,Canvas))}.ep .ep-current{padding:1em;border:1px solid var(--ep-line);border-radius:var(--ep-radius);margin-top:1.1em}.ep .ep-notice,.ep .ep-status,.ep .ep-recovery{border-radius:var(--ep-radius)}.ep .ep-record{margin-top:.65em;padding:.9em 1em;background:var(--ep-layer);border:1px solid var(--ep-line);border-radius:12px}.ep input{border-radius:10px}.ep .ep-status{border:1px solid var(--ep-line);border-inline-start:3px solid var(--ep-subtle)}
.ep header{padding-top:.9em}.ep .ep-tabs{margin:1em 0 1.15em}.ep .ep-hero{padding:1.3em}.ep .ep-create{margin-top:1em}.ep .ep-flow{margin-top:1em;padding-top:.8em}.ep .ep-more{margin:1em 0 1.2em}.ep .ep-recovery{margin:1em 0;padding:1.1em}
.ep{--ep-motion-fast:140ms;--ep-motion-enter:180ms;--ep-ease:cubic-bezier(.2,.8,.2,1)}
.ep button{transition:background var(--ep-motion-fast),border-color var(--ep-motion-fast),box-shadow var(--ep-motion-fast),color var(--ep-motion-fast)}
.ep button:active:enabled{background:color-mix(in srgb,var(--ep-accent) 12%,var(--ep-layer));border-color:var(--ep-accent)}
.ep button.ep-primary:active:enabled{background:var(--ep-accent);filter:brightness(.9)}
.ep .ep-tabs button{box-shadow:none}.ep .ep-tabs button:after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:currentColor;opacity:0;transform:scaleX(.7);transition:opacity var(--ep-motion-fast),transform var(--ep-motion-enter) var(--ep-ease)}
.ep .ep-tabs button[aria-selected=true]:after{opacity:1;transform:scaleX(1)}
.ep [role=tabpanel]{animation:ep-enter var(--ep-motion-enter) var(--ep-ease);min-width:0;outline-offset:4px}
.ep details[open]>div{animation:ep-enter var(--ep-motion-enter) var(--ep-ease)}
.ep summary{border-radius:6px;transition:color var(--ep-motion-fast)}.ep summary:hover{color:var(--ep-accent)}
.ep .ep-profile,.ep .ep-current,.ep .ep-record{background:var(--dsw-alias-bg-layer-2,Canvas)}
.ep .ep-hero{box-shadow:none;border-radius:var(--ep-radius);background:var(--dsw-alias-bg-base,Canvas)}
.ep .ep-status:not([hidden]){animation:ep-feedback var(--ep-motion-enter) var(--ep-ease)}
@keyframes ep-enter{from{opacity:.65;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
@keyframes ep-feedback{from{opacity:.7}to{opacity:1}}
@media(prefers-reduced-motion:reduce){.ep *,.ep *:after{animation:none!important;transition:none!important;transform:none!important}}
`;
    const shapes={archive:'M4 7h16v14H4z M3 3h18v4H3z M9 11h6 M12 11v6 m-2-2 2 2 2-2',folder:'M3 7V4h7l2 3h9v14H3z',chevron:'m9 5 7 7-7 7',clock:'M12 6v6l4 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',warning:'m12 3 10 18H2z M12 9v4 m0 3v.1',shield:'m12 3-8 3v6c0 5 8 9 8 9s8-4 8-9V6z M8 12l3 3 5-6'};
    const icon=name=>h('svg',{viewBox:'0 0 24 24','aria-hidden':true},h('path',{d:shapes[name]||shapes.archive}));
    const action=(name,text,onClick,disabled,primary=false)=>h('button',{type:'button','data-action':name,onClick,disabled,className:primary?'ep-primary':undefined},text);
    function Section() {
      const [busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(''),[fallback,setFallback]=React.useState(false),[target,setTarget]=React.useState('');
      const inFlight=React.useRef(false);
      const [legacy,setLegacy]=React.useState(null),[defaults,setDefaults]=React.useState(null),[tab,setTab]=React.useState('backup'),[loading,setLoading]=React.useState(false);
      React.useEffect(()=>{let alive=true;fetch('/plugins/dsh-environment-packer/defaults',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(r=>{if(alive)setDefaults(r);}).catch(()=>{if(alive)setDefaults({unavailable:true});});return()=>{alive=false;};},[]);
      const refresh=async()=>{if(loading)return;setLoading(true);try{const r=await fetch('/plugins/dsh-environment-packer/defaults',{cache:'no-store'});if(!r.ok)throw Error();setDefaults(await r.json());}catch{setDefaults({unavailable:true});}finally{setLoading(false);}};
      const recover=async(confirmLegacyTaskId)=>{
        if(inFlight.current)return;inFlight.current=true;setTab('tasks');setBusy(true);setMessage('正在检查任务句柄和进程身份…');
        setLegacy(null);
        try{const response=await fetch('/plugins/dsh-environment-packer/recover-cold-task',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(confirmLegacyTaskId?{confirmLegacyTaskId}:{}),cache:'no-store'});const r=await response.json();
          if(r.code==='COLD_LEGACY_REBOOT_ELIGIBLE'){setLegacy(r.taskId);setMessage(`旧任务 ${r.taskId} 已通过初步检查：任务记录早于完整启动，当前未发现任务进程。任务末次记录：${r.proof.taskLatestUtc}；完整启动：${r.proof.bootUtc}。原锁尚未移动。确认后将重新核验并退役旧锁，保留日志和 ZIP；旧备份结果仍未确认。`);}
          else setMessage(labels[r.code||r.error]||`恢复未确认（${r.code||r.error||response.status}），请保留现场。`);}
        catch{setMessage('恢复结果未确认，请再次检查；不要手动删除任务锁。');}finally{inFlight.current=false;setBusy(false);}
      };
      const go=async(manual=false)=>{
        if(inFlight.current)return;inFlight.current=true;setBusy(true);setMessage('请在 Windows 窗口选择 ZIP 保存位置，再完成或取消“确认本次私人冷备份”。未确认不会创建任务；确认窗口可从任务栏找到。');
        try{
          let comfort;try{comfort=JSON.parse(localStorage.getItem('dsh-chat-comfort.settings.v1')||'null');}catch{}
          const clientPreferences={'dsh-chat-comfort.settings.v1':{enabled:typeof comfort?.enabled==='boolean'?comfort.enabled:true,density:comfort?.density==='compact'?'compact':'comfortable'}};
          const response=await fetch('/plugins/dsh-environment-packer/cold-backup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...manual?{manualTarget:target}:{},clientPreferences}),cache:'no-store'});
          const r=await response.json();
          if(r.cancelled){setMessage('已取消；没有创建备份任务，DSH 继续运行。');return;}
          if(!response.ok||!r.ok){setMessage(labels[r.error]||`未启动备份（${r.error||response.status}）。请保持 DSH 运行，检查路径、权限和助手状态。`);if(/^SAVE_DIALOG_/.test(r.error||'')){setFallback(true);setTab('help');}return;}
          setMessage(`独立助手已接管任务 ${r.taskId}。请保存工作，通过 DSH 菜单或托盘正常退出所有 DSH 实例，再到独立助手点击“我已正常退出，检查后继续”。检测未通过不会开始备份。进度和结果请看独立窗口。`);
        }catch{setMessage('交接结果未确认。请先查看独立助手窗口；若无接管成功提示，请保持 DSH 运行，不要重复创建任务。');}
        finally{inFlight.current=false;setBusy(false);}
      };


      const overview=defaults?.taskOverview;
      const fmtBytes=n=>typeof n!=='number'||!Number.isFinite(n)||n<0?'':n>=1073741824?(n/1073741824).toFixed(2)+' GB':n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(0)+' KB':n+' B';
      const fmtTime=ms=>{try{const d=new Date(ms),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;}catch{return '';}};
      const phaseNames={waiting:'等待正常退出与人工确认','exit-verified':'退出检查通过',scanning:'扫描文件','checking-dependencies':'检查依赖',writing:'生成备份',verifying:'验证 ZIP',success:'归档完成（文件完整性通过；恢复状态见本次记录）',failed:'失败或已取消',unknown:'结果未确认'};
      const recorded=overview?.current?.diagnostic?overview.current:overview?.history?.find(t=>t.diagnostic);
      const diagnostic=recorded?.diagnostic;
      const tone=busy||/独立助手已接管任务/.test(message)?'running':/已安全恢复|已经安全退役|当前没有阻止/.test(message)?'success':/失败|损坏|未通过|拒绝|无法|未启动|证据不足/.test(message)?'error':message?'warning':'unknown';
      const stateLabel={running:'执行中',success:'检查完成',error:'需要处理',warning:'请确认',unknown:'尚未检查'}[tone];
      const navigate=(name,text)=>h('button',{type:'button',className:'ep-link',onClick:()=>setTab(name)},text,icon('chevron'));
      const outcomeLabel=task=>{const o=task.result?.outcome;if(o==='success')return task.result?.recoveryState==='blocked'?'归档完成；恢复受阻':task.result?.recoveryState==='unknown'?'归档完成（覆盖状态未记录）':'归档完成（完整性通过）';return o==='cancelled'?'已取消':o==='failed'?'备份失败':o==='unknown'?'结果未确认':task.record==='corrupt'?'状态记录损坏，结果未知':phaseNames[task.phase]||'结果未知';};
      const taskLine=task=>{const r=task.result||null,size=r?fmtBytes(r.bytes):'',when=r?.completedAt?fmtTime(r.completedAt):'';
        return h('div',{key:task.id,className:'ep-record'},h('strong',null,outcomeLabel(task)),
          h('p',{className:'ep-path'},r?.target||task.id),
          h('p',null,[when?`完成 ${when}`:'',size?`大小 ${size}`:'',r&&r.files!==null&&r.files!==undefined?`${r.files} 个文件`:''].filter(Boolean).join(' · ')||`任务 ${task.id}`),
          r?.sha256?h('p',{className:'ep-path'},`SHA-256 ${r.sha256}`):null,
          r?.outcome==='success'?h('p',null,r.integrity==='verified'?'完整性：ZIP 结构、CRC、清单与全部载荷哈希通过':'完整性：未确认'):null,
          r?.outcome==='success'&&r.dependencyIssues>0?h('p',null,`依赖冲突 ${r.dependencyIssues} 项已记录；恢复时重新检查。`):null,
          r?.outcome==='success'&&r.coverage?.state==='critical-gaps'?h('p',null,`已知关键覆盖缺口 ${r.coverage.criticalCount} 项：${(r.coverage.criticalCodes||[]).join('、')||'未列明代码'}。受支持恢复流程被阻断；本包仅作数据保全，源环境可用时请另建新备份，不要修改原 ZIP。`):null,
          r?.outcome==='success'&&r.coverage?.state==='unknown'?h('p',null,'本次记录未含覆盖摘要，不能据此判断恢复可用性。'):null,
          task.error&&r?.outcome!=='success'?h('p',null,`错误码 ${task.error}`):null);};
      const snapshotText=overview?.state==='lock-present'?'有任务记录，需确认是否结束':overview?.state==='corrupt'?'任务锁信息损坏，需检查安全恢复':overview?.state==='no-lock'||overview?.state==='no-records'?'本次备份尚未开始':'任务状态未知，请检查或刷新记录';
      const compatibility=diagnostic?h('div',{className:'ep-notice',role:'note'},diagnostic.unavailable?'保留的依赖诊断不可读取':diagnostic.issueCount>0?`保留的检查记录有 ${diagnostic.issueCount} 项兼容性问题（已写入归档）`:'保留的依赖记录未发现问题',h('p',null,'recovery/4 会把实际冲突保留在归档元数据中；恢复计划会重新检查依赖、宿主与数据 schema，未解决的关键问题会阻断提交。'),navigate('help','查看实际记录')):null;
      const backup=h('div',null,
        h('div',{className:'ep-profile'},h('div',{className:'ep-profile-name'},h('span',{className:'ep-profile-icon'},icon('folder')),h('div',null,h('strong',null,defaults?.profileDirectory?.split(/[\\/]/).filter(Boolean).pop()||'当前 Profile 未确认'),h('p',{className:'ep-small'},'当前 Profile'))),h('span',{className:'ep-pill'},'本次尚未检查')),
        h('div',{className:'ep-hero'},h('div',{className:'ep-hero-top'},h('div',null,h('h3',null,'完整环境备份'),h('p',{className:'ep-sub'},'将插件、配置和私人数据保存为一个恢复包，用于重装、迁移或归档。')),h('div',{className:'ep-archive'},icon('archive'))),h('div',{className:'ep-create'},action('create',busy?'正在准备…':'创建完整环境备份（离线）',()=>go(false),busy,true),h('span',{className:'ep-small'},'选择新的 ZIP 保存位置')),h('div',{className:'ep-flow'},'选择位置',icon('chevron'),'助手接管',icon('chevron'),'正常退出后备份')),
        h('p',{className:'ep-private',role:'note'},icon('warning'),'ZIP 未加密，可能包含密钥与私人会话。请勿公开分享。'),compatibility,
        h('div',{className:'ep-current'},icon('clock'),h('div',null,h('h3',null,snapshotText),h('p',{className:'ep-small'},overview?.current?phaseNames[overview.current.phase]||'任务结果未知':'开始后，进度与结果将在独立助手中显示。'))),
        h('div',{className:'ep-more'},h('span',{className:'ep-small'},'已有任务未结束或无法重试？'),navigate('tasks','任务记录与恢复')));
      const tasks=h('div',null,h('div',{className:'ep-heading'},h('h3',null,'任务记录'),action('refresh',loading?'正在刷新…':'刷新记录',refresh,busy||loading)),h('p',{className:'ep-sub'},'加载时快照不证明任务仍运行或已经失效；检查与确认会重新核验证据。'),overview?.current?taskLine(overview.current):h('p',{className:'ep-sub'},snapshotText),overview?.history?.map(taskLine),h('div',{className:'ep-recovery'},h('h3',null,'恢复异常任务'),h('p',{className:'ep-sub'},'先检查任务归属与安全证据。活动任务受到保护；不能证明安全时，不会解锁。'),action('recover','检查并恢复异常任务',()=>recover(),busy),legacy?h('div',{className:'ep-proof'},h('h3',null,'旧任务已通过初步检查，尚未退役'),h('p',{className:'ep-sub'},'证据见上方检查结果。确认后重新核验并原子退役旧锁，保留日志与残留 ZIP；旧备份结果仍未确认。'),action('confirm-legacy','确认安全退役此旧任务（保留全部证据）',()=>recover(legacy),busy)):null));
      const help=h('div',null,h('h3',null,'帮助与诊断'),h('p',{className:'ep-sub'},'关键阻塞会直接显示；说明、范围和技术详情在这里按需查看。'),
        diagnostic?h('details',null,h('summary',null,diagnostic.unavailable?'保留的依赖诊断不可读取':`保留的依赖诊断：${diagnostic.issueCount} 项问题`),h('div',null,h('p',{className:'ep-path'},`记录任务：${recorded.id}`),h('p',null,'这是该次任务的诊断，不是当前兼容性证明。'),diagnostic.issues?.map((x,i)=>h('code',{key:i,className:'ep-path'},`${x.package||'未知插件'} → ${x.name||'未知依赖'} · 要求 ${x.range||'未提供'}${x.actual?` · 实际 ${x.actual}`:''} · ${x.code}${x.reason==='browser-parser-unavailable'?' · 当前检查进程缺少浏览器解析器；请用随包助手或 --expose-internals 重新检查。':x.reason==='consumer-source-syntax-invalid'?' · 客户端或宿主源码无法解析；未放行恢复。':''}`)),diagnostic.truncated?h('p',null,'仅展示前 100 项，完整诊断保留在任务目录。'):null)):h('p',{className:'ep-sub'},'没有可读取的依赖检查记录。实际备份时仍会执行完整依赖检查。'),
        h('details',null,h('summary',null,'如何完成一次备份'),h('div',null,'选择 ZIP 并确认私人备份 → 助手接管 → 保存工作并正常退出全部 DSH 实例（包括托盘）→ 回到助手人工确认。',h('p',null,'人工确认不能绕过相关进程、源文件读锁、一致性或 ZIP 验证；外部写入程序也须停止。'))),
        h('details',null,h('summary',null,'备份范围与恢复限制'),h('div',null,'完整备份仅覆盖当前 Profile 及声明的 home 状态，不包括外部工作区、模型、外部数据库、系统凭据和 DSH 运行时。',h('p',null,'恢复只允许写入全新兼容环境。ZIP 文件校验通过，不等于恢复后的 DSH 业务运行已验证。'),h('p',null,'归档完成不等于可恢复：若记录显示「恢复受阻」，说明已知关键数据未采集，现有受支持恢复流程不能提交。请保留该包作数据保全，源环境可用时另建新备份。'),h('p',null,'recovery/4 独立只读检查请用完整工具包内的 assets/migration-cli.cjs inspect；旧 verify-private.cjs 仅适用于 recovery/2、/3。检查成功也不等于恢复可提交。'))),
        h('details',null,h('summary',null,'当前 Profile 位置'),h('div',{className:'ep-path'},defaults?.profileDirectory||'尚未取得当前 Profile，不能据此判断备份可用。')),
        h('details',null,h('summary',null,'故障记录与恢复说明'),h('div',null,'日志、残留 ZIP 和提交回执保留在原任务目录。检查后的拒绝原因会直接显示；不要手动删除锁，也不要把未确认的 ZIP 当作成功备份。')),
        h('details',{open:fallback||undefined},h('summary',null,'专家兼容接口与路径后备'),h('div',null,'安全配置导出仅保留兼容接口，不能恢复完整环境。',fallback?h('div',null,h('label',null,'原生窗口不可用时的完整 ZIP 路径：',h('input',{value:target,disabled:busy,onChange:e=>setTarget(e.target.value),placeholder:'D:\\Backups\\private.zip',spellCheck:false,autoComplete:'off'})),action('manual-target','使用此路径并继续确认',()=>go(true),busy||!target.trim())):null)),
        h('p',{className:'ep-bottom'},'界面继承 DSH 的主题与字号；独立助手外观在助手内调整。'));
      const tabNames=[['backup','备份'],['tasks','任务与恢复'],['help','帮助与诊断']];
      const onTabKey=(event,index)=>{let next;if(event.key==='ArrowRight')next=(index+1)%3;else if(event.key==='ArrowLeft')next=(index+2)%3;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;event.preventDefault();setTab(tabNames[next][0]);event.currentTarget.parentElement.children[next].focus();};
      return h('section',{className:'ep','aria-label':'环境恢复包'},h('style',null,css),h('header',null,h('h2',null,'环境恢复包',h('span',{className:'ep-version'},defaults?.version||'0.7.1')),h('p',{className:'ep-sub'},'备份当前环境，在需要时从容恢复。')),
        h('div',{className:'ep-tabs',role:'tablist','aria-label':'环境恢复包功能'},tabNames.map(([name,label],i)=>h('button',{key:name,id:'ep-tab-'+name,type:'button',role:'tab','aria-selected':tab===name,'aria-controls':'ep-panel-'+name,tabIndex:tab===name?0:-1,onClick:()=>setTab(name),onKeyDown:event=>onTabKey(event,i)},label))),
        h('div',{className:'ep-status','data-tone':tone,role:'status','aria-live':'polite','aria-atomic':true,hidden:!message},h('strong',null,stateLabel),message),
        h('div',{key:tab,role:'tabpanel',id:'ep-panel-'+tab,'aria-labelledby':'ep-tab-'+tab,tabIndex:0},tab==='backup'?backup:tab==='tasks'?tasks:help));
    }
    return {inject:['slots'],apply(ctx){ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'environment-packer',order:60,label:'环境恢复包'},Section));}};
  }
});
