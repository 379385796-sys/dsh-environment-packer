'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const E=require('../assets/migration-engine.cjs');
const base=process.env.DSH_PACKER_TEST_ROOT;if(!base)throw Error('Explicit isolated root required');const fixture=JSON.parse(fs.readFileSync(path.join(base,'migration-business-state.json'))),p=fixture.plan;
const {chromium}=require('C:/Users/37938/.dsh/profiles/desktop/node_modules/playwright-core');
const checks=[],errors=[];let sessionCount;
async function browser(round,{url}){
 const context=await chromium.launchPersistentContext(path.join(p.layout.state,'browser-acceptance'),{channel:'msedge',headless:true,viewport:{width:1280,height:1000},env:{...process.env,TEMP:process.env.TEMP,TMP:process.env.TMP},args:['--no-first-run','--disable-background-networking']});
 let page;try{
  await context.route('**/*',r=>['127.0.0.1','localhost','[::1]'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());page=context.pages()[0];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.getByRole('button',{name:'账号菜单',exact:true}).waitFor({timeout:60000});
  const notice=page.getByRole('button',{name:'继续',exact:true});if(await notice.isVisible())await notice.click();if(await page.getByText('开始使用',{exact:true}).isVisible())await page.keyboard.press('Escape');
  const settings=async()=>{await page.getByRole('button',{name:'账号菜单',exact:true}).click();await page.getByRole('menuitem',{name:/^设置/}).click();};
  if(round===1){
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('dsh-chat-comfort.settings.v1'))),{enabled:true,density:'compact'});assert.equal(await page.locator('#dsh-chat-comfort-style-v1').count(),1);checks.push('known localStorage preference imported before real Chat Comfort client');
    await settings();await page.getByRole('button',{name:'系统提示词注入',exact:true}).click();await page.locator('.pt-page').waitFor();assert(await page.getByText('synthetic-global',{exact:true}).count()>0);checks.push('Prompt Inject templates and structured workspace overrides render');await page.getByRole('button',{name:'关闭',exact:true}).click();
    await settings();await page.getByRole('button',{name:'Chat Comfort',exact:true}).click();const enabled=page.getByRole('checkbox',{name:/启用聊天美化/});await enabled.uncheck();assert.equal(await page.locator('#dsh-chat-comfort-style-v1').count(),0);await page.getByRole('button',{name:'关闭',exact:true}).click();
    const pick=page.getByRole('button',{name:'请选择模型',exact:true});if(await pick.count()){await pick.click();await page.getByText('Exporter fixture (offline)',{exact:true}).click();}
    const edit=page.locator('[contenteditable="true"][role="textbox"]');await edit.fill('SYNTHETIC_MIGRATION_OFFLINE_TURN');await edit.press('Enter');await page.locator('[data-chat-flow-kind="assistant-step"]').filter({hasText:'EXPORTER_HOST_FIXTURE_COMPLETE'}).first().waitFor({timeout:60000});checks.push('actual DSH offline conversation through real prompt/LLM/session pipeline');
    sessionCount=await page.evaluate(async()=>{const rows=await(await fetch('api/ai-exporter.sessions')).json();return rows.length;});assert(sessionCount>0);
  }else{
    const value=await page.evaluate(()=>JSON.parse(localStorage.getItem('dsh-chat-comfort.settings.v1')));assert.equal(value.enabled,false);assert.equal(await page.locator('#dsh-chat-comfort-style-v1').count(),0);checks.push('post-restore user preference survives reload and is not overwritten by import');
    const data=await page.evaluate(async()=>{const rows=await(await fetch('api/ai-exporter.sessions')).json();return Promise.all(rows.map(async row=>({id:row.id,data:await(await fetch('api/ai-exporter.snapshot?sessionId='+encodeURIComponent(row.id))).json()})));});assert(data.length>=sessionCount);assert(data.some(x=>(x.data.stats?.rounds||0)>=1));assert(!JSON.stringify(data).includes('EXPORTER_HIDDEN_REASONING_SECRET'));checks.push('conversation readable after normal shutdown/restart; exporter preserves hidden-reasoning boundary');
  }
  await page.screenshot({path:path.join(p.layout.state,'logs','browser-'+round+'.png')});assert.deepEqual(errors,[]);
 }catch(e){if(page){fs.writeFileSync(path.join(p.layout.state,'logs','browser-failure.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(p.layout.state,'logs','browser-failure.png')});}throw e;}finally{await context.close();}
}
(async()=>{
 const net=require('node:net'),server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const attempt=Date.now().toString(),rounds=[];rounds.push(await E.boot(p,'browser1-'+attempt,{port,onReady:ctx=>browser(1,ctx)}));rounds.push(await E.boot(p,'browser2-'+attempt,{port,onReady:ctx=>browser(2,ctx)}));
 const tool=p.tools.find(t=>t.name==='mnemon'),memory=p.externalRoots.find(r=>r.id.startsWith('memory-')).to;
 const result=require('node:child_process').spawnSync(tool.to,['recall','SYNTHETIC_PERSISTENT_MEMORY_060','--readonly','--data-dir',memory,'--store','fixture-store'],{env:{...E.childEnvironment(p),MNEMON_DATA_DIR:memory},encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(result.status,0,result.stderr);assert(result.stdout.includes('SYNTHETIC_PERSISTENT_MEMORY_060'));checks.push('official Mnemon recalls the pre-backup insight from restored SQLite');
 const report={status:'PASS',syntheticOnly:true,realHost:p.host.version,checks,rounds,frontendErrors:errors};fs.writeFileSync(path.join(base,'migration-browser-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
