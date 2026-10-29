import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {harness} from '../tests/runtimeHarness.mjs';
import {prepareAvatar} from '../tests/pssGameplay.mjs';
const h=await harness({port:3197,publicOrigin:'http://127.0.0.1:3197'}),base='http://127.0.0.1:3197';let browser;const errors=[];
try{
 const u=await prepareAvatar(h,'space_visual');browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const context=await browser.newContext({viewport:{width:1654,height:951},reducedMotion:'reduce'});
 await context.addCookies([{name:'pieona_session',value:u.cookie.split('=')[1],url:base}]);
 await context.addInitScript(({uid,slot})=>{localStorage.setItem('pieona.tutorial.v1.'+uid,'seen');localStorage.setItem('illova.card.seen.'+uid+'.'+slot,slot+':1');localStorage.setItem('pieona.peopleCollapsed','true');localStorage.setItem('pieona.bgm.v1',JSON.stringify({enabled:false,volume:0}));},{uid:u.id,slot:u.activeSlot});
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 mkdirSync('artifacts/stars',{recursive:true});await page.goto(base+'/?view=village');await page.locator('.scene-loading').waitFor({state:'hidden'});await page.waitForTimeout(1300);
 assert.equal(await page.getByRole('button',{name:'숲으로 가기',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'공방',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'농장',exact:true}).count(),0);
 await page.getByRole('button',{name:'별 꾸미기',exact:true}).click();await page.getByRole('button',{name:'바닥 색상 #8bb3c9',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.scene-canvas canvas')?.dataset.platformColor==='#8bb3c9');await page.getByRole('button',{name:'설정 완료',exact:true}).click();await page.locator('.village-studio').waitFor({state:'hidden'});assert.equal((await h.request('/me',u)).body.user.village.platformColor,'#8bb3c9');await page.screenshot({path:'artifacts/stars/plaza.png'});
 await page.mouse.move(800,550);await page.mouse.wheel(0,1500);await page.waitForTimeout(400);assert.equal(await page.locator('.star-atlas').isVisible(),false);await page.getByRole('button',{name:'내 별 보기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.star-atlas')?.dataset.phase==='open');
 assert.equal(await page.locator('.star-marker').count(),3);const plazaPixel=await page.locator('.star-atlas canvas').evaluate(canvas=>{const sample=document.createElement('canvas');sample.width=canvas.width;sample.height=canvas.height;const ctx=sample.getContext('2d');ctx.drawImage(canvas,0,0);return [...ctx.getImageData(Math.round(canvas.width*.5),Math.round(canvas.height*.65),1,1).data];});assert.ok((plazaPixel[0]+plazaPixel[1]+plazaPixel[2])/3>110,'The current plaza must be visibly rendered: '+plazaPixel);const atlasId=await page.locator('.star-atlas canvas').getAttribute('data-atlas-renderer');await page.getByRole('button',{name:'낚시별 선택',exact:true}).hover();await page.waitForFunction(()=>document.querySelector('.star-atlas canvas')?.dataset.hoveredStar==='fishing');
 await page.getByRole('button',{name:'낚시별 선택',exact:true}).click();await page.getByRole('button',{name:'낚시별로 이동',exact:true}).waitFor();await page.screenshot({path:'artifacts/stars/atlas.png'});
 await page.getByRole('button',{name:'낚시별로 이동',exact:true}).click();await page.locator('.star-atlas').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('.scene-canvas canvas')?.dataset.starId==='fishing');await page.waitForTimeout(1200);await page.screenshot({path:'artifacts/stars/fishing.png'});
 await page.getByRole('button',{name:'내 별 보기',exact:true}).click();assert.equal(await page.locator('.star-atlas canvas').getAttribute('data-atlas-renderer'),atlasId);await page.getByRole('button',{name:'농장별 선택',exact:true}).click();await page.getByRole('button',{name:'농장별로 이동',exact:true}).click();await page.locator('.farm-screen').waitFor();await page.waitForTimeout(1500);assert.equal(await page.locator('.farm-fallback').count(),0);assert.equal(await page.locator('.farm-plot').count(),9);await page.screenshot({path:'artifacts/stars/farm.png'});
 await page.getByRole('button',{name:'1번 텃밭 · 씨앗 심기',exact:true}).click();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/me/life/actions')&&r.request().method()==='POST'),page.getByRole('button',{name:/딸기 씨앗/}).click()]);h.advance(3000);await page.getByRole('button',{name:/1번 텃밭 · 딸기/}).waitFor();assert.equal(h.runtime.life.snapshot(u.id).garden.plots[0].cropId,'STRAWBERRY');
 await page.getByRole('button',{name:'별 지도로 돌아가기',exact:true}).click();await page.locator('.star-atlas').waitFor();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1300);await page.screenshot({path:'artifacts/stars/mobile-atlas.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const star of ['낚시별','농장별','광장별']){const marker=page.getByRole('button',{name:star+' 선택',exact:true});const rect=await marker.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390,JSON.stringify({star,rect}));await marker.click();await page.getByRole('button',{name:star+'로 이동',exact:true}).waitFor();}
 await page.getByRole('button',{name:'광장별로 이동',exact:true}).click();await page.locator('.star-atlas').waitFor({state:'hidden'});
 await page.setViewportSize({width:1654,height:951});
 for(const [name,id] of [['태양 노을','sunset'],['황혼','twilight'],['오로라','cafe'],['은하수','milkyway']]){
   await page.locator('.village-theme-button').click();await page.locator('.village-theme-list').getByRole('button',{name:new RegExp(name)}).click();await page.waitForFunction(id=>document.querySelector('.scene-canvas canvas')?.dataset.villageTheme===id,id);await page.waitForTimeout(700);assert.equal(await page.locator('.scene-error').count(),0);assert.equal(await page.locator('.scene-canvas canvas').getAttribute('data-platform-color'),'#8bb3c9');if(id==='sunset')await page.screenshot({path:'artifacts/stars/solar-sunset.png'});
 }
 await page.emulateMedia({reducedMotion:'no-preference'});const persistentId=await page.locator('.star-atlas canvas').getAttribute('data-atlas-renderer');
 await page.getByRole('button',{name:'내 별 보기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.star-atlas')?.dataset.phase==='opening');
 const positions=new Set();for(let i=0;i<16;i++){positions.add(await page.locator('.star-atlas canvas').getAttribute('data-camera-position'));await page.waitForTimeout(90);}
 assert.ok(positions.size>=3,'The map camera must move through intermediate frames');await page.waitForFunction(()=>document.querySelector('.star-atlas')?.dataset.phase==='open');
 assert.equal(await page.locator('.star-atlas canvas').getAttribute('data-atlas-renderer'),persistentId);
 await page.getByRole('button',{name:'광장별로 돌아가기',exact:true}).click();await page.locator('.star-atlas').waitFor({state:'hidden'});
 await page.goto(base+'/explore');await page.locator('.world-panel').waitFor();assert.equal(await page.locator('.exploration-screen').count(),0);
 assert.deepEqual(errors,[]);console.log('Star browser flow passed: no wheel navigation, persistent atlas, selection/travel, independent floor color, four themes, farm planting, mobile atlas, retired forest.');
}catch(error){console.error('PAGE ERRORS',errors);throw error;}finally{await browser?.close();await h.close();}
