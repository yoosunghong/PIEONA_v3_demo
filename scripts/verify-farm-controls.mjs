import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {harness} from '../tests/runtimeHarness.mjs';
import {prepareAvatar} from '../tests/pssGameplay.mjs';
const h=await harness({port:4317,publicOrigin:'http://127.0.0.1:4317'}),base=`http://127.0.0.1:${h.runtime.server.address().port}`;let browser;
try{
 const user=await prepareAvatar(h,'farm_controls');
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addCookies([{name:'pieona_session',value:user.cookie.split('=')[1],url:base}]);
 await context.addInitScript(({uid,slot})=>{localStorage.setItem('pieona.tutorial.v1.'+uid,'seen');localStorage.setItem('illova.card.seen.'+uid+'.'+slot,slot+':1');localStorage.setItem('pieona.bgm.v1',JSON.stringify({enabled:false,volume:0}));},{uid:user.id,slot:user.activeSlot});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await page.goto(base+'/?view=village');await page.locator('.scene-loading').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'농장',exact:true}).click();
 const canvas=page.locator('.farm-canvas canvas');await canvas.waitFor();await page.waitForTimeout(1800);
 assert.equal(await page.locator('.farm-fallback').count(),0);assert.equal(await page.locator('.farm-plot').count(),9);
 assert.equal(await page.getByText('아바타와 이야기하기',{exact:true}).count(),0);
 assert.equal(await page.locator('#people-sidebar').evaluate(el=>getComputedStyle(el).opacity),'1');assert.equal(await page.locator('#people-sidebar').evaluate(el=>el.inert),false);
 const farm=await page.locator('.farm-screen').boundingBox(),side=await page.locator('#people-sidebar').boundingBox();assert.ok(farm.x+farm.width<=side.x+1);
 const geometry=await canvas.evaluate(el=>({width:el.width,height:el.height,rect:el.getBoundingClientRect().toJSON()}));assert.ok(Math.abs(geometry.width/geometry.height-geometry.rect.width/geometry.rect.height)<.01);
 mkdirSync('artifacts/farm',{recursive:true});await page.screenshot({path:'artifacts/farm/controls-desktop.png'});
 const before=await canvas.getAttribute('data-player-position');await canvas.focus();await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');assert.notEqual(await canvas.getAttribute('data-player-position'),before);
 const box=await canvas.boundingBox(),camera=await canvas.getAttribute('data-camera-position');await page.mouse.move(box.x+box.width*.55,box.y+box.height*.65);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.62,{steps:12});await page.mouse.up();await page.waitForTimeout(400);assert.notEqual(await canvas.getAttribute('data-camera-position'),camera);
 const afterDrag=await canvas.getAttribute('data-player-position');await page.waitForTimeout(200);assert.equal(await canvas.getAttribute('data-player-position'),afterDrag);
 const beforeZoom=await canvas.getAttribute('data-camera-position');await page.mouse.wheel(0,-250);await page.waitForTimeout(300);assert.notEqual(await canvas.getAttribute('data-camera-position'),beforeZoom);
 const beforePan=await canvas.getAttribute('data-camera-position');await page.mouse.move(box.x+box.width*.6,box.y+box.height*.7);await page.mouse.down({button:'right'});await page.mouse.move(box.x+box.width*.65,box.y+box.height*.7,{steps:8});await page.mouse.up({button:'right'});await page.waitForTimeout(300);assert.notEqual(await canvas.getAttribute('data-camera-position'),beforePan);
 await page.mouse.click(box.x+box.width*.4,box.y+box.height*.75);await page.waitForTimeout(500);assert.notEqual(await canvas.getAttribute('data-player-position'),afterDrag);
 await page.getByRole('button',{name:'1번 텃밭 · 씨앗 심기',exact:true}).click();await page.getByRole('heading',{name:'1번 텃밭 · 씨앗 선택'}).waitFor();await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:'artifacts/farm/controls-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'마을로 돌아가기',exact:true}).click();await page.getByRole('button',{name:'농장',exact:true}).click();await canvas.waitFor();await page.waitForTimeout(800);
 // Tap the visible player's body from the initial camera and open the anchored action.
 const position=await canvas.evaluate(el=>JSON.parse(el.dataset.playerPosition));assert.equal(position.x,2);
 const mobileBox=await canvas.boundingBox();
 // The projected prompt position is maintained even before selection through the test probe.
 const player=await canvas.getAttribute('data-player-screen');
 if(player){const p=JSON.parse(player);await page.mouse.click(mobileBox.x+p.left/100*mobileBox.width,mobileBox.y+p.top/100*mobileBox.height);}
 await page.getByRole('button',{name:'대화하기',exact:true}).waitFor();await page.getByRole('button',{name:'대화하기',exact:true}).click();await page.getByRole('region',{name:'아바타 대화창'}).waitFor();assert.equal(await page.locator('.farm-screen').count(),1);await page.getByLabel('아바타에게 보낼 메시지').fill('농장에서 만나서 반가워');await page.getByRole('button',{name:'이야기 보내기',exact:true}).click();await page.locator('.chat-line.assistant').waitFor();await page.screenshot({path:'artifacts/farm/controls-chat.png'});await page.getByRole('button',{name:'대화창 끄기',exact:true}).click();await page.getByRole('button',{name:'마을로 돌아가기',exact:true}).click();
 await page.locator('.farm-screen').waitFor({state:'hidden'});await page.setViewportSize({width:1440,height:1000});await page.locator('.world-actions').getByRole('button',{name:'캐릭터 변경 · 꾸미기',exact:true}).click();await page.locator('.studio-subjects').getByRole('button',{name:'펫',exact:true}).click();
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/me/pet/appearance')&&r.request().method()==='PATCH');await page.getByLabel('펫 이름',{exact:true}).fill('콩이');assert.equal((await saved).status(),200);
assert.equal((await h.request('/me',user)).body.user.avatarAppearance.petName,'콩이');await page.screenshot({path:'artifacts/farm/pet-name.png'});
 assert.deepEqual(errors,[]);console.log('Farm controls passed: responsive canvas, friend sidebar, walking, camera drag, plot picker, mobile, re-entry, avatar selection and in-farm conversation.');
}finally{await browser?.close();await h.close();}
