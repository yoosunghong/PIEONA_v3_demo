import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {harness} from '../tests/runtimeHarness.mjs';
const port=43461;const h=await harness({port,publicOrigin:`http://127.0.0.1:${port}`});let browser;
try{
 const a=await h.register('forest_ui_owner'),b=await h.register('forest_ui_friend');
 h.runtime.store.run('UPDATE users SET nickname=? WHERE id=?','숲친구',b.id);
 await h.request('/friends/'+b.id,a,{});await h.request('/friends/'+a.id,b,{});
 const base=`http://127.0.0.1:${h.runtime.server.address().port}`;
 browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:1440,height:900}});
 const [name,value]=a.cookie.split('=');await context.addCookies([{name,value,url:base}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',e.message)});page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url())});
 mkdirSync('tmp/exploration-companion',{recursive:true});
 await page.goto(base+'/explore?depart=1');await page.getByRole('dialog',{name:'숲 동행 친구 선택'}).waitFor({timeout:15000}).catch(async e=>{console.log('BODY',await page.locator('body').innerText());await page.screenshot({path:'tmp/exploration-companion/error.png'});throw e;});
 await page.getByRole('button',{name:'숲친구 아바타와 동행'}).click();await page.screenshot({path:'tmp/exploration-companion/departure.png'});
 await page.getByRole('button',{name:'숲으로 출발',exact:true}).click();await page.locator('.exp-world canvas').waitFor();await page.locator('.exp-loading').waitFor({state:'detached',timeout:90000});
 await page.getByRole('button',{name:'동행 친구 P'}).click();await page.getByRole('button',{name:'부탁하기',exact:true}).click();await page.screenshot({path:'tmp/exploration-companion/menu.png'});await page.getByRole('button',{name:'벌목 요청하기',exact:true}).click();
 await page.getByRole('status').filter({hasText:'나무를 계속 모을게'}).waitFor();assert.equal((await h.request('/exploration',a)).body.state.companion.mode,'GATHER_WOOD');
 await page.screenshot({path:'tmp/exploration-companion/logging.png'});
 await page.getByRole('button',{name:'동행 친구 P'}).click();await page.getByRole('button',{name:'부탁하기',exact:true}).click();await page.getByRole('button',{name:'채광 요청하기',exact:true}).click();assert.equal((await h.request('/exploration',a)).body.state.companion.mode,'MINE_STONE');
 await page.getByRole('button',{name:'동행 친구 P'}).click();await page.getByRole('button',{name:'부탁하기',exact:true}).click();await page.getByRole('button',{name:'중단하기',exact:true}).click();assert.equal((await h.request('/exploration',a)).body.state.companion.mode,'IDLE');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tmp/exploration-companion/mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'마을로 귀환',exact:true}).click();await page.waitForURL('**/?view=village');
 assert.deepEqual(errors,[]);console.log('PASS: real-server departure, friend selection, 3D forest, request dialogue, task replacement, stop, mobile layout, return; no browser errors');
}finally{await browser?.close();await h.close();}
