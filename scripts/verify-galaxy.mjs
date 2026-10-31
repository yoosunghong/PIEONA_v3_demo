import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {harness} from '../tests/runtimeHarness.mjs';
import {prepareAvatar} from '../tests/pssGameplay.mjs';

const h=await harness({port:43198,publicOrigin:'http://127.0.0.1:43198'}),base='http://127.0.0.1:43198';let browser;const errors=[];
try{
 const viewer=await prepareAvatar(h,'galaxy_visual');h.runtime.store.run('UPDATE users SET nickname=? WHERE id=?','yoo',viewer.id);
 for(const [i,name] of ['세온','하루','JAY','하린','Sora','민수','나비','초코'].entries()){
  const user=await h.register('galaxy_visual_'+i);h.runtime.store.run('UPDATE users SET nickname=? WHERE id=?',name,user.id);h.runtime.store.run('INSERT INTO avatar_legacy_experience VALUES(?,?,?)',user.id,'',200+i*100);
 }
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const context=await browser.newContext({viewport:{width:1672,height:941},reducedMotion:'reduce'});
 await context.addCookies([{name:'pieona_session',value:viewer.cookie.split('=')[1],url:base}]);
 await context.addInitScript(({uid,slot})=>{localStorage.setItem('pieona.tutorial.v1.'+uid,'seen');localStorage.setItem('illova.card.seen.'+uid+'.'+slot,slot+':1');localStorage.setItem('pieona.peopleCollapsed','true');localStorage.setItem('pieona.bgm.v1',JSON.stringify({enabled:false,volume:0}));},{uid:viewer.id,slot:viewer.activeSlot});
 const page=await context.newPage();page.setDefaultTimeout(35000);page.on('pageerror',e=>errors.push(e.message));
 mkdirSync('artifacts/galaxy',{recursive:true});await page.goto(base+'/?view=village');await page.locator('.scene-loading').waitFor({state:'hidden'});await page.getByRole('button',{name:'은하 지도',exact:true}).click();await page.locator('.galaxy-open').waitFor();await page.locator('.galaxy-constellation').first().waitFor();
 assert.equal(await page.locator('.galaxy-constellation').count(),13);
 const data=(await h.request('/galaxy',viewer)).body.users;
 for(const u of data){const constellation=page.getByRole('button',{name:`${u.nickname}의 별자리 · 별 ${u.starCount}개 · 광장별로 이동`,exact:true});assert.equal(await constellation.locator('[data-owned-star]').count(),u.starCount);}
 assert.equal(await page.locator('.galaxy-map [data-star-id="plaza"]').count(),13);
 const camera=page.locator('.galaxy-camera');
 await page.mouse.move(800,600);await page.mouse.wheel(0,-400);await page.waitForFunction(()=>+document.querySelector('.galaxy-camera').dataset.zoom>1);
 await page.mouse.wheel(0,400);await page.waitForFunction(()=>Math.abs(+document.querySelector('.galaxy-camera').dataset.zoom-1)<.01);
 const headerBefore=await page.locator('.galaxy-header').boundingBox(),skyBefore=await page.locator('.galaxy-sky').boundingBox();
 await page.mouse.down({button:'right'});await page.mouse.move(930,645,{steps:8});await page.mouse.up({button:'right'});
 assert.ok(+await camera.getAttribute('data-rotation')>20);assert.ok(+await camera.getAttribute('data-tilt')<0);assert.equal(await page.locator('.galaxy-open').count(),1,'right drag must not visit a star');
 assert.deepEqual(await page.locator('.galaxy-header').boundingBox(),headerBefore,'camera controls leave the HUD fixed');assert.deepEqual(await page.locator('.galaxy-sky').boundingBox(),skyBefore,'the distant sky fills the viewport while rotating');await page.screenshot({path:'artifacts/galaxy/rotated.png'});
 await page.getByRole('button',{name:'은하 지도 시점 초기화',exact:true}).click();assert.equal(await camera.getAttribute('data-rotation'),'0.00');
 for(let i=0;i<8;i++)await page.getByRole('button',{name:'은하 지도 확대',exact:true}).evaluate(button=>button.click());assert.equal(await camera.getAttribute('data-zoom'),'2.400');
 for(let i=0;i<12;i++)await page.getByRole('button',{name:'은하 지도 축소',exact:true}).evaluate(button=>button.click());assert.equal(await camera.getAttribute('data-zoom'),'0.600');
 await page.mouse.move(5,400);await page.mouse.wheel(0,-200);await page.waitForFunction(()=>+document.querySelector('.galaxy-camera').dataset.zoom>.6);
 await page.getByRole('button',{name:'은하 지도 시점 초기화',exact:true}).click();await page.keyboard.press('+');assert.ok(+await camera.getAttribute('data-zoom')>1);await page.keyboard.press('0');assert.equal(await camera.getAttribute('data-zoom'),'1.000');
 await page.emulateMedia({reducedMotion:'no-preference'});const twinkles=new Set();for(let i=0;i<5;i++){twinkles.add(await page.locator('.galaxy-plaza-rays').first().evaluate(node=>getComputedStyle(node).opacity));await page.waitForTimeout(150);}assert.ok(twinkles.size>1,'central plazas visibly twinkle');await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:/^yoo의 별자리/}).hover();await page.mouse.move(0,0);await page.screenshot({path:'artifacts/galaxy/desktop.png'});
 const luna=page.getByRole('button',{name:/^루나의 별자리/});await luna.hover();await page.getByRole('complementary',{name:'별자리 플레이어 정보'}).getByRole('heading',{name:'루나의 별'}).waitFor();assert.ok((await luna.getAttribute('class')).includes('is-highlighted'));await page.screenshot({path:'artifacts/galaxy/hover.png'});
 const search=page.getByRole('textbox',{name:'플레이어 이름 또는 별 이름 검색'});await search.fill('루나');assert.equal(await page.locator('.galaxy-constellation').count(),1);await search.fill('존재하지않는별');await page.getByText('일치하는 별자리가 없어요.',{exact:true}).waitFor();await search.fill('');
 await page.getByRole('button',{name:'은하 지도 필터',exact:true}).click();await page.getByRole('button',{name:'NPC',exact:true}).click();assert.equal(await page.locator('.galaxy-constellation').count(),4);await page.getByRole('button',{name:'모든 별',exact:true}).click();await page.getByRole('button',{name:'은하 지도 필터',exact:true}).click();
 await page.emulateMedia({reducedMotion:'no-preference'});await luna.click();await page.locator('.galaxy-traveling').waitFor();await page.waitForTimeout(400);await page.screenshot({path:'artifacts/galaxy/travel.png'});await page.getByRole('dialog',{name:'은하 지도',exact:true}).waitFor({state:'hidden'});await page.getByRole('heading',{name:'루나의 광장별',exact:true}).waitFor();
 await page.getByRole('button',{name:'은하 지도',exact:true}).click();await page.locator('.galaxy-open').waitFor();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);assert.equal(await page.locator('.galaxy-constellation').count(),6);await page.getByRole('button',{name:/^yoo의 별자리/}).hover();await page.mouse.move(0,0);await page.screenshot({path:'artifacts/galaxy/mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const button of await page.locator('.galaxy-constellation').all()){const rect=await button.boundingBox();assert.ok(rect.x>=-1&&rect.x+rect.width<=391,JSON.stringify(rect));}
 await page.getByRole('button',{name:'다음 별자리',exact:true}).click();assert.equal(await page.locator('.galaxy-constellation').count(),6);await page.getByRole('button',{name:'다음 별자리',exact:true}).click();assert.equal(await page.locator('.galaxy-constellation').count(),1);await page.getByRole('button',{name:'이전 별자리',exact:true}).click();await page.getByRole('button',{name:'이전 별자리',exact:true}).click();await page.getByRole('button',{name:/^토리의 별자리/}).click();await page.getByRole('dialog',{name:'은하 지도',exact:true}).waitFor({state:'hidden'});await page.getByRole('heading',{name:'토리의 광장별',exact:true}).waitFor();
 await page.getByRole('button',{name:'은하 지도',exact:true}).click();await page.locator('.galaxy-open').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'은하 지도',exact:true}).waitFor({state:'hidden'});
 await page.route('**/api/galaxy',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'일시적인 지도 연결 오류'})}));
 await page.getByRole('button',{name:'은하 지도',exact:true}).click();await page.getByRole('alert').filter({hasText:'일시적인 지도 연결 오류'}).waitFor();await page.unroute('**/api/galaxy');await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await page.locator('.galaxy-constellation').first().waitFor();
 const fiona=data.find(u=>u.nickname==='피오나');h.runtime.store.run('UPDATE users SET settings=? WHERE id=?',JSON.stringify({allowVisitors:false}),fiona.id);
 await page.getByRole('button',{name:/^피오나의 별자리/}).click();await page.locator('.galaxy-open .galaxy-error').waitFor();await page.getByRole('button',{name:/^yoo의 별자리/}).click();await page.getByRole('dialog',{name:'은하 지도',exact:true}).waitFor({state:'hidden'});await page.getByRole('heading',{name:'yoo의 광장별',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('Galaxy browser verification passed: wheel/button/keyboard zoom with limits, right drag rotation, fixed HUD, central plaza twinkle, actual star counts, hover, search, filters, NPC plaza travel, mobile, retry and Escape; no runtime errors.');
}finally{await browser?.close();await h.close();}
