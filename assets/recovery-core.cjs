'use strict';
// Shared by the packer and the separately invoked, trusted restore CLI.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const MAX_FILE = 128 * 1024 * 1024;
const MAX_TOTAL = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 60000;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function safeName(name) {
  if (typeof name !== 'string' || !name || name.length > 2048 || name.includes('\\')) fail('UNSAFE_ARCHIVE_PATH');
  for (const part of name.split('/')) {
    if (!part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f\x7f]/.test(part) || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) fail('UNSAFE_ARCHIVE_PATH');
  }
  return name;
}
function noLinks(target) {
  if (!path.isAbsolute(target)) fail('ABSOLUTE_PATH_REQUIRED');
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let st;
    try { st = fs.lstatSync(current); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    if (st.isSymbolicLink() || fs.realpathSync.native(current).toLowerCase() !== path.resolve(current).toLowerCase()) fail('REPARSE_REFUSED');
  }
}
function exists(p) { try { fs.lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
function privateAccess(target, directory = false) {
  if (process.platform !== 'win32') { fs.chmodSync(target, directory ? 0o700 : 0o600); return; }
  const who = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  const sid = who.status === 0 && who.stdout.match(/S-1-5-\d+(?:-\d+)+/i)?.[0];
  if (!sid) fail('PRIVATE_ACL_FAILED');
  const inherit = directory ? '(OI)(CI)' : '';
  const result = spawnSync('icacls.exe', [target, '/inheritance:r', '/grant:r', `*${sid}:${inherit}F`, `*S-1-5-18:${inherit}F`], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) fail('PRIVATE_ACL_FAILED');
}
const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let i=0;i<8;i++) c=c&1 ? 0xedb88320^(c>>>1) : c>>>1; return c>>>0; });
function crc(data) { let c=0xffffffff; for (const b of data) c=table[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function identity(st) { return `${st.dev}:${st.ino}`; }
function readStable(file) {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_FILE) fail('SOURCE_TYPE_OR_SIZE');
  const fd = fs.openSync(file, 'r');
  try {
    if (identity(fs.fstatSync(fd)) !== identity(before)) fail('SOURCE_CHANGED');
    const data = fs.readFileSync(fd), after = fs.fstatSync(fd);
    if (data.length !== before.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('SOURCE_CHANGED');
    return data;
  } finally { fs.closeSync(fd); }
}
class ZipWriter {
  constructor(file) {
    this.file=file; this.offset=0; this.central=[]; this.names=new Set();
    this.fd=fs.openSync(file,'wx',0o600);
    try { privateAccess(file); } catch(e) { this.close(); fs.unlinkSync(file); throw e; }
  }
  add(name,data) {
    safeName(name); const key=name.toLowerCase();
    if(this.names.has(key)) fail('DUPLICATE_ARCHIVE_PATH'); this.names.add(key);
    if(this.names.size>MAX_ENTRIES || this.offset+data.length>MAX_TOTAL || data.length>MAX_FILE) fail('ARCHIVE_LIMIT');
    const nb=Buffer.from(name), checksum=crc(data), h=Buffer.alloc(30), c=Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20,4); h.writeUInt16LE(0x800,6);
    h.writeUInt32LE(checksum,14); h.writeUInt32LE(data.length,18); h.writeUInt32LE(data.length,22); h.writeUInt16LE(nb.length,26);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt16LE(0x800,8);
    c.writeUInt32LE(checksum,16); c.writeUInt32LE(data.length,20); c.writeUInt32LE(data.length,24); c.writeUInt16LE(nb.length,28); c.writeUInt32LE(this.offset,42);
    for(const b of [h,nb,data]) { let p=0; while(p<b.length) p+=fs.writeSync(this.fd,b,p,b.length-p); }
    this.central.push(c,nb); this.offset+=h.length+nb.length+data.length;
  }
  finish() {
    const central=Buffer.concat(this.central), end=Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50); end.writeUInt16LE(this.names.size,8); end.writeUInt16LE(this.names.size,10);
    end.writeUInt32LE(central.length,12); end.writeUInt32LE(this.offset,16);
    for(const b of [central,end]) { let p=0; while(p<b.length) p+=fs.writeSync(this.fd,b,p,b.length-p); }
    fs.fsyncSync(this.fd); this.close();
  }
  close() { if(this.fd!==null) { fs.closeSync(this.fd); this.fd=null; } }
}
function openZip(file) {
  noLinks(file); const fd=fs.openSync(file,'r');
  const opened=fs.fstatSync(fd);
  function assertUnchanged() {
    noLinks(file);
    const current=fs.fstatSync(fd),named=fs.lstatSync(file);
    if(!current.isFile()||identity(opened)!==identity(current)||identity(named)!==identity(opened)||opened.size!==current.size||opened.mtimeMs!==current.mtimeMs||opened.ctimeMs!==current.ctimeMs) fail('ARCHIVE_CHANGED');
  }
  function read(pos,len) {
    if (!Number.isSafeInteger(pos)||!Number.isSafeInteger(len)||len<0||pos<0||len>MAX_FILE||pos+len>size) fail('INVALID_ZIP');
    const b=Buffer.alloc(len); let n=0;
    while(n<len) { const got=fs.readSync(fd,b,n,len-n,pos+n); if(!got) fail('INVALID_ZIP'); n+=got; } return b;
  }
  const size=fs.fstatSync(fd).size;
  try {
    if(size<22 || size>MAX_TOTAL+16*1024*1024) fail('ARCHIVE_LIMIT');
    const e=read(size-22,22), count=e.readUInt16LE(10), centralSize=e.readUInt32LE(12), start=e.readUInt32LE(16);
    if(e.readUInt32LE(0)!==0x06054b50 || e.readUInt16LE(4)||e.readUInt16LE(6)||e.readUInt16LE(8)!==count||e.readUInt16LE(20)||!count||count>MAX_ENTRIES||start+centralSize!==size-22) fail('INVALID_ZIP');
    const records=new Map(); let p=start, offset=0;
    for(let i=0;i<count;i++) {
      const c=read(p,46), nl=c.readUInt16LE(28), extra=c.readUInt16LE(30), comment=c.readUInt16LE(32);
      if(c.readUInt32LE(0)!==0x02014b50||c.readUInt16LE(8)!==0x800||c.readUInt16LE(10)!==0||extra||comment||c.readUInt16LE(34)||c.readUInt32LE(38)||c.readUInt32LE(20)!==c.readUInt32LE(24)) fail('UNSUPPORTED_ZIP');
      const nb=read(p+46,nl), name=nb.toString('utf8'); safeName(name);
      if(!Buffer.from(name).equals(nb)||records.has(name.toLowerCase())) fail('DUPLICATE_ARCHIVE_PATH');
      const loc=c.readUInt32LE(42), len=c.readUInt32LE(24), h=read(loc,30);
      if(loc!==offset||h.readUInt32LE(0)!==0x04034b50||h.readUInt16LE(6)!==0x800||h.readUInt16LE(8)||h.readUInt16LE(26)!==nl||h.readUInt16LE(28)||h.readUInt32LE(18)!==len||h.readUInt32LE(22)!==len||h.readUInt32LE(14)!==c.readUInt32LE(16)||!read(loc+30,nl).equals(nb)) fail('INVALID_ZIP');
      offset=loc+30+nl+len; if(offset>start||len>MAX_FILE) fail('ARCHIVE_LIMIT');
      records.set(name.toLowerCase(),{name,pos:loc+30+nl,len,crc:c.readUInt32LE(16)}); p+=46+nl;
    }
    if(p!==size-22||offset!==start) fail('INVALID_ZIP');
    assertUnchanged();
    return { records, close:()=>fs.closeSync(fd), assertUnchanged, fingerprint() {
      assertUnchanged();const hash=crypto.createHash('sha256'),chunk=Buffer.alloc(1024*1024);let pos=0;
      while(pos<size){const n=fs.readSync(fd,chunk,0,Math.min(chunk.length,size-pos),pos);if(!n)fail('ARCHIVE_CHANGED');hash.update(chunk.subarray(0,n));pos+=n;}
      assertUnchanged();return hash.digest('hex');
    }, get(name) {
      const r=records.get(name.toLowerCase()); if(!r||r.name!==name) fail('MISSING_ARCHIVE_FILE');
      const b=read(r.pos,r.len); if(crc(b)!==r.crc) fail('ZIP_CRC_MISMATCH'); return b;
    }};
  } catch(e) { fs.closeSync(fd); throw e; }
}
function validateManifest(zip) {
  let m; try { m=JSON.parse(zip.get('manifest.json').toString('utf8')); } catch(e) { fail(e.code||'INVALID_MANIFEST'); }
  if(!['dsh-private-recovery/2','dsh-private-recovery/3'].includes(m.format)||m.mode!=='private-full'||!Array.isArray(m.files)||!Array.isArray(m.directories)||!m.compatibility) fail('INVALID_MANIFEST');
  if(!m.files.length||m.files.length+m.directories.length>MAX_ENTRIES-1||!m.files.some(f=>f?.path==='profile/package.json')) fail('INVALID_MANIFEST');
  const all=new Map([['manifest.json','file']]);
  for(const [items,type] of [[m.directories,'directory'],[m.files,'file']]) for(const item of items) {
    const n=type==='file'?item.path:item; safeName(n);
    if(!n.startsWith('profile/')&&!n.startsWith('home/')) fail('INVALID_MANIFEST_SCOPE');
    if(n.startsWith('home/')&&!['storages','sessions','attachments','memory','skills','AGENTS.md','.credentials.yaml','.credentials.yml'].includes(n.split('/')[1])) fail('INVALID_MANIFEST_SCOPE');
    if(all.has(n.toLowerCase())) fail('DUPLICATE_ARCHIVE_PATH'); all.set(n.toLowerCase(),type);
    if(type==='file'&&(!/^[a-f0-9]{64}$/.test(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes<0)) fail('INVALID_MANIFEST');
  }
  for(const n of all.keys()) { const parts=n.split('/'); parts.pop(); while(parts.length) { const parent=parts.join('/'); if(all.get(parent)==='file') fail('ARCHIVE_PATH_COLLISION'); parts.pop(); } }
  if(zip.records.size!==m.files.length+1) fail('ARCHIVE_SET_MISMATCH');
  for(const f of m.files) { const b=zip.get(f.path); if(b.length!==f.bytes||sha(b)!==f.sha256) fail('HASH_MISMATCH'); }
  return m;
}
module.exports={MAX_FILE,MAX_TOTAL,MAX_ENTRIES,fail,sha,safeName,noLinks,exists,privateAccess,identity,readStable,ZipWriter,openZip,validateManifest};
