import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import * as THREE from 'three';
import {harness} from '../tests/runtimeHarness.mjs';
import {prepareAvatar} from '../tests/pssGameplay.mjs';
import {createStarWorld} from '../server/starWorlds.mjs';

const base='http://127.0.0.1:3199',h=await harness({port:3199,publicOrigin:base});let browser;const errors=[];
try{
 const u=await prepareAvatar(h,'worlds_visual'),store=h.runtime.store;
 function make(type,grade){const id=`found-${type}-${randomUUID()}`;store.run('INSERT INTO owned_stars VALUES(?,?,?)',u.id,id,'개척별');store.run('INSERT INTO colony_stars VALUES(?,?,?,?,?,?)',u.id,id,type,grade,20,2);createStarWorld(store,u.id,id);return id;}
 const a=make('red','B'),b=make('red','A'),green=make('green','B'),green2=make('green','A'),robot={id:randomUUID(),type:'miningRobot',x:3,z:-1,rotation:0};
 assert.equal((await h.request('/me/world',u,{starId:a,village:{items:[robot],platformColor:'#8bb3c9'}},'PATCH')).status,200);
 assert.equal((await h.request('/me/world',u,{starId:b,village:{items:[],platformColor:'#d1b8d9'}},'PATCH')).status,200);
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});const context=await browser.newContext({viewport:{width:1654,height:951},reducedMotion:'reduce'});
 await context.addCookies([{name:'pieona_session',value:u.cookie.split('=')[1],url:base}]);
 await context.addInitScript(({uid,slot})=>{localStorage.setItem('pieona.tutorial.v1.'+uid,'seen');localStorage.setItem('illova.card.seen.'+uid+'.'+slot,slot+':1');localStorage.setItem('pieona.peopleCollapsed','true');localStorage.setItem('pieona.bgm.v1',JSON.stringify({enabled:false,volume:0}));},{uid:u.id,slot:u.activeSlot});
 const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));mkdirSync('artifacts/star-worlds',{recursive:true});
 await page.goto(base+'/?view=village');await page.locator('.scene-loading').waitFor({state:'hidden'});
 async function travel(name){await page.getByRole('button',{name:'내 별 보기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.star-atlas')?.dataset.phase==='open');await page.getByRole('button',{name:name+' 선택',exact:true}).click();await page.getByRole('button',{name:name+'로 이동',exact:true}).click();await page.locator('.star-atlas').waitFor({state:'hidden'});}
 await travel('붉은별 · B');await page.waitForFunction(()=>document.querySelector('.scene-canvas canvas')?.dataset.platformColor==='#8bb3c9');
 const rect=await page.locator('.scene-canvas canvas').boundingBox(),camera=new THREE.PerspectiveCamera(38,rect.width/rect.height,.1,180);camera.position.set(11,17,14);camera.lookAt(0,0,0);camera.updateMatrixWorld();const point=new THREE.Vector3(3,.8,-1).project(camera);
 await page.mouse.click(rect.x+(point.x+1)*rect.width/2,rect.y+(1-point.y)*rect.height/2);await page.getByRole('dialog',{name:'채광 로봇 상태'}).waitFor();await page.screenshot({path:'artifacts/star-worlds/star-a-robot.png'});await page.getByRole('button',{name:'별 교류 닫기'}).click();
 await travel('붉은별 · A');await page.waitForFunction(()=>document.querySelector('.scene-canvas canvas')?.dataset.platformColor==='#d1b8d9');await page.getByRole('button',{name:'별 꾸미기',exact:true}).click();await page.getByRole('button',{name:'바닥 색상 #8bb3c9',exact:true}).click();await page.getByRole('button',{name:'설정 완료',exact:true}).click();await page.locator('.village-studio').waitFor({state:'hidden'});
 assert.equal((await h.request(`/users/${u.id}/stars/${a}/world`,u)).body.village.items.length,1);assert.equal((await h.request(`/users/${u.id}/stars/${b}/world`,u)).body.village.items.length,0);
 // An independent farm must remain empty after planting on another green star.
 await travel('초록별 · B');await page.locator('.farm-screen').waitFor();await page.getByRole('button',{name:'1번 텃밭 · 씨앗 심기',exact:true}).click();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/me/life/actions')&&r.request().method()==='POST'),page.getByRole('button',{name:/딸기 씨앗/}).click()]);h.advance(3000);await page.getByRole('button',{name:/1번 텃밭 · 딸기/}).waitFor();
 await page.getByRole('button',{name:'별 지도로 돌아가기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.star-atlas')?.dataset.phase==='open');await page.getByRole('button',{name:'초록별 · A 선택',exact:true}).click();await page.getByRole('button',{name:'초록별 · A로 이동',exact:true}).click();await page.locator('.star-atlas').waitFor({state:'hidden'});await page.getByRole('button',{name:'1번 텃밭 · 씨앗 심기',exact:true}).waitFor();await page.screenshot({path:'artifacts/star-worlds/independent-farm.png'});
 assert.equal(h.runtime.life.gardenSnapshot(u.id,green).plots[0].cropId,'STRAWBERRY');assert.equal(h.runtime.life.gardenSnapshot(u.id,green2).plots[0].cropId,null);
 await page.reload();await page.locator('.scene-loading').waitFor({state:'hidden'});await travel('붉은별 · B');await page.waitForFunction(()=>document.querySelector('.scene-canvas canvas')?.dataset.platformColor==='#8bb3c9');await page.screenshot({path:'artifacts/star-worlds/reloaded-star.png'});
 assert.deepEqual(errors,[]);console.log('Independent star browser flow passed: separate layouts/colors, per-star editor save, placed robot focus, separate green-star plots, green-to-green travel and reload.');
}finally{await browser?.close();await h.close();if(errors.length)console.log('PAGE ERRORS',errors);}
