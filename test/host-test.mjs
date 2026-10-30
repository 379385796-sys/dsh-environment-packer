import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apply } from '../index.js';

let route;
const server = {
  register(options) {
    route = options;
    return () => { route = undefined; };
  },
  getOrigin() { return 'http://127.0.0.1:9375'; },
};
const ctx = {
  get(name) {
    if (name === 'webServer') return server;
    if (name === 'configEditor') return { entries: () => [{ id: 'foo', name: 'foo', disabled: false }] };
    if (name === 'workingDirectory') return { defaultDirectory: process.cwd() };
    return undefined;
  },
  on() { return () => {}; },
  effect(fn) { return fn(); },
};

apply(ctx);
assert.ok(route, 'host route was not registered');
assert.equal(route.path, '/plugins/dsh-environment-packer');

function request(method, url, headers = {}, body = '') {
  const chunks = body === '' ? [] : [Buffer.from(body, 'utf8')];
  return {
    method,
    url,
    headers,
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next: async () => (index < chunks.length
          ? { value: chunks[index++], done: false }
          : { value: undefined, done: true }),
      };
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

const json = (body) => ({ 'content-type': 'application/json' });
const parse = (res) => JSON.parse(res.state.body);

let res = response();
await route.handler(request('GET', '/plugins/dsh-environment-packer/create'), res);
assert.equal(res.state.status, 404);

res = response();
await route.handler(request('POST', '/plugins/dsh-environment-packer/other'), res);
assert.equal(res.state.status, 404);

res = response();
await route.handler(request('POST', '/plugins/dsh-environment-packer/create', { origin: 'https://evil.example' }), res);
assert.equal(res.state.status, 403);
assert.match(res.state.body, /Cross-origin/);

res = response();
await route.handler(request('POST', '/plugins/dsh-environment-packer/create', { 'sec-fetch-site': 'cross-site' }), res);
assert.equal(res.state.status, 403);
assert.match(res.state.body, /Cross-site/);

// The UI asks for a destination default before the operator clicks anything.
res = response();
await route.handler(request('GET', '/plugins/dsh-environment-packer/defaults'), res);
assert.equal(res.state.status, 200);
const defaults = parse(res);
assert.equal(defaults.ok, true);
assert.equal(path.isAbsolute(defaults.directory), true);
assert.equal(typeof defaults.dialog, 'boolean');

// Same guards reach the defaults endpoint.
res = response();
await route.handler(request('GET', '/plugins/dsh-environment-packer/defaults', { origin: 'https://evil.example' }), res);
assert.equal(res.state.status, 403);

// A missing folder is a caller error with a client-renderable code.
res = response();
await route.handler(request('POST', '/plugins/dsh-environment-packer/create', json()), res);
assert.equal(res.state.status, 400);
assert.equal(parse(res).error, 'TARGET_DIRECTORY_REQUIRED');

res = response();
await route.handler(request('POST', '/plugins/dsh-environment-packer/create', json(),
  JSON.stringify({ directory: 'relative\\folder' })), res);
assert.equal(res.state.status, 400);
assert.equal(parse(res).error, 'TARGET_DIRECTORY_NOT_ABSOLUTE');

res = response();
await route.handler(request('POST', '/plugins/dsh-environment-packer/create', json(),
  JSON.stringify({ directory: path.join(os.tmpdir(), 'dsh-packer-definitely-missing') })), res);
assert.equal(res.state.status, 400);
assert.equal(parse(res).error, 'TARGET_DIRECTORY_MISSING');

// A junction as the destination is refused before anything is written, and the
// refusal is reported as an actionable code rather than INTERNAL_ERROR.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-packer-host-'));
let junction = null;
try {
  const real = path.join(scratch, 'real');
  fs.mkdirSync(real);
  junction = path.join(scratch, 'link');
  fs.symlinkSync(real, junction, 'junction');
} catch {
  junction = null;
}
if (junction !== null) {
  res = response();
  await route.handler(request('POST', '/plugins/dsh-environment-packer/create', json(),
    JSON.stringify({ directory: junction })), res);
  assert.equal(res.state.status, 400, res.state.body);
  assert.equal(parse(res).error, 'TARGET_PARENT_REPARSE');
  assert.equal(fs.readdirSync(path.join(scratch, 'real')).length, 0, 'nothing may be written');
}
fs.rmSync(scratch, { recursive: true, force: true });

console.log('PASS: host route registration + method/origin guards + destination contract');
