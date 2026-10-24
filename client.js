window.__ModuleLoader__.load({
  id: 'dsh-environment-packer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // Only the codes this panel can actually produce. The packing route still
    // returns the richer ZIP-mode codes, but this UI no longer calls it.
    const LABELS = {
      TARGET_DIRECTORY_REQUIRED: '请先填写目标文件夹。',
      TARGET_DIRECTORY_NOT_ABSOLUTE: '目标文件夹必须是绝对路径，例如 D:\\Backups。',
      TARGET_DIRECTORY_MISSING: '目标文件夹不存在。',
      TARGET_DIRECTORY_NOT_FOLDER: '目标路径不是文件夹。',
      TARGET_PARENT_MISSING: '目标文件夹不存在。',
      TARGET_PARENT_REPARSE: '目标文件夹位于链接或 junction 上；为安全起见已停止。',
      TARGET_EXISTS: '目标 ZIP 已存在，请使用新名称或目录。',
      SAFETY_DOC_MISSING: '必需的安全文档缺失，已停止。',
      SAFETY_DOC_UNSAFE: '安全文档路径不安全，已停止。',
      DIRECTORY_DIALOG_UNAVAILABLE: '当前平台不支持 Windows 原生文件夹选择；请直接填写目标文件夹。',
      DIRECTORY_DIALOG_FAILED: '文件夹选择窗口启动失败；请直接填写目标文件夹（下方会显示具体原因）。',
      DIRECTORY_DIALOG_TIMEOUT: '文件夹选择窗口长时间没有响应，已超时；请重试或直接填写目标文件夹。',
      DIRECTORY_DIALOG_BAD_OUTPUT: '文件夹选择窗口返回了无效路径；请直接填写目标文件夹。',
      INTERNAL_ERROR: '操作失败，请检查受控错误码；若进程中断，请查看文档中的临时文件处理。',
    };

    function readError(result, status) {
      const label = LABELS[result?.error] || `生成失败（${result?.error || `HTTP ${status}`}）`;
      const details = Array.isArray(result?.details) ? result.details : [];
      return { label, details };
    }

    function Section() {
      const [phase, setPhase] = React.useState('idle');
      const [message, setMessage] = React.useState('');
      const [details, setDetails] = React.useState([]);
      const [directory, setDirectory] = React.useState('');
      const [mode,setMode]=React.useState('private-full');
      const [confirmed,setConfirmed]=React.useState(false);
      const [quiescent,setQuiescent]=React.useState(false);

      React.useEffect(() => {
        let alive = true;
        fetch('/plugins/dsh-environment-packer/defaults', { cache: 'no-store' })
          .then((response) => response.json())
          .then((result) => {
            if (!alive || !result?.ok) return;
            if (typeof result.directory === 'string') setDirectory(result.directory);
          })
          .catch(() => { /* the field stays editable, this is only a default */ });
        return () => { alive = false; };
      }, []);

      const generate = async () => {
        if (phase === 'running') return;
        if(mode==='private-full'&&(!confirmed||!quiescent)) { setMessage('请阅读警告并确认本次私人备份及暂停写入。'); return; }
        setConfirmed(false); setQuiescent(false);
        setPhase('running');
        setDetails([]);
        setMessage('正在打包全部插件与依赖，可能要几分钟…');
        try {
          const response = await fetch('/plugins/dsh-environment-packer/'+(mode==='private-full'?'create-full':'create'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ directory, confirmPrivate:confirmed, sourceQuiescent:quiescent }),
            cache: 'no-store',
          });
          const result = await response.json();
          if (result?.cancelled) {
            setPhase('cancelled');
            setMessage('已取消，没有生成文件。');
            return;
          }
          if (!response.ok || !result?.ok) {
            const { label, details: extra } = readError(result, response.status);
            setPhase('error');
            setDetails(extra);
            setMessage(label);
            return;
          }
          setPhase('done');
          const size = result.bytes >= 1024 * 1024
            ? `${(result.bytes / 1024 / 1024).toFixed(1)} MB`
            : `${Math.round(result.bytes / 1024)} KB`;
          setMessage(`已保存本地 ZIP：${result.path}（${size}）。${result.cleanup?.tempRemoved===false?'临时文件清理未完成，请按文档处理。':''}`);
        } catch (error) {
          setPhase('error');
          setMessage(error instanceof Error ? error.message : String(error));
        }
      };

      // Fills the field only. Choosing a folder never starts a build.
      const browse = async () => {
        if (phase === 'running') return;
        try {
          const response = await fetch('/plugins/dsh-environment-packer/pick-directory', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ initialDirectory: directory }),
            cache: 'no-store',
          });
          const result = await response.json();
          if (result?.cancelled) return;
          if (!response.ok || !result?.ok) {
            const { label, details: extra } = readError(result, response.status);
            setPhase('error');
            setDetails(extra);
            setMessage(label);
            return;
          }
          if (typeof result.directory === 'string') {
            setDirectory(result.directory);
            setPhase('idle');
            setMessage('');
          }
        } catch (error) {
          setPhase('error');
          setMessage(error instanceof Error ? error.message : String(error));
        }
      };

      const running = phase === 'running';
      const border = '1px solid var(--dsh-border, rgba(127,127,127,.35))';
      const field = {
        padding: '7px 10px',
        borderRadius: '8px',
        border,
        background: 'var(--dsh-surface, transparent)',
        color: 'inherit',
        fontSize: '13px',
        width: '100%',
        boxSizing: 'border-box',
      };

      return h('section', {
        style: {
          display: 'grid',
          gap: '10px',
          padding: '16px',
          border: '1px solid var(--dsh-border, rgba(127,127,127,.28))',
          borderRadius: '12px',
          background: 'var(--dsh-surface, transparent)',
        },
      },
        h('div', { style: { display: 'grid', gap: '4px' } },
          h('h3', { style: { margin: 0, fontSize: '15px' } }, '环境恢复包'),
          h('p', { style: { margin: 0, opacity: 0.72, fontSize: '13px', lineHeight: 1.55 } },
            '完整私人恢复 ZIP 与安全配置导出采用不同范围。恢复只写全新隔离 DSH_HOME；需使用可信的离线恢复命令。'),
        ),
        h('label',null,'模式 ',h('select',{value:mode,disabled:running,onChange:e=>{setMode(e.target.value);setConfirmed(false);setQuiescent(false);setPhase('idle');setMessage('');setDetails([]);}},
          h('option',{value:'private-full'},'完整私人环境恢复包'),h('option',{value:'safe-config'},'安全配置导出（不能恢复环境）'))),
        mode==='private-full' ? h('div',{role:'note'},
          h('p',null,'私人警告：可能包含 API Key、Token、密码、私人 Prompt、会话、附件与记忆。仅本地保存；ZIP 没有加密，不可公开分享。范围：当前 Profile 全目录及插件依赖；DSH_HOME 下 storages、sessions、attachments、memory、skills、AGENTS.md 和 .credentials.yaml/.yml。外部工作区、其他 Profile、浏览器和系统凭据、运行时不包含。'),
          h('label',{style:{display:'block'}},h('input',{type:'checkbox',checked:confirmed,disabled:running,onChange:e=>setConfirmed(e.target.checked)}),'我明确确认本次私人完整备份'),
          h('label',{style:{display:'block'}},h('input',{type:'checkbox',checked:quiescent,disabled:running,onChange:e=>setQuiescent(e.target.checked)}),'我已暂停会话和后台写入（数据库一致性需退出 DSH 后用离线 CLI 备份）'))
          : h('p',null,'仅导出计数和已验证的布尔/有限数字设置。原始配置、标识、Prompt、文档、会话、插件与 tgz 全部排除；ZIP 内列明恢复限制。'),
        h('label', { style: { display: 'grid', gap: '4px', fontSize: '12px', opacity: 0.85 } },
          '目标文件夹',
          h('div', { style: { display: 'flex', gap: '6px' } },
            h('input', {
              type: 'text',
              value: directory,
              spellCheck: false,
              disabled: running,
              placeholder: 'D:\\Backups',
              onChange: (event) => setDirectory(event.target.value),
              style: field,
            }),
            h('button', {
              type: 'button',
              onClick: browse,
              disabled: running,
              title: '选择一个文件夹，只填入这里，不会生成文件',
              style: {
                padding: '7px 12px',
                borderRadius: '8px',
                border,
                background: 'transparent',
                color: 'inherit',
                fontSize: '13px',
                fontWeight: 600,
                cursor: running ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              },
            }, '更改…'),
          ),
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
          h('button', {
            type: 'button',
            onClick: generate,
            disabled: running,
            style: {
              padding: '8px 16px',
              borderRadius: '8px',
              border,
              background: 'var(--dsh-accent, #1f6f5c)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: running ? 'wait' : 'pointer',
              opacity: running ? 0.7 : 1,
            },
          }, running ? '正在生成…' : '生成'),
          h('span', {
            role: 'status',
            'aria-live': 'polite',
            style: {
              fontSize: '12px',
              lineHeight: 1.5,
              color: phase === 'error' ? '#b42318' : 'inherit',
              opacity: phase === 'error' ? 1 : 0.78,
              wordBreak: 'break-all',
            },
          }, message),
        ),
        details.length > 0
          ? h('ul', {
            style: {
              margin: 0,
              padding: '8px 10px 8px 26px',
              borderRadius: '8px',
              background: 'rgba(180,35,24,.08)',
              fontSize: '12px',
              lineHeight: 1.55,
              wordBreak: 'break-all',
            },
          }, details.map((item, index) => h('li', { key: index }, item)))
          : null,
        h('p', { style: { margin: 0, opacity: 0.6, fontSize: '12px', lineHeight: 1.55 } },
          '版本 0.4.1。建议完全退出 DSH 后用离线 CLI 生成一致备份。目标文件夹须已存在；同名 ZIP 不覆盖。恢复支持 Windows、相同架构、Node ABI 和 DSH 精确版本；启动后仍须检查外部依赖。'),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'environment-packer',
          order: 60,
          label: '环境恢复包',
        }, Section));
      },
    };
  },
});
