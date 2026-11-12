import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAsarVersion } from './lib/collect.js';

const MIGRATION_WARNING='私人环境 ZIP 未加密，可能含凭据、Prompt、会话、附件、记忆和插件数据。新版会收录已识别的外部记忆、Skills、工作区配置、插件载荷与已知偏好，不递归打包工程源码或 DSH 安装程序。未识别、缺失或不兼容项目会列入计划，关键项目未经验证不能提交。必须正常关闭 DSH 和相关写入者；完整性校验不代替恢复启动验收。';
import { collectSafeConfiguration } from './lib/safe-export.js';
import { createZip } from './lib/zip.js';
import { chooseDirectory, chooseSavePath, confirmColdBackup } from './lib/dialog.js';
import { startColdTask } from './lib/cold-task.js';
import { recoverColdTask } from './lib/task-guard.js';
import { readUiOverview } from './lib/ui-overview.js';
import { startColdRetention } from './lib/cold-retention.js';
import { TargetDirectoryError, defaultDirectory, resolveDirectory, resolveTarget, safeDefaultName } from './lib/target.js';
import {
  TargetExistsError,
  TargetIdentityChangedError,
  findStaleTemps,
  inspectTarget,
  writeZipAtomic,
} from './lib/write.js';

const PREFIX = '/plugins/dsh-environment-packer';
const PACKAGE_NAME = 'dsh-environment-packer';
const MAX_BODY_BYTES = 8 * 1024;
const DIALOG_CODES = new Set([
  'SAVE_DIALOG_UNAVAILABLE',
  'SAVE_DIALOG_FAILED',
  'SAVE_DIALOG_TIMEOUT',
  'SAVE_DIALOG_BAD_OUTPUT',
  'DIRECTORY_DIALOG_UNAVAILABLE',
  'DIRECTORY_DIALOG_FAILED',
  'DIRECTORY_DIALOG_TIMEOUT',
  'DIRECTORY_DIALOG_BAD_OUTPUT',
]);
// Destinations the caller can fix: a bad folder, a bad name, or an unsafe
// parent. These are request errors, not host failures.
const CALLER_CODES = new Set([
  'PRIVATE_CONFIRMATION_REQUIRED',
  'QUIESCENT_CONFIRMATION_REQUIRED',
  'DSH_VERSION_REQUIRED',
  'TARGET_REQUIRED',
  'TARGET_MUST_BE_ZIP',
  'TARGET_PARENT_MISSING',
  'TARGET_PARENT_REPARSE',
  'TARGET_VOLUME_NOT_WRITABLE',
  'TARGET_VOLUME_NO_ACL',
  'TARGET_VOLUME_NO_HARDLINK',
]);

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function sameOrigin(request, server) {
  const origin = request.headers.origin;
  if (!origin) return true;
  let own;
  try { own = server.getOrigin?.() ?? null; } catch { own = null; }
  if (!own) return false;
  try { return new URL(origin).origin === new URL(own).origin; } catch { return false; }
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('REQUEST_BODY_TOO_LARGE'), { code: 'REQUEST_BODY_TOO_LARGE' });
    chunks.push(chunk);
  }
  if (size === 0) return {};
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('INVALID_REQUEST_BODY'), { code: 'INVALID_REQUEST_BODY' });
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/** Do not expose filesystem/parser/dialog text that may contain private values. */
function detailsOf() { return undefined; }
function reportFailure(error, code) {
  const safe = /^[A-Z0-9_]+$/.test(code) ? code : 'INTERNAL_ERROR';
  console.error('[dsh-environment-packer] ' + safe);
}

/**
 * The profile whose `node_modules` entry resolves to this module.
 *
 * This is the env-free detector: whatever the Host exports, the profile that
 * owns this install contains `<profile>/node_modules/dsh-environment-packer`
 * pointing at the same real directory as this file (a `link:` install becomes a
 * junction, so its real path is the development tree).
 */
function profileOwningThisModule(dshHome) {
  let self;
  try {
    self = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
  } catch {
    return null;
  }
  let entries;
  try {
    entries = fs.readdirSync(path.join(dshHome, 'profiles'), { withFileTypes: true });
  } catch {
    return null;
  }
  const wanted = self.toLowerCase();
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const profile = path.join(dshHome, 'profiles', entry.name);
    let installed;
    try {
      installed = fs.realpathSync(path.join(profile, 'node_modules', PACKAGE_NAME));
    } catch {
      continue;
    }
    if (installed.toLowerCase() !== wanted) continue;
    if (fs.statSync(path.join(profile, 'package.json'), { throwIfNoEntry: false })?.isFile()) {
      return profile;
    }
  }
  return null;
}

