import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apply } from '../index.js';

// Drive the real HTTP handler with a fake webserver/ctx, the way the desktop
// host does, and check that an export lands in a caller-supplied directory
// without any native dialog being involved.

let route;
const server = {
  register(options) { route = options; return () => { route = undefined; }; },
  getOrigin() { return 'http://127.0.0.1:9375'; },
};
const ctx = {
  get(name) {
    if (name === 'webServer') return server;
    if (name === 'configEditor') return { entries: () => [] };
    if (name === 'workingDirectory') return { defaultDirectory: process.cwd() };
    return undefined;
  },
  on() { return () => {}; },
  effect(fn) { return fn(); },
};
apply(ctx);
assert.ok(route, 'host route was not registered');

function request(method, url, headers = {}, body = '') {
  const chunks = body === '' ? [] : [Buffer.from(body, 'utf8')];
  return {
    method,
    url,
    headers,
    [Symbol.asyncIterator]() {
      let index = 0;
      return { next: async () => (index < chunks.length ? { value: chunks[index++], done: false } : { value: undefined, done: true }) };
    },
  };
}

function response() {
  const state = { status: 0, body: '' };
  return {
    state,
    writeHead(status) { state.status = status; },
    end(body) { state.body = Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? ''); },
  };
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-packer-route-'));

const fixtureProfile=path.join(scratch,'home','profiles','synthetic');
fs.mkdirSync(fixtureProfile,{recursive:true});fs.writeFileSync(path.join(fixtureProfile,'package.json'),'{"name":"synthetic","dependencies":{}}');
const previousProfile=process.env.DSH_ENVIRONMENT_PACKER_PROFILE_DIR;process.env.DSH_ENVIRONMENT_PACKER_PROFILE_DIR=fixtureProfile;
const previousHome=process.env.DSH_HOME;process.env.DSH_HOME=path.join(scratch,'home');
// defaults: the UI needs a real folder to pre-fill
let res = response();
await route.handler(request('GET', '/plugins/dsh-environment-packer/defaults'), res);
assert.equal(res.state.status, 200);
const defaults = JSON.parse(res.state.body);
assert.equal(defaults.ok, true);
assert.equal(defaults.profileDirectory, fixtureProfile);
assert.equal(defaults.taskOverview.state,'no-records');
assert.equal(fs.existsSync(path.join(process.env.DSH_HOME,'.packer-cold')),false,'overview must not create lock resources');
assert.equal(path.isAbsolute(defaults.directory), true);
assert.equal(typeof defaults.dialog, 'boolean');
assert.equal(defaults.platform, process.platform);

// a missing directory is a caller error, not an internal one
res = response();
await route.handler(request('POST', '/plugins/dsh-environment-packer/create',
  { 'content-type': 'application/json' }, JSON.stringify({})), res);
assert.equal(res.state.status, 400);
assert.equal(JSON.parse(res.state.body).error, 'TARGET_DIRECTORY_REQUIRED');

res = response();
await route.handler(request('POST', '/plugins/dsh-environment-packer/create',
  { 'content-type': 'application/json' }, JSON.stringify({ directory: 'relative\\folder' })), res);
assert.equal(res.state.status, 400);
assert.equal(JSON.parse(res.state.body).error, 'TARGET_DIRECTORY_NOT_ABSOLUTE');

// the actual export: no dialog, caller-supplied folder
res = response();
await route.handler(request('POST', '/plugins/dsh-environment-packer/create',
  { 'content-type': 'application/json' },
  JSON.stringify({ directory: scratch, defaultName: 'round4' })), res);
const created = JSON.parse(res.state.body);
assert.equal(res.state.status, 200, res.state.body);
assert.equal(created.ok, true);
assert.equal(created.path, path.join(fs.realpathSync.native(scratch), 'round4.zip'));
assert.ok(fs.statSync(created.path).isFile());
assert.ok(created.entries > 0);
assert.equal(created.sha256.length, 64);
assert.equal(fs.readFileSync(created.path).subarray(0, 2).toString('latin1'), 'PK');

// no-overwrite still holds through the HTTP layer
res = response();
await route.handler(request('POST', '/plugins/dsh-environment-packer/create',
  { 'content-type': 'application/json' },
  JSON.stringify({ directory: scratch, defaultName: 'round4' })), res);
assert.equal(res.state.status, 409);
assert.equal(JSON.parse(res.state.body).error, 'TARGET_EXISTS');

// nothing left behind
assert.equal(fs.readdirSync(scratch).filter((name) => name.endsWith('.tmp')).length, 0);

for(const body of [{},{confirmPrivate:true,sourceQuiescent:true}]) {
  res=response();await route.handler(request('POST','/plugins/dsh-environment-packer/create-full',{'content-type':'application/json'},JSON.stringify(body)),res);
  assert.equal(res.state.status,410);assert.equal(JSON.parse(res.state.body).code,'HOT_BACKUP_DISABLED');
}
if(previousProfile===undefined)delete process.env.DSH_ENVIRONMENT_PACKER_PROFILE_DIR;else process.env.DSH_ENVIRONMENT_PACKER_PROFILE_DIR=previousProfile;
if(previousHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome;
console.log('PASS isolated HTTP safe export, no-overwrite and retired hot API (including obsolete flags)');
