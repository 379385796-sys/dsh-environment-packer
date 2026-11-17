'use strict';
// Windows PowerShell 5.1 decodes a script without a byte-order mark using the
// machine's ANSI code page. Every .ps1 here carries Chinese UI text, so a file
// saved as UTF-8 without BOM parses into garbled tokens and the window dies
// before it can write ui-owner.json - which the host reports as
// ASSISTANT_HANDOFF_TIMEOUT. Keep the marker on every non-ASCII script.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = process.env.DSH_PACKER_TEST_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('DSH_PACKER_TEST_ROOT must be an absolute path');
const repo = path.resolve(__dirname, '..');
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

function scripts(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name === 'test') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scripts(full, out);
    else if (entry.name.toLowerCase().endsWith('.ps1')) out.push(full);
  }
  return out;
}

const files = scripts(repo);
const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
  console.log('PASS ' + name);
}

let offenders = [];
check('every non-ASCII script keeps its UTF-8 BOM', () => {
  for (const file of files) {
    const bytes = fs.readFileSync(file);
    const bom = bytes.length >= 3 && bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2];
    const text = bytes.toString('utf8');
    const nonAscii = /[^\x00-\x7F]/.test(text);
    if (nonAscii && !bom) offenders.push(path.relative(repo, file));
  }
  assert.deepStrictEqual(offenders, [], 'scripts without BOM: ' + offenders.join(', '));
});

check('the cold backup window is covered by the rule', () => {
  const window = path.join(repo, 'bin', 'cold-window.ps1');
  assert.ok(files.includes(window), 'cold-window.ps1 missing from scan');
  const bytes = fs.readFileSync(window);
  assert.deepStrictEqual([...bytes.subarray(0, 3)], [...BOM], 'cold-window.ps1 lost its BOM');
  assert.ok(/[^\x00-\x7F]/.test(bytes.toString('utf8')), 'cold-window.ps1 is expected to contain non-ASCII text');
});

check('the scan is not vacuous', () => {
  assert.ok(files.length >= 10, 'expected the shipped PowerShell scripts, found ' + files.length);
});

const result = {suite: 'v074-ps1-encoding', checks, scripts: files.length, skipped: []};
fs.writeFileSync(path.join(root, 'v074-ps1-encoding-result.json'), JSON.stringify(result, null, 2));
console.log('PASS v074-ps1-encoding ' + checks.length + ' checks (' + files.length + ' scripts)');
