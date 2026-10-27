import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {harness} from '../tests/runtimeHarness.mjs';
import {prepareAvatar} from '../tests/pssGameplay.mjs';
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const base=`http://127.0.0.1:${port}`,h=await harness({port,publicOrigin:base}),errors=[];let browser;
try{
 const user=await prepareAvatar(h,'farm_browser');
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const context=await browser.newContext({viewport:{width:1670,height:942},reducedMotion:'reduce'});
 await context.addCookies([{name:'pieona_session',value:user.cookie.split('=')[1],url:base}]);
 await context.addInitScript(({uid,slot})=>{localStorage.setItem('pieona.tutorial.v1.'+uid,'seen');localStorage.setItem('illova.card.seen.'+uid+'.'+slot,slot+':1');localStorage.setItem('pieona.bgm.v1',JSON.stringify({enabled:false,volume:0}));},{uid:user.id,slot:user.activeSlot});
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 async function finishClick(locator){const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/me/life/actions')&&r.request().method()==='POST'),locator.click()]);assert.equal(response.status(),200,await response.text());h.advance(3000);await page.waitForTimeout(500);}
 await page.goto(base+'/?view=village');await page.locator('.scene-loading').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'농장',exact:true}).click();
 await page.locator('.farm-screen').waitFor();await page.waitForTimeout(1800);
 assert.equal(await page.locator('.farm-plot').count(),9);assert.equal(await page.locator('.farm-fallback').count(),0);
 mkdirSync('artifacts/farm',{recursive:true});await page.screenshot({path:'artifacts/farm/desktop.png'});
 const soil=await page.getByRole('button',{name:'9번 텃밭 · 씨앗 심기',exact:true}).boundingBox();await page.mouse.click(soil.x+soil.width*.6,soil.y+soil.height*.55);await page.getByRole('heading',{name:'9번 텃밭 · 씨앗 선택'}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'1번 텃밭 · 씨앗 심기',exact:true}).click();await page.getByRole('heading',{name:'1번 텃밭 · 씨앗 선택'}).waitFor();
 await page.screenshot({path:'artifacts/farm/seeds.png'});console.log('Seed picker opened');await finishClick(page.getByRole('button',{name:/딸기 씨앗/}));await page.screenshot({path:'artifacts/farm/planted.png'});
 await page.getByRole('button',{name:/1번 텃밭 · 딸기 · 다음 물주기/}).waitFor();
 console.log('Seed planted');const crop=h.runtime.life.snapshot(user.id).garden.plots[0];assert.equal(crop.cropId,'STRAWBERRY');assert.equal(crop.waterCount,0);
 for(let i=0;i<3;i++){console.log('Water cycle',i);
  h.advance(300000);await page.getByRole('button',{name:'농장 가이드',exact:true}).click();await page.keyboard.press('Escape');
  // Focus refresh reads server time after the test clock advances.
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(350);
  await finishClick(page.getByRole('button',{name:'1번 텃밭 · 딸기 물주기',exact:true}));
 }
 await page.getByRole('button',{name:'1번 텃밭 · 딸기 수확',exact:true}).waitFor();await page.waitForTimeout(4500);await page.screenshot({path:'artifacts/farm/harvest.png'});
 await finishClick(page.getByRole('button',{name:'1번 텃밭 · 딸기 수확',exact:true}));
 const inventory=(await h.request('/me/life',user)).body.inventory;assert.equal(inventory.find(i=>i.itemId==='STRAWBERRY').quantity,1);assert.equal(inventory.find(i=>i.itemId==='STRAWBERRY_SEED').quantity,3);
 await page.getByRole('button',{name:'작물 관리',exact:true}).click();await page.getByRole('button',{name:'아이템 인벤토리',exact:true}).click();await page.getByRole('button',{name:'딸기 · 1개',exact:true}).waitFor();
 await page.getByRole('button',{name:'마을로 돌아가기',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('button',{name:'농장',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(4500);await page.screenshot({path:'artifacts/farm/mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const rects=await page.locator('.farm-plot').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));assert.ok(rects.every(r=>r.left>=0&&r.right<=390&&r.top>180&&r.bottom<710),JSON.stringify(rects));
 await page.getByRole('button',{name:'9번 텃밭 · 씨앗 심기',exact:true}).click();await page.getByRole('heading',{name:'9번 텃밭 · 씨앗 선택'}).waitFor();await page.screenshot({path:'artifacts/farm/mobile-seeds.png'});await page.keyboard.press('Escape');assert.equal(await page.locator('.farm-sheet').count(),0);

 // Populate a representative garden through actual server actions, for reference-size visual QA.
 await page.setViewportSize({width:1670,height:942});
 const crops=['TOMATO','TOMATO','STRAWBERRY','HERB','HERB','STRAWBERRY','HERB','HERB','STRAWBERRY'];
 h.runtime.store.run("UPDATE inventory_entries SET quantity=9 WHERE owner_id=? AND item_id='HERB_SEED'",user.id);
 for(const [index,crop] of crops.entries()){const r=h.runtime.life.execute(user.id,{intent:'PLANT_SEED',plot:`garden:${index}`,crop});assert.equal(r.ok,true,r.reply);h.advance(3000);}
 const water=index=>{const r=h.runtime.life.execute(user.id,{intent:'WATER_CROP',plot:`garden:${index}`});assert.equal(r.ok,true,r.reply);h.advance(3000);};
 h.advance(300000);for(let i=0;i<9;i++)water(i);
 h.advance(300000);water(1);h.advance(300000);for(let i=0;i<9;i++)if(i!==1)water(i);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(5500);await page.evaluate(()=>document.activeElement?.blur());await page.waitForFunction(()=>!document.querySelector('.farm-footer p')?.textContent);mkdirSync('artifacts/farm/reference',{recursive:true});await page.screenshot({path:'artifacts/farm/reference/desktop-populated.png'});
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.locator('.farm-tools').getByRole('button',{name:'캡처',exact:true}).click()]);assert.equal(download.suggestedFilename(),'illova-farm.png');
 await page.getByRole('button',{name:'밭 보기',exact:true}).click();assert.equal(await page.locator('.farm-screen.is-inspecting').count(),1);await page.getByRole('button',{name:'밭 보기',exact:true}).click();
 await page.getByRole('button',{name:'가공하기',exact:true}).click();await page.getByRole('heading',{name:'마을 요리대',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('Farm browser flow passed: desktop/mobile, nine plots, seeds, three timed waterings, harvest and inventory.');
}finally{await browser?.close();await h.close();}
