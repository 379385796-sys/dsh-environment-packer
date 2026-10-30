import assert from 'node:assert/strict';
import { parseDialogOutput, parseFolderOutput } from '../lib/dialog.js';

function encode(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

// A folder picker returns a directory, and nothing about it is written here.
assert.equal(parseFolderOutput(encode('C:\\Users\\Example\\Desktop')), 'C:\\Users\\Example\\Desktop');
assert.equal(parseFolderOutput(`noise\n${encode('D:\\Backups')}\n`), 'D:\\Backups');
assert.equal(parseFolderOutput(''), null);
assert.equal(parseFolderOutput('\n \n'), null);
assert.throws(() => parseFolderOutput(encode('relative\\folder')), /non-absolute/);

// Save As still insists on an absolute .zip path.
assert.equal(parseDialogOutput(''), null);
assert.equal(parseDialogOutput('\r\n \r\n'), null);
assert.equal(parseDialogOutput(encode('C:\\Temp\\a.zip')), 'C:\\Temp\\a.zip');
assert.throws(() => parseDialogOutput(encode('C:\\Temp\\a.bin')), /must end with \.zip/);
assert.throws(() => parseDialogOutput(encode('a.zip')), /non-absolute/);

console.log('DIALOG_PARSE_OK 9 checks');