function profileDirectory() {
  const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
  const candidates = [];
  const override = process.env.DSH_ENVIRONMENT_PACKER_PROFILE_DIR;
  if (override) candidates.push(override);
  if (process.env.DSH_PROFILE_DIR) candidates.push(process.env.DSH_PROFILE_DIR);
  const owner = profileOwningThisModule(dshHome);
  if (owner) candidates.push(owner);
  candidates.push(path.join(dshHome, 'profiles', process.env.DSH_PROFILE || 'desktop'));
  try {
    candidates.push(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  } catch { /* fall through to the error below */ }
  for (const candidate of candidates) {
    const stat = fs.statSync(path.join(candidate, 'package.json'), { throwIfNoEntry: false });
    if (stat?.isFile()) return candidate;
  }
  throw Object.assign(new Error('PROFILE_UNRESOLVED'), { code: 'PROFILE_UNRESOLVED' });
}

export function apply(ctx, config = {}) {
  let routeDispose;
  let busy = false;
  // Import only the known, validated preference once per restored origin.
  // The script runs in the index head before client plugins read localStorage.
  ctx.on('webserver/index-inject', table => {
    const file=path.join(process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),'PACKER-CLIENT-PREFERENCES.json');
    if(!fs.existsSync(file))return;
    try{
      const record=JSON.parse(fs.readFileSync(file,'utf8'));
      if(!/^[a-f0-9]{64}$/.test(record.planId)||record.key!=='dsh-chat-comfort.settings.v1')return;
      const value={enabled:record.value.enabled,density:record.value.density};
      if(typeof value.enabled!=='boolean'||!['compact','comfortable'].includes(value.density))return;
      const data=JSON.stringify({id:record.planId,key:record.key,value}).replaceAll('<','\\u003c');
      table.push({kind:'script',placement:'head',text:`try{const p=${data},m='dsh-packer.preference-import.'+p.id;if(!localStorage.getItem(m)){localStorage.setItem(p.key,JSON.stringify(p.value));localStorage.setItem(m,'1')}}catch{}`});
    }catch{/* A malformed private preference must never become executable script. */}
  });

  const ensureRoute = () => {
    if (routeDispose) return;
    const server = ctx.get('webServer') ?? ctx.get('httpServer');
    if (!server || typeof server.register !== 'function') return;

    routeDispose = server.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (request, response) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        const isCreate = pathname === `${PREFIX}/create` && request.method === 'POST';
        const isFull = pathname === `${PREFIX}/create-full` && request.method === 'POST';
        const isCold = pathname === `${PREFIX}/cold-backup` && request.method === 'POST';
        const isRecover = pathname === `${PREFIX}/recover-cold-task` && request.method === 'POST';
        const isDefaults = pathname === `${PREFIX}/defaults` && request.method === 'GET';
        const isPick = pathname === `${PREFIX}/pick-directory` && request.method === 'POST';
        if (!isCreate && !isFull && !isCold && !isRecover && !isDefaults && !isPick) {
          sendJson(response, 404, { ok: false, error: 'Not found' });
          return;
        }
        if (!sameOrigin(request, server)) {
          sendJson(response, 403, { ok: false, error: 'Cross-origin request refused' });
          return;
        }
        const fetchSite = request.headers['sec-fetch-site'];
        if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
          sendJson(response, 403, { ok: false, error: 'Cross-site request refused' });
          return;
        }
        if (isDefaults) {
          let currentProfile = null;
          try { currentProfile = profileDirectory(); } catch { /* Unknown is displayed explicitly; no profile is created. */ }
          sendJson(response, 200, {
            ok: true,
            profileDirectory: currentProfile,
            taskOverview: readUiOverview(process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')),
            version: '0.7.3',
            coldOnly: true,
            quitMode: 'manual-normal-exit',
            directory: defaultDirectory(),
            platform: process.platform,
            dialog: process.platform === 'win32',
            privateWarning: MIGRATION_WARNING,
            dshVersion: readAsarVersion(path.join(process.env.DSH_DESKTOP_ROOT || path.dirname(process.execPath), 'resources', 'app.asar')), 
          });
          return;
        }
        // Retired, including callers that still send the old confirmation flags.
        if (isFull) {
          sendJson(response, 410, {ok:false,error:'HOT_BACKUP_DISABLED',code:'HOT_BACKUP_DISABLED'});
          return;
        }
        if (busy) {
          sendJson(response, 429, { ok: false, error: 'COLD_OPERATION_BUSY', code:'COLD_OPERATION_BUSY' });
          return;
        }

        busy = true;
        try {
          const body = await readBody(request);
          if(isRecover) {
            const result=await recoverColdTask(process.env.DSH_HOME || path.join(os.homedir(),'.dsh'),{confirmLegacyTaskId:body.confirmLegacyTaskId});
            sendJson(response,200,result);return;
          }
          if (isCold) {
            const homeDir = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
            if (fs.existsSync(path.join(homeDir,'.packer-cold','active.lock'))) throw Object.assign(new Error('COLD_TASK_ACTIVE'),{code:'COLD_TASK_ACTIVE'});
            // The host, never the browser, supplies source paths, runtime and task parameters.
            const target = typeof body.manualTarget === 'string' && body.manualTarget.trim()
              ? body.manualTarget.trim()
              : await chooseSavePath({defaultName:safeDefaultName('dsh-private-cold-'+Date.now()+'.zip')});
            if (!target) {sendJson(response,200,{ok:false,cancelled:true});return;}
            const info = inspectTarget(target);
            if (info.exists) throw new TargetExistsError(info.target);
            if (!await confirmColdBackup()) {sendJson(response,200,{ok:false,cancelled:true});return;}
            const dshVersion = readAsarVersion(path.join(process.env.DSH_DESKTOP_ROOT || path.dirname(process.execPath),'resources','app.asar'));
            const task = await startColdTask({homeDir,profileDir:profileDirectory(),target:info.target,dshVersion,confirmExternal:true,archiveMode:'migrate',clientPreferences:body.clientPreferences});
            sendJson(response,202,{ok:true,...task});
            return;
          }
          if (isPick) {
            // Picking a folder only fills the target field. Nothing is written,
            // so a picker can never produce a file the operator did not ask for.
            const picked = await chooseDirectory({ initialDirectory: body.initialDirectory });
            if (!picked) {
              sendJson(response, 200, { ok: false, cancelled: true });
              return;
            }
            sendJson(response, 200, { ok: true, directory: picked });
            return;
          }
          const editorEntries = () => {
            try {
              const editor = ctx.get('configEditor');
              if (editor && typeof editor.entries === 'function') return editor.entries();
            } catch { /* an unavailable editor just means no config entries */ }
            return [];
          };

          const requestedName = safeDefaultName(body.defaultName ?? body.fileName);
          const useDialog = body.mode === 'dialog';
          let target;
          if (useDialog) {
            // Optional convenience path: the native Save As dialog. A failure
            // here is reported with its own code and the dialog's own words,
            // and the directory field in the UI stays usable as a fallback.
            target = await chooseSavePath({ defaultName: requestedName });
            if (!target) {
              sendJson(response, 200, { ok: false, cancelled: true });
              return;
            }
          } else {
            target = resolveTarget({ directory: body.directory, fileName: requestedName });
          }

          // The overwrite prompt is not an authorization to replace a file that
          // appears later. Inspect now, refuse existing targets, and let
          // writeZipAtomic perform the final atomic no-replace commit.
          const targetInfo = inspectTarget(target);
          if (targetInfo.exists) throw new TargetExistsError(targetInfo.target);

          const environment = collectSafeConfiguration({profileDir:profileDirectory(), entries:editorEntries()});
          const archive = createZip(environment.files);
          const written = writeZipAtomic(targetInfo.target, archive, {parentReal:targetInfo.parentReal,parentDev:targetInfo.parentDev,parentIno:targetInfo.parentIno});
          const staleTemps = findStaleTemps(targetInfo.parent, targetInfo.base)
            .map((value) => path.basename(value));
          sendJson(response, 200, {
            ok: true,
            path: written.path,
            bytes: written.bytes,
            sha256: written.sha256,
            entries: environment.files.length,
            manifest: environment.manifest,
            cleanup: written.cleanup,
            staleTemps,
          });
        } catch (error) {
          if(/^COLD_(?:TASK_|OPERATION_|STATE_|IDENTITY_|LEGACY_)/.test(error?.code||'')) {
            sendJson(response,409,{ok:false,error:error.code,code:error.code});return;
          }
          if (error instanceof TargetExistsError || error?.code === 'TARGET_EXISTS') {
            sendJson(response, 409, { ok: false, error: 'TARGET_EXISTS', code: 'TARGET_EXISTS' });
            return;
          }
          if (error instanceof TargetIdentityChangedError || error?.code === 'TARGET_IDENTITY_CHANGED') {
            sendJson(response, 409, { ok: false, error: 'TARGET_IDENTITY_CHANGED', code: 'TARGET_IDENTITY_CHANGED' });
            return;
          }
          if (error?.code === 'COMMIT_VERIFY_FAILED') {
            sendJson(response, 500, {
              ok: false,
              error: 'COMMIT_VERIFY_FAILED',
              code: 'COMMIT_VERIFY_FAILED',
              targetRemoved: error.targetRemoved === true,
            });
            return;
          }
          if (error instanceof TargetDirectoryError || CALLER_CODES.has(error?.code)) {
            const details = detailsOf(error, error.code);
            sendJson(response, 400, details
              ? { ok: false, error: error.code, code: error.code, details }
              : { ok: false, error: error.code, code: error.code });
            return;
          }
          if (DIALOG_CODES.has(error?.code)) {
            reportFailure(error, error.code);
            const details = detailsOf(error, error.code);
            sendJson(response, 502, details
              ? { ok: false, error: error.code, code: error.code, details }
              : { ok: false, error: error.code, code: error.code });
            return;
          }
          const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'INTERNAL_ERROR';
          const details = detailsOf(error, code);
          reportFailure(error, code);
          sendJson(response, 500, details ? { ok: false, error: code, code, details } : { ok: false, error: code, code });
        } finally {
          busy = false;
        }
      },
    });
  };

  ctx.effect(() => {
    ensureRoute();
    const off = ctx.on('internal/service', ensureRoute);
    const stopRetention = startColdRetention(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'));
    return () => {
      stopRetention();
      off?.();
      try { routeDispose?.(); } catch { /* best effort */ }
      routeDispose = undefined;
    };
  });
}
