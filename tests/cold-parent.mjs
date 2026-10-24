import fs from 'node:fs';import path from 'node:path';import {startColdTask} from '../lib/cold-task.js';
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
try{
  const task=await startColdTask({...input,confirmExternal:true});
  fs.writeFileSync(path.join(path.dirname(input.homeDir),'handoff.json'),JSON.stringify({...task,parentPid:process.pid}));
}catch(e){console.error(e.code||'TEST_FAILED');process.exitCode=1;}
