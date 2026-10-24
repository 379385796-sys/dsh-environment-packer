import { createPrivateBackup,PRIVATE_WARNING } from '../lib/private-backup.js';
const args=process.argv.slice(2), allowed=new Set(['--home','--profile','--zip','--dsh-version','--confirm-private','--source-quiescent']);
try {
  for(let i=0;i<args.length;i++) { if(!allowed.has(args[i])) throw Error('INVALID_ARGUMENT'); if(!['--confirm-private','--source-quiescent'].includes(args[i])) i++; }
  const value=k=>{const i=args.indexOf(k); if(i<0||!args[i+1]||args[i+1].startsWith('--')) throw Error('MISSING_ARGUMENT'); return args[i+1];};
  console.log(PRIVATE_WARNING);
  const result=createPrivateBackup({homeDir:value('--home'),profileDir:value('--profile'),target:value('--zip'),dshVersion:value('--dsh-version'),confirmPrivate:args.includes('--confirm-private'),sourceQuiescent:args.includes('--source-quiescent')});
  console.log(JSON.stringify({ok:true,files:result.files,bytes:result.bytes,cleanup:result.cleanup}));
} catch(e) { console.error(/^[A-Z0-9_]+$/.test(e.code||e.message||'')?(e.code||e.message):'BACKUP_FAILED'); process.exitCode=1; }
