'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const E=require('../assets/migration-engine.cjs');
const [fixture,playwrightPath]=process.argv.slice(2);if(![fixture,playwrightPath].every(p=>p&&path.isAbsolute(p)))throw Error('Explicit isolated fixture and browser library paths required');
const p=JSON.parse(fs.readFileSync(path.join(fixture,'state.json'))).plan;
const {chromium}=require(playwrightPath),errors=[],checks=[];
(async()=>{
 const round=await E.boot(p,'rc1-settings-browser',{onReady:async({url})=>{
  const context=await chromium.launchPersistentContext(path.join(p.layout.state,'settings-browser-profile'),{channel:'msedge',headless:true,viewport:{width:1280,height:1000},env:{...E.childEnvironment(p),ELECTRON_RUN_AS_NODE:''},args:['--no-first-run','--disable-background-networking','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']});
  try{await context.route('**/*',r=>['127.0.0.1','localhost','[::1]'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());const page=context.pages()[0];page.on('pageerror',e=>errors.push(e.message.replace(/token=[A-Za-z0-9_-]+/g,'token=REDACTED')));await page.goto(url);await page.getByRole('button',{name:'账号菜单',exact:true}).waitFor({timeout:60000});
   const notice=page.getByRole('button',{name:'继续',exact:true});if(await notice.count()&&await notice.first().isVisible())await notice.first().click();if(await page.getByText('开始使用',{exact:true}).isVisible())await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'账号菜单',exact:true}).click();await page.getByRole('menuitem',{name:/^设置/}).click();await page.getByRole('button',{name:'环境恢复包',exact:true}).click();await page.locator('.ep').waitFor();
   assert((await page.locator('.ep header').innerText()).includes('0.6.2'));assert.equal(await page.locator('.ep [role="tab"]').count(),3);assert(await page.locator('.ep [data-action="create"]').isVisible());checks.push('actual rc1 frontend loads Packer 0.6.2 settings and primary backup entry');
   const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('dsh-chat-comfort.settings.v1')));assert.deepEqual(prefs,{enabled:true,density:'compact'});checks.push('actual browser executes the plan-bound preference bootstrap');
   await page.getByRole('tab',{name:'帮助与诊断',exact:true}).click();assert(await page.locator('.ep [role="tabpanel"]').isVisible());checks.push('settings tabs remain functional on rc1 client APIs');
   await page.screenshot({path:path.join(p.layout.state,'logs/rc1-packer-settings.png')});assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }});
 const result={status:'PASS',checks,frontendErrors:errors,round,screenshot:path.join(p.layout.state,'logs/rc1-packer-settings.png'),headlessRenderer:true,humanVisualAcceptance:false};fs.writeFileSync(path.join(fixture,'settings-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
