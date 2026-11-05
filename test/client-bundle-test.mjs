import assert from 'node:assert/strict';

// Minimal stand-ins so the browser bundle can be executed in Node: this catches
// syntax slips and hook misuse in the settings section without a full UI.
const hooks = { state: [], refs: [], index: 0, effects: [] };
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => {
    const slot = hooks.index++;
    if (!(slot in hooks.state)) hooks.state[slot] = typeof initial === 'function' ? initial() : initial;
    return [hooks.state[slot], (value) => { hooks.state[slot] = value; }];
  },
  useRef: (initial) => {
    const slot = hooks.index++;
    if (!(slot in hooks.refs)) hooks.refs[slot] = { current: initial };
    return hooks.refs[slot];
  },
  useEffect: (fn) => { if (!hooks.effects.length) hooks.effects.push(fn); },
};

let loaded;
globalThis.window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
await import('../client.js');
assert.ok(loaded, 'client bundle did not call __ModuleLoader__.load');
assert.equal(loaded.id, 'dsh-environment-packer');

const exported = loaded.factory((name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected module: ${name}`);
});

let registered;
const ctx = { slots: { inject: (name, factory) => factory() , register: (options, component) => { registered = { options, component }; return () => {}; } } };
exported.apply(ctx);
assert.ok(registered, 'settings section was not registered');
assert.equal(registered.options.name, 'settings.section');
assert.equal(registered.options.id, 'environment-packer');
assert.equal(registered.options.order, 60);
assert.equal(registered.options.label, '环境恢复包');

// Render once: no fetch happens because the effect is captured, not run.
hooks.index = 0;
const tree = registered.component();
assert.equal(tree.type, 'section');
const render = () => { hooks.index = 0; return registered.component(); };
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === 'object' ? [value, ...nodes(value.children)] : [];
}

const buttons = () => nodes(render()).filter(node => node.type === 'button');
const action = name => buttons().find(node => node.props?.['data-action'] === name);
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.children) : '';
const tab = name => buttons().find(node => node.props?.role === 'tab' && text(node) === name);
const status = () => nodes(render()).find(node => node.props?.role === 'status').children.filter(x => typeof x === 'string').join('');
assert.deepEqual(buttons().filter(n=>n.props.role==='tab').map(text),['备份','任务与恢复','帮助与诊断']);
assert.ok(action('create'));assert.equal(tab('设置'),undefined);
assert(!text(render()).includes('24 项'),'historical blockers must not be hardcoded in production UI');
const responses=[],requests=[],reply=(body,status=200)=>({ok:status<400,status,json:async()=>body}),originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{requests.push({url,...init});assert(responses.length,'unexpected request');return responses.shift();};
try {
 assert.equal(requests.length,0,'render must not start backup');
 responses.push(reply({ok:false,cancelled:true}));await action('create').props.onClick();assert.match(status(),/已取消/);assert.match(requests.at(-1).url,/cold-backup$/);assert(!action('create').props.disabled,'cancelled preparation must re-enable creation');
 let finish;responses.push(new Promise(resolve=>finish=resolve));const pending=action('create').props.onClick();assert(action('create').props.disabled);assert.match(status(),/确认本次私人冷备份/);assert.deepEqual(JSON.parse(requests.at(-1).body),{clientPreferences:{'dsh-chat-comfort.settings.v1':{enabled:true,density:'comfortable'}}});
 finish(reply({ok:true,taskId:'synthetic-task'},202));await pending;assert.match(status(),/独立助手已接管任务 synthetic-task/);assert(!action('create').props.disabled);
 tab('任务与恢复').props.onClick();responses.push(reply({ok:false,error:'COLD_TASK_RUNNING_OR_UNPROVEN'},409));await action('recover').props.onClick();assert.match(status(),/无法证明/);assert.match(requests.at(-1).url,/recover-cold-task$/);
 responses.push(reply({ok:true,code:'COLD_RECOVERED'}));await action('recover').props.onClick();assert.match(status(),/已安全恢复/);
 responses.push(reply({ok:false,error:'COLD_LEGACY_UNPROVEN'},409));await action('recover').props.onClick();assert.match(status(),/旧版任务缺少安全恢复协议/);
 responses.push(reply({ok:true,code:'COLD_LEGACY_REBOOT_ELIGIBLE',taskId:'legacy-id',proof:{bootUtc:'2026-01-02T00:00:00Z',taskLatestUtc:'2026-01-01T00:00:00Z'}}));await action('recover').props.onClick();assert.match(status(),/原锁尚未移动/);assert(action('confirm-legacy'));assert.deepEqual(JSON.parse(requests.at(-1).body),{});
 responses.push(reply({ok:true,code:'COLD_LEGACY_RECOVERED'}));await action('confirm-legacy').props.onClick();assert.deepEqual(JSON.parse(requests.at(-1).body),{confirmLegacyTaskId:'legacy-id'});assert.match(status(),/旧任务已经安全退役/);assert(!action('confirm-legacy'));
 responses.push(reply({ok:true,profileDirectory:'D:\\Synthetic\\profiles\\desktop',taskOverview:{state:'no-lock',history:[{id:'synthetic-record',phase:'failed',files:0,record:'available',diagnostic:{issueCount:7,issues:[]}}]}}));await action('refresh').props.onClick();assert.equal(requests.at(-1).method,undefined);tab('备份').props.onClick();assert.match(text(render()),/7 项兼容性问题/);assert(!text(render()).includes('24 项'));
 responses.push(reply({ok:false,error:'SAVE_DIALOG_FAILED'},500));await action('create').props.onClick();assert.equal(tab('帮助与诊断').props['aria-selected'],true);assert(action('manual-target').props.disabled,'empty fallback path cannot submit');
 // Invalid preference capture must be reported clearly, never silently defaulted.
 tab('备份').props.onClick();responses.push(reply({ok:false,error:'CLIENT_PREFERENCE_INVALID'},500));await action('create').props.onClick();assert.match(status(),/格式不合法/);assert.match(status(),/不会用默认值冒充已采集/);
 // A persisted critical gap is visible in the task history and never labelled success.
 tab('任务与恢复').props.onClick();
 responses.push(reply({ok:true,profileDirectory:'D:\\Synthetic\\profiles\\desktop',taskOverview:{state:'no-lock',history:[{id:'blocked-record',phase:'success',files:69,result:{outcome:'success',integrity:'verified',dependencyIssues:1,recoveryState:'blocked',coverage:{schema:1,state:'critical-gaps',criticalCount:1,criticalCodes:['CLIENT_PREFERENCE_NOT_CAPTURED'],recoveryBlocked:true},target:'D:\\Synthetic\\private.zip'}}]}}));
 await action('refresh').props.onClick();assert.match(text(render()),/归档完成；恢复受阻/);assert.match(text(render()),/CLIENT_PREFERENCE_NOT_CAPTURED/);assert.match(text(render()),/受支持恢复流程被阻断/);assert.match(text(render()),/完整性：ZIP 结构/);
} finally {globalThis.fetch=originalFetch;delete globalThis.window;}
console.log('PASS three sections, handoff/cancel/busy guards, actual diagnostic counts, fallback visibility, invalid capture and blocked-coverage history');
